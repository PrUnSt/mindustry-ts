// 源: core/src/mindustry/world/meta/Env.java
//
// 注意 Java `Env.any = 0xffffffff` 在 Java 里就是 int 的 -1（全 1 位掩码）。TS 里
// `0xffffffff` 是 4294967295，参与 `&` 会被截成 -1 但可读性差，所以这里直接写 -1 并注明。

/** 不同地点的环境标志位。对应 `mindustry.world.meta.Env`。 */
export class Env{
  /** 位于行星表面。 */
  static readonly terrestrial = 1;
  /** 位于太空，无大气。 */
  static readonly space = 1 << 1;
  /** 位于水下。 */
  static readonly underwater = 1 << 2;
  /** 有孢子。 */
  static readonly spores = 1 << 3;
  /** 有灼烧环境效果。 */
  static readonly scorching = 1 << 4;
  /** 有油田。 */
  static readonly groundOil = 1 << 5;
  /** 有水库。 */
  static readonly groundWater = 1 << 6;
  /** 大气含氧。 */
  static readonly oxygen = 1 << 7;
  /** 全部属性（Java `0xffffffff`，即 int 的 -1）。 */
  static readonly any = -1;
  /** 无属性。 */
  static readonly none = 0;
}
