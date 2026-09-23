import { DEFAULT_CONFIG, type CodegenConfig, type GroupConfig } from "../config.js";

/**
 * Port of `EntityProcess.java:664-746` + `entities/GroupDefs.java:6-17`.
 *
 * Java emits one `IndexableEntity__<group>` marker interface per group plus a
 * `Groups` holder whose static fields are the groups themselves. Membership rules
 * (which entity joins which group) live in `entityGen.ts`; this module only emits
 * the holder, its flags, and the exclusion table as machine-readable metadata.
 */

export class GroupGenError extends Error {}

const IMPORT_EXTENSION = ".js";

export function generateGroupFiles(
  groups: readonly GroupConfig[],
  config: CodegenConfig = DEFAULT_CONFIG,
): Map<string, string> {
  if (groups.length === 0) throw new GroupGenError("No groups declared; `Groups` would be empty");
  const outputs = new Map<string, string>();
  for (const group of groups) outputs.set(`IndexableEntity__${group.name}.ts`, renderIndexable(group, config));
  outputs.set("Groups.ts", renderGroups(groups, config));
  return outputs;
}

function renderIndexable(group: GroupConfig, config: CodegenConfig): string {
  return [
    config.generatedHeader,
    "/* eslint-disable */",
    "",
    "/**",
    ` * Marker for entities that belong to group \`${group.name}\` (Java \`EntityProcess.java:259-261\`).`,
    " */",
    `export interface IndexableEntity__${group.name} {`,
    `  setIndex__${group.name}(index: number): void;`,
    "}",
    "",
  ].join("\n");
}

function renderGroups(groups: readonly GroupConfig[], config: CodegenConfig): string {
  const lines: string[] = [config.generatedHeader, "/* eslint-disable */", ""];
  lines.push(`import { Pools } from "${config.poolsImport}";`);
  lines.push(`import { EntityGroup } from "${config.entityGroupImport}";`);
  const baseTypes = [...new Set(groups.map((group) => group.baseType))].sort();
  for (const name of baseTypes) lines.push(`import type { ${name} } from "./${name}${IMPORT_EXTENSION}";`);
  for (const group of groups) {
    lines.push(`import type { IndexableEntity__${group.name} } from "./IndexableEntity__${group.name}${IMPORT_EXTENSION}";`);
  }
  lines.push("");
  lines.push("/**");
  lines.push(" * Every entity group, in `GroupDefs.java:6-17` order.");
  lines.push(" * Membership is decided per entity by `entityGen` (Java `EntityProcess.java:273-274`).");
  lines.push(" */");
  lines.push("export class Groups {");

  for (const group of groups) {
    lines.push("  /**");
    lines.push(`   * Group \`${group.name}\` over \`${group.baseType}\`.`);
    lines.push(`   * Requires: ${group.value.map((name) => `\`${name}\``).join(", ")}.`);
    lines.push(`   * Excludes: ${group.exclude.length === 0 ? "nothing" : group.exclude.map((name) => `\`${name}\``).join(", ")}.`);
    lines.push(`   * spatial: ${group.spatial}, mapping: ${group.mapping}, collide: ${group.collide}, update: ${group.update}.`);
    lines.push("   */");
    lines.push(`  static ${group.name}: EntityGroup<${group.baseType}>;`);
  }
  lines.push("");
  lines.push("  /** Component-interface names excluded from each group, mirroring `GroupDefs.java`. */");
  lines.push("  static readonly groupExcludes: Readonly<Record<string, readonly string[]>> = {");
  for (const group of groups) {
    lines.push(`    ${group.name}: [${group.exclude.map((name) => `"${name}"`).join(", ")}],`);
  }
  lines.push("  };");
  lines.push("");
  lines.push("  static isClearing = false;");
  lines.push("");
  lines.push("  private static readonly freeQueue: unknown[] = [];");
  lines.push("");

  // Java `:665-676`.
  lines.push("  /** Java `Groups.init()`, `EntityProcess.java:665-676`. */");
  lines.push("  static init(): void {");
  for (const group of groups) {
    lines.push(
      `    Groups.${group.name} = new EntityGroup<${group.baseType}>(${group.spatial}, ${group.mapping}, (e, index) => {`,
    );
    lines.push(`      (e as unknown as Partial<IndexableEntity__${group.name}>).setIndex__${group.name}?.(index);`);
    lines.push("    });");
  }
  lines.push("  }");
  lines.push("");

  // Java `:683-691`.
  lines.push("  /** Java `Groups.clear()`, `EntityProcess.java:683-691`. */");
  lines.push("  static clear(): void {");
  lines.push("    Groups.isClearing = true;");
  for (const group of groups) lines.push(`    Groups.${group.name}.clear();`);
  lines.push("    Groups.isClearing = false;");
  lines.push("  }");
  lines.push("");

  // Java `:697-702` — pooled entities are freed at the start of the next frame.
  lines.push("  /** Java `Groups.queueFree()`, `EntityProcess.java:697-702`. */");
  lines.push("  static queueFree(object: unknown): void {");
  lines.push("    Groups.freeQueue.push(object);");
  lines.push("  }");
  lines.push("");

  lines.push("  /** Java `Groups.updatePooling()`, `EntityProcess.java:712-718`. */");
  lines.push("  static updatePooling(): void {");
  lines.push("    for (const pooled of Groups.freeQueue) Pools.free(pooled);");
  lines.push("    Groups.freeQueue.length = 0;");
  lines.push("  }");
  lines.push("");

  // Java `:705-728` — resize only the spatial groups.
  lines.push("  /** Java `Groups.resize()`, `EntityProcess.java:705-728`. */");
  lines.push("  static resize(x: number, y: number, w: number, h: number): void {");
  for (const group of groups) if (group.spatial) lines.push(`    Groups.${group.name}.resize(x, y, w, h);`);
  lines.push("  }");
  lines.push("");

  const spatial = groups.filter((group) => group.spatial);
  const updating = groups.filter((group) => group.update);
  const colliding = groups.filter((group) => group.collide);
  lines.push("  /** Java `Groups.update()`, `EntityProcess.java:709-744`. */");
  lines.push("  static update(): void {");
  lines.push("    Groups.updatePooling();");
  for (const group of spatial) lines.push(`    Groups.${group.name}.updatePhysics();`);
  for (const group of updating) lines.push(`    Groups.${group.name}.update();`);
  for (const group of colliding) lines.push(`    Groups.${group.name}.collide();`);
  lines.push("  }");
  lines.push("}");
  return lines.join("\n") + "\n";
}
