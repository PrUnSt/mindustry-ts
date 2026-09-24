// 源: core/src/mindustry/graphics/Layer.java
//
// 计划 §11: 渲染层不移植，但 `Prop.layer` 的字段默认值是 `Layer.blockProp`（`Prop.java:14`），
// 这是一个真实的数值（Java 里是 `float` 静态字段），所以需要一个带正确数值的常量对象。
// headless 下没人读它（S3 无绘制路径），但保留数值能让后续渲染阶段直接对齐。

/** 对应 `mindustry.graphics.Layer`（S3 只保留被字段默认值引用到的成员）。 */
export class Layer{
  /** `Layer.java:39`。 */
  static readonly blockProp = 32;
}
