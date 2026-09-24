// 源: core/src/mindustry/world/blocks/distribution/Conveyor.java
//
// ⚠️ 有意的窄化（S3）—— 必须先读环境注意事项（计划 §6.2 陷阱 #13）:
//   传送带的**全部**行为（`ConveyorBuild`）建立在 `ItemModule`（`Building.items`）之上，
//   以及 `handleItem/acceptItem/getTileTarget/next/delta/efficiency` 这套物品投递协议上。
//   `ItemModule` 与物品投递协议属于 S4（物品搬运）范围，不在 S3（headless 世界跑 tick）。
//   因此本文件移植**方块级元数据**（构造器字段与 `init()` 的语义），
//   而 `ConveyorBuild.updateTile()` 是**显式空实现 + TODO**，不是"忘了写"。
//   这不会削弱 6 条硬断言：它们只依赖 `Blocks.air` / `Tiles` / `World` / `Wall` / `Groups.build`。
//
// 未移植（逐条标注）:
//   - `regions` 等贴图字段与 `draw*` / `drawPlanRegion` / `drawPlace` —— 渲染（计划 §9）
//   - `setStats()` —— 依赖 `Stat`/`StatUnit`
//   - `init()` 的 `junctionReplacement` / `bridgeReplacement` 回填 —— Java 回填的是
//     `Blocks.junction` / `Blocks.itemBridge`，这两个方块不在 S3 的最小方块集合里。
//     **没有**静默写成 `undefined`；而是整个跳过并在交付说明里标注。
//   - `ConveyorBuild` 的全部成员（`ids/xs/ys/len/next/aligned/...`）—— 依赖 `ItemModule`
//   - `Autotiler` / `ChainedBuilding` 接口 —— S4

import { Building } from "../../../gen/Building.js";
import { Block } from "../../Block.js";
import { BlockGroup } from "../../meta/BlockGroup.js";
import { TargetPriority } from "../../../entities/TargetPriority.js";
import { Sounds } from "../../../mocks/Sounds.js";

/** 对应 `mindustry.world.blocks.distribution.Conveyor.ConveyorBuild`（S3 空壳，见文件头）。 */
export class ConveyorBuild extends Building{
  /**
   * ⚠️ 必须显式声明 public 构造器：`Building` 的构造器由 codegen 生成为 `protected`
   * （`gen/Building.ts`），TS 对「未声明构造器」的子类会继承该 protected 构造器，
   * 于是外部的 `new ConveyorBuild()` 报 `TS2674`。见 `defense/Wall.ts` 的同一说明。
   */
  constructor(){
    super();
  }

  /**
   * Java `ConveyorBuild.updateTile()`：按 `speed` 推进 `ids/xs/ys` 三组平行数组里的物品，
   * 并把物品投递给 `next`。整段依赖 `ItemModule`（`items`）与 `handleItem` 协议。
   * TODO(S4): 移植 `ItemModule` 与物品投递协议后补全。
   */
  override updateTile(): void{ }
}

/** 对应 `mindustry.world.blocks.distribution.Conveyor`。 */
export class Conveyor extends Block{
  /** Java `Conveyor.capacity`（private static final int）。 */
  static readonly capacity = 3;
  /** Java `Conveyor.itemSpace`（private static final float）。 */
  static readonly itemSpace = 0.4;

  /** 传送速度（每 tick 推进的比例）。 */
  speed = 0;
  /** 展示用的速度（每秒物品数）。 */
  displayedSpeed = 0;
  /** 是否推动站在其上的单位。 */
  pushUnits = true;
  /** 交叉器替换方块（Java 在 `init()` 里回填 `Blocks.junction`；S3 不移植，见文件头）。 */
  junctionReplacement: Block | null = null;
  /** 桥替换方块（同上）。 */
  bridgeReplacement: Block | null = null;

  constructor(name: string){
    super(name);
    this.rotate = true;
    this.update = true;
    this.group = BlockGroup.transportation;
    this.hasItems = true;
    this.itemCapacity = Conveyor.capacity;
    this.priority = TargetPriority.transport;
    this.conveyorPlacement = true;
    this.underBullets = true;

    this.ambientSound = Sounds.loopConveyor;
    this.ambientSoundVolume = 0.0022;
    this.unloadable = false;
    this.noUpdateDisabled = false;

    // 陷阱 #6：显式注册建筑工厂
    this.buildType = () => new ConveyorBuild();
  }
}
