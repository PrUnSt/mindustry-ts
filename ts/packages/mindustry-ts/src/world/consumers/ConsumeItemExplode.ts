// 源: core/src/mindustry/world/consumers/ConsumeItemExplode.java (62 行)
//
// 移植范围: `damage` / `threshold` / `baseChance` + 构造器的 `filter` 设置 +
//   `efficiency`（恒 1）。
//
// ❌ **爆炸是 no-op**（本阶段唯一被砍掉的**行为**，不是渲染）:
//   Java `update(Building)`（:31-42）会在放入易爆物品时按 `Mathf.chance(delta * baseChance *
//   clamp(explosiveness - threshold))` 触发 `build.damage(damage)` + `explodeEffect.at(...)` +
//   `Events.fire(Trigger.blastGenerator)`。
//   它是「伤害 + 特效 + 事件」三层，本阶段都不做（`Damage` / `Fx` / `Events` 均属后续阶段）→
//   `update` 保留为**空实现**（Java 注释 :44 也说「as this consumer doesn't actually consume
//   anything, all methods below are empty」）。
//   ⚠️ 附带影响: Java 每 tick 会消耗一次全局随机数（`Mathf.chance` 内部），
//   本移植省略 → RNG 流与 Java 不再逐步对齐。对「两次同布景 → 同结果」无影响。
//
// ❌ 其余未移植（UI 层，计划 §9）: `build(Building, Table)`（:46-47）/ `display(Stats)`（:52-53）。
//   ⚠️ `apply(Block)`（:55-56）在 Java 里**本就是空实现**（不置 `hasItems`）—— 必须照抄，
//      否则 `combustion-generator` 会因为多声明一个消费者而被误判为「有物品槽」。
//      （真正置 `hasItems` 的是同块的 `ConsumeItemFlammable`。）
//
// ⚠️ `threshold` 默认 **0.5**（:27）：coal 的 `explosiveness` 是 0.2 → 不触发；
//   pyratite 是 0.4 → 不触发；blastCompound 是 1.2 → 触发。

import type { Building } from "../../gen/Building.js";
import type { Block } from "../Block.js";
import type { Item } from "../../type/Item.js";
import { ConsumeItemFilter } from "./ConsumeItemFilter.js";

/** 对应 `mindustry.world.consumers.ConsumeItemExplode`。 */
export class ConsumeItemExplode extends ConsumeItemFilter{
  /** Java `public float damage = 4f`（:18）。爆炸时对本建筑造成的伤害。 */
  damage = 4;
  /** Java `public float threshold, baseChance = 0.06f`（:19）。 */
  threshold: number;
  baseChance = 0.06;

  constructor(threshold = 0.5){
    super();
    this.filter = (item: Item) => item.explosiveness >= this.threshold;
    this.threshold = threshold;
  }

  /**
   * 对应 Java `update(Building)`（:31-42）。
   * ❌ **本阶段做成 no-op** —— 爆炸是「伤害 + 特效 + 事件」三层，均属后续阶段（见文件头）。
   *    Java 原文保留在注释里供后续移植:
   * ```java
   * var item = getConsumed(build);
   * if(item != null){
   *     if(Vars.state.rules.reactorExplosions && Mathf.chance(build.delta() * baseChance * Mathf.clamp(item.explosiveness - threshold))){
   *         build.damage(damage);
   *         explodeEffect.at(build.x + Mathf.range(build.block.size * tilesize / 2f), build.y + Mathf.range(build.block.size * tilesize / 2f));
   *         Events.fire(Trigger.blastGenerator);
   *     }
   * }
   * ```
   */
  override updateConsume(_build: Building): void{
    // no-op（见文件头）
  }

  /** 对应 Java `trigger(Building)`（:49-50）：空 —— 本消费者不消耗任何东西。 */
  override trigger(_build: Building): void{
    // no-op（Java 原文即空）
  }

  /** 对应 Java `apply(Block)`（:55-56）：**空** —— 不置 `hasItems`。⚠️ 别补成基类实现。 */
  override apply(_block: Block): void{
    // no-op（Java 原文即空）
  }

  /** 对应 Java `efficiency(Building)`（:58-61）：恒 1 —— 不拉低木桶最小值。 */
  override efficiency(_build: Building): number{
    return 1;
  }
}
