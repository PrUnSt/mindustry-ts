// 源: arc-core/src/arc/math/geom/Geometry.java
//
// 为什么放在 mindustry-ts 里: 见 `arc-compat/Color.ts` 顶部说明。`Tile.changed()` 用
// `Geometry.d4`（`Tile.java:678`）遍历邻居做邻接更新。
// S3 只移植这两个 8 邻域/4 邻域查表；`pixelCircle` 等在 S3 用不到。
//
// ⚠️ 已知风险（见交付说明）: 本机**没有 arc 的 Java 源码**，`d8` 的起始点与绕向是按 arc 的
// 惯例（从正上方开始顺时针）写的，未经源码比对。当前 S3 里 `d4` 的消费方是
// `BuildingComp.onProximityUpdate()`（空实现），所以不影响任何验收断言；
// 迁移到 S4（传送带转向）之前必须比对上游 arc 源码。
//
// TODO: arc-ts 补上 `math/geom/Geometry` 后删除本文件。

import { Point2 } from "@mindustry-ts/arc";

/** 对应 `arc.math.geom.Geometry` 的静态查表。 */
export class Geometry{
  /** 8 邻域（上 → 右上 → 右 → 右下 → 下 → 左下 → 左 → 左上）。 */
  static readonly d8: Point2[] = [
    new Point2(0, -1),
    new Point2(1, -1),
    new Point2(1, 0),
    new Point2(1, 1),
    new Point2(0, 1),
    new Point2(-1, 1),
    new Point2(-1, 0),
    new Point2(-1, -1)
  ];

  /** 4 邻域，对齐 Java `static{ d4 = {d8[0], d8[2], d8[4], d8[6]} }`。 */
  static readonly d4: Point2[] = [Geometry.d8[0]!, Geometry.d8[2]!, Geometry.d8[4]!, Geometry.d8[6]!];
}
