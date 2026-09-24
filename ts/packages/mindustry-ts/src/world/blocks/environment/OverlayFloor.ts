// 源: core/src/mindustry/world/blocks/environment/OverlayFloor.java (25 行)
//
// 用途: 覆盖层地板（矿石）的基类。`OreBlock` 继承它（`OreBlock.java:15`）。
//
// 未移植（渲染路径，计划 §9）:
//   - `drawBase(Tile)` —— `Draw.rect(variantRegions[...])`，headless 无 Draw。

import { Floor } from "./Floor.js";
import type { Tile } from "../../Tile.js";
import type { Team } from "../../../game/Team.js";

/** 对应 `mindustry.world.blocks.environment.OverlayFloor`。 */
export class OverlayFloor extends Floor{
  constructor(name: string){
    super(name);
    // Java: `useColor = false;`（矿石子类会覆盖回 true）
    this.useColor = false;
  }

  /** 对应 Java `Block.isOverlay()` 的 `this instanceof OverlayFloor`。改写理由同 `Floor.isFloor()`。 */
  override isOverlay(): boolean{
    return true;
  }

  /** 对应 Java `canPlaceOn(Tile, Team, int)`：`!wallOre || tile.block().solid`。 */
  override canPlaceOn(tile: Tile, _team: Team, _rotation: number): boolean{
    return !this.wallOre || tile.block().solid;
  }

  // Java `drawBase(Tile)` —— 渲染路径，见文件头。
}
