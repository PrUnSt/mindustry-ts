import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { generate } from "./codegen.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sampleComp = path.join(packageRoot, "fixtures", "sample.comp.ts");

describe("generate()", () => {
  it("emits one output file per component, named after the interface", () => {
    const outputs = generate([sampleComp]);
    expect([...outputs.keys()]).toEqual(["Pos.gen.ts"]);
  });

  it("emits the entity interface with field and method declarations", () => {
    const content = generate([sampleComp]).get("Pos.gen.ts")!;
    expect(content).toContain("export interface Pos {");
    expect(content).toContain("x: number;");
    expect(content).toContain("y: number;");
    expect(content).toContain("dst(other: Pos): number;");
  });

  it("emits the merged entity class with field defaults and method bodies", () => {
    const content = generate([sampleComp]).get("Pos.gen.ts")!;
    expect(content).toContain("export class PosEntity implements Pos {");
    expect(content).toContain("x: number = 0;");
    expect(content).toContain("y: number = 0;");
    expect(content).toContain("dst(other: Pos): number {");
    expect(content).toContain("return Math.sqrt(dx * dx + dy * dy);");
  });

  it("carries the component doc comment into the generated interface", () => {
    const content = generate([sampleComp]).get("Pos.gen.ts")!;
    expect(content).toContain("Position component: 2D coordinates plus a distance helper.");
  });

  it("is deterministic and syntactically valid", () => {
    const a = generate([sampleComp]).get("Pos.gen.ts")!;
    const b = generate([sampleComp]).get("Pos.gen.ts")!;
    expect(a).toBe(b);

    const parsed = ts.createSourceFile("Pos.gen.ts", a, ts.ScriptTarget.Latest, true);
    // parseDiagnostics exists at runtime but is not part of the public SourceFile type.
    const diagnostics = (parsed as unknown as { parseDiagnostics: readonly unknown[] }).parseDiagnostics;
    expect(diagnostics).toHaveLength(0);
  });

  it("ignores files without @Component classes", () => {
    const outputs = generate([path.join(packageRoot, "fixtures", "decorators.ts")]);
    expect(outputs.size).toBe(0);
  });

  it("skips static and private members in the generated output", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codegen-test-"));
    try {
      const input = path.join(dir, "edge.comp.ts");
      fs.writeFileSync(
        input,
        [
          'import { Component } from "../decorators.js";',
          "",
          "@Component()",
          "export class Edgec {",
          "  x: number = 1;",
          "  static count: number = 0;",
          '  private secret: string = "s";',
          "  private hide(): void {}",
          "  public visible(): number {",
          "    return this.x;",
          "  }",
          "}",
          "",
        ].join("\n"),
        "utf8",
      );
      const content = generate([input]).get("Edge.gen.ts")!;
      expect(content).toContain("export interface Edge {");
      expect(content).toContain("x: number;");
      expect(content).toContain("visible(): number;");
      expect(content).not.toContain("count");
      expect(content).not.toContain("secret");
      expect(content).not.toContain("hide");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});