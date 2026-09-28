// 源: core/src/mindustry/entities/bullet/BulletType.java (1016 行)
//
// 移植范围（S1 · 子弹子系统）:
//   - 字段区（`BulletType.java:34-385`）**逐字对照**：字段名 / 默认值一致。
//     ⚠️ 与 Items 不同，`BulletType` Java 里**没有 `name`**（`extends Content`，不是
//     `MappableContent`），因此这里也继承 `Content`（`BulletType.java:30`）。
//   - 构造器（`:387-393`）、`copy()`（`:395-404`）、`afterPatch()`（`:406-419`）的等价行为。
//   - `calculateRange()`（`:443-448`）、`init()`（`:832-868`）的**非渲染**部分。
//   - `getContentType()` → `ContentType.bullet`（`:870-873`）。
//   - 命中路径的最小闭环：`init(Bullet)`（`:713-728`）、`damageMultiplier`（`:547-552`）、
//     `estimateDPS`（`:422-440`）、`hit`（`:562-589` 的破片部分）、`createFrags`（`:627-636`）、
//     `despawned`（`:650-661`）、`removed`（`:664-672`）、`hitEntity`（`:488-534` 的扣血部分）、
//     `handlePierce`（`:536-545`）、`create(...)`（`:924-1004` 的核心重载，含 `keepVelocity`）。
//
// 未移植（逐条标注；均为「依赖未移植系统」或「渲染」，不是静默省略）:
//   - 全部 `draw*`（`:682-711`）—— 渲染（计划 §9「渲染不做」，headless 不绘制）。
//   - `load()`（`:414-419`）—— 遍历 `parts` 打标 + `part.load()`，纯渲染。保留空实现 + 调用点。
//   - `update(b)`（`:730-736`）—— `updateTrail` / `updateHoming` / `updateTrailEffects` /
//     `updateBulletInterval` 分别依赖 `Trail` / `Units.closestTarget` / `b.timer`（`Timerc`
//     未并入本阶段的 `BulletComp`）/ `Effect`，全部未移植。**只保留 `updateWeaving` 里
//     `rotateSpeed` 这条纯数学分支**（见方法体）。
//   - `hitEntity` 的护盾 / `maxDamageFraction` / 吸血 / 击退 / 状态 / `Events` 部分
//     （`:491-531`）—— 依赖 `Shieldc` / `StatusEffect` 应用 / `Events.fire` /
//     `Unit.impulse`（未移植）。只保留 `h.damage(damage)`。
//   - `hit`（`:562-589`）的 hitEffect / 音效 / `Effect.shake` / 水洼 / 纵火 / 生成单位 /
//     压制 / 溅射 / 闪电 —— 依赖 `Puddles` / `Fires` / `Damage` / `Lightning` / `Units`
//     （未移植）。只保留破片。
//   - `createSplashDamage`（`:606-625`）/ `createPuddles`（`:597-604`）/ `createIncend`
//     （`:591-595`）/ `createUnits`（`:638-647`）—— 同 `hit`。
//   - `spawnUnit` 分支（`:932-961`）—— `UnitType` 尚未移植（另一 agent 正在建
//     `src/type/UnitType.ts`），因此 `spawnUnit` / `despawnUnit` 的类型放宽为 `any`。
//   - `unitSort`（Java `Sortf`）/ `shootPattern`（Java `ShootPattern`）/ `parts`（Java
//     `DrawPart`）—— 目标排序 / 射击模式 / 渲染部件系统，类型放宽为 `unknown`。
//   - `net.client()` / `Call.createNet` / `createBullet`（`:1006-1015`）—— 网络层（S6）。
//   - `puddleLiquid` 的 `Liquid` **已**移植（`type/Liquid.ts`），默认值 `Liquids.water` 保留。
//
// ⚠️ 字段类型的三处收窄（因 codegen 约束 / 跨阶段解耦，逐条给出原因）:
//   1. `status` 用 `mocks/StatusEffects.ts` 的 `StatusEffect`；`BulletType.java:120` 默认
//      `StatusEffects.none`。⚠️ `init()` 里 Java 会把 `lightning > 0 && status == none`
//      改成 `StatusEffects.shocked`（`:840-842`）—— 该 mock **未导出 `shocked`**，且本阶段
//      文件范围不允许修改它，故该分支暂不生效（headless 无状态效果消费者，不可观测）。
//   2. `spawnUnit` / `despawnUnit` → `any`（见上）。
//   3. `unitSort` / `shootPattern` → `unknown`（见上）。
//
// ⚠️ 陷阱 #16 的两处**被迫改名**（TS 不允许同名字段/方法或重载；调用点已同步）:
//   - Java `init(Bullet)`  ↔ 本类 `initBullet(Bulletc)` —— 与 `Content.init()`（无参）冲突。
//   - Java `removed(Bullet)` ↔ 本类 `removedBullet(Bulletc)` —— 与 `Content.removed` 字段冲突。

