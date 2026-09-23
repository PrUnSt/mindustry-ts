import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { main } from "./cli.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(packageRoot, "fixtures");
/**
 * Scratch space comes from `TEMP`/`os.tmpdir()` and is left behind. Deleting a freshly
 * written tree is the flakiest part of Windows test suites (open handles, AV scans), so
 * each run gets its own directory instead.
 */
const tempRoot = fs.mkdtempSync(path.join(process.env.TEMP ?? os.tmpdir(), "codegen-cli-test-"));
const outDir = path.join(tempRoot, "gen");

describe("cli main()", () => {
  it("generates every artefact from the fixtures in one run", () => {
    expect(main([fixturesDir, outDir])).toBe(0);
    const written = fs.readdirSync(outDir).sort();
    expect(written).toEqual([
      "Building.ts",
      "EntityMapping.ts",
      "Entityc.ts",
      "Groups.ts",
      "Healthc.ts",
      "IndexableEntity__all.ts",
      "IndexableEntity__build.ts",
      "IndexableEntity__bullet.ts",
      "IndexableEntity__draw.ts",
      "IndexableEntity__effect.ts",
      "IndexableEntity__player.ts",
      "IndexableEntity__powerGraph.ts",
      "IndexableEntity__sync.ts",
      "IndexableEntity__unit.ts",
      "IndexableEntity__weather.ts",
      "MechUnit.ts",
      "MechUnitLegacyNova.ts",
      "Mechc.ts",
      "PosTeam.ts",
      "Posc.ts",
      "Teamc.ts",
      "Tile.ts",
      "Unit.ts",
      "UnitEntity.ts",
      "Unitc.ts",
    ]);
    expect(fs.readFileSync(path.join(outDir, "Posc.ts"), "utf8")).toContain("export interface Posc {");
    expect(fs.readFileSync(path.join(outDir, "Groups.ts"), "utf8")).toContain("static unit: EntityGroup<Unit>;");
    // `BuildingComp` sets genInterface: false, so no interface file may appear.
    expect(written).not.toContain("Buildingc.ts");
  });

  it("--check exits 0 straight after a generation (idempotent)", () => {
    expect(main([fixturesDir, outDir])).toBe(0);
    expect(main([fixturesDir, outDir, "--check"])).toBe(0);
  });

  it("--check exits 1 on drift and writes nothing", () => {
    expect(main([fixturesDir, outDir])).toBe(0);
    const target = path.join(outDir, "Posc.ts");
    const original = fs.readFileSync(target, "utf8");
    fs.writeFileSync(target, `${original}// hand edited\n`, "utf8");
    expect(main([fixturesDir, outDir, "--check"])).toBe(1);
    // The point of --check: it must not repair the file.
    expect(fs.readFileSync(target, "utf8")).toBe(`${original}// hand edited\n`);

    fs.writeFileSync(target, original, "utf8");
    expect(main([fixturesDir, outDir, "--check"])).toBe(0);
  });

  it("--check exits 1 when the output directory is missing", () => {
    expect(main([fixturesDir, path.join(tempRoot, "absent"), "--check"])).toBe(1);
  });

  it("returns a non-zero exit code without arguments", () => {
    expect(main([])).toBe(1);
  });

  it("returns a non-zero exit code when the input directory is missing", () => {
    expect(main([path.join(tempRoot, "does-not-exist"), outDir])).toBe(1);
  });

  it("returns a non-zero exit code on an unknown option", () => {
    expect(main([fixturesDir, outDir, "--watch"])).toBe(1);
  });

  it("reports generation errors instead of throwing", () => {
    const badDir = path.join(tempRoot, "bad");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(
      path.join(badDir, "Broken.def.ts"),
      ['import { EntityDef } from "../decorators.js";', "", '@EntityDef({ components: [] } as never)', "export class BrokenDef {}", ""].join("\n"),
      "utf8",
    );
    expect(main([badDir, path.join(tempRoot, "bad-out")])).toBe(1);
  });
});
