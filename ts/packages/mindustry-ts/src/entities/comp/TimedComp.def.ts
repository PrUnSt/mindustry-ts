import { Component, MethodPriority } from "../../annotations.js";

/**
 * 计时组件：有限生命周期的倒计时。
 *
 * 逐字对照 `core/src/mindustry/entities/comp/TimedComp.java`。
 *
 * codegen 约束（见 `EntityComp.def.ts` 顶部说明）：生成文件只会自动 import
 * 「组件接口名 / `Groups` / 基类名」，因此方法体**不得引用 arc-ts 或 mindustry 的类型**。
 * `update()` 的 Java 原文是
 * ```java
 * time = Math.min(time + Time.delta, lifetime);
 * if(time >= lifetime) remove();
 * ```
 * 引用了 `Time` → 这里**有意留空**，由手写子类实现。`fin()` 是纯计算，原样移植。
 *
 * Java 还 `implements Scaled` —— `Scaled` 不是组件接口（不在 `entities/comp/` 下），
 * 按项目约定不写进 `implements`：生成文件无法 import 它（与 `DrawComp` 省略 `Posc` 以外的接口同理）。
 */
@Component()
export abstract class TimedComp implements Entityc{
  /** 已经过时间，单位 tick（Java `time`）。 */
  time: number = 0;

  /** 总存活时间，单位 tick（Java `lifetime`）。 */
  lifetime: number = 0;

  /**
   * Java `TimedComp.update()`（带 `@MethodPriority(100)`：合并到具象实体时**最后**执行，
   * 保证「到期移除 / 池回收」排在其它组件的 `update()` 之后）。
   *
   * ⚠️ 方法体有意留空：Java 体需要 `Time.delta`，而生成文件无法 import `Time`
   * （codegen 约束）。由手写子类覆写实现。
   */
  @MethodPriority(100)
  update(): void{ }

  /** Java `TimedComp.fin()`：`time / lifetime`（纯计算，原样移植）。 */
  fin(): number{
    return this.time / this.lifetime;
  }
}
