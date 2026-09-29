// 源: core/src/mindustry/world/consumers/ConsumeItemFilter.java (85 行)
//
// 移植范围: `filter` + `apply` / `trigger` / `efficiency` / `getConsumed` /
//   `efficiencyMultiplier` / `itemEfficiencyMultiplier`。
//
// ❌ 未移植（逐条标注，计划 §9）:
//   - `build(Building, Table)`（:35-42）—— UI（`MultiReqImage` / `ReqImage` / `StatValues`）
//   - `display(Stats)`（:71-74）—— `Stat` / `StatValues` 未移植
//   - `apply` 里的 `block.itemFilter[item.id] = true`（:28-32）—— TS 的 `Block` 尚无
//     `itemFilter` 数组（与 `ConsumeItems.ts` 同一处置）。
//     ⚠️ `hasItems` / `acceptsItems`（:26-27）**已移植** —— 它们才是
//     `ConsumeGeneratorBuild.updateTile()` 里 `if(block.hasItems && valid …)` 的判据来源。
//
// ⚠️ `itemDurationMultipliers` 字段**下沉**到了本类（Java 在子类 `ConsumeItemEfficiency`
//   `ConsumeItemEfficiency.java:9`）。理由见 `world/blocks/power/ConsumeGenerator.ts` 文件头：
//   TS 侧不新建 `ConsumeItemEfficiency`，且空 map 与 null 在 `updateTile` 的
//   `itemDurationMultipliers.size > 0` 判据下等价 → 不可观测。

import { ObjectMap } from "@mindustry-ts/arc";
import type { Building } from "../../gen/Building.js";
import type { Block } from "../Block.js";
import type { Item } from "../../type/Item.js";
import { Vars } from "../../Vars.js";
import { Consume } from "./Consume.js";

/**
 * 对应 `mindustry.world.consumers.ConsumeItemFilter`。
 *
 * `filter` 是「哪些物品能当这份消耗」的谓词；`ConsumeItemFlammable` /
 * `ConsumeItemExplode` 都是它的子类。
 */
export class ConsumeItemFilter extends Consume{
  /** Java `public Boolf<Item> filter = i -> false`（:15）。 */
  filter: (item: Item) => boolean = () => false;

  /**
   * Java `public @Nullable ObjectFloatMap<Item> itemDurationMultipliers`
   * （在子类 `ConsumeItemEfficiency.java:9`；下沉理由见文件头）。
   * 由 `ConsumeGenerator.init()` 从方块侧回填。
   */
  itemDurationMultipliers: ObjectMap<Item, number> | null = null;

  constructor(filter?: (item: Item) => boolean){
    super();
    if(filter !== undefined) this.filter = filter;
  }

  /** 对应 Java `apply(Block)`（:24-33）。 */
  override apply(block: Block): void{
    block.hasItems = true;
    block.acceptsItems = true;
    // TODO: `block.itemFilter[item.id] = true`（Java :28-32）—— TS `Block` 无 `itemFilter`。
  }

  /** 对应 Java `trigger(Building)`（:47-54）—— **扣掉一件燃料就在这里**。 */
  override trigger(build: Building): void{
    const item = this.getConsumed(build);
    if(item !== null){
      build.items.remove(item, 1);
    }
  }

  /**
   * 对应 Java `efficiency(Building)`（:56-59）。
   *
   * ⚠️ `consumeTriggerValid()` 在前 —— 这是发电机的关键：
   * `ConsumeGeneratorBuild.consumeTriggerValid()` 返回 `generateTime > 0`
   * （`ConsumeGenerator.java:152`），即「上一件燃料还在烧」时即使库存已空也算有效。
   */
  override efficiency(build: Building): number{
    return build.consumeTriggerValid() || this.getConsumed(build) !== null ? 1 : 0;
  }

  /** 对应 Java `getConsumed(Building)`（:61-69）：按 `content.items()` 的顺序取第一个命中。 */
  getConsumed(build: Building): Item | null{
    const items = Vars.content.items();
    for(let i = 0; i < items.size; i++){
      const item = items.items[i]!;
      if(build.items.has(item) && this.filter(item)){
        return item;
      }
    }
    return null;
  }

  /** 对应 Java `efficiencyMultiplier(Building)`（:76-80）= 燃料品质。 */
  override efficiencyMultiplier(build: Building): number{
    const item = this.getConsumed(build);
    return item === null ? 0 : this.itemEfficiencyMultiplier(item);
  }

  /** 对应 Java `itemEfficiencyMultiplier(Item)`（:82-84）。基类恒 1；子类按物品属性覆写。 */
  itemEfficiencyMultiplier(_item: Item): number{
    return 1;
  }
}
