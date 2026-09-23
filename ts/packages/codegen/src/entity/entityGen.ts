import path from "node:path";
import { DEFAULT_CONFIG, type CodegenConfig, type GroupConfig } from "../config.js";
import type { ComponentFieldModel, ComponentMethodModel, ComponentModel, EntityDefModel } from "../model.js";
import { deriveEntityName } from "./nameRule.js";

/**
 * Port of `EntityProcess.java:175-180,285-325,421-660` — component interfaces,
 * abstract base classes and the merged entity classes.
 *
 * Four of Java's six design causes disappear in TS and shape this rewrite (§5.2):
 *  - the processor needed 3 rounds because components cross-reference each other
 *    and generated code is invisible within a round. A build-time program sees
 *    every source file at once, so this runs **once** and emits **two passes**
 *    (interfaces + abstract bases, then entities) — plus one to mirror Java's own
 *    write order, which emits base classes last (`:903-906`).
 *  - `interfaceToComp` (`:931-935`) recovered a component from an interface name by
 *    chopping its trailing character. Here a real symbol table maps
 *    `interfaceName -> ComponentModel`; the string rule survives only in
 *    `nameRule.ts`, as a tested invariant.
 *  - entity names were derived because `@EntityDef.value()` is a `Class[]` with no
 *    name slot. TS decorators carry `{name}`, so the declared name is the
 *    mechanism, and `deriveEntityName` is asserted against it.
 *  - entity interfaces are still generated: 502 Java files spell `EntityGroup<Unitc>`,
 *    so keeping the `*c` vocabulary avoids rewriting every ported call site. The
 *    names are kept for migration cost, not for parity.
 */

export class EntityGenError extends Error {}

/** One flat generated directory, mirroring Java's single `mindustry.gen` package. */
const IMPORT_EXTENSION = ".js";

export interface EntityGenInput {
  components: readonly ComponentModel[];
  entityDefs: readonly EntityDefModel[];
  groups: readonly GroupConfig[];
  /** Final class ids, keyed by {@link definitionKey} (see `entityMappingGen`). */
  classIds: ReadonlyMap<string, number>;
  /** Root used to build stable id keys; Java keys on the element's FQN (`:760`). */
  inputRoot: string;
  config?: CodegenConfig;
}

export interface ResolvedEntity {
  def: EntityDefModel;
  /** Final entity class name (legacy suffix already applied). */
  name: string;
  classId: number;
  legacy: boolean;
  /** `true` when the def element itself carries `@Component({base: true})`. */
  typeIsBase: boolean;
  /** Component closure (Java `allComponents`, `:938-963`). */
  components: ComponentModel[];
  /** Component carrying `base: true`; the abstract class this entity extends. */
  baseComponent?: ComponentModel;
  /**
   * For `legacy` entities only: the class this one extends, i.e. the name Java
   * derived *before* appending the legacy suffix (`EntityProcess.java:309-312`
   * repoints `baseClass` at `mindustry.gen.<name>`).
   */
  parentName?: string;
  /** Groups this entity belongs to (Java `:273-274`). */
  groups: GroupConfig[];
}

/**
 * Stable identity for class-id assignment. Java uses the source element's
 * fully-qualified name (`mindustry.entities.comp.BuildingComp`, `:760`) so that
 * renaming the *entity* never changes a saved id. TS has no packages, so the key
 * is `<input-root-relative file>:<element name>`.
 */
export function definitionKey(def: EntityDefModel, inputRoot: string): string {
  const relative = path.relative(inputRoot, def.sourceFile).split(path.sep).join("/");
  return `${relative}:${def.elementName}`;
}

class Symbols {
  readonly all: readonly ComponentModel[];
  readonly byName = new Map<string, ComponentModel>();
  readonly byInterface = new Map<string, ComponentModel>();
  private readonly depsCache = new Map<ComponentModel, ComponentModel[]>();