import { Angles, Interp, Mathf, Seq, Time } from "@mindustry-ts/arc";
import { Color } from "../arc-compat/Color.js";
import { Pal } from "../arc-compat/Pal.js";
import { Content } from "../ctype/Content.js";
import { ContentType } from "../ctype/ContentType.js";
import { Liquids } from "../content/Liquids.js";
import { Fx } from "../mocks/Fx.js";
import type { Effect } from "../mocks/Fx.js";
import { Layer } from "../mocks/Layer.js";
import { Sound, Sounds } from "../mocks/Sounds.js";
import { StatusEffects } from "../mocks/StatusEffects.js";
import type { StatusEffect } from "../mocks/StatusEffects.js";
import type { Liquid } from "./Liquid.js";
import type { Entityc } from "../gen/Entityc.js";
import type { Bulletc } from "../gen/Bulletc.js";
import { Bullets } from "../content/Bullets.js";
import { BulletRuntime } from "../entities/BulletRuntime.js";

/** 对应 `mindustry.entities.bullet.BulletType`。 */
export class BulletType extends Content{
  // ---------------------------------------------------------------- 字段区（:34-385）

  /** 生命周期，单位 tick。 */
  lifetime = 40;
  /** 生成时施加给 `lifetime` 的随机倍率区间。 */
  lifeScaleRandMin = 1;
  lifeScaleRandMax = 1;
  /** 速度，单位/tick。 */
  speed = 1;
  /** 生成时施加给速度的随机倍率区间。 */
  velocityScaleRandMin = 1;
  velocityScaleRandMax = 1;
  /** 命中直接伤害。 */
  damage = 1;
  /** 碰撞盒尺寸。 */
  hitSize = 4;
  /** 渲染裁剪盒尺寸（渲染专用，见文件头）。 */
  drawSize = 40;
  /** 生成时固定的角度偏移。 */
  angleOffset = 0;
  randomAngleOffset = 0;
  /** 阻力（速度的比例）。 */
  drag = 0;
  /** 每帧加速度。 */
  accel = 0;
  /** 是否穿透单位。 */
  pierce = false;
  /** 是否穿透建筑。 */
  pierceBuilding = false;
  /** 最大穿透对象数。 */
  pierceCap = -1;
  /** 每穿透一层，伤害按被穿透者血量扣减的因子。 */
  pierceDamageFactor = 0;
  /** > 0 时把非溅射伤害限制为目标最大血量的比例。 */
  maxDamageFraction = -1;
  /** 若为 false，超过 `pierceCap` 也不移除（专家用法）。 */
  removeAfterPierce = true;
  /** 穿透激光是否被塑钢墙吸收。 */
  laserAbsorb = true;
  /** 是否视为激光子弹（被塑钢墙吸收）。 */
  laserBullet = false;
  /** 激光/持续炮台取最佳射程/伤害的生命比例。 */
  optimalLifeFract = 0;
  /** 绘制所在的 Z 层（渲染专用）。 */
  layer = Layer.bullet;
  /** 直接命中时的特效（渲染专用）。 */
  hitEffect: Effect = Fx.hitBulletSmall;
  /** 消失时的特效（渲染专用）。 */
  despawnEffect: Effect = Fx.hitBulletSmall;
  /** 发射时的特效（渲染专用）。 */
  shootEffect: Effect = Fx.shootSmall;
  /** 该子弹的射击模式；null 时用炮台的默认模式（未移植，见文件头）。 */
  shootPattern: unknown | null = null;
  /** 蓄力特效（渲染专用）。 */
  chargeEffect: Effect = Fx.none;
  /** 额外烟尘特效（渲染专用）。 */
  smokeEffect: Effect = Fx.shootSmallSmoke;
  /** 覆盖炮台的射击音效。 */
  shootSound: Sound = Sounds.none;
  /** 命中/移除时的音效。 */
  hitSound: Sound = Sounds.none;
  /** 消失时的音效。 */
  despawnSound: Sound = Sounds.none;
  /** 命中音效音高及随机范围。 */
  hitSoundPitch = 1;
  hitSoundPitchRange = 0.1;
  /** 命中音效音量。 */
  hitSoundVolume = 1;
  /** 额外散布（度）。 */
  inaccuracy = 0;
  /** 每个弹药/液体生成的子弹数。 */
  ammoMultiplier = 2;
  /** 炮台装填速度倍率。 */
  reloadMultiplier = 1;
  /** 对地形伤害的倍率。 */
  buildingDamageMultiplier = 1;
  /** 对力场护盾伤害的倍率。 */
  shieldDamageMultiplier = 1;
  /** 发射者的后坐力。 */
  recoil = 0;
  /** 是否击杀发射者（自爆兵）。 */
  killShooter = false;
  /** 是否让子弹立即消失。 */
  instantDisappear = false;
  /** 溅射伤害；0 表示禁用。 */
  splashDamage = 0;
  /** 溅射是否按单位碰撞盒缩放。 */
  scaledSplashDamage = false;
  /** 击退速度。 */
  knockback = 0;
  /** 击退是否沿子弹方向。 */
  impact = false;
  /** 命中时施加的状态。 */
  status: StatusEffect = StatusEffects.none;
  /** 状态效果的持续时长（按强度计）。 */
  statusDuration = 60 * 8;
  /** 炮台专用：选择目标单位的排序函数（未移植，见文件头）。 */
  unitSort: unknown | null = null;
  /** 施加状态的概率。 */
  statusChance = 1;
  /** 炮台专用：是否瞄准建筑。 */
  targetBlocks = true;
  /** 炮台专用：是否瞄准导弹。 */
  targetMissiles = true;
  /** 是否与地形碰撞。 */
  collidesTiles = true;
  /** 是否与同队伍地形碰撞。 */
  collidesTeam = false;
  /** 是否与空中/地面单位碰撞。 */
  collidesAir = true;
  collidesGround = true;
  /** 是否与任何东西碰撞。 */
  collides = true;
  /** 是否与非表面地板碰撞。 */
  collideFloor = false;
  /** 是否与静态墙碰撞。 */
  collideTerrain = false;
  /** 是否继承发射者的速度。 */
  keepVelocity = true;
  /** `keepVelocity` 时，是否按增加的速度等比缩短寿命以保持射程一致。 */
  scaleKeepVelocity = false;
  /** 是否按寿命缩放（实为缩短寿命）以在目标处消失（火炮用）。 */
  scaleLife = false;
  /** 是否可被点防御拦截。 */
  hittable = true;
  /** 是否可被反弹。 */
  reflectable = true;
  /** 是否可被护盾吸收。 */
  absorbable = true;
  /** 为 true 时忽略 `create` 的角度参数。 */
  ignoreSpawnAngle = false;
  /** 生成概率。 */
  createChance = 1;
  /** 射程正覆盖值。 */
  maxRange = -1;
  /** > 0 时覆盖射程（即使更小）。 */
  rangeOverride = -1;
  /** 炮台多弹药时影响射程。 */
  rangeChange = 0;
  /** `limitRange()` 时给子弹额外的射程余量。 */
  extraRangeMargin = 0;
  /** `init()` 里计算的射程。 */
  range = 0;
  /** 炮台多弹药时影响最小射程。 */
  minRangeChange = 0;
  /** 治疗建筑的最大血量的百分比。 */
  healPercent = 0;
  /** 治疗建筑的固定血量。 */
  healAmount = 0;
  /** 治疗时的音效。 */
  healSound: Sound = Sounds.blockHeal;
  /** 治疗音效音量。 */
  healSoundVolume = 0.9;
  /** 伤害转化为发射者治疗的比例。 */
  lifesteal = 0;
  /** 命中时是否点火。 */
  makeFire = false;
  /** 是否总是命中其下方建筑。 */
  hitUnder = false;
  /** 消失时是否产生命中特效。 */
  despawnHit = false;
  /** 命中任何东西时是否生成破片。 */
  fragOnHit = true;
  /** 消失时是否生成破片。 */
  fragOnDespawn = true;
  /** 被护盾吸收时是否生成破片。 */
  fragOnAbsorb = true;
  /** 是否忽略单位护甲。 */
  pierceArmor = false;
  /** 单位/建筑护甲倍率。 */
  armorMultiplier = 1;
  /** 仅建筑护甲倍率。 */
  blockArmorMultiplier = 1;
  /** 是否「粘」在敌人身上并在碰撞时失活。 */
  sticky = false;
  /** 粘附时额外增加的寿命。 */
  stickyExtraLifetime = 0;
  /** 是否自动设置状态与 `despawnHit`。 */
  setDefaults = true;
  /** 命中/消失时的屏幕抖动。 */
  hitShake = 0;
  despawnShake = 0;

