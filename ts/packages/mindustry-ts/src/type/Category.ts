// 源: core/src/mindustry/type/Category.java
//
// ⚠️ 与 ContentType 不同，`Category` 的 ordinal **不承载持久语义**（不进存档、不进网络）。
// 但 `Block.setBars` / 建筑 UI 与 `postInit()` 的 `databaseTag = category.name()` 依赖它，
// 且顺序影响 `Category.all` 的遍历顺序，因此仍按 Java 逐字同序搬运。

/** 对应 `mindustry.type.Category`。 */
export enum Category{
  /** 进攻性炮塔。 */
  turret,
  /** 生产原料的方块，如钻头。 */
  production,
  /** 搬运物品的方块。 */
  distribution,
  /** 搬运液体的方块。 */
  liquid,
  /** 发电或输电的方块。 */
  power,
  /** 墙和其它防御结构。 */
  defense,
  /** 合成物品的方块。 */
  crafting,
  /** 制造单位的方块。 */
  units,
  /** 存储或被动效果。 */
  effect,
  /** 逻辑相关。 */
  logic
}

/* eslint-disable @typescript-eslint/no-namespace */
export namespace Category{
  /** 对应 Java `Category.all = values()`。 */
  export const all: readonly Category[] = [
    Category.turret,
    Category.production,
    Category.distribution,
    Category.liquid,
    Category.power,
    Category.defense,
    Category.crafting,
    Category.units,
    Category.effect,
    Category.logic
  ];

  /** 对应 Java `Category.prev()`。 */
  export function prev(c: Category): Category{
    return all[(c - 1 + all.length) % all.length]!;
  }

  /** 对应 Java `Category.next()`。 */
  export function next(c: Category): Category{
    return all[(c + 1) % all.length]!;
  }
}
