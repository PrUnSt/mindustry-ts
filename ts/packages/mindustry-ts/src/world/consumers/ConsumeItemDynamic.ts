// 源: core/src/mindustry/world/consumers/ConsumeItemDynamic.java (53 行)
//
// 移植范围: **全部**（纯模拟，无渲染/UI）。`itemConsumer` 字段 + `apply` / `trigger` /
//   `efficiency`。`build(Table)`（:15-41，UI 物品列表）未移植（计划 §9）。
//
// ⚠️ 为什么 UnitFactory 需要它而不是 `ConsumeItems`:
//   `ConsumeItems` 的配方在**声明期**就固定；而工厂的消耗量随 `currentPlan` 动态变化
//   （`efficiency` / `trigger` 都要按「当前方案的 `requirements`」算）。Java 用
//   `ConsumeItemDynamic` 把「取配方」抽象成 `Func<Building, ItemStack[]>`，`UnitFactory`
//   在构造器里喂一个闭包（`UnitFactory.java:71-73`）。TS 照搬。

import type { Building } from "../../gen/Building.js";
import type { Block } from "../Block.js";
import type { ItemStack } from "../../type/ItemStack.js";
import { Consume } from "./Consume.js";

/** 对应 `mindustry.world.consumers.ConsumeItemDynamic`。 */
export class ConsumeItemDynamic extends Consume{
  /** Java `public final Func<Building, ItemStack[]> items`（:9）。 */
  readonly itemConsumer: (build: Building) => ItemStack[];

  constructor(itemConsumer: (build: Building) => ItemStack[]){
    super();
    this.itemConsumer = itemConsumer;
  }

  /** 对应 Java `apply(Block)`（:13-16）。 */
  override apply(block: Block): void{
    block.hasItems = true;
    block.acceptsItems = true;
  }

  /** 对应 Java `trigger(Building)`（:43-48）—— **扣原料就在这里**（由 `consume()` 调）。 */
  override trigger(build: Building): void{
    for(const stack of this.itemConsumer(build)){
      build.items.remove(stack.item, Math.round(stack.amount * this.multiplier(build)));
    }
  }

  /**
   * 对应 Java `efficiency(Building)`（:50-52）。
   * ⚠️ 动态配方的「当前方案无消耗」时效率为 0（Java 原文 `build.items.has(...)`）。
   */
  override efficiency(build: Building): number{
    return build.consumeTriggerValid() || build.items.hasStacksMultiplied(this.itemConsumer(build), this.multiplier(build))
      ? 1
      : 0;
  }
}