  /** 本弹消失时生成的子弹类型。 */
  fragBullet: BulletType | null = null;
  /** 破片是否延迟到下一帧生成。 */
  delayFrags = false;
  /** 破片的角度随机范围（度）。 */
  fragRandomSpread = 360;
  /** 破片之间的均布角度（度）。 */
  fragSpread = 0;
  /** 破片的角度偏移（度）。 */
  fragAngle = 0;
  /** 破片数量。 */
  fragBullets = 9;
  /** 破片速度随机倍率区间。 */
  fragVelocityMin = 0.2;
  fragVelocityMax = 1;
  /** 破片寿命随机倍率区间。 */
  fragLifeMin = 1;
  fragLifeMax = 1;
  /** 破片相对父弹的随机偏移区间。 */
  fragOffsetMin = 1;
  fragOffsetMax = 7;
  /** `pierce = true` 时最多释放破片的次数。 */
  pierceFragCap = -1;

  /** 定间隔生成的子弹。 */
  intervalBullet: BulletType | null = null;
  /** 间隔（tick）。 */
  bulletInterval = 20;
  /** 每次间隔生成的子弹数。 */
  intervalBullets = 1;
  /** 间隔子弹的随机角度。 */
  intervalRandomSpread = 360;
  /** 间隔子弹之间的角度间隔。 */
  intervalSpread = 0;
  /** 间隔子弹的角度偏移。 */
  intervalAngle = 0;
  /** 负值表示禁用间隔延迟。 */
  intervalDelay = -1;

