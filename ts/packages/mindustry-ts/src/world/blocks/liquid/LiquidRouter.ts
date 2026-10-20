// 源: core/src/mindustry/world/blocks/liquid/LiquidRouter.java (32 行)
//
// 移植范围: 构造器 flags + `LiquidRouterBuild` 的 `updateTile`（向四周 dump 当前液体）
//   与 `acceptLiquid`（只收「当前液体或库存为空」）。
//   `icons`/`draw` —— 渲染，未移植（计划 §9）。

import { Building } from "../../../gen/Building.js";
import { LiquidBlock, LiquidBuild } from "./LiquidBlock.js";

/** 对应 `mindustry.world.blocks.liquid.LiquidRouter`。 */
export class LiquidRouter extends LiquidBlock{
  /** Java `public float liquidPadding = 0f`（:8）—— 渲染，仅留值。 */
  liquidPadding = 0;

  /** 对应 Java `LiquidRouter(String name)`（:10-16）。 */
  constructor(name: string){
    super(name);
    this.solid = true;
    this.noUpdateDisabled = true;
    this.canOverdrive = false;
    this.floating = true;
    // 陷阱 #6：显式注册建筑工厂
    this.buildType = () => new LiquidRouterBuild();
  }
}

/** 对应 Java `LiquidRouter.LiquidRouterBuild`（:18-31）。 */
export class LiquidRouterBuild extends LiquidBuild{
  /** 对应 Java `updateTile()`（:20-22）—— 把当前液体尽量向外倒。 */
  override updateTile(): void{
    // codegen 不保留默认参数 → 显式传 3 参（等价 Java 的 `dumpLiquid(liquid)` 默认 (2, -1)）。
    this.dumpLiquid(this.liquids.current(), 2, -1);
  }

  /** 对应 Java `acceptLiquid(Building, Liquid)`（:27-29）—— 只收「当前液体或空箱」。 */
  override acceptLiquid(source: Building, liquid: any): boolean{
    return this.liquids.current() === liquid || this.liquids.currentAmount() < 0.2;
  }
}
