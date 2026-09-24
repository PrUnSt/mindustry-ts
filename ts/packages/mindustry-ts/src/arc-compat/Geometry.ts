// 源: arc-core/src/arc/math/geom/Geometry.java（上游 Anuken/Arc）
//
// 为什么放在 mindustry-ts 里: 见 `arc-compat/Color.ts` 顶部说明。`Tile.changed()` 用
// `Geometry.d4`（`Tile.java:678`）遍历邻居做邻接更新；S4 的传送带 `front()`、
// `Autotiler.nearbyBuild(rotation)` 与 `Wall` 的 8 邻域自动拼接同样依赖这两张表。
//
// ⚠️ S4 勘误修正（**重要**：S3 的两张表顺序是错的）
//   S3 版本按「上 → 右上 → 右 → …」的直觉写了 d4/d8；当时的文件头已明确标注
//   「未经源码比对，迁移到 S4（传送带转向）之前必须比对上游 arc 源码」。
//   S4 已比对上游 `arc-core/src/arc/math/geom/Geometry.java`，正确值是：
//     d4  = {(1,0), (0,1), (-1,0), (0,-1)}                      —— 0=+x 1=+y 2=-x 3=-y
//     d8  = {(1,0),(1,1),(0,1),(-1,1),(-1,0),(-1,-1),(0,-1),(1,-1)}
//     d4x = {1, 0, -1, 0};   d4y = {0, 1, 0, -1}
//   它与 `Tile.nearby(int rotation)`（0→(x+1,y)、1→(x,y+1)、2→(x-1,y)、3→(x,y-1)，
//   `Tile.java:556-564`）**同序**，这是传送带 `front()` 与自动拼接能对上的前提。
//
//   为什么 S3 的错序没让任何断言变红: S3 仅有的两处消费点（`Tile.changed()`、
//   `World.addDarkness()`）都只是**遍历全部** 4 / 8 个邻域，集合相同 ⇒ 结果相同
//   （顺序不影响 `min` / 布尔聚合）。S4 的消费点按**下标**取方向，错序会让传送带
//   朝错误方向输出，因此必须修正。
//
// TODO: arc-ts 补上 `math/geom/Geometry` 后删除本文件。

import { Angles, Mathf, Point2, Vec2 } from "@mindustry-ts/arc";

/** 对应 `arc.math.geom.Geometry` 的静态查表（S4 只需 `d4` / `d8` 家族）。 */
export class Geometry{
  /** 4 邻域基向量；`d4[i]` ≡ `(d4x[i], d4y[i])`。对应 Java `Geometry.d4`。 */
  static readonly d4: Point2[] = [
    new Point2(1, 0),
    new Point2(0, 1),
    new Point2(-1, 0),
    new Point2(0, -1)
  ];

  /** 对应 Java `Geometry.d8`。 */
  static readonly d8: Point2[] = [
    new Point2(1, 0),
    new Point2(1, 1),
    new Point2(0, 1),
    new Point2(-1, 1),
    new Point2(-1, 0),
    new Point2(-1, -1),
    new Point2(0, -1),
    new Point2(1, -1)
  ];

  /** 对应 Java `Geometry.d4x`（分量表，省掉每次取 `.x`）。 */
  static readonly d4x: number[] = [1, 0, -1, 0];
  /** 对应 Java `Geometry.d4y`。 */
  static readonly d4y: number[] = [0, 1, 0, -1];

  /**
   * 对应 Java `Geometry.d4x(int i)`（`d4x[Mathf.mod(i, 4)]`）。
   * ⚠️ 陷阱 #16 同型改名: TS 不允许「字段 `d4x` 与方法 `d4x`」同名，故访问器加 `At` 后缀。
   */
  static d4xAt(i: number): number{
    return Geometry.d4x[Mathf.mod(i, 4)]!;
  }

  /** 对应 Java `Geometry.d4y(int i)`。⚠️ 改名原因同 `d4xAt`。 */
  static d4yAt(i: number): number{
    return Geometry.d4y[Mathf.mod(i, 4)]!;
  }

  /** 对应 Java `Geometry.d4(int i)`。⚠️ 改名原因同 `d4xAt`。 */
  static d4At(i: number): Point2{
    return Geometry.d4[Mathf.mod(i, 4)]!;
  }

  /** 对应 Java `Geometry.d8(int i)`。⚠️ 改名原因同 `d4xAt`。 */
  static d8At(i: number): Point2{
    return Geometry.d8[Mathf.mod(i, 8)]!;
  }

  /**
   * 对应 Java `Geometry.pixelCircle(float tindex)`：以「实心像素圆」的**边界格**构成一条
   * 顺时针闭合折线（返回的 `Vec2` 已按 `size/2` 居中）。
   * ⚠️ 逐字移植（含 `size == 3` 的按角度特判排序、以及整数除法的**向零截断**语义）。
   */
  static pixelCircle(tindex: number): Vec2[];
  /** 对应 Java `Geometry.pixelCircle(float index, SolidChecker checker)`。 */
  static pixelCircle(index: number, checker: SolidChecker): Vec2[];
  static pixelCircle(index: number, checker?: SolidChecker): Vec2[]{
    const solid: SolidChecker =
      checker ?? ((i, x, y) => Mathf.dst(x, y, i, i) < i - 0.5);

    const size = Math.trunc(index * 2);
    let ints: number[] = [];

    // 收集边界格（左下角判定：4 个角不全实心、但至少 1 个实心）
    for(let x = -1; x < size + 1; x++){
      for(let y = -1; y < size + 1; y++){
        const a = solid(index, x, y);
        const b = solid(index, x - 1, y);
        const c = solid(index, x, y - 1);
        const d = solid(index, x - 1, y - 1);
        if((a || b || c || d) && !(a && b && c && d)){
          ints.push(x + y * (size + 1));
        }
      }
    }

    const path: Vec2[] = [];

    // size == 3 需要按角度特判排序（否则闭合顺序会冲突）
    if(size === 3){
      ints = ints
        .slice()
        .sort(
          (i1, i2) =>
            Angles.angle(i1 % (size + 1), Math.trunc(i1 / (size + 1)), index, index) -
            Angles.angle(i2 % (size + 1), Math.trunc(i2 / (size + 1)), index, index)
        );
    }

    let cindex = 0;
    while(ints.length > 0){
      const x = ints[cindex]! % (size + 1);
      const y = Math.trunc(ints[cindex]! / (size + 1));
      path.push(new Vec2(x - size / 2, y - size / 2));
      ints.splice(cindex, 1);

      // 找相邻的边界格
      for(let i = 0; i < ints.length; i++){
        const x2 = ints[i]! % (size + 1);
        const y2 = Math.trunc(ints[i]! / (size + 1));
        if(Math.abs(x2 - x) <= 1 && Math.abs(y2 - y) <= 1 && !(Math.abs(x2 - x) === 1 && Math.abs(y2 - y) === 1)){
          cindex = i;
          break;
        }
      }
    }

    return path;
  }
}

/** 对应 Java `Geometry.SolidChecker`（函数式接口 → 函数类型）。 */
export type SolidChecker = (index: number, x: number, y: number) => boolean;