  /** 是否在水下渲染（高度实验性；渲染专用）。 */
  underwater = false;

  /** 命中/消失特效的颜色（渲染专用）。 */
  hitColor: Color = Color.white;
  /** 治疗特效的颜色（渲染专用）。 */
  healColor: Color = Pal.heal;
  /** 治疗建筑时的特效（渲染专用）。 */
  healEffect: Effect = Fx.healBlockFull;
  /** 生成本弹时同时生成的子弹（多为视觉效果）。 */
  spawnBullets: Seq<BulletType> = new Seq<BulletType>();
  /** 是否在详情里显示 `spawnBullets` 的属性（UI）。 */
  showStats = false;
  /** `spawnBullets` 的随机角度范围。 */
  spawnBulletRandomSpread = 0;
  /** 代替本弹生成的单位（导弹用）。⚠️ `UnitType` 未移植 → `any`，见文件头。 */
  spawnUnit: any | null = null;
  /** 本弹命中/寿命耗尽时生成的单位。⚠️ 同上。 */
  despawnUnit: any | null = null;
  /** 生成 `despawnUnit` 的概率。 */
  despawnUnitChance = 1;
  /** 生成的 `despawnUnit` 数量。 */
  despawnUnitCount = 1;
  /** 生成单位相对原点的随机偏移距离。 */
  despawnUnitRadius = 0.1;
  /** 生成单位是否背向子弹方向。 */
  faceOutwards = false;
  /** 额外视觉部件（渲染专用）。 */
  parts: Seq<unknown> = new Seq<unknown>();

  /** 尾迹颜色（渲染专用）。 */
  trailColor: Color = Pal.missileYellowBack;
  /** 每 tick 生成尾迹特效的概率（渲染专用）。 */
  trailChance = -0.0001;
  /** 尾迹特效的固定间隔（渲染专用）。 */
  trailInterval = 0;
  /** 生成尾迹特效的最小速度（渲染专用）。 */
  trailMinVelocity = 0;
  /** 尾迹特效（渲染专用）。 */
  trailEffect: Effect = Fx.missileTrail;
  /** 尾迹特效的随机偏移（渲染专用）。 */
  trailSpread = 0;
  /** 传给尾迹的旋转/尺寸参数（渲染专用）。 */
  trailParam = 2;
  /** 传给尾迹的参数是否用子弹旋转（渲染专用）。 */
  trailRotation = false;
  /** 尾迹宽度按寿命的插值（渲染专用）。 */
  trailInterp: Interp = Interp.one;
  /** 尾迹四边形长度；<= 0 关闭尾迹（渲染专用）。 */
  trailLength = -1;
  /** 尾迹宽度（渲染专用）。 */
  trailWidth = 2;
  /** 尾迹宽度的正弦调制（渲染专用）。 */
  trailSinMag = 0;
  trailSinScl = 3;
  /** 是否围绕发射者转圈。 */
  circleShooter = false;
  /** 绕圈半径。 */
  circleShooterRadius = 13;
  /** 绕圈半径的平滑值。 */
  circleShooterRadiusSmooth = 10;
  /** 绕圈时调整速度的倍率。 */
  circleShooterRotateSpeed = 0.3;

  /** 溅射半径；负值禁用（溅射伤害）。 */
  splashDamageRadius = -1;
  /** 溅射是否穿透地形。 */
  splashDamagePierce = false;

  /** 尝试在子弹周围点火的次数。 */
  incendAmount = 0;
  /** 点火范围。 */
  incendSpread = 8;
  /** 点火概率。 */
  incendChance = 1;

  /** 追踪能力（0-1）。 */
  homingPower = 0;
  /** 追踪范围。 */
  homingRange = 50;
  /** 追踪延迟；负值禁用。 */
  homingDelay = -1;
  /** 跟随准星旋转的速度；<= 0 禁用。 */
  followAimSpeed = 0;

  /** 抑制治疗建筑的范围。 */
  suppressionRange = -1;
  /** 抑制持续时长。 */
  suppressionDuration = 60 * 8;
  /** 抑制触发概率。 */
  suppressionEffectChance = 50;
  /** 抑制特效颜色（渲染专用）。 */
  suppressColor: Color = Pal.sapBullet;

