import path from "node:path";
import { DEFAULT_CONFIG, type CodegenConfig } from "../config.js";

/**
 * Port of `StructProcess.java` (207 lines) — "value types" that pack several
 * fields into one integer primitive.
 *
 * TS has no fixed-width integers, so where Java picks `byte`/`short`/`int`/`long`
 * this generator picks `number` (<= 32 bits, using JS's 32-bit bitwise operators)
 * or `bigint` (64 bits). Field offsets, masks and the accessor shape are the same.
 */

export interface StructFieldModel {
  readonly name: string;
  /** Source type text; only `number` and `boolean` are packable in S2. */
  readonly type: string;
  /** Bit width: `@StructField(n)` if given, else 32 for `number` / 1 for `boolean`. */
  readonly bits: number;
}

export interface StructModel {
  readonly sourceFile: string;
  /** Declared class name; must end in `Struct` (Java `:29-32`). */
  readonly structName: string;
  /** `TileStruct` -> `Tile`. */
  readonly valueName: string;
  readonly fields: readonly StructFieldModel[];
}

export class StructGenError extends Error {}

/** Java `typeSize` (`:191-206`). */
export function defaultBits(type: string): number {
  switch (type.trim()) {
    case "boolean":
      return 1;
    case "number":
      return 32;
    default:
      throw new StructGenError(
        `Unsupported struct field type "${type}": S2 packs only "number" and "boolean" (float packing needs Float32Array reinterpretation)`,
      );
  }
}

/** Java `bitString(offset, size, totalSize)` (`:145-151`). */
export function bitString(offset: number, size: number, totalSize: number): string {
  const bits = "0".repeat(offset) + "1".repeat(size) + "0".repeat(totalSize - size - offset);
  return "0b" + [...bits].reverse().join("");
}

/** Java `bitString(size, totalSize)` (`:153-158`) — value mask `2^size - 1`. */
export function valueBitString(size: number, totalSize: number): string {
  const bits = "1".repeat(size) + "0".repeat(totalSize - size);
  return "0b" + [...bits].reverse().join("");
}

/** Java `typeForSize` (`:177-188`). */
export function totalSizeFor(bits: number): 8 | 16 | 32 | 64 {
  if (bits <= 8) return 8;
  if (bits <= 16) return 16;
  if (bits <= 32) return 32;
  if (bits <= 64) return 64;
  throw new StructGenError(`Too many fields, must fit in 64 bits. Current size: ${bits}`);
}

export function generateStructFiles(
  structs: readonly StructModel[],
  config: CodegenConfig = DEFAULT_CONFIG,
): Map<string, string> {
  const outputs = new Map<string, string>();
  for (const struct of structs) outputs.set(`${struct.valueName}.ts`, renderStruct(struct, config));
  return outputs;
}

