// 源: core/src/mindustry/content/Blocks.java (7000+ 行，约 340 个方块)
//
// ⚠️ 有意的窄化（S3）—— 这是本阶段**最大**的一处范围收窄，必须写清楚：
//
//   S3 只创建「跑通 headless 世界 + 6 条硬断言」所必需的**最小方块集合**。Java 的
//   `Blocks.load()` 会实例化约 340 个方块（含 `ConstructBlock` 1..16、炮塔、电力、
//   液体、单位工厂……），其中 99% 依赖 S3 范围外的系统（`ItemModule` / `LiquidModule` /
//   `PowerGraph` / `BulletType` / `UnitType` / 渲染贴图），移植它们既不可能也不必要。
//
//   因此：**`ContentType.block` 的 id 序列与 Java 不同**。唯一被硬断言约束的是
//   `Blocks.air.id === 0`（Java 与 S3 都成立，因为 `air` 都是第一条）。**其它方块的 id
//   在 S3 中没有与 Java 对齐的保证** —— 后续阶段整体替换本文件时，所有 id 都会回到 Java 序列。
//   这是一处必须让下游读者知道的偏差；好在 S3 没有任何「按 id 持久化」的路径（无存档/无网络）。
//
// 已迁移的方块（6 个，覆盖 S3 的每一条断言路径）:
//   air        —— 自举起点（陷阱 #2），`Tile` 构造器与 `Floor` 字段初值都读它，必须是第 0 条
//   stone      —— `Floor` 的代表：断言 #3 的生成器默认地板、`setFloor` 路径
//   stoneWall  —— `StaticWall` 的代表（`isStatic()` / `canReplace` 的 `isStaticWall()` 分支），
//                 同时让 `Floor.init()` 的 `name + "-wall"` 查表真正命中（而不是回落 air）
//   copperWall —— `Wall` 的代表：断言 #4 的「反事实半边」—— 它 `destructible = true`
//                 但 `update = false`，因此 `Tile.changeBuild` 会**创建** `Building` 实例
//                 却**不**把它放进 `Groups.build`（`Tile.java:668` 的 `shouldAdd`）
//   conveyor   —— 断言 #4/#5 的「update = true」代表，会真正进入 `Groups.build` 并逐 tick 更新
//   router     —— 同上；`RouterBuild.updateTile()` 在 S3 是显式空实现（S4 补物品投递）
//
// 未迁移（按 Java 的区块归类，逐段标注，避免静默丢失）:
//   - environment 的其余全部：`spawn` / `removeWall` / `removeOre` / `cliff` /
//     `ConstructBlock` 1..16 / `deepwater` / `water` / `taintedWater` / `tar` / `slag` /
//     `cryofluid` / `craters` / `charr` / `sand` / `darksand` / `dirt` / `mud` / `ice` /
//     `snow` / `space` / `dacite` / `rhyolite` / `regolith` / `arkyciteFloor` / 全部矿石
//     (`oreCopper` 等) / 全部巨石 (`*Boulder`) / 全部树与植被 (`sporePine` / `pine` /
//     `whiteTree` / `shrubs` / `redweed` / `purbush`) / 全部喷口 (`*Vent`) / 全部墙
//     (`dirtWall` / `sporeWall` / `iceWall` / `daciteWall` / `regolithWall` / ...)
//     —— 其中矿石与巨石只影响渲染与生成器外观；喷口依赖 `Effect`；墙依赖贴图。
//   - defense（`Wall.java` 之外的）：`mender` / `mendProjector` / `overdriveProjector` /
//     `forceProjector` / `shockMine` / … —— 依赖 `PowerGraph` / `ItemModule` / 单位
//   - defense.turrets：全部炮塔 —— 依赖 `BulletType` / `ItemModule` / `LiquidModule`
//   - distribution 的其余：`junction` / `bridgeConveyor` / `itemBridge` / `phaseConveyor` /
//     `sorter` / `invertedSorter` / `message` / `payloadConveyor` / `duct*` / `*Router`
//     —— 依赖 `ItemModule` 或 `Payload` 体系
//   - production：全部钻头与工厂 —— 依赖 `ItemModule` / `Attribute` / `PowerGraph`
//   - liquid / power / storage / units / payloads / sandbox / logic / campaign / heat
//     —— 全部依赖 S4+ 系统（`LiquidModule` / `PowerGraph` / `CoreBuild` / `UnitType` /
//     `Payload` / `LogicBlock` / `SectorPreset`）
//
// 迁移方法: Java 的 `new Floor("stone")` / `new Wall("copper-wall"){{ ... }}` 双大括号
// 子类一律展开为「构造 + 逐字段赋值」（陷阱 #7），顺序与 Java 相同。

