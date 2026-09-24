// 源: core/src/mindustry/world/meta/BlockGroup.java
//
// ⚠️ 修正记录: 本文件此前被写成「none, walls, projectiles, distribution, transportation,
// power, defense, production, storage, turrets, units, payloads, sandbox, heat, liquid,
// drills, logic」——**与 Java 完全不符**。Java 实际是：
//   none, walls(true), projectors(true), turrets(true), transportation(true), power,
//   liquids(true), drills, units, logic(true), payloads(true), heat(true)
// 并且每个成员带一个 `anyReplace` 布尔字段（`canReplace` 会读它）。现按 Java 逐字重写。
//
// 实现方式: Java 枚举带字段 → TS 用「类 + 静态只读实例」表达（与 BuildVisibility 同一手法）。
// 语义与 Java 一致：成员是**身份对象**，比较用 `===`；`anyReplace` 是实例字段。

/** 方块所属的逻辑分组。对应 `mindustry.world.meta.BlockGroup`。 */
export class BlockGroup{
  /** 成员名（对应 Java `Enum.name()`）。 */
  readonly name: string;
  /** 若为 true，本组的任意方块可以替换本组的任意其它方块。 */
  readonly anyReplace: boolean;

  private constructor(name: string, anyReplace: boolean){
    this.name = name;
    this.anyReplace = anyReplace;
  }

  static readonly none = new BlockGroup("none", false);
  static readonly walls = new BlockGroup("walls", true);
  static readonly projectors = new BlockGroup("projectors", true);
  static readonly turrets = new BlockGroup("turrets", true);
  static readonly transportation = new BlockGroup("transportation", true);
  static readonly power = new BlockGroup("power", false);
  static readonly liquids = new BlockGroup("liquids", true);
  static readonly drills = new BlockGroup("drills", false);
  static readonly units = new BlockGroup("units", false);
  static readonly logic = new BlockGroup("logic", true);
  static readonly payloads = new BlockGroup("payloads", true);
  static readonly heat = new BlockGroup("heat", true);

  /** 对应 Java `BlockGroup.values()`（声明顺序）。 */
  static readonly all: readonly BlockGroup[] = [
    BlockGroup.none,
    BlockGroup.walls,
    BlockGroup.projectors,
    BlockGroup.turrets,
    BlockGroup.transportation,
    BlockGroup.power,
    BlockGroup.liquids,
    BlockGroup.drills,
    BlockGroup.units,
    BlockGroup.logic,
    BlockGroup.payloads,
    BlockGroup.heat
  ];

  toString(): string{
    return this.name;
  }
}
