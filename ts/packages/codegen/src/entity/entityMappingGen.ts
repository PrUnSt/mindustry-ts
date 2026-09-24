import { DEFAULT_CONFIG, nextClassId, type CodegenConfig } from "../config.js";
import type { EntityDefModel } from "../model.js";
import { definitionKey, type ResolvedEntity } from "./entityGen.js";

/**
 * Port of `EntityProcess.java:748-830` + `annotations/src/main/resources/classids.properties`.
 *
 * Ids are stable across renames of the *entity* class because Java keys them on the
 * source element's fully-qualified name (`:760`). TS has no packages, so the key is
 * `<input-root-relative file>:<element name>` (`entityGen.definitionKey`).
 */

/** One flat generated directory, mirroring Java's single `mindustry.gen` package. */
const IMPORT_EXTENSION = ".js";

/** Java uses `arc.func.Prov`; TS spells it as a thunk. */
const PROVIDER_TYPE = "() => Entityc";

/**
 * Java `:757-767` — sort by source element name, keep existing ids, hand out
 * `maxId + 1` to the rest. Sorting makes assignment reproducible.
 */
export function assignClassIds(
  defs: readonly EntityDefModel[],
  inputRoot: string,
  existing: ReadonlyMap<string, number>,
): Map<string, number> {
  const assigned = new Map(existing);
  let next = nextClassId(existing);
  const sorted = [...defs].sort((a, b) => {
    const left = definitionKey(a, inputRoot);
    const right = definitionKey(b, inputRoot);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  for (const def of sorted) {
    const key = definitionKey(def, inputRoot);
    if (assigned.has(key)) continue;
    assigned.set(key, next);
    next += 1;
  }
  return assigned;
}

/** Java `Strings.camelToKebab`: `MechUnitLegacyNova` -> `mech-unit-legacy-nova`. */
export function camelToKebab(text: string): string {
  return text.replace(/([a-z])([A-Z]+)/g, "$1-$2").toLowerCase();
}

export interface NameAlias {
  readonly alias: string;
  readonly target: string;
}

/**
 * Every lookup name Java registers for a definition (`extraNames`, `:315-324`):
 * the derived class name always, the declared element name for non-type defs
 * (`UnitTypes.java`'s `nova`), and kebab-case spellings when they differ (`:810-815`).
 */
export function nameAliases(entity: ResolvedEntity): NameAlias[] {
  const names = [entity.name];
  if (!entity.def.isType) names.push(entity.def.elementName);
  const aliases: NameAlias[] = [];
  for (const name of names) {
    aliases.push({ alias: name, target: entity.name });
    const kebab = camelToKebab(name);
    if (kebab !== name) aliases.push({ alias: kebab, target: entity.name });
  }
  return aliases;
}

export function generateEntityMappingFile(
  entities: readonly ResolvedEntity[],
  config: CodegenConfig = DEFAULT_CONFIG,
): string {
  const idMapSize = Math.max(256, ...entities.map((entity) => entity.classId + 1));
  const aliases = entities.flatMap((entity) => nameAliases(entity));
  const entityNames = [...new Set(entities.map((entity) => entity.name))].sort();

  const lines: string[] = [config.generatedHeader, "/* eslint-disable */", ""];
  // `static { … new Building() … }` needs the entity classes as *values*, not types —
  // the `Entityc` import is the only type-only one. Java gets away without thinking about
  // it because `mindustry.gen` is one package; TS files must import what they reference.
  for (const name of entityNames) lines.push(`import { ${name} } from "./${name}${IMPORT_EXTENSION}";`);
  lines.push(`import type { Entityc } from "./Entityc${IMPORT_EXTENSION}";`);
  lines.push("");
  lines.push("/**");
  lines.push(" * Entity id to constructor mapping (Java `EntityProcess.java:776-825`).");
  lines.push(" * Ids come from `annotations/src/main/resources/classids.properties`, which stays");
  lines.push(" * hand-maintained in S2 — the generator seeds from it but does not rewrite it.");
  lines.push(" */");
  lines.push(`export type EntityProvider = ${PROVIDER_TYPE};`);
  lines.push("");
  lines.push("export class EntityMapping {");
  lines.push(`  static readonly idMap: (EntityProvider | undefined)[] = new Array(${idMapSize});`);
  lines.push("  static readonly nameMap = new Map<string, EntityProvider>();");
  lines.push("  static readonly customIdMap = new Map<number, string>();");
  lines.push("");
  lines.push("  /**");
  lines.push("   * Reserves an id for a modded entity type. Only call this once per type.");
  lines.push("   * Java `EntityMapping.register`, `EntityProcess.java:787-796`.");
  lines.push("   */");
  lines.push("  static register(name: string, constructor: EntityProvider): number {");
  lines.push("    const next = EntityMapping.idMap.findIndex((value) => value === undefined);");
  lines.push('    if (next < 0) throw new Error("Entity id table is full");');
  lines.push("    EntityMapping.idMap[next] = constructor;");
  lines.push("    EntityMapping.nameMap.set(name, constructor);");
  lines.push("    EntityMapping.customIdMap.set(next, name);");
  lines.push("    return next;");
  lines.push("  }");
  lines.push("");
  lines.push("  static map(id: number): EntityProvider | undefined;");
  lines.push("  static map(name: string): EntityProvider | undefined;");
  lines.push("  static map(key: number | string): EntityProvider | undefined {");
  lines.push('    return typeof key === "number" ? EntityMapping.idMap[key] : EntityMapping.nameMap.get(key);');
  lines.push("  }");
  lines.push("");
  lines.push("  static {");
  // Java writes `idMap[$id] = $Name::new` (`:812`) and gets away with it because the
  // generated entity constructor is `protected` *and* `EntityMapping` sits in the same
  // package — Java's protected includes package access. TypeScript's `protected` does
  // not, so a constructor reference is a TS2674 here. Routing through the entity's own
  // public `create()` factory keeps Java's actual intent ("do not `new` an entity from
  // outside; ask the class for one") and, since TS emits `create() { return new X(); }`
  // for a non-pooled entity, is the same object either way.
  for (const entity of entities) {
    lines.push(`    EntityMapping.idMap[${entity.classId}] = () => ${entity.name}.create();`);
  }
  for (const alias of aliases) {
    lines.push(`    EntityMapping.nameMap.set(${JSON.stringify(alias.alias)}, () => ${alias.target}.create());`);
  }
  lines.push("  }");
  lines.push("}");
  return lines.join("\n") + "\n";
}
