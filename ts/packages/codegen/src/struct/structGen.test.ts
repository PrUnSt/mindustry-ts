import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { collectModels } from "../codegen.js";
import { DEFAULT_CONFIG } from "../config.js";
import {
  StructGenError,
  bitString,
  defaultBits,
  generateStructFiles,
  totalSizeFor,
  valueBitString,
  type StructModel,
} from "./structGen.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturesRoot = path.join(packageRoot, "fixtures");
/**
 * Scratch directory for the generated file that the round-trip tests import. It has to
 * live inside the package for vite to transform it, and `.vitest-cache/` is already
 * gitignored, so the file is left in place rather than deleted.
 */
const scratchDir = path.join(packageRoot, ".vitest-cache", "struct-test");

function collectStructs(): StructModel[] {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".def.ts")) files.push(full);
    }
  };
  walk(fixturesRoot);
  return collectModels(files.sort()).structs;
}

const structs = collectStructs();
const tile = generateStructFiles(structs).get("Tile.ts")!;

/** Writes the generated file somewhere vite can transform, then imports it. */
async function importGenerated(name: string, content: string): Promise<Record<string, any>> {
  fs.mkdirSync(scratchDir, { recursive: true });
  const target = path.join(scratchDir, `${name}.ts`);
  fs.writeFileSync(target, content, "utf8");
  return (await import(/* @vite-ignore */ pathToFileURL(target).href)) as Record<string, any>;
}

describe("generateStructFiles (StructProcess.java)", () => {
  it("derives the value class name by stripping the Struct suffix", () => {
    expect(structs.map((struct) => struct.structName)).toEqual(["TileStruct"]);
    expect(structs[0].valueName).toBe("Tile");
    // `@StructField` overrides the default width of `number` (32 bits, Java's `int`).
    expect(structs[0].fields.map((field) => [field.name, field.bits])).toEqual([
      ["x", 16],
      ["y", 16],
      ["block", 16],
      ["floor", 8],
      ["overlay", 8],
    ]);
  });

  it("emits the five Tile fields with their offsets", () => {
    for (const field of ["x", "y", "block", "floor", "overlay"]) expect(tile).toContain(`static ${field}(tile: TileValue`);
    expect(tile).toContain(" * Bits used: 64 / 64");
    expect(tile).toContain(" * <br>  x [0..16]");
    expect(tile).toContain(" * <br>  block [32..48]");
    expect(tile).toContain(" * <br>  overlay [56..64]");
  });

  it("picks the storage width from the total, matching Java's typeForSize", () => {
    expect(tile).toContain("export type TileValue = bigint;");
    expect(generateStructFiles([{ ...structs[0], fields: [{ name: "x", type: "number", bits: 16 }] }]).get("Tile.ts")).toContain(
      "export type TileValue = number;",
    );
  });

  it("computes masks exactly like Java's bitString", () => {
    expect(BigInt(bitString(0, 16, 64))).toBe(0xffffn);
    expect(BigInt(bitString(16, 16, 64))).toBe(0xffffn << 16n);
    expect(BigInt(bitString(48, 8, 64))).toBe(0xffn << 48n);
    expect(BigInt(valueBitString(8, 64))).toBe(0xffn);
    expect(BigInt(valueBitString(16, 64))).toBe(0xffffn);
    expect(totalSizeFor(1)).toBe(8);
    expect(totalSizeFor(9)).toBe(16);
    expect(totalSizeFor(33)).toBe(64);
    expect(() => totalSizeFor(65)).toThrow(StructGenError);
  });

  it("rejects unpacksafe types and oversized structs", () => {
    expect(defaultBits("number")).toBe(32);
    expect(defaultBits("boolean")).toBe(1);
    expect(() => defaultBits("float")).toThrow(/Unsupported struct field type/);
    expect(() =>
      generateStructFiles([{ sourceFile: "x.ts", structName: "BigStruct", valueName: "Big", fields: [{ name: "a", type: "number", bits: 64 }, { name: "b", type: "number", bits: 8 }] }]),
    ).toThrow(/must fit in 64 bits/);
    expect(() =>
      generateStructFiles([{ sourceFile: "x.ts", structName: "NoSuffix", valueName: "No", fields: [{ name: "a", type: "number", bits: 8 }] }]),
    ).toThrow(/must have class names ending in 'Struct'/);
  });
});

describe("the generated Tile value class actually works", () => {
  it("round-trips every field through get/set", async () => {
    const { Tile } = await importGenerated("Tile", tile);
    const packed = Tile.get(1, 2, 3, 4, 5);
    expect(typeof packed).toBe("bigint");
    expect(Tile.x(packed)).toBe(1);
    expect(Tile.y(packed)).toBe(2);
    expect(Tile.block(packed)).toBe(3);
    expect(Tile.floor(packed)).toBe(4);
    expect(Tile.overlay(packed)).toBe(5);

    // Each setter must only touch its own 8/16 bits.
    const retargeted = Tile.overlay(Tile.block(packed, 7), 9);
    expect(Tile.block(retargeted)).toBe(7);
    expect(Tile.overlay(retargeted)).toBe(9);
    expect(Tile.x(retargeted)).toBe(1);
    expect(Tile.y(retargeted)).toBe(2);
    expect(Tile.floor(retargeted)).toBe(4);
  });

  it("lays the fields out in declaration order, low bits first", async () => {
    const { Tile } = await importGenerated("Tile", tile);
    expect(Tile.bitMaskX).toBe(0xffffn);
    expect(Tile.bitMaskY).toBe(0xffffn << 16n);
    expect(Tile.bitMaskBlock).toBe(0xffffn << 32n);
    expect(Tile.bitMaskFloor).toBe(0xffn << 48n);
    expect(Tile.bitMaskOverlay).toBe(0xffn << 56n);
    // All five fields tile the full 64-bit word with no gaps.
    const union = Tile.bitMaskX | Tile.bitMaskY | Tile.bitMaskBlock | Tile.bitMaskFloor | Tile.bitMaskOverlay;
    expect(union).toBe(0xffffffffffffffffn);
    expect(Tile.get(0, 0, 0, 0, 255)).toBe(0xffn << 56n);
  });

  it("masks values that are wider than their field, with no spill", async () => {
    const { Tile } = await importGenerated("Tile", tile);
    // 0x1ffff does not fit in 16 bits; the excess must be dropped, not pushed into `y`.
    const packed = Tile.get(0x1ffff, 0, 0, 0, 0);
    expect(Tile.x(packed)).toBe(0xffff);
    expect(Tile.y(packed)).toBe(0);
  });
});

describe("struct config", () => {
  it("uses the shared header", () => {
    expect(tile.startsWith(DEFAULT_CONFIG.generatedHeader)).toBe(true);
  });
});
