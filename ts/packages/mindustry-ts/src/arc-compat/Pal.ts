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

  // ---- S1 · 子弹子系统追加（只增不改）。`BulletType.java` 的字段默认值需要这 4 个色值 ----

  /** `Pal.java:77`。`BulletType.healColor` 默认值（`BulletType.java:251`）。 */
  static readonly heal = Color.valueOf("98ffa9");
  /** `Pal.java:39`。`BulletType.trailColor` 默认值（`BulletType.java:276`）。 */
  static readonly missileYellowBack = Color.valueOf("e58956");
  /** `Pal.java:17`。`BulletType.suppressColor` 默认值（`BulletType.java:336`）。 */
  static readonly sapBullet = Color.valueOf("bf92f9");
  /** `Pal.java:94`。`BulletType.lightColor` 默认值（`BulletType.java:383`）。 */
  static readonly powerLight = Color.valueOf("fbd367");

  // ---- S2 · 单位子系统追加（只增不改）----

  /** `Pal.java:52`。`Weapon.heatColor` 默认值（`Weapon.java:155`）。 */
  static readonly turretHeat = Color.valueOf("ab3400");
  /** `Pal.java:35`。`UnitType.outlineColor` 默认值（`UnitType.java:373`）。 */
  static readonly darkerMetal = Color.valueOf("565666");
}