function renderStruct(struct: StructModel, config: CodegenConfig): string {
  if (!struct.structName.endsWith("Struct")) {
    throw new StructGenError(`All classes annotated with @Struct must have class names ending in 'Struct': "${struct.structName}"`);
  }
  if (struct.fields.length === 0) throw new StructGenError(`Struct "${struct.structName}" has no fields`);

  for (const field of struct.fields) {
    if (field.type.trim() === "boolean" && field.bits !== 1) {
      throw new StructGenError(`Booleans can only be one bit long (field "${struct.structName}.${field.name}")`);
    }
  }

  const used = struct.fields.reduce((sum, field) => sum + field.bits, 0);
  const total = totalSizeFor(used);
  const wide = total === 64;
  /** Storage literal for a non-negative integer. */
  const num = (value: number): string => (wide ? `${value}n` : `${value}`);
  const one = wide ? "1n" : "1";
  const zero = wide ? "0n" : "0";
  /** Mask literal for the bits `[offset, offset + size)`. */
  const mask = (offset: number, size: number): string => {
    const literal = bitString(offset, size, total);
    return wide ? `${literal}n` : literal;
  };
  const singleBit = (offset: number): string => `${one} << ${num(offset)}`;
  const toStorage = (text: string): string => (wide ? `BigInt(${text})` : text);
  const fromStorage = (text: string): string => (wide ? `Number(${text})` : text);
  const shr = (text: string, offset: number): string => (wide ? `(${text} >> ${num(offset)})` : `(${text} >>> ${offset})`);

  const offsets = new Map<string, number>();
  let cursor = 0;
  for (const field of struct.fields) {
    offsets.set(field.name, cursor);
    cursor += field.bits;
  }

  const lines: string[] = [];
  lines.push(config.generatedHeader);
  lines.push(`// Source: ${path.basename(struct.sourceFile)}`);
  lines.push("/* eslint-disable */");
  lines.push("");
  lines.push("/**");
  lines.push(` * Bit-packs {@link ${struct.structName}} into a ${total}-bit value.`);
  lines.push(` * Bits used: ${used} / ${total}`);
  for (const field of struct.fields) {
    const offset = offsets.get(field.name)!;
    lines.push(` * <br>  ${field.name} [${offset}..${offset + field.bits}]`);
  }
  lines.push(" */");
  lines.push(`export type ${struct.valueName}Value = ${wide ? "bigint" : "number"};`);
  lines.push("");
  lines.push(`export class ${struct.valueName} {`);

  // Java `:84-85` — one `bitMask<Field>` constant per field.
  for (const field of struct.fields) {
    const offset = offsets.get(field.name)!;
    const initializer = field.type.trim() === "boolean" ? singleBit(offset) : mask(offset, field.bits);
    lines.push(`  /** Bits [${offset}..${offset + field.bits}). */`);
    lines.push(`  static readonly bitMask${field.name.charAt(0).toUpperCase()}${field.name.slice(1)} = ${initializer};`);
  }
  lines.push("");

  // Java `:53-58,133-134` — `get(fields...) : structType`.
  const params = struct.fields.map((field) => `${field.name}: ${field.type.trim()}`).join(", ");
  const terms = struct.fields.map((field) => {
    const offset = offsets.get(field.name)!;
    if (field.type.trim() === "boolean") return `(${field.name} ? ${singleBit(offset)} : ${zero})`;
    const shifted = `${toStorage(field.name)} << ${num(offset)}`;
    if (field.bits === total && offset === 0) return `(${shifted})`;
    return `((${shifted}) & ${mask(offset, field.bits)})`;
  });
  lines.push("  /** Packs every field (Java `StructProcess.java:53-58`). */");
  lines.push(`  static get(${params}): ${struct.valueName}Value {`);
  lines.push(`    return ${terms.join(" | ")};`);
  lines.push("  }");
  lines.push("");

  for (const field of struct.fields) {
    const offset = offsets.get(field.name)!;
    const type = field.type.trim();
    const packed = `${struct.valueName.toLowerCase()}`;
    lines.push(`  /** Reads ${field.name} (Java getter, StructProcess.java:72-97). */`);
    lines.push(`  static ${field.name}(${packed}: ${struct.valueName}Value): ${type};`);
    lines.push(`  /** Writes ${field.name} (Java setter, StructProcess.java:99-119). */`);
    lines.push(`  static ${field.name}(${packed}: ${struct.valueName}Value, fieldValue: ${type}): ${struct.valueName}Value;`);
    lines.push(`  static ${field.name}(${packed}: ${struct.valueName}Value, fieldValue?: ${type}): ${type} | ${struct.valueName}Value {`);
    if (type === "boolean") {
      lines.push(`    if (fieldValue === undefined) return (${packed} & ${singleBit(offset)}) !== ${zero};`);
      lines.push(`    if (fieldValue) return ${packed} | ${singleBit(offset)};`);
      lines.push(`    return ${packed} & ${wide ? `~(1n << ${num(offset)})` : `~(1 << ${offset})`};`);
    } else {
      lines.push(`    if (fieldValue === undefined) return ${fromStorage(`${shr(packed, offset)} & ${mask(0, field.bits)}`)};`);
      lines.push(`    return (${packed} & ~${mask(offset, field.bits)}) | (${toStorage("fieldValue")} << ${num(offset)});`);
    }
    lines.push("  }");
    lines.push("");
  }

  while (lines[lines.length - 1] === "") lines.pop();
  lines.push("}");
  return lines.join("\n") + "\n";
}