  constructor(components: readonly ComponentModel[]) {
    this.all = components;
    for (const component of components) {
      if (this.byName.has(component.compName)) throw new EntityGenError(`Duplicate component class "${component.compName}"`);
      this.byName.set(component.compName, component);
      this.byInterface.set(component.interfaceName, component);
    }
  }

  /**
   * Resolves a supertype identifier to its component. Components write *interface*
   * names in `implements` (`Healthc`, as in Java), but a component class name is
   * accepted too. This replaces Java's `interfaceToComp` (`:931-935`), which had to
   * reconstruct `BlockComp` from `Blockc` by string surgery because the processor only
   * had a type mirror; here both names are keys in a real symbol table.
   */
  resolveSupertype(name: string): ComponentModel | undefined {
    return this.byInterface.get(name) ?? this.byName.get(name);
  }

  /** Java `getDependencies` (`:965-990`): transitive component supertypes, self excluded. */
  deps(component: ComponentModel): ComponentModel[] {
    const cached = this.depsCache.get(component);
    if (cached !== undefined) return cached;
    const result: ComponentModel[] = [];
    const collect = (current: ComponentModel, stack: ComponentModel[]): void => {
      for (const name of current.implements) {
        const parent = this.resolveSupertype(name);
        if (parent === undefined || parent === current || parent === component) continue;
        if (stack.includes(parent)) {
          throw new EntityGenError(`Component dependency cycle: ${[...stack, parent].map((c) => c.compName).join(" -> ")}`);
        }
        if (!result.includes(parent)) result.push(parent);
        collect(parent, [...stack, parent]);
      }
    };
    collect(component, [component]);
    this.depsCache.set(component, result);
    return result;
  }

  /** Java `allComponents` (`:938-963`): the component plus its dependencies. */
  closure(component: ComponentModel): ComponentModel[] {
    return [component, ...this.deps(component)];
  }

  /** `implements` entries that are not components (Java keeps them verbatim, `:117-120`). */
  externalSupertypes(component: ComponentModel): string[] {
    return component.implements.filter((name) => this.resolveSupertype(name) === undefined);
  }
}

export function resolveEntities(input: EntityGenInput): ResolvedEntity[] {
  const config = input.config ?? DEFAULT_CONFIG;
  const symbols = new Symbols(input.components);
  const resolved: ResolvedEntity[] = [];

  for (const def of input.entityDefs) {
    const referenced = def.componentRefs.map((name) => {
      const component = symbols.byInterface.get(name);
      if (component === undefined) {
        throw new EntityGenError(
          `@EntityDef({name: "${def.declaredName}"}) references unknown component interface "${name}" ` +
            `(${path.basename(def.sourceFile)})`,
        );
      }
      return component;
    });

    // Java `:952-957` — closure = the reference list plus each component's deps.
    const components: ComponentModel[] = [];
    for (const component of [...referenced, ...referenced.flatMap((c) => symbols.closure(c))]) {
      if (!components.includes(component)) components.push(component);
    }

    const baseComponents = components.filter((component) => component.base);
    if (baseComponents.length > 1) {
      // Java only rejects `> 2` (`:282-284`); TS tightens to `> 1` because "two base
      // classes" has no meaning under single-inheritance classes.
      throw new EntityGenError(
        `Entity "${def.declaredName}" has more than one base component: ${baseComponents.map((c) => c.compName).join(", ")}`,
      );
    }

    // Java `:292` — `typeIsBase = baseClassType != null && type.has(Component) && @Component.base()`.
    const selfComponent = def.isType ? symbols.byName.get(def.elementName) : undefined;
    const typeIsBase = selfComponent !== undefined && selfComponent.base;
    const baseComponent = baseComponents[0];
    const nameInput = {
      elementName: def.elementName,
      isType: def.isType,
      componentNames: referenced.map((c) => c.compName),
      baseComponentName: baseComponent?.compName,
      typeIsBase,
    };
    // Legacy entities extend the class Java would have named without the suffix,
    // so both forms are derived (`:309-312`).
    const parentName = def.legacy ? deriveEntityName({ ...nameInput, legacy: false }, config.nameRules) : undefined;
    const derived = deriveEntityName({ ...nameInput, legacy: def.legacy }, config.nameRules);
    if (derived !== def.declaredName) {
      throw new EntityGenError(
        `Entity name mismatch for "${def.elementName}": Java's rules derive "${derived}" but ` +
          `"${def.declaredName}" was declared (${path.basename(def.sourceFile)}). ` +
          `Fix the declaration or the component list.`,
      );
    }

    resolved.push({
      def,
      name: derived,
      classId: input.classIds.get(definitionKey(def, input.inputRoot)) ?? 0,
      legacy: def.legacy,
      typeIsBase,
      components,
      baseComponent,
      parentName,
      groups: groupsFor(def, components, config.groups, symbols),
    });
  }

  const names = new Set<string>();
  for (const entity of resolved) {
    if (names.has(entity.name)) throw new EntityGenError(`Duplicate entity name "${entity.name}"`);
    names.add(entity.name);
  }
  return resolved;
}

