// 源: core/src/mindustry/world/blocks/environment/StaticWall.java
//
// 未移植（渲染路径，计划 §9）: `drawBase` / `load` / `variant` / `checkAutotileSame` / `eq`
// 以及 `large` / `split` / `autotileRegions` 等贴图字段。

import { Block } from "../../Block.js";
import { Prop } from "./Prop.js";
import { CacheLayer } from "../../../mocks/CacheLayer.js";
import { Fx } from "../../../mocks/Fx.js";

/** 对应 `mindustry.world.blocks.environment.StaticWall`。 */
export class StaticWall extends Prop{
  /** 是否使用自动拼接（参见 tile-gen）。 */
  autotile = false;
  /** 自动拼接中间区域的随机变体数。 */
  autotileMidVariants = 1;

  constructor(name: string){
    super(name);
    this.breakable = false;
    this.alwaysReplace = false;
    this.unitMoveBreakable = false;
    this.solid = true;
    this.variants = 2;
    this.cacheLayer = CacheLayer.walls;
    this.allowRectanglePlacement = true;
    this.placeEffect = Fx.rotateBlock;
    this.instantBuild = true;
    this.ignoreBuildDarkness = true;
    this.placeableLiquid = true;
  }

  /** 对应 Java `StaticWall.canReplace(Block)`：`other instanceof StaticWall || super.canReplace(other)`。 */
  override canReplace(other: Block): boolean{
    return other.isStaticWall() || super.canReplace(other);
  }

  /** 对应 Java `other instanceof StaticWall`（`StaticWall.java:73`）；见 `Block.isStaticWall()` 的说明。 */
  override isStaticWall(): boolean{
    return true;
  }
}
