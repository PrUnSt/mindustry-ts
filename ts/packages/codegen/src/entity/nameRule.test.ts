import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectModels } from "../codegen.js";
import { interfaceNameFor, baseNameFor, interfaceToCompName } from "./nameRule.js";
import {
  NameRuleError,
  capitalize,
  createName,
  deriveEntityName,
  type EntityNameInput,
} from "./nameRule.js";
import { resolveEntities } from "./entityGen.js";
import { DEFAULT_GROUPS } from "../config.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturesRoot = path.join(packageRoot, "fixtures");
const entityFixtures = path.join(fixturesRoot, "entity");
const groundTruth = fs
  .readFileSync(path.join(entityFixtures, "gen-classnames.txt"), "utf8")
  // 必须容忍 CRLF（同 groupGen.test.ts 的理由：否则 groundTruth 会变成空数组）。
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.endsWith(".class"))
  .map((line) => line.replace("mindustry/gen/", "").replace(/\.class$/, ""));

/** Every `.def.ts` fixture, sorted, as the codegen pipeline sees them. */
function fixtureFiles(directory: string = fixturesRoot): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...fixtureFiles(full));
    else if (entry.name.endsWith(".def.ts")) found.push(full);
  }
  return found.sort();
}

function derive(partial: Partial<EntityNameInput> & Pick<EntityNameInput, "elementName">): string {
  return deriveEntityName({
    isType: false,
    componentNames: [],
    typeIsBase: false,
    legacy: false,
    ...partial,
  });
}

describe("name rules (EntityProcess.java:915-935,996-1000)", () => {
  it("maps component class names to role interfaces and abstract base names", () => {
    // One assertion per Java rule, on the names that actually appear in the ground truth.
    expect(interfaceNameFor("PosComp")).toBe("Posc");
    expect(interfaceNameFor("BuildingComp")).toBe("Buildingc");
    expect(interfaceNameFor("PowerGraphUpdaterComp")).toBe("PowerGraphUpdaterc");
    expect(baseNameFor("PosComp")).toBe("Pos");
    expect(baseNameFor("UnitComp")).toBe("Unit");
    expect(interfaceToCompName("Posc")).toBe("PosComp");
    expect(interfaceToCompName("Buildingc")).toBe("BuildingComp");
  });

  it("rejects names that do not end in Comp", () => {
    expect(() => interfaceNameFor("Posc")).toThrow(NameRuleError);
    expect(() => baseNameFor("Posc")).toThrow(/must have names that end with 'Comp'/);
    expect(() => createName(["Posc"])).toThrow(NameRuleError);
    expect(() => createName([])).toThrow(/zero components/);
  });

  it("sorts component names before concatenating, so order does not matter", () => {
    expect(createName(["UnitComp", "MechComp"])).toBe("MechUnit");
    expect(createName(["MechComp", "UnitComp"])).toBe("MechUnit");
    expect(createName(["UnitComp"])).toBe("Unit");
    expect(createName(["LegsComp", "UnitComp"])).toBe("LegsUnit");
    expect(createName(["PayloadComp", "UnitComp"])).toBe("PayloadUnit");
    expect(capitalize("nova")).toBe("Nova");
  });

  it("derives PosTeam from the Def-suffixed type name", () => {
    // `entities/comp/PosTeamDef.java` -> mindustry/gen/PosTeam.class
    expect(derive({ elementName: "PosTeamDef", isType: true, componentNames: ["TeamComp"] })).toBe("PosTeam");
    expect(groundTruth).toContain("PosTeam");
  });

  it("appends the Entity suffix when the derived name collides with the base class", () => {
    // `UnitTypes.java:51` puts @EntityDef on the field `flare` with {Unitc}: the derived
    // name `Unit` collides with the abstract base `Unit` (`baseNameFor("UnitComp")`), so
    // Java appends `Entity` -> `UnitEntity`. That is why both classes exist in the jar.
    expect(
      derive({ elementName: "flare", componentNames: ["UnitComp"], baseComponentName: "UnitComp" }),
    ).toBe("UnitEntity");
    expect(groundTruth).toContain("UnitEntity");
    expect(groundTruth).toContain("Unit");
  });

  it("does not add the Entity suffix when the def element is the base itself", () => {
    // `BuildingComp` carries its own @EntityDef and `@Component(base = true)`, so the
    // generated class *is* the base (`typeIsBase`) and keeps the plain name.
    expect(
      derive({ elementName: "BuildingComp", isType: true, componentNames: ["BuildingComp"], typeIsBase: true }),
    ).toBe("Building");
    expect(groundTruth).toContain("Building");
  });

  it("derives legacy names as <derived>Legacy<Capitalized element>", () => {
    expect(
      derive({ elementName: "nova", componentNames: ["UnitComp", "MechComp"], baseComponentName: "UnitComp", legacy: true }),
    ).toBe("MechUnitLegacyNova");
    expect(
      derive({ elementName: "spiroct", componentNames: ["UnitComp", "LegsComp"], baseComponentName: "UnitComp", legacy: true }),
    ).toBe("LegsUnitLegacySpiroct");
    expect(derive({ elementName: "mono", componentNames: ["UnitComp"], baseComponentName: "UnitComp", legacy: true })).toBe(
      "UnitEntityLegacyMono",
    );
    for (const name of ["MechUnitLegacyNova", "LegsUnitLegacySpiroct", "UnitEntityLegacyMono"]) {
      expect(groundTruth).toContain(name);
    }
  });

  it("rejects type def names without a Def/Comp suffix", () => {
    expect(() => derive({ elementName: "MechUnit", isType: true, componentNames: ["UnitComp"] })).toThrow(
      /must end with 'Def'\/'Comp'/,
    );
  });
});

