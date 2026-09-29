// 源: core/src/mindustry/world/consumers/ConsumeItemFlammable.java (21 行)
//
// 移植范围: **全部**（21 行里没有一行是渲染/音效）。
//
// Java 原文:
// ```
// public class ConsumeItemFlammable extends ConsumeItemEfficiency{
//     public float minFlammability;
//     public ConsumeItemFlammable(float minFlammability){
//         this.minFlammability = minFlammability;
//         filter = item -> item.flammability >= this.minFlammability;
//     }
//     public ConsumeItemFlammable(){ this(0.2f); }
//     @Override public float itemEfficiencyMultiplier(Item item){ return item.flammability; }
// }
// ```
//
// ⚠️ 继承链的**被迫差异**: Java 的中间父类是 `ConsumeItemEfficiency`（它只多带一个
//   `itemDurationMultipliers` 字段 + 一个 UI 用的 `display`）。TS 侧不新建那个类
//   （文件所有权限制），`ConsumeItemFlammable` 直接继承 `ConsumeItemFilter`，
//   字段已下沉到基类 → 语义等价（见 `ConsumeItemFilter.ts` 文件头）。
//
// ⚠️ `minFlammability` 默认 **0.2**（:13）：coal 是 1、pyratite 是 1.4、sporePod 是 1.15 →
//   都能烧；sand / scrap / titanium 等 `flammability === 0` 的物品不能烧。

import type { Item } from "../../type/Item.js";
import { ConsumeItemFilter } from "./ConsumeItemFilter.js";

/** 对应 `mindustry.world.consumers.ConsumeItemFlammable`。 */
export class ConsumeItemFlammable extends ConsumeItemFilter{
  /** Java `public float minFlammability`（:6）。 */
  minFlammability: number;

  constructor(minFlammability = 0.2){
    super();
    this.minFlammability = minFlammability;
    this.filter = (item: Item) => item.flammability >= this.minFlammability;
  }

  /** 对应 Java `itemEfficiencyMultiplier(Item)`（:17-20）= 该物品的可燃性（燃料品质）。 */
  override itemEfficiencyMultiplier(item: Item): number{
    return item.flammability;
  }
}
