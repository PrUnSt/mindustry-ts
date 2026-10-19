// 源: core/src/mindustry/world/blocks/units/UnitBlock.java (34 行)
//
// 移植范围: 构造器 + `UnitBuild` 的最小面（`progress` / `time` / `speedScl` 字段）。
//
// ⚠️ **结构性差异（必须知道）**: Java `UnitBlock extends PayloadBlock`（`:14`）。TS **没有
//   payload 系统**（`Block.ts` 文件头的 `outputsPayload` 只是字段，无 `PayloadBlock` 基类）
//   → 本类直接 `extends Block`，把构造器里**与 payload 无关**的 flags 照抄:
//     `group = BlockGroup.units; outputsPayload = true; rotate = true; update = true; solid = true;`
//   （`UnitBlock.java:15-21`）。「单位被包成 `UnitPayload` 移出工厂」这段（`dumpPayload` /
//   `Call.unitBlockSpawn` / `spawned`，:23-33）整体不移植 —— 见 `UnitFactory.ts` 文件头
//   的「单位如何产出」说明。
//
// 未移植: `unitBlockSpawn(Tile)`（:25-30，`@Remote` 网络回调）—— 网络层。

import { Building } from "../../../gen/Building.js";
import { Block } from "../../Block.js";
import { BlockGroup } from "../../meta/BlockGroup.js";
import { ItemModule } from "../../modules/ItemModule.js";

/** 对应 `mindustry.world.blocks.units.UnitBlock`。 */
export class UnitBlock extends Block{
  /** 对应 Java `UnitBlock(String name)`（:14-22）。 */
  constructor(name: string){
    super(name);
    this.group = BlockGroup.units;
    this.outputsPayload = true;
    this.rotate = true;
    this.update = true;
    this.solid = true;
  }
}

/** 对应 Java `UnitBlock.UnitBuild`（:32-44）—— 只保留三个进度字段。 */
export class UnitBuild extends Building{
  /** Java `public float progress`（:33）。 */
  progress = 0;
  /** Java `public float time`（:33）。 */
  time = 0;
  /** Java `public float speedScl`（:33）。 */
  speedScl = 0;

  /** ⚠️ 必须显式声明 public 构造器（`gen/Building.ts` 的构造器是 `protected`）。 */
  constructor(){
    super();
    // `hasItems=true` 的方块由具象建筑分配 `ItemModule`（生成文件不能 import 模块类；
    // 时机与 Java `BuildingComp.create()` 等价，见 `Conveyor.ts` 文件头）。
    this.items = new ItemModule();
  }
}
