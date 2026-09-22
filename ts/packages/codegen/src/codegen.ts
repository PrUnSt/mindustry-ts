import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/** A field extracted from a component class. */
export interface ComponentField {
  name: string;
  /** Type annotation text, or a type inferred from the initializer. */
  type: string;
  /** Initializer source text (e.g. `0`), if present. */
  initializer?: string;
  optional: boolean;
  readonly: boolean;
  /** Static members are recognized but not emitted by the minimal generator. */
  static: boolean;
  /** Private members are recognized but not emitted. */
  private: boolean;
  /** Leading `/** *​/` doc comment, if present. */
  doc?: string;
}

/** A method parameter extracted from a component class. */
export interface ComponentMethodParameter {
  name: string;
  type?: string;
  optional: boolean;
}

/** A method extracted from a component class. */
export interface ComponentMethod {
  name: string;
  parameters: ComponentMethodParameter[];
  returnType?: string;
  /** Raw source text of the body (including braces), if the method is concrete. */
  body?: string;
  static: boolean;
  private: boolean;
  doc?: string;
}

/** The model of one `@Component()` class, ready to be rendered. */
export interface ComponentModel {
  /** Absolute path of the source file the component was found in. */
  sourceFile: string;
  /** Component class name, e.g. `Posc`. */
  compName: string;
  /** Generated entity interface name, e.g. `Pos`. */
  interfaceName: string;
  /** Generated merged entity class name, e.g. `PosEntity`. */
  entityName: string;
  doc?: string;
  fields: ComponentField[];
  methods: ComponentMethod[];
}

/** `Posc` -> `Pos` (a trailing `c` is stripped; other names are kept). */
export function interfaceNameFor(compName: string): string {
  return compName.length > 1 && compName.endsWith("c") ? compName.slice(0, -1) : compName;
}

/** `Posc` -> `PosEntity`. */
export function entityNameFor(compName: string): string {
  return interfaceNameFor(compName) + "Entity";
}

/**
 * Parses every file with the TypeScript compiler API and generates, for each
 * `@Component()` class, one output file (key = `<InterfaceName>.gen.ts`).
 */
export function generate(files: string[]): Map<string, string> {
  const results = new Map<string, string>();
  for (const file of files) {
    const abs = path.resolve(file);
    const text = fs.readFileSync(abs, "utf8");
    const sourceFile = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, /* setParentNodes */ true);
    for (const component of extractComponents(sourceFile)) {
      results.set(`${component.interfaceName}.gen.ts`, renderComponent(component));
    }
  }
  return results;
}

// ---- extraction -----------------------------------------------------------