/** Java `:273-274` — group membership. Unknown interface names never match. */
function groupsFor(
  def: EntityDefModel,
  components: readonly ComponentModel[],
  groups: readonly GroupConfig[],
  symbols: Symbols,
): GroupConfig[] {
  return groups.filter(
    (group) =>
      group.value.length > 0 &&
      !def.excludeGroups.includes(group.name) &&
      !group.value.some((name) => {
        const component = symbols.byInterface.get(name);
        return component === undefined || !components.includes(component);
      }) &&
      !group.exclude.some((name) => {
        const component = symbols.byInterface.get(name);
        return component !== undefined && components.includes(component);
      }),
  );
}

export function generateEntityFiles(input: EntityGenInput): Map<string, string> {
  const config = input.config ?? DEFAULT_CONFIG;
  const symbols = new Symbols(input.components);
  const resolved = resolveEntities({ ...input, config });
  const outputs = new Map<string, string>();

  // Pass 1: component interfaces (Java round 1, `:105-172`).
  for (const component of input.components) {
    if (!component.genInterface) continue;
    outputs.set(`${component.interfaceName}.ts`, renderInterface(component, symbols, config));
  }

  // Pass 2: merged entity classes (Java round 3, `:827-901`).
  for (const entity of resolved) {
    outputs.set(`${entity.name}.ts`, renderEntity(entity, symbols, config));
  }

  // Pass 3: abstract base classes, written last exactly like Java (`:903-906`).
  for (const component of input.components) {
    if (!component.base || componentHasOwnEntityDef(component, input.entityDefs)) continue;
    const inherited: GroupConfig[] = [];
    for (const entity of resolved) {
      if (entity.baseComponent !== component) continue;
      for (const group of entity.groups) if (!inherited.includes(group)) inherited.push(group);
    }
    outputs.set(`${component.baseName}.ts`, renderBaseClass(component, symbols, config, inherited));
  }

  return outputs;
}

function componentHasOwnEntityDef(component: ComponentModel, defs: readonly EntityDefModel[]): boolean {
  // Java `:182` — "components with EntityDefs don't get a base class! the generated
  // class becomes the base class itself".
  return defs.some((def) => def.elementName === component.compName);
}

// ---- pass 1: interfaces ---------------------------------------------------

function renderInterface(component: ComponentModel, symbols: Symbols, config: CodegenConfig): string {
  const supertypes = symbols
    .deps(component)
    .filter((dep) => dep.genInterface)
    .map((dep) => dep.interfaceName);
  const external = symbols.externalSupertypes(component);

  const body: string[] = [];
  body.push("/**");
  body.push(` * Interface for {@link ${component.compName}} (Java \`EntityProcess.java:109-172\`).`);
  if (component.doc !== undefined) {
    for (const line of docBody(component.doc)) body.push(line === "" ? " *" : ` * ${line}`);
  }
  if (external.length > 0) body.push(` * <br>External supertypes needing a manual import: ${external.join(", ")}`);
  body.push(" */");
  body.push(`export interface ${component.interfaceName}${supertypes.length > 0 ? ` extends ${supertypes.join(", ")}` : ""} {`);

  for (const field of component.fields) {
    if (field.static || field.private || field.imported) continue;
    pushDoc(body, field.doc, 1);
    body.push(`  ${field.readonly ? "readonly " : ""}${field.name}: ${field.type};`);
  }
  for (const method of component.methods) {
    if (method.static || method.private) continue;
    pushDoc(body, method.doc, 1);
    body.push(`  ${signatureText(method)};`);
  }
  body.push("}");

  return assemble(component.sourceFile, body, config, symbols, [component.interfaceName], [], []);
}

