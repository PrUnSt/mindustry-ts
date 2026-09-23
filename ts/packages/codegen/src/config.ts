import fs from "node:fs";
import path from "node:path";

/**
 * Naming rules, ported verbatim from `EntityProcess.java:915-935,996-1000`.
 *
 * Java needs these as *derivation* rules because `@EntityDef.value()` is a
 * `Class[]` with no name parameter, so an entity's class name cannot be
 * declared — it has to be derived from the component interface names. TS
 * decorators can carry arbitrary data, so entities declare `name` explicitly
 * (see `entity/entityGen.ts`) and these rules survive as a *checked invariant*
 * (`deriveEntityName(...) === declaredName`) instead of as the mechanism.
 */
export interface NameRules {
  /** Component classes must end with this (`PosComp`). */
  readonly componentSuffix: string;
  /** Entity interface suffix (`PosComp` -> `Posc`). */
  readonly interfaceSuffix: string;
  /** Entity-def suffix stripped from type names (`PosTeamDef` -> `PosTeam`). */
  readonly defSuffix: string;
  /** Appended when an entity name would collide with its base class name. */
  readonly entitySuffix: string;
  /** Infix inserted for `legacy` entities (`MechUnitLegacyNova`). */
  readonly legacyInfix: string;
}

export const NAME_RULES: NameRules = {
  componentSuffix: "Comp",
  interfaceSuffix: "c",
  defSuffix: "Def",
  entitySuffix: "Entity",
  legacyInfix: "Legacy",
};

/**
 * One `@GroupDef`, mirroring `core/src/mindustry/entities/GroupDefs.java:6-17`.
 *
 * `baseType` is the *generated* type the group is parameterised over. Java
 * computes it as `repr.base() ? baseName(repr) : interfaceName(repr)`
 * (`EntityProcess.java:251`), so base components resolve to their abstract
 * class (`Unit`, `Building`, `Player`) and the rest to their interface
 * (`Entityc`, `Bulletc`, ...). Both names are checked against the v160.5
 * ground truth in `entity/groupGen.test.ts`.
 */
export interface GroupConfig {
  readonly name: string;
  readonly baseType: string;
  /** Component-interface names that must all be present for membership. */
  readonly value: readonly string[];
  /** Component-interface names whose presence disqualifies membership. */
  readonly exclude: readonly string[];
  readonly spatial: boolean;
  readonly mapping: boolean;
  readonly collide: boolean;
  readonly update: boolean;
}

export const DEFAULT_GROUPS: readonly GroupConfig[] = [
  {
    name: "all",
    baseType: "Entityc",
    value: ["Entityc"],
    // GroupDefs.java:7 — components with `@Component(base = true)` never join `all`.
    exclude: ["Unitc", "PowerGraphUpdaterc", "Bulletc", "EffectStatec", "Playerc"],
    spatial: false,
    mapping: false,
    collide: false,
    update: true,
  },
  { name: "effect", baseType: "EffectStatec", value: ["EffectStatec"], exclude: [], spatial: false, mapping: false, collide: false, update: false },
  { name: "player", baseType: "Player", value: ["Playerc"], exclude: [], spatial: false, mapping: true, collide: false, update: false },
  { name: "bullet", baseType: "Bulletc", value: ["Bulletc"], exclude: [], spatial: true, mapping: false, collide: true, update: false },
  { name: "unit", baseType: "Unit", value: ["Unitc"], exclude: [], spatial: true, mapping: true, collide: false, update: false },
  { name: "build", baseType: "Building", value: ["Buildingc"], exclude: [], spatial: false, mapping: false, collide: false, update: true },
  { name: "sync", baseType: "Syncc", value: ["Syncc"], exclude: [], spatial: false, mapping: true, collide: false, update: false },
  { name: "draw", baseType: "Drawc", value: ["Drawc"], exclude: [], spatial: false, mapping: false, collide: false, update: false },
  { name: "weather", baseType: "WeatherStatec", value: ["WeatherStatec"], exclude: [], spatial: false, mapping: false, collide: false, update: false },
  { name: "powerGraph", baseType: "PowerGraphUpdaterc", value: ["PowerGraphUpdaterc"], exclude: [], spatial: false, mapping: false, collide: false, update: false },
];

export interface CodegenConfig {
  /** Suffix of codegen input files. */
  readonly sourceExtension: string;
  /** First line of every generated file. */
  readonly generatedHeader: string;
  readonly nameRules: NameRules;
  readonly groups: readonly GroupConfig[];
  /**
   * Where generated `Groups.ts` imports `EntityGroup` from. `mindustry-ts`'s
   * `src/entities/EntityGroup.ts` does not exist yet (S3 scope), so the import
   * goes through the package entry point — re-export it there when it lands.
   */
  readonly entityGroupImport: string;
  /** Where generated `Groups.ts` imports `Pools` from (`Pools.obtain/free`). */
  readonly poolsImport: string;
  /** Seeds for entity class IDs; `null` means "start from 0". */
  readonly classIdsPath: string | null;
}

/** Repository-relative location of Java's hand-maintained id table. */
export const JAVA_CLASS_IDS_RELATIVE = "annotations/src/main/resources/classids.properties";

/** `packages/codegen` -> repository root. */
export function repositoryRoot(packageRoot: string): string {
  return path.resolve(packageRoot, "..", "..", "..");
}

export const DEFAULT_CONFIG: CodegenConfig = {
  sourceExtension: ".def.ts",
  generatedHeader: "// Generated by @mindustry-ts/codegen. Do not edit.",
  nameRules: NAME_RULES,
  groups: DEFAULT_GROUPS,
  entityGroupImport: "@mindustry-ts/mindustry-ts",
  poolsImport: "@mindustry-ts/arc",
  classIdsPath: null,
};

/**
 * Configuration with `classIdsPath` resolved against the repository root, so
 * generated IDs line up with `annotations/src/main/resources/classids.properties`
 * (`EntityProcess.java:750-767`). Absent file -> `null` (IDs start at 0).
 */
export function defaultConfig(packageRoot: string): CodegenConfig {
  const candidate = path.join(repositoryRoot(packageRoot), JAVA_CLASS_IDS_RELATIVE);
  return { ...DEFAULT_CONFIG, classIdsPath: fs.existsSync(candidate) ? candidate : null };
}

/** Parses a Java `.properties` id table (`key=value`, `#` comments). */
export function parseClassIds(text: string): Map<string, number> {
  const ids = new Map<string, number>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const id = Number(line.slice(eq + 1).trim());
    if (Number.isInteger(id)) ids.set(line.slice(0, eq).trim(), id);
  }
  return ids;
}

export function loadClassIds(file: string | null): Map<string, number> {
  if (file === null || !fs.existsSync(file)) return new Map();
  return parseClassIds(fs.readFileSync(file, "utf8"));
}

/** Highest seeded id, matching Java's `maxID = max + 1` (`:754-755`). */
export function nextClassId(ids: ReadonlyMap<string, number>): number {
  let max = -1;
  for (const id of ids.values()) max = Math.max(max, id);
  return max + 1;
}
