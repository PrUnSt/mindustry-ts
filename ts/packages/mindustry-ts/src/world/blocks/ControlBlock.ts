// 源: core/src/mindustry/world/blocks/ControlBlock.java (23 行)
//
// 语义: 「有可被玩家操控的代理单位的方块」（`Router` 是 S4 唯一的实现者，
//   `Router.java:30` 的 `RouterBuild implements ControlBlock`）。
//
// ⚠️ TS 表达方式（相对于 Java 的关键差异，必须知道）:
//   Java 是**接口 + default 方法**（`isControlled()` / `canControl()` / `shouldAutoTarget()`
//   都有默认实现）。TS 的 `interface` **不能带实现**，而 `RouterBuild` 已经 `extends Building`
//   （单继承被占用），无法再继承一个「带默认实现的抽象类」。
//   处置: 这里只保留**签名**（`interface`），三个 default 方法的默认体由实现者
//   `RouterBuild` 逐条提供（`Router.java` 本来就覆写了 `canControl` / `shouldAutoTarget`，
//   只有 `isControlled()` 是纯默认值 → 在 `Router.ts` 里照抄 Java 的 `unit().isPlayer()`）。
//
// ⚠️ `unit()` 的返回类型: Java 是 `Unit`（**非空** —— 惰性创建代理单位后缓存）。
//   S4 的 `Unit` 最小集**没有** `isPlayer()`（见 `gen/Unit.ts`；Java 的 `isPlayer()` 来自
//   `PlayerComp` 的 `instanceof Player` 判定），因此 `RouterBuild.isControlled()` 用显式窄化读它。
//   `RouterBuild.unit()` 在 S4 会**抛错**（`UnitTypes.block` 未移植），而不是静默返回 null ——
//   这样任何调用点都会立刻暴露，不会被 `if(unit != null)` 之类的守卫悄悄掩盖。
//   注意 `Router.getTileTarget` 的守卫读的是**字段** `unit`（Java `unit != null`），
//   字段在 S4 恒为 null → 该分支不可达 → `unit()` 在正常 tick 路径上**不会**被调用。

import type { Unit } from "../../gen/Unit.js";

/** 对应 `mindustry.world.blocks.ControlBlock`。 */
export interface ControlBlock{
  /** @return 该方块的代理单位（惰性创建）。S4 会抛错，见文件头。 */
  unit(): Unit;

  /** @return 该方块是否正被玩家操控。Java 默认实现: `unit().isPlayer()`。 */
  isControlled(): boolean;

  /** @return 该方块是否**能够**被操控。Java 默认实现: `true`。 */
  canControl(): boolean;

  /** @return 是否应自动选取目标（移动端）。Java 默认实现: `true`。 */
  shouldAutoTarget(): boolean;
}
