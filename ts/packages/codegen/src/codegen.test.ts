import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CollectError, collectModels, commonRoot, generate } from "./codegen.js";
import { DEFAULT_CONFIG, defaultConfig, nextClassId, parseClassIds, repositoryRoot, JAVA_CLASS_IDS_RELATIVE } from "./config.js";
import { assignClassIds, camelToKebab, nameAliases } from "./entity/entityMappingGen.js";
import type { EntityDefModel } from "./model.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = path.join(packageRoot, "fixtures");
/** Scratch fixtures for the failure cases; each run gets a fresh directory (see cli.test). */
const tempRoot = fs.mkdtempSync(path.join(process.env.TEMP ?? os.tmpdir(), "codegen-collect-test-"));

function fixtureFiles(directory: string = fixturesRoot): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...fixtureFiles(full));
    else if (entry.name.endsWith(".def.ts")) found.push(full);
  }
  return found.sort();
}

function writeFixture(name: string, source: string): string {
  const target = path.join(tempRoot, name);
  fs.writeFileSync(target, source, "utf8");
  return target;
}

describe("collectModels", () => {
  const model = collectModels(fixtureFiles());

  it("reads @Component options from the decorator argument", () => {
    const byName = new Map(model.components.map((component) => [component.compName, component]));
    expect(byName.get("PosComp")!.base).toBe(false);
    expect(byName.get("PosComp")!.genInterface).toBe(true);
    expect(byName.get("UnitComp")!.base).toBe(true);
    expect(byName.get("BuildingComp")!.base).toBe(true);
    // Java still emits an empty interface here; S2 records the flag and emits nothing.
    expect(byName.get("BuildingComp")!.genInterface).toBe(false);
  });

  it("derives interface and base names from the component class name", () => {
    for (const component of model.components) {
      expect(component.interfaceName).toBe(`${component.compName.slice(0, -4)}c`);
      expect(component.baseName).toBe(component.compName.slice(0, -4));
    }
  });

  it("reads field metadata: initializers, @Import, @ReadOnly and @SyncField", () => {
    const pos = model.components.find((component) => component.compName === "PosComp")!;
    expect(pos.fields.map((field) => [field.name, field.type, field.initializer, field.sync])).toEqual([
      ["x", "number", "0", true],
      ["y", "number", "0", true],
    ]);
    const team = model.components.find((component) => component.compName === "TeamComp")!;
    expect(team.fields.filter((field) => field.imported).map((field) => field.name)).toEqual(["x", "y"]);
    expect(team.fields.find((field) => field.name === "team")!.imported).toBe(false);
  });

  it("reads @Replace and @MethodPriority from method decorators", () => {
    const mech = model.components.find((component) => component.compName === "MechComp")!;
    expect(mech.methods.find((method) => method.name === "drownFloor")!.replace).toBe(true);
    expect(mech.methods.find((method) => method.name === "walkExtend")!.replace).toBe(false);
    expect(mech.methods.every((method) => method.priority === 0)).toBe(true);
  });

  it("keeps the body text exactly between its braces", () => {
    const pos = model.components.find((component) => component.compName === "PosComp")!;
    const set = pos.methods.find((method) => method.name === "set")!;
    expect(set.body!.startsWith("{")).toBe(true);
    expect(set.body!.endsWith("}")).toBe(true);
    expect(set.signature).toBe("set(number, number): void");
  });

  it("reads the whole @EntityDef option bag, including the field form", () => {
    const byName = new Map(model.entityDefs.map((def) => [def.declaredName, def]));
    expect(byName.get("MechUnit")).toMatchObject({
      elementName: "mace",
      isType: false,
      componentRefs: ["Unitc", "Mechc"],
      legacy: false,
      serialize: true,
    });
    expect(byName.get("MechUnitLegacyNova")!.legacy).toBe(true);
    expect(byName.get("PosTeam")).toMatchObject({ elementName: "PosTeamDef", isType: true, genio: false, isFinal: false });
    expect(byName.get("Building")!.excludeGroups).toEqual(["all"]);
    expect(byName.get("Building")!.serialize).toBe(false);
  });

  it("reads @Struct fields and their @StructField widths", () => {
    expect(model.structs).toHaveLength(1);
    expect(model.structs[0].fields.map((field) => field.bits)).toEqual([16, 16, 16, 8, 8]);
  });

  it("resolves the package root and the Java id table", () => {
    expect(repositoryRoot(packageRoot).endsWith("Mindustry")).toBe(true);
    expect(defaultConfig(packageRoot).classIdsPath).toBe(path.join(repositoryRoot(packageRoot), JAVA_CLASS_IDS_RELATIVE));
    expect(DEFAULT_CONFIG.classIdsPath).toBeNull();
  });
});

