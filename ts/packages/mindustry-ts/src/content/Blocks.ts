// 源: core/src/mindustry/content/Blocks.java (7000+ 行，约 340 个方块)
//
// ⚠️ 有意的窄化（S3/S4）—— 这是本项目**最大**的一处范围收窄，必须写清楚：
//
//   Java 的 `Blocks.load()` 会实例化约 340 个方块（含 `ConstructBlock` 1..16、炮塔、电力、
//   液体、单位工厂……），其中 99% 依赖阶段范围外的系统（`ItemModule` / `LiquidModule` /
//   `PowerGraph` / `BulletType` / `UnitType` / 渲染贴图），移植它们既不可能也不必要。
//
//   因此：**`ContentType.block` 的 id 序列与 Java 不同**。唯一被硬断言约束的是
//   `Blocks.air.id === 0`（Java 与这里都成立，因为 `air` 都是第一条）。**其它方块的 id
//   没有与 Java 对齐的保证** —— 后续阶段整体替换本文件时，所有 id 都会回到 Java 序列。
//   这是一处必须让下游读者知道的偏差；好在当前没有任何「按 id 持久化」的路径（无存档/无网络）。
//
// 已迁移的方块（S4 共 15 个）:
//
//   ── S3 的 6 个（覆盖 S3 的每一条断言路径）──
//   air        —— 自举起点（陷阱 #2），`Tile` 构造器与 `Floor` 字段初值都读它，必须是第 0 条
//   stone      —— `Floor` 的代表：断言 #3 的生成器默认地板、`setFloor` 路径
//   stoneWall  —— `StaticWall` 的代表（`isStatic()` / `canReplace` 的 `isStaticWall()` 分支），
//                 同时让 `Floor.init()` 的 `name + "-wall"` 查表真正命中（而不是回落 air）
//   copperWall —— `Wall` 的代表：断言 #4 的「反事实半边」—— 它 `destructible = true`
//                 但 `update = false`，因此 `Tile.changeBuild` 会**创建** `Building` 实例
//                 却**不**把它放进 `Groups.build`（`Tile.java:668` 的 `shouldAdd`）
//   conveyor   —— 断言 #4/#5 的「update = true」代表；S4 起有真实的物品搬运行为
//   router     —— 同上；S4 起有真实的轮转投递行为
//
//   ── S4 新增的 9 个 ──
//   sand / grass / snow —— 环境地板（各自带 Java 的 `attributes` / `itemDrop` / `albedo` 赋值）。
//       作用: 让 `Block.attributes`、`Floor.init()` 的 wall/decoration 查表、
//       `Tile.setFloor` 的 `floorChanged` 路径被真实内容覆盖，而不是永远只有 `stone`。
//       创建顺序遵循 Java（stone → sand → grass → snow）。
//   oreCopper / oreLead / oreScrap / oreCoal / oreTitanium / oreThorium —— 覆盖层矿石
//       （`OreBlock extends OverlayFloor`）。作用: 让 `Tile.setOverlay` / `Tile.drop()` /
//       `Items.getAllOres()` 有真实数据；同时它们**是** `Floor` 子类，进一步压测
//       `Floor.init()` 与 `Block.attributes`。
//
// 未迁移（按 Java 的区块归类，逐段标注，避免静默丢失）:
//   - environment 的其余全部：`spawn` / `removeWall` / `removeOre` / `cliff` /
//     `ConstructBlock` 1..16 / `deepwater` / `water` / `taintedWater` / `tar` / `slag` /
//     `cryofluid` / `craters` / `charr` / `darksand` / `dirt` / `mud` / `ice` /
//     `space` / `dacite` / `rhyolite` / `regolith` / `arkyciteFloor` / 其余矿石
//     (`oreBeryllium`/`oreTungsten`/`oreCrystalThorium`/`wallOre*`) / 全部巨石
//     (`*Boulder`) / 全部树与植被 (`sporePine` / `pine` / `whiteTree` / `shrubs` /
//     `redweed` / `purbush`) / 全部喷口 (`*Vent`) / 全部环境墙
//     (`dirtWall` / `sporeWall` / `iceWall` / `daciteWall` / `regolithWall` / ...)
//     —— 其中树/巨石/喷口依赖 `Effect` 或 `Prop` 的贴图；`ConstructBlock` 属建造计划系统。
//   - defense（`Wall.java` 之外的）：`mender` / `mendProjector` / `overdriveProjector` /
//     `forceProjector` / `shockMine` / … —— 依赖 `PowerGraph` / `ItemModule` / 单位
//   - defense.turrets：全部炮塔 —— 依赖 `BulletType` / `ItemModule` / `LiquidModule`
//   - distribution 的其余：`junction` / `bridgeConveyor` / `itemBridge` / `phaseConveyor` /
//     `sorter` / `invertedSorter` / `overflowGate` / `message` / `payloadConveyor` / `duct*` /
//     `*Router` —— 依赖 `ItemModule` 的更多分支或 `Payload` 体系。
//     ⚠️ `overflowGate` 的缺失会影响 `Router.getTileTarget` 里的一处守卫：
//     `Router.ts` 用 `Vars.content.block("overflow-gate")` 表达它，因此该守卫在 S4 恒不成立
//     （与 Java 在「地图里没有 overflowGate」时一致），补上方块后**无需改代码**即自动生效。
//   - production：全部钻头与工厂 —— 依赖 `ItemModule` / `Attribute` / `PowerGraph`
//   - liquid / power / storage / units / payloads / sandbox / logic / campaign / heat
//     —— 全部依赖 S4+ 系统（`LiquidModule` / `PowerGraph` / `CoreBuild` / `UnitType` /
//     `Payload` / `LogicBlock` / `SectorPreset`）
//
// 迁移方法: Java 的 `new Floor("stone")` / `new Wall("copper-wall"){{ ... }}` 双大括号
// 子类一律展开为「具名子类 + 构造器逐字段赋值」（陷阱 #7），或「构造 + 逐字段赋值」，
// 顺序与 Java 相同。