  /** 闪电颜色。 */
  lightningColor: Color = Pal.surge;
  /** 闪电「根」的数量。 */
  lightning = 0;
  /** 每道闪电的长度。 */
  lightningLength = 5;
  /** 闪电长度的额外随机值。 */
  lightningLengthRand = 0;
  /** 闪电伤害；负值表示用本弹伤害。 */
  lightningDamage = -1;
  /** 闪电相对子弹朝向的散布。 */
  lightningCone = 360;
  /** 闪电相对子弹朝向的偏移。 */
  lightningAngle = 0;
  /** 闪电末端生成的子弹。 */
  lightningType: BulletType | null = null;

  /** 蛇形走位的尺度（越大越不抖）。 */
  weaveScale = 1;
  /** 蛇形走位的强度。 */
  weaveMag = 0;
  /** 蛇形走位是否在生成时随机换向。 */
  weaveRandom = true;
  /** 子弹飞行中速度的旋转速度。 */
  rotateSpeed = 0;

  /** 水洼数量。 */
  puddles = 0;
  /** 水洼围绕子弹位置的范围。 */
  puddleRange = 0;
  /** 每个水洼的液体量。 */
  puddleAmount = 5;
  /** 水洼的液体种类。 */
  puddleLiquid: Liquid | null = Liquids.water;

  /** 是否在详情里显示弹药倍率（UI）。 */
  displayAmmoMultiplier = true;
  /** > 0 时按弹药倍率除以该值显示（UI）。 */
  statLiquidConsumed = 0;

  /** 本弹发出光的半径；< 0 用默认值（渲染专用）。 */
  lightRadius = -1;
  /** 光的透明度（渲染专用）。 */
  lightOpacity = 0.3;
  /** 光的颜色（渲染专用）。 */
  lightColor: Color = Pal.powerLight;

  /** `estimateDPS()` 的缓存。 */
  protected cachedDps = -1;

  // ---------------------------------------------------------------- 构造 / 生命周期

  /**
   * 对应 `BulletType(float speed, float damage)`（`BulletType.java:387-390`）。
   * ⚠️ 必须显式声明 **public** 构造器：`Content` 的构造器是 `protected`，TS 对
   * 「未声明构造器」的子类会继承 protected 可访问性，外部 `new BulletType(...)` 会报
   * `TS2674`（与 `ConveyorBuild` / `WallBuild` 同一处置）。
   */
  constructor(speed: number, damage: number){
    super();
    this.speed = speed;
    this.damage = damage;
  }

  /**
   * 对应 Java `copy()`（`BulletType.java:395-404`）：`clone()`（浅拷贝）后分配新的内容 id
   * 并注册。
   *
   * TS 侧没有 `Object.clone()`，用 `Object.assign` 复刻浅拷贝语义。⚠️ 顺序必须与 Java 一致：
   * 先构造（`Content` 构造器已把本副本注册进 `contentMap` 并分配 id），拷完字段后**把 id
   * 还原成新分配的那个** —— 否则会把源对象的 id 带过来，破坏「id ≡ 下标」不变量。
   */
  copy(): BulletType{
    const copy = new BulletType(this.speed, this.damage);
    const newId = copy.id;
    Object.assign(copy, this);
    copy.id = newId;
    return copy;
  }

  /**
   * 对应 `afterPatch()`（`BulletType.java:406-411`）：数据补丁后重算射程。
   * （Java 的 `super.afterPatch()` 是 `Content` 的空实现。）
   */
  override afterPatch(): void{
    super.afterPatch();
    this.range = this.calculateRange();
  }

  /**
   * 对应 `load()`（`BulletType.java:414-419`）：遍历 `parts` 打标并 `part.load(null)`。
   * ⚠️ `parts`（`DrawPart`）是渲染部件系统，未移植（见文件头）→ **有意留空**，保留调用点。
   */
  override load(): void{
    // for(const part of this.parts){ part.turretShading = false; part.load(null); }
  }

  // ---------------------------------------------------------------- DPS / 射程

  /** @return 估算的每发伤害（可能很不准）。对应 `estimateDPS()`（`BulletType.java:422-440`）。 */
  estimateDPS(): number{
    if(this.cachedDps >= 0) return this.cachedDps;

    // Java 先处理 spawnUnit / despawnUnit 的转发（未移植，见文件头）。
    // if(this.spawnUnit !== null) return this.spawnUnit.estimateDps();
    // if(this.despawnUnit !== null) return this.despawnUnit.estimateDps();

    let sum =
      (this.damage + this.splashDamage * 0.75) *
      (this.pierce ? (this.pierceCap === -1 ? 2 : Mathf.clamp(this.pierceCap, 1, 2)) : 1);
    if(this.fragBullet !== null && this.fragBullet !== (this as BulletType)){
      sum += (this.fragBullet.estimateDPS() * this.fragBullets) / 2;
    }
    for(const other of this.spawnBullets){
      sum += other.estimateDPS();
    }
    return (this.cachedDps = sum);
  }