// ---- pass 2: entities -----------------------------------------------------

function renderEntity(entity: ResolvedEntity, symbols: Symbols, config: CodegenConfig): string {
  const { def } = entity;
  const interfaces = entity.components.filter((component) => component.genInterface).map((c) => c.interfaceName);
  // Java `:425-434` — index members land on the base class when one exists, but a
  // `typeIsBase` entity *is* its own base. When several entities share a base, the
  // union of their groups is used (Java only records the first one's).
  const indexOwner = !entity.legacy && (entity.baseComponent === undefined || entity.typeIsBase);
  const indexInterfaces = indexOwner ? entity.groups.map((group) => `IndexableEntity__${group.name}`) : [];

  const merged = mergeMethods(entity.components, symbols);
  const hasAddRemove = merged.some((method) => method.representative.name === "add" || method.representative.name === "remove");

  const baseClosure =
    entity.typeIsBase || entity.baseComponent === undefined ? [] : symbols.closure(entity.baseComponent);
  const usedFields = new Set<string>();
  const fieldLines: string[] = [];
  for (const component of entity.components) {
    const shadowed = baseClosure.includes(component);
    // Java `:344` — `@Import` fields are filtered out *before* the duplicate check,
    // because they are declared by another component on purpose.
    for (const field of component.fields.filter((candidate) => !candidate.imported)) {
      if (usedFields.has(field.name)) {
        throw new EntityGenError(
          `Field "${field.name}" of component "${component.compName}" redefines a field in entity "${entity.name}"`,
        );
      }
      usedFields.add(field.name);
      const visible = !field.static && !field.private && !field.readonly;
      // Java `:376` — shadowed visible fields live in the base class; legacy
      // entities carry no extra fields at all.
      if (shadowed && visible) continue;
      if (entity.legacy) continue;
      pushDoc(fieldLines, field.doc, 1);
      fieldLines.push(`  ${fieldModifiers(field)}${field.name}: ${field.type}${defaultText(field)};`);
    }
  }

  const methodLines: string[] = [];
  if (!entity.legacy) {
    assertNoOverloads(merged, entity.name);
    for (const method of merged) methodLines.push(...renderMergedMethod(method, entity));
  }

  const extendsTarget = entity.parentName ?? (entity.typeIsBase ? undefined : entity.baseComponent?.baseName);
  const extendsClause = extendsTarget === undefined ? "" : ` extends ${extendsTarget}`;
  const implementsClause = [...interfaces, ...indexInterfaces].join(", ");

  const body: string[] = [];
  body.push("/**");
  body.push(` * Merged entity class for ${entity.components.map((c) => `{@link ${c.compName}}`).join(", ")}.`);
  if (entity.parentName !== undefined) {
    body.push(
      ` * <br>Legacy branch (Java \`EntityProcess.java:309-312\`); keeps the old class id and extends {@link ${entity.parentName}}.`,
    );
  }
  body.push(" */");
  body.push(`export class ${entity.name}${extendsClause}${implementsClause === "" ? "" : ` implements ${implementsClause}`} {`);

  if (indexOwner && entity.groups.length > 0) {
    for (const group of entity.groups) body.push(`  protected index__${group.name}: number = -1;`);
    body.push("");
  }
  if (fieldLines.length > 0) body.push(...fieldLines, "");
  if (methodLines.length > 0) body.push(...methodLines, "");

  if (indexOwner && entity.groups.length > 0) {
    for (const group of entity.groups) {
      body.push(`  setIndex__${group.name}(index: number): void {`);
      body.push(`    this.index__${group.name} = index;`);
      body.push("  }");
      body.push("");
    }
  }

  if (!merged.some((method) => method.representative.name === "toString")) {
    body.push("  toString(): string {");
    body.push(`    return "${entity.name}#" + this.id;`);
    body.push("  }");
    body.push("");
  }
  body.push(`  serialize(): boolean {`);
  body.push(`    return ${def.serialize};`);
  body.push("  }");
  body.push("");
  body.push("  classId(): number {");
  body.push(`    return ${entity.classId};`);
  body.push("  }");
  body.push("");
  body.push("  protected constructor() {}");
  body.push("");
  body.push(`  static create(): ${entity.name} {`);
  body.push(`    return new ${entity.name}();`);
  body.push("  }");
  body.push("}");

  const valueImports = [
    ...(extendsTarget === undefined ? [] : [extendsTarget]),
    ...(indexOwner && entity.groups.length > 0 ? ["Groups"] : []),
    ...(hasAddRemove && !entity.legacy ? ["Groups"] : []),
  ];
  return assemble(def.sourceFile, body, config, symbols, [entity.name], indexInterfaces, valueImports);
}

