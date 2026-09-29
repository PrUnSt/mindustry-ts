// 源: core/src/mindustry/world/consumers/ConsumeItems.java (59 行)
//
// 移植范围: `items` 字段 + `apply` / `trigger` / `efficiency`（:22-29 / :43-48 / :50-53）。
//
// 未移植（逐条标注）:
//   - `build(Building, Table)`（:31-41）与 `display(Stats)`（:55-58）—— UI/统计层，计划 §9
//   - `apply` 里的 `block.itemFilter[stack.item.id] = true`（:27）—— TS 的 `Block` 尚无
//     `itemFilter` 数组（它依赖 `content.items().size`，见 `Block.init()` 里的同批 TODO）

import type { Building } from "../../gen/Building.js";
import type { Block } from "../Block.js";
import type { ItemStack } from "../../type/ItemStack.js";
import { Consume } from "./Consume.js";

/** 对应 Java `mindustry.world.consumers.ConsumeItems`。 */
export class ConsumeItems extends Consume{
  /** 每份配方需要的物品（Java `public final ItemStack[] items`，:11）。 */
  readonly items: readonly ItemStack[];

  constructor(items: readonly ItemStack[]){
    super();
    this.items = items;
  }

  /**
   * 对应 Java `apply(Block)`（:22-29）。
   *
   * ⚠️ `itemFilter` 那一行（:27）**不是可选装饰**：它是
   *    `Block.consumesItem(item)` → `BuildingComp.acceptItem()` 的唯一数据源，
   *    也就是「传送带能不能把原料投进本方块」的闸门。漏掉它 → 工厂永远收不到料。
   */
  override apply(block: Block): void{
    block.hasItems = true;
    block.acceptsItems = true;
    for(const stack of this.items){
      if(stack.item.id < block.itemFilter.length){
        block.itemFilter[stack.item.id] = true;
      }
    }
  }

  /**
   * 对应 Java `trigger(Building)`（:43-48）—— **扣原料就发生在这里**。
   * 由 `BuildingComp.consume()` → `GenericCrafter.craft()` 的第一行调用。
   * ⚠️ `Math.round(amount * multiplier)` 的取整与 Java 一致（Java 也是 `Math.round` 后转 int）。
   */
  override trigger(build: Building): void{
    for(const stack of this.items){
      build.items.remove(stack.item, Math.round(stack.amount * this.multiplier(build)));
    }
  }

  /**
   * 对应 Java `efficiency(Building)`（:50-53）。
   * ⚠️ `consumeTriggerValid()` 在前：发电机这类「靠 trigger 驱动的消费者」即使库存为空
   *    也算有料（Java `ConsumeGenerator.java:152` 覆写它返回 `generateTime > 0`）。
   */
  override efficiency(build: Building): number{
    return build.consumeTriggerValid() || build.items.hasStacksMultiplied(this.items, this.multiplier(build))
      ? 1
      : 0;
  }
}