import { AirBlock } from "../world/blocks/environment/AirBlock.js";
import { StoneFloor } from "../world/blocks/environment/StoneFloor.js";
import { SandFloor } from "../world/blocks/environment/SandFloor.js";
import { GrassFloor } from "../world/blocks/environment/GrassFloor.js";
import { SnowFloor } from "../world/blocks/environment/SnowFloor.js";
import { OreBlock } from "../world/blocks/environment/OreBlock.js";
import { StaticWall } from "../world/blocks/environment/StaticWall.js";
import { Wall } from "../world/blocks/defense/Wall.js";
import { Conveyor } from "../world/blocks/distribution/Conveyor.js";
import { Router } from "../world/blocks/distribution/Router.js";
import { Category } from "../type/Category.js";
import { Items } from "./Items.js";
import { ItemStack } from "../type/ItemStack.js";

/** 对应 `mindustry.content.Blocks`（S3/S4 子集，见文件头）。 */
export class Blocks{
  /** 空气方块。**必须**是第一个创建的方块（陷阱 #2）。 */
  static air: AirBlock;
  /** 石头地板。 */
  static stone: StoneFloor;
  /** 沙地（内部名 `sand-floor`）。 */
  static sand: SandFloor;
  /** 草地。 */
  static grass: GrassFloor;
  /** 雪地。 */
  static snow: SnowFloor;
  /** 铜矿。 */
  static oreCopper: OreBlock;
  /** 铅矿。 */
  static oreLead: OreBlock;
  /** 废料矿。 */
  static oreScrap: OreBlock;
  /** 煤矿。 */
  static oreCoal: OreBlock;
  /** 钛矿。 */
  static oreTitanium: OreBlock;
  /** 钍矿。 */
  static oreThorium: OreBlock;
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
   * 对应 Java `Blocks.load()`（S3/S4 子集）。
   * ⚠️ **`air` 必须是第一条语句**，且在任何 `Floor`/`StaticWall`/`Wall` 创建之前 ——
   * 见 `world/blocks/environment/AirBlock.ts` 的自举说明与陷阱 #2。
   */
  static load(): void{
    // ---- environment ----
    // 自举起点：必须最先创建。`Floor.wall` / `Floor.decoration` 的字段初值会读到
    // 尚为 undefined 的 `Blocks.air`，由 `AirBlock` 构造器与 `AirBlock.init()` 纠正。
    Blocks.air = new AirBlock("air");

    // Java: `stone = new Floor("stone");`（348）
    Blocks.stone = new StoneFloor("stone");

    // Java: `sand = new Floor("sand-floor"){{ itemDrop = Items.sand; … }}`（384）
    Blocks.sand = new SandFloor("sand-floor");

    // Java: `grass = new Floor("grass"){{ attributes.set(Attribute.water, 0.1f); }}`（547）
    Blocks.grass = new GrassFloor("grass");

    // Java: `snow = new Floor("snow"){{ attributes.set(Attribute.water, 0.2f); albedo = 0.7f; }}`（558）
    Blocks.snow = new SnowFloor("snow");

    // ---- ore ----
    // ⚠️ 矿石必须在**它们所依附的地板**之后创建（Java 里也是在 environment 区之后，
    //    `Blocks.java:979+`）。`OreBlock.init()` 会读 `itemDrop`，缺少时直接抛错。
    // Java: `oreCopper = new OreBlock(Items.copper){{ oreDefault = true; oreThreshold = 0.81f; oreScale = 23.47619f; }}`（979）
    Blocks.oreCopper = new OreBlock(Items.copper);
    Blocks.oreCopper.oreDefault = true;
    Blocks.oreCopper.oreThreshold = 0.81;
    Blocks.oreCopper.oreScale = 23.47619;

    // Java: `oreLead = new OreBlock(Items.lead){{ oreDefault = true; oreThreshold = 0.828f; oreScale = 23.952381f; }}`（985）
    Blocks.oreLead = new OreBlock(Items.lead);
    Blocks.oreLead.oreDefault = true;
    Blocks.oreLead.oreThreshold = 0.828;
    Blocks.oreLead.oreScale = 23.952381;

    // Java: `oreScrap = new OreBlock(Items.scrap);`（991）
    Blocks.oreScrap = new OreBlock(Items.scrap);

    // Java: `oreCoal = new OreBlock(Items.coal){{ oreDefault = true; oreThreshold = 0.846f; oreScale = 24.428572f; }}`（993）
    Blocks.oreCoal = new OreBlock(Items.coal);
    Blocks.oreCoal.oreDefault = true;
    Blocks.oreCoal.oreThreshold = 0.846;
    Blocks.oreCoal.oreScale = 24.428572;

    // Java: `oreTitanium = new OreBlock(Items.titanium){{ oreDefault = true; oreThreshold = 0.864f; oreScale = 24.904762f; }}`（999）
    Blocks.oreTitanium = new OreBlock(Items.titanium);
    Blocks.oreTitanium.oreDefault = true;
    Blocks.oreTitanium.oreThreshold = 0.864;
    Blocks.oreTitanium.oreScale = 24.904762;

    // Java: `oreThorium = new OreBlock(Items.thorium){{ oreDefault = true; oreThreshold = 0.882f; oreScale = 25.380953f; }}`（1005）
    Blocks.oreThorium = new OreBlock(Items.thorium);
    Blocks.oreThorium.oreDefault = true;
    Blocks.oreThorium.oreThreshold = 0.882;
    Blocks.oreThorium.oreScale = 25.380953;

    // ---- defense ----
    // Java: `stoneWall = new StaticWall("stone-wall"){{ variants = 1; }}`
    Blocks.stoneWall = new StaticWall("stone-wall");
    Blocks.stoneWall.variants = 1;

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