function fieldModifiers(field: ComponentFieldModel): string {
  const modifiers: string[] = [];
  if (field.static) modifiers.push("static");
  // Java `:367` — `@ReadOnly`/private fields land as protected members.
  if (field.readonly) modifiers.push("readonly");
  else if (field.private) modifiers.push("protected");
  return modifiers.length === 0 ? "" : `${modifiers.join(" ")} `;
}

/**
 * Java could merge overloads because `descString()` carries the descriptor; a TS class
 * body can hold only one implementation per method name. Rejecting the case loudly is
 * better than emitting a file that does not compile — the porter merges the overloads
 * by hand (the same thing arc-ts did when porting Java overloads).
 */
function assertNoOverloads(methods: readonly MergedMethod[], entityName: string): void {
  const byName = new Map<string, Set<string>>();
  for (const method of methods) {
    const signatures = byName.get(method.representative.name) ?? new Set<string>();
    signatures.add(method.representative.signature);
    byName.set(method.representative.name, signatures);
  }
  for (const [name, signatures] of byName) {
    if (signatures.size > 1) {
      throw new EntityGenError(
        `Entity "${entityName}" would need overloaded "${name}" (${[...signatures].join(" / ")}); ` +
          `TS allows one implementation per name, so merge them in the component source`,
      );
    }
  }
}

function defaultText(field: ComponentFieldModel): string {
  return field.initializer === undefined ? "" : ` = ${field.initializer}`;
}

// ---- pass 3: abstract base classes ---------------------------------------

function renderBaseClass(
  component: ComponentModel,
  symbols: Symbols,
  config: CodegenConfig,
  groups: readonly GroupConfig[],
): string {
  const closure = symbols.closure(component);
  const interfaces = closure.filter((c) => c.genInterface).map((c) => c.interfaceName);
  const indexInterfaces = groups.map((group) => `IndexableEntity__${group.name}`);

  const body: string[] = [];
  body.push("/**");
  body.push(` * Abstract base class generated from {@link ${component.compName}} (\`@Component({ base: true })\`).`);
  body.push(" * Mirrors Java's base-class generation at `EntityProcess.java:176-213`.");
  body.push(" */");
  const all = [...interfaces, ...indexInterfaces];
  body.push(`export abstract class ${component.baseName}${all.length === 0 ? "" : ` implements ${all.join(", ")}`} {`);

  for (const group of groups) body.push(`  protected index__${group.name}: number = -1;`);
  if (groups.length > 0) body.push("");

  for (const current of closure) {
    for (const field of current.fields) {
      // Java `:188` — the base class takes visible, non-readonly fields only.
      if (field.static || field.private || field.imported || field.readonly) continue;
      pushDoc(body, field.doc, 1);
      body.push(`  ${field.name}: ${field.type}${defaultText(field)};`);
    }
  }
  for (const group of groups) {
    body.push("");
    body.push(`  setIndex__${group.name}(index: number): void {`);
    body.push(`    this.index__${group.name} = index;`);
    body.push("  }");
  }
  body.push("}");

  return assemble(component.sourceFile, body, config, symbols, [component.baseName], indexInterfaces, []);
}

