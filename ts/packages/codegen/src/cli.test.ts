import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { main } from "./cli.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(packageRoot, "fixtures");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codegen-cli-test-"));

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("cli main()", () => {
  it("writes generated files into the output directory", () => {
    const outputDir = path.join(tempRoot, "gen");
    expect(main([fixturesDir, outputDir])).toBe(0);

    const outputFile = path.join(outputDir, "Pos.gen.ts");
    expect(fs.existsSync(outputFile)).toBe(true);
    const content = fs.readFileSync(outputFile, "utf8");
    expect(content).toContain("export interface Pos {");
    expect(content).toContain("export class PosEntity implements Pos {");
  });

  it("returns a non-zero exit code without arguments", () => {
    expect(main([])).toBe(1);
  });

  it("returns a non-zero exit code when the input directory is missing", () => {
    expect(main([path.join(tempRoot, "does-not-exist"), path.join(tempRoot, "out")])).toBe(1);
  });
});