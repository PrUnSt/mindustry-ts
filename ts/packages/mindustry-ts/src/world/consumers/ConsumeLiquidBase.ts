// 源: core/src/mindustry/world/consumers/ConsumeLiquidBase.java (23 行)
//
// 移植范围: 全部。`amount` + `apply`（置 hasLiquids）+ 抽象 `consumes(Liquid)`。
//   它是「液体消费者」的基类 —— `BuildingComp.acceptLiquid()` 的判据
//   `block.consumesLiquid(liquid)`（BuildingComp.java:875）靠它区分「这个方块
//   收不收这种液体」。

import type { Block } from "../Block.js";
import type { Liquid } from "../../type/Liquid.js";
import { Consume } from "./Consume.js";

/** 对应 `mindustry.world.consumers.ConsumeLiquidBase`。 */
export abstract class ConsumeLiquidBase extends Consume{
  /** 每帧用量（Java `public float amount`，:9）。 */
  amount = 0;

  constructor(amount: number){
    super();
    this.amount = amount;
  }

  /** 对应 Java `apply(Block)`（:18-21）。 */
  override apply(block: Block): void{
    block.hasLiquids = true;
  }

  /** 对应 Java `abstract boolean consumes(Liquid)` —— 本消费者是否消耗这种液体。 */
  abstract consumes(liquid: Liquid): boolean;
}