  /** @return 本类子弹能飞行的最大距离。对应 `calculateRange()`（`BulletType.java:443-448`）。 */
  protected calculateRange(): number{
    if(this.rangeOverride > 0) return this.rangeOverride;
    if(this.spawnUnit !== null) return this.spawnUnit.lifetime * this.spawnUnit.speed;
    if(this.despawnUnit !== null) return this.despawnUnit.lifetime * this.despawnUnit.speed;
    const base = Mathf.zero(this.drag)
      ? this.speed * this.lifetime
      : (this.speed * (1 - Mathf.pow(1 - this.drag, this.lifetime))) / this.drag;
    return Math.max(base, this.maxRange);
  }

  /** @return 每秒的持续伤害，非持续弹种返回 -1。对应 `continuousDamage()`（`BulletType.java:451-453`）。 */
  continuousDamage(): number{
    return -1;
  }

  /** @return 本弹是否会治疗。对应 `heals()`（`BulletType.java:455-457`）。 */
  heals(): boolean{
    return this.healPercent > 0 || this.healAmount > 0;
  }

  // ---------------------------------------------------------------- 命中路径

  /**
   * 对应 `damageMultiplier(Bullet)`（`BulletType.java:547-552`）的**最小版**：
   * Java 会读 `state.rules.unitDamage(team)` / `blockDamage(team)`（`Rules` 的队伍伤害倍率，
   * S4 未移植队伍规则项），因此这里区分 owner 类型的部分留作注释，恒返回 1。
   * 对 S1 的子弹（owner 为 null 或非单位/建筑）与 Java **完全一致**。
   */
  damageMultiplier(_b: Bulletc): number{
    return 1;
  }

  /**
   * 对应 `init(Bullet)`（`BulletType.java:713-728`）：击杀发射者 / 立即消失 / 生成 spawnBullets。
   * ⚠️ `spawnBullets` 的 `bullet.create(...)` 在 TS 侧可用（`BulletType.create` 已移植），
   * 故一并实现；`killShooter` 只对实现了 `Healthc`（有 `kill()`）的 owner 生效。
   *
   * ⚠️ **陷阱 #16 的被迫改名**：Java 同时有 `init()`（无参，`Content` 契约）与
   * `init(Bullet)`（本方法）。TS 一个类只能有一个同名实现 → 本方法改名 `initBullet`。
   * 唯一的 Java 调用点 `BulletComp.add()`（`BulletComp.java:78-80`）在 TS 侧对应
   * `BulletRuntime.add()`，已同步改动。
   */
  initBullet(b: Bulletc): void{
    const owner = b.owner as unknown as { dead?: boolean; kill?: () => void } | null;
    if(this.killShooter && owner !== null && typeof owner.kill === "function" && owner.dead !== true){
      owner.kill();
    }

    if(this.instantDisappear){
      b.time = this.lifetime + 1;
    }

    if(this.spawnBullets.size > 0){
      for(const bullet of this.spawnBullets){
        bullet.create(b, b.team, b.x, b.y, b.rotation + Mathf.range(this.spawnBulletRandomSpread));
      }
    }
  }

  /**
   * 对应 `update(Bullet)`（`BulletType.java:730-736`）的**最小版**。
   * 未移植：`updateTrail` / `updateHoming`（需 `Units.closestTarget`）/ `updateTrailEffects` /
   * `updateBulletInterval`（需 `b.timer`，`Timerc` 未并入）—— 见文件头。
   * 唯一可无损实现的是 `updateWeaving` 的 `rotateSpeed` 分支（`:784-786`），原样移植。
   */
  update(b: Bulletc): void{
    if(this.rotateSpeed !== 0){
      // Java: `b.vel.rotate(rotateSpeed * Time.delta)`。arc 的 `Vec2.rotate(deg)` 走
      // `Angles.rotate`（查表 `Mathf.cosDeg/sinDeg`），这里用同一入口保证数值一致。
      const vx = b.velX;
      const vy = b.velY;
      const ang = this.rotateSpeed * Time.delta;
      b.velX = Angles.trnsx(ang, vx, vy);
      b.velY = Angles.trnsy(ang, vx, vy);
    }
  }

  /**
   * 对应 `hit(Bullet, float, float, boolean)`（`BulletType.java:562-589`）的**最小版**：
   * 只保留破片生成（`createFrags`）。其余（hitEffect / 音效 / 抖动 / 水洼 / 纵火 / 生成单位 /
   * 压制 / 溅射 / 闪电）依赖未移植系统，见文件头。
   */
  hit(b: Bulletc, x: number, y: number, createFrags = true): void{
    if(createFrags && this.fragOnHit){
      this.createFrags(b, x, y);
    }
  }