describe("derived names vs the v160.5 ground truth", () => {
  it("loads a non-trivial class list from the jar listing", () => {
    // The fixture records names extracted from server-release v160.5 with `zipfile`.
    expect(groundTruth.length).toBeGreaterThan(280);
    expect(groundTruth).toContain("Unitc");
    expect(groundTruth).toContain("Buildingc");
    expect(groundTruth).not.toContain("BuildingCompc");
    expect(groundTruth).not.toContain("PosCompc");
  });

  it("agrees with the interface naming rule for every component fixture", () => {
    const model = collectModels(fixtureFiles(entityFixtures));
    for (const component of model.components) {
      expect(component.interfaceName).toBe(`${component.compName.slice(0, -"Comp".length)}c`);
      // Every generated interface name must be a real class in the jar. `Buildingc` is
      // emitted by Java even though it is empty; S2 skips the file (see entityGen tests).
      expect(groundTruth).toContain(component.interfaceName);
    }
  });

  it("agrees with the group base types declared in GroupDefs.java", () => {
    for (const group of DEFAULT_GROUPS) {
      expect(groundTruth).toContain(group.baseType);
      for (const name of [...group.value, ...group.exclude]) expect(groundTruth).toContain(name);
    }
  });

  it("raises when a fixture's declared name is not what Java's rules derive", () => {
    const model = collectModels(fixtureFiles(entityFixtures));
    const wrong = { ...model.entityDefs[0], declaredName: "NotWhatJavaDerives" };
    expect(() =>
      resolveEntities({
        components: model.components,
        entityDefs: [wrong],
        groups: [],
        classIds: new Map(),
        inputRoot: fixturesRoot,
      }),
    ).toThrow(/Entity name mismatch/);
  });

  it("has every fixture's derived name equal to its declared name", () => {
    const model = collectModels(fixtureFiles(fixturesRoot));
    expect(model.entityDefs.length).toBeGreaterThan(0);
    const resolved = resolveEntities({
      components: model.components,
      entityDefs: model.entityDefs,
      groups: DEFAULT_GROUPS,
      classIds: new Map(),
      inputRoot: fixturesRoot,
    });
    expect(resolved.map((entity) => entity.name).sort()).toEqual([
      "Building",
      "MechUnit",
      "MechUnitLegacyNova",
      "PosTeam",
      "UnitEntity",
    ]);
    for (const entity of resolved) {
      expect(entity.name).toBe(entity.def.declaredName);
      expect(groundTruth).toContain(entity.name);
    }
  });
});
