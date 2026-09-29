// 源: core/src/mindustry/world/blocks/power/PowerDistributor.java (10 行)
//
// 移植范围: **全部**（构造器 2 行）。Java 原文:
//   `consumesPower = false; outputsPower = true;`
//
// ⚠️ `consumesPower = false` 是 `PowerGraph.add()`（PowerGraph.java:290-299）分类判据的一半:
//   发电机/导线是「只出不进」，因此落进 `producers` 而不是 `consumers`。
//   它同时让 `getPowerConnections()` 的「两个纯耗电方块互不导通」判据
//   （`BuildingComp.java:1195`）**不**把发电机排除在外 —— 电力正是靠它传播的。
//
// 未移植: 无。

import { PowerBlock } from "./PowerBlock.js";

/** 对应 `mindustry.world.blocks.power.PowerDistributor`。 */
export class PowerDistributor extends PowerBlock{
  /** 对应 Java `PowerDistributor(String name)`（:5-9）。 */
  constructor(name: string){
    super(name);
    this.consumesPower = false;
    this.outputsPower = true;
  }
}
