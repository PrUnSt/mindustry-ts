// 源: core/src/mindustry/content/Liquids.java
//
// ⚠️ 有意的窄化（S3）: `load()` 为空。理由：
//   1. S3 的目标是「headless 世界模拟跑 tick」，6 条硬断言与 600 tick 全都不涉及液体；
//   2. 液体系统（`Puddle` / `Puddles` / `LiquidModule` / `ConsumeLiquid`）不在 S3 范围（计划 §9）；
//   3. 空列表不会破坏任何不变量：`ContentType.liquid` 的 `Seq` 合法地为空，
//      而 `Floor.liquidDrop` 的默认值本就是 `null`（`Floor.java:48`）。
// TODO(S4/S5): 移植全部 22 种液体并按 Java 顺序创建（id 顺序不可改）。
//
// 保留类本身是为了让 `Vars.content.liquids()` 与 Java 的 `ContentLoader.liquids()` 同形，
// 同时让 `createBaseContent()` 的调用顺序与 Java 逐行一致。

import type { Liquid } from "../type/Liquid.js";

/** 对应 `mindustry.content.Liquids`。 */
export class Liquids{
  /** 该数组与 Java 的 `Liquids.water` 等字段一一对应；S3 为空。 */
  static readonly all: readonly Liquid[] = [];

  /** 对应 Java `Liquids.load()`。S3 为空实现（见文件头说明）。 */
  static load(): void{
    // 有意为空：见文件头「有意的窄化」。
  }
}
