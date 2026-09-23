import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { DEFAULT_CONFIG, loadClassIds, type CodegenConfig } from "./config.js";
import { generateEntityFiles, resolveEntities } from "./entity/entityGen.js";
import { assignClassIds, generateEntityMappingFile } from "./entity/entityMappingGen.js";
import { generateGroupFiles } from "./entity/groupGen.js";
import { baseNameFor, interfaceNameFor } from "./entity/nameRule.js";
import type {
  ComponentFieldModel,
  ComponentMethodModel,
  ComponentModel,
  EntityDefModel,
} from "./model.js";
import { defaultBits, generateStructFiles, type StructFieldModel, type StructModel } from "./struct/structGen.js";

export class CollectError extends Error {}

/** Everything `codegen` reads out of a `*.def.ts` source set. */
export interface SourceModel {
  components: ComponentModel[];
  entityDefs: EntityDefModel[];
  structs: StructModel[];
}

export interface GenerateOptions {
  /** Root used for stable class-id keys; defaults to the common directory of the inputs. */
  inputRoot?: string;
  config?: CodegenConfig;
}

/**
 * Full pipeline: collect `*.def.ts` models, then run every generator once.
 *
 * Java needed three annotation-processing rounds because components cross-reference
 * each other and generated types are invisible within a round (`EntityProcess.java:65-231`).
 * A build-time program sees the whole source set at once, so this is a single run
 * whose output is written by the caller (`cli.ts`).
 */
export function generate(files: readonly string[], options: GenerateOptions = {}): Map<string, string> {
  const config = options.config ?? DEFAULT_CONFIG;
  const model = collectModels(files);
  const inputRoot = options.inputRoot ?? commonRoot(files);

  const classIds = assignClassIds(model.entityDefs, inputRoot, loadClassIds(config.classIdsPath));
  const entityInput = {
    components: model.components,
    entityDefs: model.entityDefs,
    groups: config.groups,
    classIds,
    inputRoot,
    config,
  };

  const outputs = new Map<string, string>();
  for (const [name, content] of generateEntityFiles(entityInput)) outputs.set(name, content);
  for (const [name, content] of generateGroupFiles(config.groups, config)) outputs.set(name, content);
  for (const [name, content] of generateStructFiles(model.structs, config)) outputs.set(name, content);
  // Resolution is pure, so running it twice for the mapping table is free of side
  // effects (and keeps `generateEntityFiles` the single owner of its own planning).
  outputs.set("EntityMapping.ts", generateEntityMappingFile(resolveEntities(entityInput), config));
  return outputs;
}

// ---- collection -----------------------------------------------------------

/** Parses every file and extracts the `@Component` / `@EntityDef` / `@Struct` models. */
export function collectModels(files: readonly string[]): SourceModel {
  const parsed = files.map((file) => {
    const absolute = path.resolve(file);
    const text = fs.readFileSync(absolute, "utf8");
    return ts.createSourceFile(absolute, text, ts.ScriptTarget.Latest, /* setParentNodes */ true);
  });

  // Component names must be known up front: `@EntityDef({components})` refers to the
  // *interfaces* those components generate, and the symbol table that resolves them
  // is built from the models themselves (`entityGen.Symbols`). No string surgery.
  const componentNames = new Set<string>();
  for (const sourceFile of parsed) {
    for (const cls of classDeclarations(sourceFile)) {
      if (hasDecorator(cls, "Component")) componentNames.add(cls.name!.text);
    }
  }

  const model: SourceModel = { components: [], entityDefs: [], structs: [] };
  for (const sourceFile of parsed) {
    for (const cls of classDeclarations(sourceFile)) {
      if (hasDecorator(cls, "Component")) model.components.push(modelComponent(cls, sourceFile));
      if (hasDecorator(cls, "Struct")) model.structs.push(modelStruct(cls, sourceFile));
    }
    for (const node of decoratableDeclarations(sourceFile)) {
      if (!hasDecorator(node, "EntityDef")) continue;
      model.entityDefs.push(modelEntityDef(node, sourceFile));
    }
  }

  for (const component of model.components) rewriteComponentTypes(component, componentNames);
  return model;
}

