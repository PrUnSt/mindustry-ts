// 源: core/src/mindustry/world/blocks/liquid/LiquidBlock.java (91 行)
//
// 移植范围: 构造器（flags）+ `LiquidBuild`（`liquids` 分配）。
//
// ⚠️ 与 Java 的差异（写清）:
//   - 全部渲染（`@Load` 贴图 / `drawTiledFrames` / `icons` / `LiquidBuild.draw`）—— 计划 §9。
//   - `outputsLiquid = true`（:18）—— TS `Block` 无此字段（未移植的液体输出标记）→ 省略。
//
// ⚠️ 液体库存的分配: `LiquidBuild` 构造器 `this.liquids = new LiquidModule()`（同 `ItemModule`
//   的处置 —— 生成文件不能 import 模块类）。凡 `hasLiquids=true` 的方块都必须这么分。

import { Building } from "../../../gen/Building.js";
import { Block } from "../../Block.js";
import { BlockGroup } from "../../meta/BlockGroup.js";
import { Env } from "../../meta/Env.js";
import { LiquidModule } from "../../modules/LiquidModule.js";

/** 对应 `mindustry.world.blocks.liquid.LiquidBlock`。 */
export class LiquidBlock extends Block{
  /** 对应 Java `LiquidBlock(String name)`（:14-20）。 */
  constructor(name: string){
    super(name);
    this.update = true;
    this.solid = true;
    this.hasLiquids = true;
    this.group = BlockGroup.liquids;
    this.envEnabled |= Env.space | Env.underwater;
    // 陷阱 #6：显式注册建筑工厂
    this.buildType = () => new LiquidBuild();
  }
}

/** 对应 Java `LiquidBlock.LiquidBuild`（:83-90）。 */
export class LiquidBuild extends Building{
  /** ⚠️ 必须显式声明 public 构造器。 */
  constructor(){
    super();
    this.liquids = new LiquidModule();
  }
}
