// 源: core/src/mindustry/world/blocks/power/PowerBlock.java (15 行)
//
// 移植范围: **全部**（构造器 4 行）。Java 原文:
//   `update = true; solid = true; hasPower = true; group = BlockGroup.power;`
//
// ⚠️ `group = BlockGroup.power` 不是装饰: `Block.canReplace()`（`world/Block.ts:650-661`）用它判断
//   「同类方块可以直接替换」，电力方块之间靠它互换。
//
// 未移植: 无（本类只有构造器）。

import { BlockGroup } from "../../meta/BlockGroup.js";
import { Block } from "../../Block.js";

/** 对应 `mindustry.world.blocks.power.PowerBlock`。 */
export class PowerBlock extends Block{
  /** 对应 Java `PowerBlock(String name)`（:8-14）。 */
  constructor(name: string){
    super(name);
    this.update = true;
    this.solid = true;
    this.hasPower = true;
    this.group = BlockGroup.power;
  }
}