function classDeclarations(sourceFile: ts.SourceFile): ts.ClassDeclaration[] {
  const found: ts.ClassDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name !== undefined) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/** Any declaration that can carry `@EntityDef` — classes and (legacy) properties. */
function decoratableDeclarations(sourceFile: ts.SourceFile): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) || ts.isPropertyDeclaration(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

// ---- decorators -----------------------------------------------------------

interface DecoratorInfo {
  name: string;
  /** `undefined` for `@Replace`-style decorators used without a call. */
  args: unknown[] | undefined;
}

function decoratorsOf(node: ts.Node): DecoratorInfo[] {
  if (!ts.canHaveDecorators(node)) return [];
  return (ts.getDecorators(node) ?? []).map((decorator) => {
    const expression = decorator.expression;
    if (ts.isCallExpression(expression)) {
      const callee = expression.expression;
      return {
        name: ts.isIdentifier(callee) ? callee.text : callee.getText(),
        args: expression.arguments.map((argument) => literalValue(argument)),
      };
    }
    return { name: ts.isIdentifier(expression) ? expression.text : expression.getText(), args: undefined };
  });
}

function hasDecorator(node: ts.Node, name: string): boolean {
  return decoratorsOf(node).some((decorator) => decorator.name === name);
}

function decorator(node: ts.Node, name: string): DecoratorInfo | undefined {
  return decoratorsOf(node).find((candidate) => candidate.name === name);
}

/** Evaluates the decorator-argument subset: literals, arrays, objects, identifiers. */
function literalValue(node: ts.Expression): unknown {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((element) => literalValue(element));
  if (ts.isObjectLiteralExpression(node)) {
    const value: Record<string, unknown> = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const key = ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name) ? property.name.text : undefined;
      if (key !== undefined) value[key] = literalValue(property.initializer);
    }
    return value;
  }
  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
    return node.operator === ts.SyntaxKind.MinusToken ? -Number(node.operand.text) : Number(node.operand.text);
  }
  return undefined;
}

function optionsOf(node: ts.Node, name: string): Record<string, unknown> {
  const info = decorator(node, name);
  const first = info?.args?.[0];
  return first !== null && typeof first === "object" && !Array.isArray(first) ? (first as Record<string, unknown>) : {};
}

function booleanOption(options: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = options[key];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new CollectError(`Option "${key}" must be a boolean literal`);
  return value;
}

function stringListOption(options: Record<string, unknown>, key: string): string[] {
  const value = options[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new CollectError(`Option "${key}" must be an array of identifiers or string literals`);
  }
  return value as string[];
}

// ---- component model ------------------------------------------------------

