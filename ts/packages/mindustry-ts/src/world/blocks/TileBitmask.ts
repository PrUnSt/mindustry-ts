// 源: core/src/mindustry/world/blocks/TileBitmask.java (45 行)
//
// 移植范围: `values` 静态表（**256 项** = 8 位掩码的完整索引空间）—— 它是 `Wall` / `Floor`
//   自动拼接的 **bitmask → 图集变体索引** 映射（取到的值域恰好是 `0..46`，共 47 个变体；
//   `load(String)` 里的 `new TextureRegion[47]` 就是按这个数量分配的）。
//   S4 的 `autotiler.test.ts` / `wall-autotile.test.ts` 直接查它来算期望值
//   （测试里的期望值写死成从本表推出的具体数字，而不是调用被测代码自己算）。
//
// ⚠️ 注意区分两套机制（计划 §7 把它们写在一起）:
//   - 本表服务的是 **8 邻域**位掩码（`WallBuild.updateAutotileBits` 的 `autotileBits`）；
//   - **传送带**的 `blendbits` / `blending` 走 `Autotilers.buildBlending`（4 方向 + 连接类型），
//     **不**查本表。
//
// 未移植（渲染 / 图集，计划 §9）:
//   - `load(String)` / `loadVariants(String, int)` —— 它们只做 `Core.atlas.find(name + "-" + i)`
//     并把结果包成 `TextureRegion[]`。headless 下 `Core.atlas` 是 `null`
//     （`arc-ts/src/Core.ts:84`），且 `content.load()` 从不被调用（计划 §9）。
//     `Wall.load()` 里的 `autotileRegions = TileBitmask.load(name)` 已经在
//     `defense/Wall.ts` 里原位标注为「未移植」。
//
// ⚠️ `values` 的正确性锚点: 该表的语义是「8 邻域连通位掩码（bit0=+x, bit1=+x+y,
//   bit2=+y, …，与 `Geometry.d8` 同序）→ 47 个变体贴图之一的索引」。S4 只做**数据搬运**，
//   不重新推导它；`autotiler.test.ts` 断言「长度 256」「值域恰为 0..46」与若干抽样值，
//   `wall-autotile.test.ts` 断言「按 `Geometry.d8` 手动推出的 bitmask」对应的变体索引。

/** 对应 `mindustry.world.blocks.TileBitmask`。 */
export class TileBitmask{
  /** 8 向自动拼接的 bitmask → 变体索引（`int[256]`）。对应 Java `public static final int[] values`。 */
  static readonly values: readonly number[] = [
    39, 36, 39, 36, 27, 16, 27, 24, 39, 36, 39, 36, 27, 16, 27, 24,
    38, 37, 38, 37, 17, 41, 17, 43, 38, 37, 38, 37, 26, 21, 26, 25,
    39, 36, 39, 36, 27, 16, 27, 24, 39, 36, 39, 36, 27, 16, 27, 24,
    38, 37, 38, 37, 17, 41, 17, 43, 38, 37, 38, 37, 26, 21, 26, 25,
    3, 4, 3, 4, 15, 40, 15, 20, 3, 4, 3, 4, 15, 40, 15, 20,
    5, 28, 5, 28, 29, 10, 29, 23, 5, 28, 5, 28, 31, 11, 31, 32,
    3, 4, 3, 4, 15, 40, 15, 20, 3, 4, 3, 4, 15, 40, 15, 20,
    2, 30, 2, 30, 9, 46, 9, 22, 2, 30, 2, 30, 14, 44, 14, 6,
    39, 36, 39, 36, 27, 16, 27, 24, 39, 36, 39, 36, 27, 16, 27, 24,
    38, 37, 38, 37, 17, 41, 17, 43, 38, 37, 38, 37, 26, 21, 26, 25,
    39, 36, 39, 36, 27, 16, 27, 24, 39, 36, 39, 36, 27, 16, 27, 24,
    38, 37, 38, 37, 17, 41, 17, 43, 38, 37, 38, 37, 26, 21, 26, 25,
    3, 0, 3, 0, 15, 42, 15, 12, 3, 0, 3, 0, 15, 42, 15, 12,
    5, 8, 5, 8, 29, 35, 29, 33, 5, 8, 5, 8, 31, 34, 31, 7,
    3, 0, 3, 0, 15, 42, 15, 12, 3, 0, 3, 0, 15, 42, 15, 12,
    2, 1, 2, 1, 9, 45, 9, 19, 2, 1, 2, 1, 14, 18, 14, 13
  ];

  // Java `load(String)` / `loadVariants(String, int)` —— 图集相关的渲染路径，见文件头。
}