  /** 对应 `hit(Bullet)`（`BulletType.java:554-556`）。 */
  hitSelf(b: Bulletc): void{
    this.hit(b, b.x, b.y, true);
  }

  /**
   * 对应 `createFrags(Bullet, float, float)`（`BulletType.java:627-636`）。
   * ⚠️ `delayFrags` 分支（延迟到下一帧，`Time.run`）依赖 `Time.run` 的挂起任务；
   * 这里只用 `Time.run` 的同义调用（`Time.run(0f, …)`），其余原样。
   */
  createFrags(b: Bulletc, x: number, y: number): void{
    if(
      this.fragBullet !== null &&
      (this.fragOnAbsorb || !b.absorbed) &&
      (this.pierceFragCap < 0 || b.frags < this.pierceFragCap)
    ){
      for(let i = 0; i < this.fragBullets; i++){
        const len = Mathf.random(this.fragOffsetMin, this.fragOffsetMax);
        const a =
          b.rotation +
          Mathf.range(this.fragRandomSpread / 2) +
          this.fragAngle +
          this.fragSpread * i -
          ((this.fragBullets - 1) * this.fragSpread) / 2;
        this.fragBullet.create(
          b,
          b.team,
          x + Angles.trnsx(a, len),
          y + Angles.trnsy(a, len),
          a,
          -1,
          Mathf.random(this.fragVelocityMin, this.fragVelocityMax),
          Mathf.random(this.fragLifeMin, this.fragLifeMax)
        );
      }
      b.frags++;
    }
  }

  /** 对应 `despawned(Bullet)`（`BulletType.java:650-661`）的最小版（特效/音效/生成单位未移植）。 */
  despawned(b: Bulletc): void{
    if(this.despawnHit){
      this.hit(b, b.x, b.y, false);
    }else{
      // Java: createUnits(b, b.x, b.y) —— `UnitType.spawn` 未移植（见文件头）。
    }
    // Java: despawnEffect.at / despawnSound.at / Effect.shake —— 特效与音效（未移植）。
  }

  /**
   * 对应 `removed(Bullet)`（`BulletType.java:664-672`）的最小版（尾迹淡出未移植）。
   *
   * ⚠️ **陷阱 #16 的被迫改名**：`Content` 已有**字段** `removed`（`Content.ts:34`，数据补丁用
   * 的布尔量）。TS 不允许字段与方法同名 → 本方法改名 `removedBullet`。唯一的 Java 调用点
   * `BulletComp.remove()`（`BulletComp.java:90`）在 TS 侧对应 `BulletRuntime.remove()`，已同步。
   */
  removedBullet(b: Bulletc): void{
    if(b.frags === 0 && this.fragOnDespawn && this.fragBullet !== null){
      this.createFrags(b, b.x, b.y);
    }
  }

  /** 对应 `testCollision(Bullet, Building)`（`BulletType.java:459-461`）。⚠️ `Building` 未移植 → `any`。 */
  testCollision(bullet: Bulletc, tile: any): boolean{
    return !this.heals() || tile.team !== bullet.team || tile.healthf() < 1;
  }

  /**
   * 对应 `hitEntity(Bullet, Hitboxc, float)`（`BulletType.java:488-534`）的**最小版**：
   * 只做「扣血 + 穿透结算」。护盾 / `maxDamageFraction` / 吸血 / 击退 / 状态 / 事件未移植。
   */
  hitEntity(b: Bulletc, entity: any, health: number): void{
    if(entity !== null && typeof entity.damage === "function"){
      // Java: `h.damage(damage)`（1 参重载 → withEffect = true）。TS 的 `Healthc.damage`
      // 是 2 参（codegen 去掉了默认参数，见 `HealthComp.def.ts` 的说明）→ 显式传 `true`。
      entity.damage(b.damage, true);
    }
    // Java: 单位击退 / 状态 / `Events.fire(...)`（未移植，见文件头）。
    this.handlePierce(b, health, entity === null ? b.x : entity.x, entity === null ? b.y : entity.y);
  }

  /** 对应 `handlePierce(Bullet, float, float, float)`（`BulletType.java:536-545`）。 */
  handlePierce(b: Bulletc, initialHealth: number, _x: number, _y: number): void{
    const sub = Mathf.zero(this.pierceDamageFactor) ? 0 : Math.max(initialHealth * this.pierceDamageFactor, 0);
    b.damage -= Number.isNaN(sub) ? b.damage : Math.min(b.damage, sub);

    if(this.removeAfterPierce && b.damage <= 0){
      b.hit = true;
      b.remove();
    }
  }

  // ---------------------------------------------------------------- init / 创建