function modelComponent(cls: ts.ClassDeclaration, sourceFile: ts.SourceFile): ComponentModel {
  const compName = cls.name!.text;
  const options = optionsOf(cls, "Component");
  const fields: ComponentFieldModel[] = [];
  const methods: ComponentMethodModel[] = [];

  for (const member of cls.members) {
    if (ts.isPropertyDeclaration(member)) {
      if (!ts.isIdentifier(member.name)) continue;
      const modifiers = modifierSet(member);
      const fieldOptions = decoratorsOf(member);
      const syncInfo = fieldOptions.find((candidate) => candidate.name === "SyncField");
      const type = member.type?.getText(sourceFile) ?? inferType(member.initializer?.getText(sourceFile));
      if (syncInfo !== undefined && type.trim() !== "number") {
        // Java `:387` — "All SyncFields must be of type float".
        throw new CollectError(`@SyncField field "${compName}.${member.name.text}" must be a number`);
      }
      fields.push({
        name: member.name.text,
        type,
        initializer: member.initializer?.getText(sourceFile),
        readonly: fieldOptions.some((candidate) => candidate.name === "ReadOnly"),
        imported: fieldOptions.some((candidate) => candidate.name === "Import"),
        sync: syncInfo !== undefined,
        static: modifiers.has(ts.SyntaxKind.StaticKeyword),
        private: modifiers.has(ts.SyntaxKind.PrivateKeyword),
        doc: getDocComment(member, sourceFile),
      });
    } else if (ts.isMethodDeclaration(member)) {
      if (!ts.isIdentifier(member.name)) continue;
      const modifiers = modifierSet(member);
      const methodDecorators = decoratorsOf(member);
      const params = member.parameters.map((parameter) => ({
        name: parameter.name.getText(sourceFile),
        type: parameter.type?.getText(sourceFile) ?? "unknown",
      }));
      const returnType = member.type?.getText(sourceFile) ?? "void";
      methods.push({
        name: member.name.text,
        signature: `${member.name.text}(${params.map((param) => param.type).join(", ")}): ${returnType}`,
        returnType,
        params,
        // `body.pos` includes the trivia before the brace; `getStart` does not, so the
        // slice is exactly `{ ... }` and `reindent` can drop the outer braces safely.
        body:
          member.body === undefined
            ? undefined
            : sourceFile.text.slice(member.body.getStart(sourceFile), member.body.end),
        replace: methodDecorators.some((candidate) => candidate.name === "Replace"),
        priority: methodPriority(methodDecorators),
        static: modifiers.has(ts.SyntaxKind.StaticKeyword),
        private: modifiers.has(ts.SyntaxKind.PrivateKeyword),
        owner: compName,
        doc: getDocComment(member, sourceFile),
      });
    }
  }

  return {
    sourceFile: sourceFile.fileName,
    compName,
    interfaceName: interfaceNameFor(compName),
    baseName: baseNameFor(compName),
    base: booleanOption(options, "base", false),
    genInterface: booleanOption(options, "genInterface", true),
    implements: implementsList(cls, sourceFile),
    fields,
    methods,
    doc: getDocComment(cls, sourceFile),
  };
}

function methodPriority(decorators: readonly DecoratorInfo[]): number {
  const info = decorators.find((candidate) => candidate.name === "MethodPriority");
  const value = info?.args?.[0];
  if (value === undefined) return 0;
  if (typeof value !== "number") throw new CollectError("@MethodPriority expects a numeric literal");
  return value;
}

function implementsList(cls: ts.ClassDeclaration, sourceFile: ts.SourceFile): string[] {
  if (cls.heritageClauses === undefined) return [];
  const names: string[] = [];
  for (const clause of cls.heritageClauses) {
    if (clause.token !== ts.SyntaxKind.ImplementsKeyword) continue;
    for (const type of clause.types) names.push(type.expression.getText(sourceFile));
  }
  return names;
}

/**
 * Rewrites component *class* names to the interface they generate, so a component
 * may write either `PosComp` or `Posc` in a type position. Interface names are what
 * the 502 ported Java call sites already spell.
 */
function rewriteComponentTypes(component: ComponentModel, componentNames: ReadonlySet<string>): void {
  const rewrite = (type: string): string => {
    let result = type;
    for (const name of componentNames) {
      result = result.replace(new RegExp(`\\b${name}\\b`, "g"), interfaceNameFor(name));
    }
    return result;
  };
  for (const field of component.fields) field.type = rewrite(field.type);
  for (const method of component.methods) {
    method.returnType = rewrite(method.returnType);
    for (const param of method.params) param.type = rewrite(param.type);
    method.signature = `${method.name}(${method.params.map((param) => param.type).join(", ")}): ${method.returnType}`;
  }
}

// ---- entity def model -----------------------------------------------------