// ---- method merging (Java `:404-408,437-613`) -----------------------------

export interface MergedMethod {
  representative: ComponentMethodModel;
  /** Concrete implementations, sorted by (priority, owner). */
  implementations: ComponentMethodModel[];
}

export function mergeMethods(components: readonly ComponentModel[], symbols?: Symbols): MergedMethod[] {
  const bySignature = new Map<string, ComponentMethodModel[]>();
  for (const component of components) {
    for (const method of component.methods) {
      if (method.static || method.private) continue;
      const bucket = bySignature.get(method.signature);
      if (bucket === undefined) bySignature.set(method.signature, [method]);
      else bucket.push(method);
    }
  }

  const merged: MergedMethod[] = [];
  for (const bucket of bySignature.values()) {
    let candidates = [...bucket];
    // Java `:440` — several `@Replace` implementations, or several non-void bodies,
    // need a winner.
    const concreteNonVoid = candidates.filter((method) => method.body !== undefined && method.returnType !== "void");
    if (candidates.length > 1 && (candidates.some((method) => method.replace) || concreteNonVoid.length > 1)) {
      candidates = candidates.filter((method) => method.body !== undefined);
      const best = candidates.reduce((a, b) => (compareCandidates(a, b, symbols) >= 0 ? a : b));
      if (candidates.some((method) => method !== best && compareCandidates(method, best, symbols) === 0)) {
        throw new EntityGenError(
          `Ambiguous implementations of "${best.signature}"; use @MethodPriority or @Replace: ` +
            candidates.map((method) => `${method.owner}#${method.name}`).join(", "),
        );
      }
      candidates = [best];
    }

    candidates.sort((a, b) => a.priority - b.priority || (a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : 0));
    const representative = candidates[0];
    if (representative.body === undefined) {
      throw new EntityGenError(
        `"${representative.owner}#${representative.name}" is abstract and must be implemented in some component`,
      );
    }
    merged.push({ representative, implementations: candidates });
  }
  return merged;
}

/** Java `:445-457` — highest `@MethodPriority`, then `@Replace`, then most dependencies. */
function compareCandidates(a: ComponentMethodModel, b: ComponentMethodModel, symbols?: Symbols): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.replace !== b.replace) return a.replace ? 1 : -1;
  const depth = (method: ComponentMethodModel): number => {
    const owner = symbols?.byName.get(method.owner);
    return owner === undefined ? 0 : symbols!.deps(owner).length;
  };
  return depth(a) - depth(b);
}

function renderMergedMethod(method: MergedMethod, entity: ResolvedEntity): string[] {
  const representative = method.representative;
  const lines: string[] = [];
  pushDoc(lines, representative.doc, 1);
  lines.push(`  ${signatureText(representative)} {`);

  const prologue: string[] = [];
  if (representative.name === "add" || representative.name === "remove") {
    const isAdd = representative.name === "add";
    // Java `:499-514` — special case: inject group add/remove bookkeeping. Java relies
    // on implicit `this`; TS needs it spelled out.
    prologue.push(`    if (this.added === ${isAdd}) return;`);
    for (const group of entity.groups) {
      if (isAdd) prologue.push(`    this.index__${group.name} = Groups.${group.name}.addIndex(this);`);
      else {
        prologue.push(`    Groups.${group.name}.removeIndex(this, this.index__${group.name});`);
        prologue.push(`    this.index__${group.name} = -1;`);
      }
    }
  }

  // Java `:493` — void methods with several bodies are wrapped in labels so each
  // `return;` only leaves its own component's block.
  const writeBlock = representative.returnType === "void" && method.implementations.length > 1;
  const bodies: string[] = [];
  for (const implementation of method.implementations) {
    if (implementation.body === undefined) continue;
    let inner = implementation.body.slice(1, -1);
    if (isEmptyBlock(inner)) continue;
    const label = implementation.owner.toLowerCase().split("comp").join("");
    if (writeBlock) {
      inner = inner.replace(/return;/g, `break ${label};`);
      bodies.push(`    ${label}: {`, ...reindent(inner, 3), "    }");
    } else {
      bodies.push(...reindent(inner, 2));
    }
  }
  // Java `:606-608` — only queued for freeing at the start of the next frame.
  const epilogue =
    representative.name === "remove" && entity.def.pooled ? ["    Groups.queueFree(this);"] : [];

  lines.push(...prologue, ...bodies, ...epilogue);
  lines.push("  }");
  return lines;
}