describe("collectModels failures", () => {
  it("requires an explicit entity name", () => {
    const file = writeFixture("NoName.def.ts", ["import { EntityDef } from \"../decorators.js\";", "", "@EntityDef({ components: [] })", "export class NonameDef {}", ""].join("\n"));
    expect(() => collectModels([file])).toThrow(/must declare \{ name: "\.\.\." \}/);
  });

  it("requires @SyncField to be a number", () => {
    const file = writeFixture(
      "BadSync.def.ts",
      ['import { Component, SyncField } from "../decorators.js";', "", "@Component()", "export abstract class BadSyncComp {", '  @SyncField(true) name: string = "x";', "}", ""].join("\n"),
    );
    expect(() => collectModels([file])).toThrow(CollectError);
  });

  it("rejects a bad @StructField width", () => {
    const file = writeFixture(
      "BadStruct.def.ts",
      ['import { Struct, StructField } from "../decorators.js";', "", "@Struct()", "export class BadStructStruct {", "  @StructField(0) x: number = 0;", "}", ""].join("\n"),
    );
    expect(() => collectModels([file])).toThrow(/positive integer/);
  });
});

describe("generate()", () => {
  it("runs every generator once and returns a flat file map", () => {
    const outputs = generate(fixtureFiles(), { inputRoot: fixturesRoot });
    expect(outputs.size).toBe(25);
    expect([...outputs.keys()].filter((name) => name.startsWith("IndexableEntity__"))).toHaveLength(10);
    expect(outputs.has("Tile.ts")).toBe(true);
    expect(outputs.has("EntityMapping.ts")).toBe(true);
  });

  it("is deterministic across runs", () => {
    const first = generate(fixtureFiles(), { inputRoot: fixturesRoot });
    const second = generate(fixtureFiles(), { inputRoot: fixturesRoot });
    expect([...second.entries()]).toEqual([...first.entries()]);
  });

  it("computes a common root for nested inputs", () => {
    expect(commonRoot([path.join(fixturesRoot, "entity", "PosComp.def.ts"), path.join(fixturesRoot, "struct", "Tile.def.ts")])).toBe(
      fixturesRoot,
    );
  });
});

describe("class id assignment", () => {
  const defs: EntityDefModel[] = [
    { sourceFile: path.join(fixturesRoot, "entity", "b.def.ts"), declaredName: "B", elementName: "b", isType: false, componentRefs: [], legacy: false, pooled: false, serialize: true, genio: true, isFinal: true, excludeGroups: [] },
    { sourceFile: path.join(fixturesRoot, "entity", "a.def.ts"), declaredName: "A", elementName: "a", isType: false, componentRefs: [], legacy: false, pooled: false, serialize: true, genio: true, isFinal: true, excludeGroups: [] },
  ];

  it("assigns ids in sorted source-element order, after the highest seeded id", () => {
    const ids = assignClassIds(defs, fixturesRoot, new Map([["seeded", 49]]));
    expect(ids.get("entity/a.def.ts:a")).toBe(50);
    expect(ids.get("entity/b.def.ts:b")).toBe(51);
    expect(nextClassId(ids)).toBe(52);
  });

  it("keeps existing ids stable when new definitions appear", () => {
    const first = assignClassIds(defs, fixturesRoot, new Map());
    const withExtra = assignClassIds([...defs, { ...defs[1], elementName: "c", declaredName: "C" }], fixturesRoot, first);
    for (const [key, id] of first) expect(withExtra.get(key)).toBe(id);
  });

  it("parses Java's classids.properties verbatim", () => {
    const ids = parseClassIds("#c\n\nalpha=0\nmindustry.entities.comp.BuildingComp=6\n");
    expect([...ids.entries()]).toEqual([
      ["alpha", 0],
      ["mindustry.entities.comp.BuildingComp", 6],
    ]);
    expect(nextClassId(ids)).toBe(7);
  });

  it("registers kebab-case and element-name aliases like Java's extraNames", () => {
    expect(camelToKebab("MechUnitLegacyNova")).toBe("mech-unit-legacy-nova");
    const entity = {
      def: defs[1],
      name: "MechUnitLegacyNova",
      classId: 4,
      legacy: true,
      typeIsBase: false,
      components: [],
      groups: [],
    };
    expect(nameAliases(entity)).toEqual([
      { alias: "MechUnitLegacyNova", target: "MechUnitLegacyNova" },
      { alias: "mech-unit-legacy-nova", target: "MechUnitLegacyNova" },
      { alias: "a", target: "MechUnitLegacyNova" },
    ]);
  });
});