function modelEntityDef(node: ts.Node, sourceFile: ts.SourceFile): EntityDefModel {
  if (!ts.isClassDeclaration(node) && !ts.isPropertyDeclaration(node)) {
    throw new CollectError("@EntityDef must decorate a class (or a field, for legacy types)");
  }
  const options = optionsOf(node, "EntityDef");
  const isType = ts.isClassDeclaration(node);
  const elementName = node.name === undefined ? "" : node.name.getText(sourceFile);
  if (typeof options.name !== "string" || options.name === "") {
    throw new CollectError(
      `@EntityDef on "${elementName}" must declare { name: "..." }: Java derived the name because ` +
        `@EntityDef.value() was a Class[] (EntityProcess.java:996-1000), TS decorators carry it explicitly.`,
    );
  }
  const components = options.components;
  if (!Array.isArray(components) || components.some((entry) => typeof entry !== "string")) {
    throw new CollectError(`@EntityDef({ name: "${options.name}" }).components must list component interfaces`);
  }
  return {
    sourceFile: sourceFile.fileName,
    declaredName: options.name,
    elementName,
    isType,
    componentRefs: components as string[],
    legacy: booleanOption(options, "legacy", false),
    pooled: booleanOption(options, "pooled", false),
    serialize: booleanOption(options, "serialize", true),
    genio: booleanOption(options, "genio", true),
    isFinal: booleanOption(options, "isFinal", true),
    excludeGroups: stringListOption(options, "excludeGroups"),
    doc: getDocComment(node, sourceFile),
  };
}

// ---- struct model ---------------------------------------------------------

function modelStruct(cls: ts.ClassDeclaration, sourceFile: ts.SourceFile): StructModel {
  const structName = cls.name!.text;
  const fields: StructFieldModel[] = [];
  for (const member of cls.members) {
    if (!ts.isPropertyDeclaration(member) || !ts.isIdentifier(member.name)) continue;
    const type = member.type?.getText(sourceFile) ?? inferType(member.initializer?.getText(sourceFile));
    const bitsInfo = decoratorsOf(member).find((candidate) => candidate.name === "StructField");
    const explicit = bitsInfo?.args?.[0];
    if (explicit !== undefined && (typeof explicit !== "number" || !Number.isInteger(explicit) || explicit <= 0)) {
      throw new CollectError(`@StructField on "${structName}.${member.name.text}" expects a positive integer`);
    }
    fields.push({
      name: member.name.text,
      type,
      bits: explicit === undefined ? defaultBits(type) : (explicit as number),
    });
  }
  return {
    sourceFile: sourceFile.fileName,
    structName,
    valueName: structName.slice(0, structName.length - "Struct".length),
    fields,
  };
}

// ---- misc helpers ---------------------------------------------------------

function modifierSet(node: ts.HasModifiers): Set<ts.SyntaxKind> {
  return new Set((ts.getModifiers(node) ?? []).map((modifier) => modifier.kind));
}

/** Returns the last `/** ... *​/` block in the node's leading trivia, if any. */
function getDocComment(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const trivia = sourceFile.text.slice(node.getFullStart(), node.getStart());
  const match = /\/\*\*[\s\S]*?\*\//.exec(trivia);
  return match ? match[0].trim() : undefined;
}

/** Minimal initializer -> type inference for fields without annotations. */
function inferType(initializer?: string): string {
  const text = initializer?.trim() ?? "";
  if (/^[-+]?(\d+\.?\d*|\.\d+)/.test(text)) return "number";
  if (/^["'`]/.test(text)) return "string";
  if (text === "true" || text === "false") return "boolean";
  return "unknown";
}

/** Longest common directory of the inputs; the base for stable class-id keys. */
export function commonRoot(files: readonly string[]): string {
  if (files.length === 0) return process.cwd();
  const directories = files.map((file) => path.dirname(path.resolve(file)));
  let root = directories[0];
  for (const directory of directories.slice(1)) {
    while (!directory.startsWith(root) && root !== path.dirname(root)) root = path.dirname(root);
  }
  return root;
}
