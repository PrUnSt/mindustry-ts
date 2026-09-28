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
  breakProp: new Effect(nextId++),

  // ---- S1 · 子弹子系统追加（只增不改）。`BulletType` / `Bullets` 的字段默认值需要这些身份 ----

  /** `BulletType.hitEffect` / `despawnEffect` 默认值（`BulletType.java:75,77`）。 */
  hitBulletSmall: new Effect(nextId++),
  /** `duo` 各弹药的 `hitEffect = despawnEffect`（`Blocks.java:3285` 等）。 */
  hitBulletColor: new Effect(nextId++),
  /** `BulletType.shootEffect` 默认值（`BulletType.java:79`）。 */
  shootSmall: new Effect(nextId++),
  /** `BulletType.smokeEffect` 默认值（`BulletType.java:85`）。 */
  shootSmallSmoke: new Effect(nextId++),
  /** `BulletType.healEffect` 默认值（`BulletType.java:253`）。 */
  healBlockFull: new Effect(nextId++),
  /** `BulletType.trailEffect` 默认值（`BulletType.java:284`）。 */
  missileTrail: new Effect(nextId++),
  /** `scatter` 各弹药的 `hitEffect`（`Blocks.java:3361` 等）。 */
  flakExplosion: new Effect(nextId++),
  /** `Bullets.damageLightning.hitEffect`（`Bullets.java:28`）。 */
  hitLancer: new Effect(nextId++),

  // ---- S2 · 单位子系统追加（只增不改）。`UnitType` / `Weapon` / `UnitTypes` 的字段默认值需要这些身份 ----

  /** `UnitType.fallEffect` / `fallEngineEffect` 默认值（`UnitType.java:329,331`）。 */
  fallSmoke: new Effect(nextId++),
  /** `UnitTypes.dagger` 的武器 `ejectEffect`（`UnitTypes.java:112`）。 */
  casing1: new Effect(nextId++),
  /** `UnitTypes.mace` 的武器子弹 `shootEffect`（`UnitTypes.java:143`）。 */
  shootSmallFlame: new Effect(nextId++),
  /** `UnitTypes.mace` 的武器子弹 `hitEffect`（`UnitTypes.java:144`）。 */
  hitFlameSmall: new Effect(nextId++)
} as const;
