import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { DEFAULT_CONFIG, DEFAULT_GROUPS, type GroupConfig } from "../config.js";
import { GroupGenError, generateGroupFiles } from "./groupGen.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const groundTruth = new Set(
  fs
    .readFileSync(path.join(packageRoot, "fixtures", "entity", "gen-classnames.txt"), "utf8")
    // 必须容忍 CRLF：Windows 上 autocrlf 可能把该文件检出为 CRLF，
    // 若逐行不 trim，line.endsWith(".class") 会全部落空、groundTruth 变成空集。
    // （根 .gitattributes 已对 *.txt 声明 eol=lf，这里是第二道防线。）
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".class"))
    .map((line) => line.replace("mindustry/gen/", "").replace(/\.class$/, "")),
);

const groupsFile = generateGroupFiles(DEFAULT_GROUPS).get("Groups.ts")!;

function parse(text: string): ts.SourceFile {
  return ts.createSourceFile("Groups.ts", text, ts.ScriptTarget.Latest, true);
}

/** Names of the static fields whose declared type is `EntityGroup<...>`. */
function groupFieldNames(text: string): string[] {
  const names: string[] = [];
  for (const statement of parse(text).statements) {
    if (!ts.isClassDeclaration(statement)) continue;
    for (const member of statement.members) {
      if (!ts.isPropertyDeclaration(member) || !ts.isIdentifier(member.name)) continue;
      const type = member.type?.getText();
      if (type !== undefined && type.startsWith("EntityGroup<")) names.push(member.name.text);
    }
  }
  return names;
}

/** Entries of the generated `groupExcludes` metadata table. */
function groupExcludes(text: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const statement of parse(text).statements) {
    if (!ts.isClassDeclaration(statement)) continue;
    for (const member of statement.members) {
      if (!ts.isPropertyDeclaration(member) || member.name.getText() !== "groupExcludes") continue;
      if (member.initializer === undefined || !ts.isObjectLiteralExpression(member.initializer)) continue;
      for (const property of member.initializer.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isArrayLiteralExpression(property.initializer)) continue;
        result[property.name.getText()] = property.initializer.elements.map((element) => element.getText().replace(/^"|"$/g, ""));
      }
    }
  }
  return result;
}

describe("generateGroupFiles (EntityProcess.java:664-746 + GroupDefs.java:6-17)", () => {
  it("emits exactly the ten groups from GroupDefs.java, no more and no fewer", () => {
    const names = groupFieldNames(groupsFile);
    expect(names).toHaveLength(10);
    expect(new Set(names)).toEqual(
      new Set(["all", "effect", "player", "bullet", "unit", "build", "sync", "draw", "weather", "powerGraph"]),
    );
    // Declaration order follows GroupDefs.java:6-17.
    expect(names).toEqual(DEFAULT_GROUPS.map((group) => group.name));
  });

  it("records GroupDefs.java:7's exclusion list for `all` exactly", () => {
    const excludes = groupExcludes(groupsFile);
    expect(excludes.all).toEqual(["Unitc", "PowerGraphUpdaterc", "Bulletc", "EffectStatec", "Playerc"]);
    expect(excludes.unit).toEqual([]);
    expect(Object.keys(excludes)).toEqual(DEFAULT_GROUPS.map((group) => group.name));
  });

  it("parametrises each group over the type Java would have used", () => {
    // `repr.base() ? baseName(repr) : interfaceName(repr)` (EntityProcess.java:251):
    // base components resolve to their abstract class, the rest to their interface.
    expect(groupsFile).toContain("static unit: EntityGroup<Unit>;");
    expect(groupsFile).toContain("static build: EntityGroup<Building>;");
    expect(groupsFile).toContain("static player: EntityGroup<Player>;");
    expect(groupsFile).toContain("static all: EntityGroup<Entityc>;");
    for (const group of DEFAULT_GROUPS) expect(groundTruth.has(group.baseType)).toBe(true);
  });

  it("emits one IndexableEntity__ marker interface per group", () => {
    const files = generateGroupFiles(DEFAULT_GROUPS);
    expect(files.size).toBe(11); // 10 markers + Groups.ts
    for (const group of DEFAULT_GROUPS) {
      const marker = files.get(`IndexableEntity__${group.name}.ts`)!;
      expect(marker).toContain(`export interface IndexableEntity__${group.name} {`);
      expect(marker).toContain(`setIndex__${group.name}(index: number): void;`);
    }
  });

  it("carries GroupDefs flags into init/resize/update", () => {
    // spatial: bullet, unit -> resize + updatePhysics; update: all, build; collide: bullet.
    expect(groupsFile).toContain("Groups.bullet.resize(x, y, w, h);");
    expect(groupsFile).toContain("Groups.unit.resize(x, y, w, h);");
    expect(groupsFile).toContain("Groups.unit.updatePhysics();");
    expect(groupsFile).toContain("Groups.all.update();");
    expect(groupsFile).toContain("Groups.build.update();");
    expect(groupsFile).toContain("Groups.bullet.collide();");
    expect(groupsFile).toContain("new EntityGroup<Unit>(true, true, (e, index) => {");
    expect(groupsFile).not.toContain("Groups.draw.update();");
  });

  it("is deterministic", () => {
    expect(generateGroupFiles(DEFAULT_GROUPS).get("Groups.ts")).toBe(groupsFile);
  });

  it("emits a different field set when the group table changes (counterfactual)", () => {
    // If the assertions above were vacuous (e.g. matching an empty file), adding a group
    // would not move them. It must.
    const extended: GroupConfig[] = [...DEFAULT_GROUPS, { ...DEFAULT_GROUPS[1], name: "extra" }];
    const names = groupFieldNames(generateGroupFiles(extended).get("Groups.ts")!);
    expect(names).toHaveLength(11);
    expect(names).not.toEqual(groupFieldNames(groupsFile));
  });

  it("rejects an empty group table", () => {
    expect(() => generateGroupFiles([])).toThrow(GroupGenError);
    expect(DEFAULT_CONFIG.groups).toBe(DEFAULT_GROUPS);
  });
});
