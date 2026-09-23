import { NAME_RULES, type NameRules } from "../config.js";

/**
 * Pure re-implementation of `EntityProcess.java`'s naming rules.
 *
 * These are *derivation* helpers only. The TS generator resolves components
 * through a real symbol table (see `entityGen.ts`), so nothing here performs
 * the `interfaceToComp` string surgery at generation time; `interfaceToCompName`
 * exists so the Java rule can still be asserted (`nameRule.test.ts`) and so
 * rendering-only helpers have a place to live.
 */

export class NameRuleError extends Error {}

function fail(message: string): never {
  throw new NameRuleError(message);
}

/** `Posc` -> `PosComp`. Java `:931-935`. Lookup-only; not used for resolution. */
export function interfaceToCompName(interfaceName: string, rules: NameRules = NAME_RULES): string {
  if (interfaceName.length < 1) fail(`Not a component interface name: "${interfaceName}"`);
  return interfaceName.slice(0, -1) + rules.componentSuffix;
}

/** `PosComp` -> `Posc`. Java `:915-921`. */
export function interfaceNameFor(compName: string, rules: NameRules = NAME_RULES): string {
  requireComponentName(compName, rules);
  return compName.slice(0, compName.length - rules.componentSuffix.length) + rules.interfaceSuffix;
}

/** `PosComp` -> `Pos`. Java `:924-928`; names the generated abstract base class. */
export function baseNameFor(compName: string, rules: NameRules = NAME_RULES): string {
  requireComponentName(compName, rules);
  return compName.slice(0, compName.length - rules.componentSuffix.length);
}

function requireComponentName(compName: string, rules: NameRules): void {
  if (!compName.endsWith(rules.componentSuffix)) {
    fail(`All components must have names that end with '${rules.componentSuffix}': "${compName}"`);
  }
}

/** Java `Strings.capitalize`. */
export function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Java `:996-1000`: sort the components by class name, strip `Comp`, concat.
 *
 * The sort is what makes `{Unitc, Mechc}` and `{Mechc, Unitc}` produce the same
 * name — Java's `@EntityDef.value()` is a `Class[]`, so declaration order cannot
 * be relied upon.
 */
export function createName(componentNames: readonly string[], rules: NameRules = NAME_RULES): string {
  if (componentNames.length === 0) fail("Cannot derive an entity name from zero components");
  return [...componentNames]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((name) => {
      requireComponentName(name, rules);
      return name.split(rules.componentSuffix).join("");
    })
    .join("");
}

export interface EntityNameInput {
  /** Declared element name: the class name, or the field name for legacy defs. */
  readonly elementName: string;
  /**
   * Whether `@EntityDef` sits on a type declaration. Java checks `type.isType()`
   * (`:294`) and takes the `Def`/`Comp`-stripping path for types while fields
   * (`UnitTypes.java:37`'s `nova`) go through `createName`.
   */
  readonly isType: boolean;
  /** Component class names reachable from the def (used by `createName`). */
  readonly componentNames: readonly string[];
  /** Class name of the component carrying `@Component(base = true)`, if any. */
  readonly baseComponentName?: string;
  /** Whether the def element itself is the base (`@Component(base = true)` on it). */
  readonly typeIsBase: boolean;
  /** Java `EntityDef.legacy()`. */
  readonly legacy: boolean;
}

/**
 * Java `:294-312` in full. The result is asserted against the fixture's declared
 * `name` by `entityGen.ts`, so Java's four implicit branches survive as a checked
 * invariant rather than as the naming mechanism.
 */
export function deriveEntityName(input: EntityNameInput, rules: NameRules = NAME_RULES): string {
  const { elementName, isType, componentNames, baseComponentName, typeIsBase, legacy } = input;

  if (isType && !elementName.endsWith(rules.defSuffix) && !elementName.endsWith(rules.componentSuffix)) {
    fail(`All entity def names must end with '${rules.defSuffix}'/'${rules.componentSuffix}': "${elementName}"`);
  }

  let name = isType
    ? elementName.split(rules.defSuffix).join("").split(rules.componentSuffix).join("")
    : createName(componentNames, rules);

  // `:303-305` — an entity whose derived name equals its base class name gets an
  // `Entity` suffix. This is why `mindustry.gen.Unit` (the base, from UnitComp's
  // own @EntityDef) coexists with `UnitEntity` (@EntityDef(Unitc.class)).
  if (!typeIsBase && baseComponentName !== undefined) {
    if (name === baseNameFor(baseComponentName, rules)) name += rules.entitySuffix;
  }

  if (legacy) name += rules.legacyInfix + capitalize(elementName);

  return name;
}