import { AirBlock } from "../world/blocks/environment/AirBlock.js";
import { Floor } from "../world/blocks/environment/Floor.js";
import { StaticWall } from "../world/blocks/environment/StaticWall.js";
import { Wall } from "../world/blocks/defense/Wall.js";
import { Conveyor } from "../world/blocks/distribution/Conveyor.js";
import { Router } from "../world/blocks/distribution/Router.js";
import { Category } from "../type/Category.js";
import { Items } from "./Items.js";
import { ItemStack } from "../type/ItemStack.js";

/** 对应 `mindustry.content.Blocks`（S3 子集，见文件头）。 */
export class Blocks{
  /** 空气方块。**必须**是第一个创建的方块（陷阱 #2）。 */
  static air: AirBlock;
  /** 石头地板。 */
  static stone: Floor;
  /** 石头墙（`StaticWall`）。 */
  static stoneWall: StaticWall;
  /** 铜墙。 */
  static copperWall: Wall;
  /** 传送带。 */
  static conveyor: Conveyor;
  /** 路由器。 */
  static router: Router;

  /** Java `Blocks` 里的 `int wallHealthMultiplier = 4`（`Blocks.java:1706`）。 */
  private static readonly wallHealthMultiplier = 4;

  /**
   * 对应 Java `Blocks.load()`（S3 子集）。
   * ⚠️ **`air` 必须是第一条语句**，且在任何 `Floor`/`StaticWall`/`Wall` 创建之前 ——
   * 见 `world/blocks/environment/AirBlock.ts` 的自举说明与陷阱 #2。
   */
  static load(): void{
    // ---- environment ----
    // 自举起点：必须最先创建。`Floor.wall` / `Floor.decoration` 的字段初值会读到
    // 尚为 undefined 的 `Blocks.air`，由 `AirBlock` 构造器与 `AirBlock.init()` 纠正。
    Blocks.air = new AirBlock("air");

    Blocks.stone = new Floor("stone");

    // Java: `stoneWall = new StaticWall("stone-wall"){{ variants = 1; }}`
    Blocks.stoneWall = new StaticWall("stone-wall");
    Blocks.stoneWall.variants = 1;

    // ---- defense ----
    // Java: `copperWall = new Wall("copper-wall"){{ requirements(...); health = 80*mult; }}`
    Blocks.copperWall = new Wall("copper-wall");
    Blocks.copperWall.setRequirements(Category.defense, [new ItemStack(Items.copper, 6)]);
    Blocks.copperWall.health = 80 * Blocks.wallHealthMultiplier;
    Blocks.copperWall.researchCostMultiplier = 0.1;

    // ---- distribution ----
    // Java: `conveyor = new Conveyor("conveyor"){{ requirements(...); health = 45; speed = 0.035; displayedSpeed = 5; }}`
    Blocks.conveyor = new Conveyor("conveyor");
    Blocks.conveyor.setRequirements(Category.distribution, [new ItemStack(Items.copper, 1)]);
    Blocks.conveyor.health = 45;
    Blocks.conveyor.speed = 0.035;
    Blocks.conveyor.displayedSpeed = 5;

    // Java: `router = new Router("router"){{ requirements(...); buildCostMultiplier = 4f; }}`
    Blocks.router = new Router("router");
    Blocks.router.setRequirements(Category.distribution, [new ItemStack(Items.copper, 3)]);
    Blocks.router.buildCostMultiplier = 4;
  }
}
