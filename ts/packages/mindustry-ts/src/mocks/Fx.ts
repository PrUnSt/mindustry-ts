// 源: core/src/mindustry/content/Fx.java (2380 行，由注解处理器生成底层)
//
// 为什么是「带身份的真实对象」（计划 §11）: `Floor.init()` 做 `walkEffect == Fx.none` 判断
// （`Floor.java:205`），`Floor.init()` 用 `Fx.bubble`、`Floor` 字段默认 `Fx.none`。
// headless 不渲染（计划 §9），所以只保留对象身份。
//
// TODO: 渲染阶段整体迁移 Fx。

/** 对应 `mindustry.entities.Effect`。S3 只保留身份。 */
export class Effect{
  readonly id: number;

  constructor(id: number){
    this.id = id;
  }

  toString(): string{
    return "Effect#" + this.id;
  }
}

let nextId = 0;

/** 对应 `mindustry.content.Fx`（S3 子集）。 */
export const Fx = {
  /** Java `Fx.none`: 「无特效」哨兵。 */
  none: new Effect(nextId++),
  rotateBlock: new Effect(nextId++),
  ripple: new Effect(nextId++),
  bubble: new Effect(nextId++),
  spawn: new Effect(nextId++),
  /** `Block.placeEffect` 默认值（`Block.java:364`）。 */
  placeBlock: new Effect(nextId++),
  /** `Block.breakEffect` 默认值（`Block.java:366`）。 */
  breakBlock: new Effect(nextId++),
  /** `Block.destroyEffect` 默认值（`Block.java:368`）。 */
  dynamicExplosion: new Effect(nextId++),
  /** `Prop` 构造器：`breakEffect = Fx.breakProp`（`Prop.java:16`）。 */
  breakProp: new Effect(nextId++)
} as const;