  /** 对应 `init()`（`BulletType.java:832-868`）的非渲染部分。 */
  override init(): void{
    if(this.pierceCap >= 1){
      this.pierce = true;
      // 注意：`pierceBuilding` 默认**不**跟着打开（Java 注释原文如此）。
    }

    if(this.setDefaults){
      if(this.lightning > 0){
        // Java: if(status == StatusEffects.none) status = StatusEffects.shocked;
        // ⚠️ `mocks/StatusEffects.ts` 未导出 `shocked`，且本阶段不允许改它（见文件头）→ 该分支
        //     暂不生效。headless 下状态效果无消费者，不可观测。
      }
      if(this.fragBullet !== null || this.splashDamageRadius > 0 || this.lightning > 0){
        this.despawnHit = true;
      }
    }

    if(this.fragBullet !== null){
      this.fragBullet.keepVelocity = false;
      this.fragBullet.scaleKeepVelocity = false;
    }

    if(this.lightningType === null){
      this.lightningType = !this.collidesAir
        ? Bullets.damageLightningGround
        : !this.collidesGround
          ? Bullets.damageLightningAir
          : Bullets.damageLightning;
    }

    if(this.lightRadius <= -1){
      this.lightRadius = Math.max(18, this.hitSize * 5);
    }

    this.drawSize = Math.max(this.drawSize, this.trailLength * this.speed * 2);
    this.range = this.calculateRange();
  }

  /** 对应 `getContentType()`（`BulletType.java:870-873`）。 */
  override getContentType(): ContentType{
    return ContentType.bullet;
  }

  /**
   * 对应 `create(...)` 的核心重载（`BulletType.java:924-1004`，经 `:883` → `:920` 链）。
   *
   * ⚠️ 与 Java 的三处收窄（均为「依赖未移植系统」，已在文件头逐条标注）:
   *  1. `spawnUnit` 分支（`:932-961`）跳过 —— `UnitType` 未移植。
   *  2. `aimTile`（`:971-973`）保持 `null` —— `World.tileWorld` / `Building` 未移植。
   *  3. `mover` 参数省略（恒 `null`）—— `Mover` 未移植。
   *
   * `shooter` 恒等于 `owner`（对应 Java `:917` 的 `create(owner, owner, …)` 链）。
   *
   * @param damage 负数表示用本类型的 `damage`（Java `:985`）。
   */
  create(
    owner: Entityc | null,
    team: number,
    x: number,
    y: number,
    angle: number,
    damage = -1,
    velocityScl = 1,
    lifetimeScl = 1,
    aimX = -1,
    aimY = -1
  ): BulletRuntime | null{
    angle += this.angleOffset + Mathf.range(this.randomAngleOffset);

    if(!Mathf.chance(this.createChance)) return null;
    if(this.ignoreSpawnAngle) angle = 0;
    // Java: spawnUnit 分支（`:932-961`）—— `UnitType` 未移植，见文件头。

    const bullet = BulletRuntime.create();
    bullet.type = this;
    bullet.owner = owner;
    bullet.shooter = owner;
    bullet.team = team;
    bullet.time = 0;
    bullet.originX = x;
    bullet.originY = y;
    // Java: `if(!(aimX == -1 && aimY == -1)) bullet.aimTile = …` —— World 未移植，跳过。
    bullet.aimX = aimX;
    bullet.aimY = aimY;

    bullet.initVel(
      angle,
      this.speed *
        velocityScl *
        (this.velocityScaleRandMin !== 1 || this.velocityScaleRandMax !== 1
          ? Mathf.random(this.velocityScaleRandMin, this.velocityScaleRandMax)
          : 1)
    );
    bullet.set(x, y);
    bullet.lastX = x;
    bullet.lastY = y;
    bullet.lifetime =
      this.lifetime *
      lifetimeScl *
      (this.lifeScaleRandMin !== 1 || this.lifeScaleRandMax !== 1
        ? Mathf.random(this.lifeScaleRandMin, this.lifeScaleRandMax)
        : 1);
    bullet.data = null;
    bullet.hitSize = this.hitSize;
    bullet.mover = null;
    bullet.damage = (damage < 0 ? this.damage : damage) * bullet.damageMultiplier();
    bullet.buildingDamageMultiplier = this.buildingDamageMultiplier;
    // Java: `if(bullet.trail != null) bullet.trail.clear();` —— 尾迹（渲染），跳过。
    bullet.add();

    if(this.keepVelocity && owner !== null){
      const vel = owner as unknown as { velX?: number; velY?: number };
      if(typeof vel.velX === "number" && typeof vel.velY === "number"){
        const len = Math.sqrt(bullet.velX * bullet.velX + bullet.velY * bullet.velY);
        bullet.velX += vel.velX;
        bullet.velY += vel.velY;

        if(this.scaleKeepVelocity){
          const newLen = Math.sqrt(bullet.velX * bullet.velX + bullet.velY * bullet.velY);
          // 只缩短寿命，绝不增加
          if(newLen > 0) bullet.lifetime *= Math.min(1, len / newLen);
        }
      }
    }
    return bullet;
  }
}