/** Java `:575-585` — a body containing only braces/whitespace is skipped. */
function isEmptyBlock(inner: string): boolean {
  return inner.replace(/[{} \t\r\n]/g, "") === "";
}

/** Strips the common indentation of `inner` and re-indents to `depth` levels. */
function reindent(inner: string, depth: number): string[] {
  const raw = inner.split("\n");
  while (raw.length > 0 && raw[0].trim() === "") raw.shift();
  while (raw.length > 0 && raw[raw.length - 1].trim() === "") raw.pop();
  let base = Infinity;
  for (const line of raw) {
    if (line.trim() === "") continue;
    base = Math.min(base, /^[ \t]*/.exec(line)![0].length);
  }
  const pad = "  ".repeat(depth);
  return raw.map((line) => (line.trim() === "" ? "" : pad + line.slice(base === Infinity ? 0 : base)));
}

function signatureText(method: ComponentMethodModel): string {
  const params = method.params.map((param) => `${param.name}: ${param.type}`).join(", ");
  return `${method.name}(${params}): ${method.returnType}`;
}

// ---- shared rendering helpers --------------------------------------------

/**
 * Emits the file header, the imports (explicit value imports plus every component
 * interface name that actually occurs in the body), and the body.
 */
function assemble(
  sourceFile: string,
  body: readonly string[],
  config: CodegenConfig,
  symbols: Symbols,
  ownNames: readonly string[],
  extraTypeImports: readonly string[],
  valueImports: readonly string[],
): string {
  const text = body.join("\n");
  const own = new Set(ownNames);
  const typeNames = new Set<string>(extraTypeImports.filter((name) => !own.has(name)));
  for (const component of symbols.all) {
    if (own.has(component.interfaceName)) continue;
    if (new RegExp(`\\b${component.interfaceName}\\b`).test(text)) typeNames.add(component.interfaceName);
  }

  const lines = [config.generatedHeader, `// Source: ${path.basename(sourceFile)}`, "/* eslint-disable */", ""];
  const values = [...new Set(valueImports)].sort();
  const types = [...typeNames].sort().filter((name) => !values.includes(name));
  for (const name of values) lines.push(`import { ${name} } from "./${name}${IMPORT_EXTENSION}";`);
  for (const name of types) lines.push(`import type { ${name} } from "./${name}${IMPORT_EXTENSION}";`);
  if (values.length + types.length > 0) lines.push("");
  lines.push(...body);
  return lines.join("\n") + "\n";
}

function pushDoc(lines: string[], doc: string | undefined, depth: number): void {
  if (doc === undefined) return;
  const pad = "  ".repeat(depth);
  lines.push(`${pad}/**`);
  for (const line of docBody(doc)) lines.push(line === "" ? `${pad} *` : `${pad} * ${line}`);
  lines.push(`${pad} */`);
}

function docBody(doc: string): string[] {
  return doc
    .replace(/^\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*?\s?/, "").trimEnd())
    .filter((line, index, all) => !(line === "" && (index === 0 || index === all.length - 1)));
}
