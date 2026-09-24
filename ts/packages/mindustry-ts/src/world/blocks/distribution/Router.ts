// 源: core/src/mindustry/world/blocks/distribution/Router.java
//
// ⚠️ 有意的窄化（S3）: 与 `Conveyor` 同因 —— `RouterBuild.updateTile()` 完全建立在
// `ItemModule`（`items`）与 `handleItem/getTileTarget/unit()/isControlled()` 之上，
// 全部属 S4（物品搬运）。方块级元数据照 Java 移植，`updateTile()` 是显式空实现 + TODO。
//
// 未移植（逐条标注）:
//   - `RouterBuild` 的 `lastItem/lastInput/time/unit/cycles` 与
//     `unit/canControl/shouldAutoTarget/acceptStack/acceptItem/handleItem/removeStack/getTileTarget`
//     —— 依赖 `ItemModule` / `ControlBlock` / `BlockUnitc`（S4）
//   - `ControlBlock` 接口 —— S4

import { Building } from "../../../gen/Building.js";
import { Block } from "../../Block.js";
import { BlockGroup } from "../../meta/BlockGroup.js";

/** 对应 `mindustry.world.blocks.distribution.Router.RouterBuild`（S3 空壳，见文件头）。 */
export class RouterBuild extends Building{
  /**
   * ⚠️ 必须显式声明 public 构造器：`Building` 的构造器由 codegen 生成为 `protected`
   * （`gen/Building.ts`），TS 对「未声明构造器」的子类会继承该 protected 构造器，
   * 于是外部的 `new RouterBuild()` 报 `TS2674`。见 `defense/Wall.ts` 的同一说明。
   */
  constructor(){
    super();
  }

  /**
   * Java `RouterBuild.updateTile()`：累积 `time += 1f / speed * delta()`，达到 1 后把
   * `lastItem` 投递给 `getTileTarget(...)` 选出的目标。
   * TODO(S4): 移植 `ItemModule` 与物品投递协议后补全。
   */
  override updateTile(): void{ }
}

/** 对应 `mindustry.world.blocks.distribution.Router`。 */
export class Router extends Block{
  /** 投递速度（Java 默认 8f）。 */
  speed = 8;

  constructor(name: string){
    super(name);
    this.solid = false;
    this.underBullets = true;
    this.update = true;
    this.hasItems = true;
    this.itemCapacity = 1;
    this.group = BlockGroup.transportation;
    this.unloadable = false;
    this.noUpdateDisabled = true;
    this.drawCached = true;
    this.drawDynamic = false;

    // 陷阱 #6：显式注册建筑工厂
    this.buildType = () => new RouterBuild();
  }
}
