// 源: core/src/mindustry/world/consumers/Consume.java (65 行)
//
// 移植范围: 抽象基类**全部**字段与方法。它是整个「工厂效率」体系的地基 ——
//   `BuildingComp.updateConsumption()` 的慢路径靠 `efficiency(build)` 取最小值，
//   `BuildingComp.consume()` 靠 `trigger(build)` 扣原料，`Block.init()` 靠 `apply(block)`
//   声明副作用（`ConsumePower.apply` 是**唯一**把 `Block.hasPower` 置 true 的地方）。
//
// ⚠️ 为什么不能省（这是本阶段最重要的判断）：
//   `GenericCrafter.craft()` 的第一行就是 `consume()`（GenericCrafter.java:309）。
//   如果 `block.consumers` 为空数组，`consume()` 就是 no-op → **原料不扣、产物照出**，
//   等于无中生有刷资源。所以「绕开 Consumers、手工给 efficiency = 1」这条捷径**不成立**。
//
// 未移植: 无（本类很小，逐条对齐）。

import type { Building } from "../../gen/Building.js";
import type { Block } from "../Block.js";

/**
 * 对应 Java `mindustry.world.consumers.Consume`。
 *
 * 子类只需按需覆写：`apply` / `ignore` / `trigger` / `update` / `efficiency` /
 * `efficiencyMultiplier`。默认值与 Java 一致（`efficiency` 默认 1 → 不影响木桶最小值）。
 */
export abstract class Consume{
  /** 是否可选（Java `optional`）。可选消费者只影响 `optionalEfficiency`，不拉低 `efficiency`。 */
  optional = false;
  /** 是否为「增益」型（Java `booster`）。 */
  booster = false;
  /** 是否参与 `updateConsumers`（Java `update`）。 */
  update = true;
  /** 效率乘子函数（Java `Floatf<Building> multiplier = b -> 1f`）。 */
  multiplier: (build: Building) => number = () => 1;

  /**
   * 声明期副作用钩子（Java `apply(Block)`，:23）。
   * 由 `Block.init()` 在固化 `consumers` 数组后统一调用（Block.java:1474-1476）。
   */
  apply(_block: Block): void{
    // Java 基类为空实现；`ConsumePower` 靠它置 `block.hasPower = true`。
  }

  /** 是否从 `optionalConsumers` / `nonOptionalConsumers` 中排除（Java `ignore()`，:43）。 */
  ignore(): boolean{
    return false;
  }

  /**
   * 消耗触发（Java `trigger(Building)`，:50）。
   * `BuildingComp.consume()`（:1918）遍历 `block.consumers` 逐个调用 —— 扣原料就在这里发生。
   */
  trigger(_build: Building): void{
    // 基类空实现。
  }

  /**
   * 每 tick 更新（Java `update(Building)`，:52）。只在 `efficiency > 0` 时被调用。
   *
   * ⚠️ 为什么叫 `updateConsume` 而不是 `update`：Java 里字段 `update`（本类 :16）
   *     与方法 `update(Building)`（:52）**同名**是合法的（字段与方法在不同命名空间），
   *     **TS 不允许**。方法名改名，语义不变；调用点只有
   *     `BuildingComp.updateConsumption()` 里的一处。
   */
  updateConsume(_build: Building): void{
    // 基类空实现。
  }

  /** 该消费者的效率（Java `efficiency(Building)`，:55）。默认 1 —— 不参与木桶取小。 */
  efficiency(_build: Building): number{
    return 1;
  }

  /** 效率乘子（Java `efficiencyMultiplier(Building)`，:60）。发电机用它算「燃料品质」。 */
  efficiencyMultiplier(_build: Building): number{
    return 1;
  }
}
