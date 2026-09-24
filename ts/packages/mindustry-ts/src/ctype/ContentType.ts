// 源: core/src/mindustry/ctype/ContentType.java
//
// ⚠️ 陷阱 #8（计划 §6.2）: Java 原文写着 "Do not rearrange, ever!"，因为
// `ContentLoader` 用 `ordinal()` 索引 `Seq<Content>[]`（`ContentLoader.java:28-29`），
// 且 `Content` 构造器按 `getBy(getContentType()).size` 自增 id（`Content.java:20-23`）。
// 所以这里**成员同序、同拼写**，并且**不允许**用 `Map<string, …>` 承载 id 语义。
//
// 相对 Java 的一处必然差异: Java 的 `contentClass` 是 `Class<? extends Content>`，用于 Mod
// 反射加载。TS 没有等价物，且 Mod 加载不在 S3 范围（计划 §9），因此这里改存**类名字符串**
// （`"Item"` / `"Block"` / …）。信息等价，且避免了模块求值期的 TDZ（存 class 引用会让
// `ContentType.ts` 立刻依赖 `Block.ts`，而 `Block` 又依赖 `Content`，形成环）。

/**
 * 所有内容类型。对应 `mindustry.ctype.ContentType`。
 * 顺序 / 拼写必须与 Java 逐字一致（含 `*_UNUSED` 占位项，共 18 项）。
 */
export enum ContentType{
  item,
  block,
  mech_UNUSED,
  bullet,
  liquid,
  status,
  unit,
  weather,
  effect_UNUSED,
  sector,
  loadout_UNUSED,
  typeid_UNUSED,
  error,
  planet,
  ammo_UNUSED,
  team,
  unitCommand,
  unitStance
}

/* eslint-disable @typescript-eslint/no-namespace */
export namespace ContentType{
  /** 对应 Java `ContentType.all = values()`。 */
  export const all: readonly ContentType[] = [
    ContentType.item,
    ContentType.block,
    ContentType.mech_UNUSED,
    ContentType.bullet,
    ContentType.liquid,
    ContentType.status,
    ContentType.unit,
    ContentType.weather,
    ContentType.effect_UNUSED,
    ContentType.sector,
    ContentType.loadout_UNUSED,
    ContentType.typeid_UNUSED,
    ContentType.error,
    ContentType.planet,
    ContentType.ammo_UNUSED,
    ContentType.team,
    ContentType.unitCommand,
    ContentType.unitStance
  ];

  /** 对应 Java `ContentType.folderName`。 */
  const folderNames: Readonly<Record<ContentType, string>> = {
    [ContentType.item]: "items",
    [ContentType.block]: "blocks",
    [ContentType.mech_UNUSED]: "unused",
    [ContentType.bullet]: "bullets",
    [ContentType.liquid]: "liquids",
    [ContentType.status]: "statuses",
    [ContentType.unit]: "units",
    [ContentType.weather]: "weather",
    [ContentType.effect_UNUSED]: "unused",
    [ContentType.sector]: "sectors",
    [ContentType.loadout_UNUSED]: "unused",
    [ContentType.typeid_UNUSED]: "unused",
    [ContentType.error]: "unused",
    [ContentType.planet]: "planets",
    [ContentType.ammo_UNUSED]: "unused",
    [ContentType.team]: "teams",
    [ContentType.unitCommand]: "unitCommands",
    [ContentType.unitStance]: "unitStances"
  };

  /**
   * 对应 Java `ContentType.contentClass` 的**类名**（Java 存 `Class<?>`；原因见文件头）。
   * `null` 表示 `*_UNUSED` 占位项。
   */
  const classNames: Readonly<Record<ContentType, string | null>> = {
    [ContentType.item]: "Item",
    [ContentType.block]: "Block",
    [ContentType.mech_UNUSED]: null,
    [ContentType.bullet]: "BulletType",
    [ContentType.liquid]: "Liquid",
    [ContentType.status]: "StatusEffect",
    [ContentType.unit]: "UnitType",
    [ContentType.weather]: "Weather",
    [ContentType.effect_UNUSED]: null,
    [ContentType.sector]: "SectorPreset",
    [ContentType.loadout_UNUSED]: null,
    [ContentType.typeid_UNUSED]: null,
    [ContentType.error]: null,
    [ContentType.planet]: "Planet",
    [ContentType.ammo_UNUSED]: null,
    [ContentType.team]: "TeamEntry",
    [ContentType.unitCommand]: "UnitCommand",
    [ContentType.unitStance]: "UnitStance"
  };

  /** 对应 Java `ContentType.folderName`（字段访问形式）。 */
  export function folderName(type: ContentType): string{
    return folderNames[type];
  }

  /** 对应 Java `ContentType.contentClass`（字段访问形式）。 */
  export function contentClassName(type: ContentType): string | null{
    return classNames[type];
  }
}
