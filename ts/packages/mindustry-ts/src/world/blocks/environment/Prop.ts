// 源: core/src/mindustry/world/blocks/environment/Prop.java
//
// 未移植: `drawBase` / `icons`（渲染路径，计划 §9）。

import { Block } from "../../Block.js";
import { Layer } from "../../../mocks/Layer.js";
import { Sounds } from "../../../mocks/Sounds.js";
import { Fx } from "../../../mocks/Fx.js";

/** 对应 `mindustry.world.blocks.environment.Prop`。 */
export class Prop extends Block{
  /** 绘制层级。 */
  layer: number = Layer.blockProp;

  constructor(name: string){
    super(name);
    this.breakable = true;
    this.alwaysReplace = true;
    this.instantDeconstruct = true;
    this.unitMoveBreakable = true;
    this.breakEffect = Fx.breakProp;
    this.breakSound = Sounds.rockBreak;
  }
}
