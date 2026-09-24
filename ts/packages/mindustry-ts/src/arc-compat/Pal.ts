// 源: core/src/mindustry/graphics/Pal.java
//
// 为什么放在 mindustry-ts 里: 见 `arc-compat/Color.ts` 顶部说明。`Team.sharded` 读
// `Pal.accent`（`Team.java:34`），`Wall.lightningColor` 默认读 `Pal.surge`（`Wall.java:23`）。
//
// TODO: 随 graphics 模块一起迁移到正式位置。

import { Color } from "./Color.js";

/** 对应 `mindustry.graphics.Pal`（S3 只取 tick 闭环需要的少数常量）。 */
export class Pal{
  /** `Pal.java:101` 的主强调色。 */
  static readonly accent = Color.valueOf("ffd37f");
  /** `Pal.java:102` 的 surge（`Wall.lightningColor` 默认值）。 */
  static readonly surge = Color.valueOf("f3e979");
}