function extractComponents(sourceFile: ts.SourceFile): ComponentModel[] {
  const components: ComponentModel[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name !== undefined && hasComponentDecorator(node)) {
      components.push(modelComponent(node, sourceFile));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return components;
}

function hasComponentDecorator(node: ts.ClassDeclaration): boolean {
  if (!ts.canHaveDecorators(node)) return false;
  return (ts.getDecorators(node) ?? []).some(isComponentDecorator);
}

function isComponentDecorator(decorator: ts.Decorator): boolean {
  const expression = decorator.expression;
  const callee = ts.isCallExpression(expression) ? expression.expression : expression;
  return ts.isIdentifier(callee) && callee.text === "Component";
}

function modelComponent(cls: ts.ClassDeclaration, sourceFile: ts.SourceFile): ComponentModel {
  const compName = cls.name!.text;
  const fields: ComponentField[] = [];
  const methods: ComponentMethod[] = [];

  for (const member of cls.members) {
    if (ts.isPropertyDeclaration(member)) {
      if (!ts.isIdentifier(member.name)) continue;
      const modifiers = modifierSet(member);
      const type =
        member.type?.getText(sourceFile) ??
        inferTypeFromInitializer(member.initializer?.getText(sourceFile));
      fields.push({
        name: member.name.text,
        type,
        initializer: member.initializer?.getText(sourceFile),
        optional: member.questionToken !== undefined,
        readonly: modifiers.has(ts.SyntaxKind.ReadonlyKeyword),
        static: modifiers.has(ts.SyntaxKind.StaticKeyword),
        private: modifiers.has(ts.SyntaxKind.PrivateKeyword),
        doc: getDocComment(member, sourceFile),
      });
    } else if (ts.isMethodDeclaration(member)) {
      if (!ts.isIdentifier(member.name)) continue;
      const modifiers = modifierSet(member);
      methods.push({
        name: member.name.text,
        parameters: member.parameters.map((parameter) => ({
          name: parameter.name.getText(sourceFile),
          type: parameter.type?.getText(sourceFile),
          optional: parameter.questionToken !== undefined,
        })),
        returnType: member.type?.getText(sourceFile),
        body:
          member.body !== undefined
            ? sourceFile.text.slice(member.body.pos, member.body.end)
            : undefined,
        static: modifiers.has(ts.SyntaxKind.StaticKeyword),
        private: modifiers.has(ts.SyntaxKind.PrivateKeyword),
        doc: getDocComment(member, sourceFile),
      });
    }
  }

  return {
    sourceFile: sourceFile.fileName,
    compName,
    interfaceName: interfaceNameFor(compName),
    entityName: entityNameFor(compName),
    doc: getDocComment(cls, sourceFile),
    fields,
    methods,
  };
}

function modifierSet(node: ts.HasModifiers): Set<ts.SyntaxKind> {
  return new Set((ts.getModifiers(node) ?? []).map((m) => m.kind));
}

/** Returns the last `/** ... *​/` block in the node's leading trivia, if any. */
function getDocComment(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const trivia = sourceFile.text.slice(node.getFullStart(), node.getStart());
  const match = /\/\*\*[\s\S]*?\*\//.exec(trivia);
  return match ? match[0].trim() : undefined;
}

/** Minimal initializer -> type inference for fields without annotations. */
function inferTypeFromInitializer(initializer?: string): string {
  const text = initializer?.trim() ?? "";
  if (/^[-+]?(\d+\.?\d*|\.\d+)/.test(text)) return "number";
  if (/^["'`]/.test(text)) return "string";
  if (text === "true" || text === "false") return "boolean";
  if (text === "null") return "null";
  if (text.startsWith("[")) return "unknown[]";
  if (text.startsWith("{")) return "object";
  return "unknown";
}

// ---- rendering ------------------------------------------------------------

function renderComponent(component: ComponentModel): string {
  const lines: string[] = [];
  lines.push("// Generated by @mindustry-ts/codegen. Do not edit.");
  lines.push(`// Source: ${path.basename(component.sourceFile)}`);
  lines.push("/* eslint-disable */");
  lines.push("");

  // Entity interface: field + method declarations.
  const interfaceDoc = component.doc ?? `/** Component interface for {@link ${component.compName}}. */`;
  lines.push(interfaceDoc);
  lines.push(`export interface ${component.interfaceName} {`);
  for (const field of component.fields) {
    if (field.private || field.static) continue;
    pushDoc(lines, field.doc, 2);
    lines.push(`  ${field.readonly ? "readonly " : ""}${field.name}${field.optional ? "?" : ""}: ${rewriteType(component, field.type)};`);
  }
  for (const method of component.methods) {
    if (method.private || method.static) continue;
    pushDoc(lines, method.doc, 2);
    lines.push(`  ${renderSignature(component, method)};`);
  }
  lines.push("}");
  lines.push("");

  // Merged entity class: field defaults + concrete method bodies.
  lines.push(`/** Merged entity class for {@link ${component.compName}}. */`);
  lines.push(`export class ${component.entityName} implements ${component.interfaceName} {`);
  for (const field of component.fields) {
    if (field.private || field.static) continue;
    pushDoc(lines, field.doc, 2);
    const initializer = !field.optional && field.initializer !== undefined ? ` = ${field.initializer}` : "";
    lines.push(`  ${field.readonly ? "readonly " : ""}${field.name}${field.optional ? "?" : ""}: ${rewriteType(component, field.type)}${initializer};`);
  }
  for (const method of component.methods) {
    if (method.private || method.static || method.body === undefined) continue;
    pushDoc(lines, method.doc, 2);
    lines.push(`  ${renderSignature(component, method)} ${renderBody(method.body, 2)}`);
  }
  lines.push("}");

  return lines.join("\n") + "\n";
}

function pushDoc(lines: string[], doc: string | undefined, indent: number): void {
  if (doc === undefined) return;
  const pad = " ".repeat(indent);
  for (const line of doc.split("\n")) {
    lines.push(line.trim() === "" ? "" : pad + line);
  }
}

function renderSignature(component: ComponentModel, method: ComponentMethod): string {
  const params = method.parameters
    .map((parameter) => {
      const type = parameter.type !== undefined ? `: ${rewriteType(component, parameter.type)}` : "";
      return `${parameter.name}${parameter.optional ? "?" : ""}${type}`;
    })
    .join(", ");
  const returns = method.returnType !== undefined ? `: ${rewriteType(component, method.returnType)}` : "";
  return `${method.name}(${params})${returns}`;
}

/**
 * Re-indents a copied method body: strips the common indentation of the
 * non-first lines (the opening line, usually `{`, is skipped), then applies
 * `memberIndent` to every line.
 */
function renderBody(body: string, memberIndent: number): string {
  const lines = body.split("\n");
  let base = Infinity;
  let seenFirst = false;
  for (const line of lines) {
    if (line.trim() === "") continue;
    if (!seenFirst) {
      seenFirst = true;
      continue;
    }
    const match = /^[ \t]*/.exec(line)!;
    base = Math.min(base, match[0].length);
  }
  const pad = " ".repeat(memberIndent);
  return lines
    .map((line, index) => {
      if (line.trim() === "") return "";
      const cut = base === Infinity ? 0 : Math.min(base, line.length - line.trimStart().length);
      // The opening line (usually `{`) stays glued to the signature above it.
      return index === 0 ? line.slice(cut) : pad + line.slice(cut);
    })
    .join("\n");
}

/**
 * Rewrites references to the component's own class name to the generated
 * interface name (`Posc` -> `Pos`) so the output stays self-contained.
 * References to any other type are copied verbatim (they may need imports —
 * see the README extension points).
 */
function rewriteType(component: ComponentModel, type: string): string {
  return type.replace(new RegExp(`\\b${escapeRegExp(component.compName)}\\b`, "g"), component.interfaceName);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}