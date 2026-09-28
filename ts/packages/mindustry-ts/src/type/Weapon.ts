// 源: core/src/mindustry/type/Weapon.java (592 行)
//
// 移植范围（S2 · 单位子系统）:
//   - 字段区（`Weapon.java:30-167`）**逐字对照**：字段名 / 默认值一致（少数引用型字段收窄，见下）。
//   - 构造器（`:169-175`）、`hasStats`（`:177-179`）、`dps`（`:194-196`）、
//     `shotsPerSec`（`:198-200`）、`range`（`:294-296`）、`flip`（`:551-558`）、
//     `copy`（`:560-566`）、`init`（`:568-573`）、`toString`（`:587-590`）。
//
// 未移植（逐条标注；均为「渲染 / 未移植系统」，不是静默省略）:
//   - 全部 `draw*`（`:203-292`）—— 渲染（计划 §9「渲染不做」）。
//   - `addStats`（`:181-192`）—— `Table` / `Stat` / `StatValues`（UI）。
//   - `update(Unit, WeaponMount)`（`:298-451`）—— 开火/AI/装填主循环。依赖 `WeaponMount` /
//     `Unit` / `Units.closestTarget` / `Predict` / `SoundLoop` 等**均未移植**；开火是后续
//     阶段（炮塔/开火）的活，本阶段**有意不实现**（不发明简化版）。
//   - `shoot(...)`（`:465-491`）/ `bullet(...)`（`:493-533`）/ `handleBullet`（`:536-549`）
//     —— 同上（开火）。
//   - `findTarget`（`:453-455`）/ `checkTarget`（`:457-459`）/ `bulletRotation`（`:461-463`）
//     —— 目标选取（`Units` / `Predict` 未移植），随 `update` 一起留待开火阶段。
//   - `load()`（`:575-585`）—— 用 `Core.atlas.find(name)` 取贴图 region + `part.load`，
//     纯渲染。保留空实现 + 调用点语义（见方法体注释）。
//
// ⚠️ 字段区三处收窄（原因逐条给出）:
//   1. **`ShootPattern shoot` 被拍平为 `shots` / `spacing`**：`Weapon.java:97` 的
//      `public ShootPattern shoot = new ShootPattern();`，而 `ShootPattern` 未移植。
//      按本阶段要求，只保留最常用的两个量：`shots`（≡ `shoot.shots`，`ShootPattern.java:8`）
//      与 `spacing`（≡ `shoot.shotDelay`，`ShootPattern.java:11`）。`firstShotDelay` 等未保留。
//      ⚠️ 这也是本类**唯一**的「字段名 ↔ 方法名冲突」点：Java 的 `Weapon` 同时有
//      **字段** `shoot`（ShootPattern）与 **方法** `shoot(Unit, WeaponMount, …)`（`:465`），
//      Java 允许同名而 TS 不允许。处置判据同 `HitboxComp.def.ts` 的 `hitSize`/`hitSizeValue()`：
//      **保留字段侧的名字**（这里落成拍平字段 `shots`），**方法侧不再移植**（开火属后续阶段）。
//   2. `bullet: BulletType | null`，默认 **null**（Java 是 `Bullets.placeholder`，`:33`）。
//      原因：`Bullets.placeholder` 只在 `Bullets.load()` 里赋值，而 `Weapon` 可能在
//      `Bullets.load()` 之前被构造；用 null 让「未赋弹药」是显式可测状态，凡读 `bullet`
//      的方法都在此显式处理 null（见 `range()` / `dps()`）。
//   3. `TextureRegion region/heatRegion/cellRegion/outlineRegion`（`:147-153`）—— 渲染资源，
//      **不移植**（类型都不存在）。
//
// ⚠️ 相对 Java **新增**的字段（本阶段要求，非 Java 所有）:
//   - `reloadMultiplier = 1`：Java 的 `Weapon` **没有**该字段（倍率在 `BulletType.reloadMultiplier`
//     与 `UnitComp.reloadMultiplier()` 上）。本阶段任务清单要求 `Weapon` 带此字段，故保留一个
//     便捷字段并在此标注；后续开火阶段可直接用它驱动装填，无需再改结构。
//   - `mirror` / `alternate` / `top` / `recoil` / `velocityRnd` 等均为 Java 原生字段。

import { Color } from "../arc-compat/Color.js";
import { Pal } from "../arc-compat/Pal.js";
import { Fx } from "../mocks/Fx.js";
import type { Effect } from "../mocks/Fx.js";
import { Sound, Sounds } from "../mocks/Sounds.js";
import { StatusEffects } from "../mocks/StatusEffects.js";
import type { StatusEffect } from "../mocks/StatusEffects.js";
import type { BulletType } from "./BulletType.js";

/** 对应 `mindustry.type.Weapon`。 */
export class Weapon{
  // ---------------------------------------------------------------- 字段区（:30-167）

  /** 显示的武器贴图名（`Weapon.java:31`）。 */
  name: string;
  /**
   * 发射的弹药（`Weapon.java:33`）。⚠️ Java 默认 `Bullets.placeholder`，TS 收窄为 `null`
   * —— 见文件头第 2 条。
   */
  bullet: BulletType | null = null;
  /** 抛壳特效（渲染专用；`Weapon.java:35`）。 */
  ejectEffect: Effect = Fx.none;
  /** 是否在单位详情里展示本武器（`Weapon.java:37`）。 */
  display = true;
  /** 初始化时是否创建镜像副本（`Weapon.java:39`）。 */
  mirror = true;
  /** 渲染时是否翻转贴图（内部使用，勿设置；`Weapon.java:41`）。 */
  flipSprite = false;
  /** `mirror = true` 时是否让两侧武器交替开火（`Weapon.java:43`）。 */
  alternate = true;
  /** 是否独立于单位旋转朝向目标（`Weapon.java:45`）。 */
  rotate = false;
  /** 是否在数据库中显示武器贴图（UI；`Weapon.java:47`）。 */
  showStatSprite = true;
  /** 起始旋转角（`Weapon.java:49`）。 */
  baseRotation = 0;
  /** 是否绘制在顶层（渲染；`Weapon.java:51`）。 */
  top = true;
  /** 是否在开火期间把子弹固定在原位（仍受装填限制；`Weapon.java:53`）。 */
  continuous = false;
  /** 是否使用无需装填的持续开火（蕴含 `continuous = true`；`Weapon.java:55`）。 */
  alwaysContinuous = false;
  /** 炮塔改变子弹「瞄准距离」的速度（点激光专用；`Weapon.java:57`）。 */
  aimChangeSpeed = Number.POSITIVE_INFINITY;
  /** 是否可由玩家手动瞄准（`Weapon.java:59`）。 */
  controllable = true;
  /** 是否可由单位自动瞄准（`Weapon.java:61`）。 */
  aiControllable = true;
  /** 是否无视目标/角度持续开火（`Weapon.java:63`）。 */
  alwaysShooting = false;
  /** 是否在 `update()` 里自动索敌（仅在 `controllable = false` 时有效；`Weapon.java:65`）。 */
  autoTarget = false;
  /** 是否做目标轨迹预测（`Weapon.java:67`）。 */
  predictTarget = true;
  /** 是否计入攻击射程计算（`Weapon.java:69`）。 */
  useAttackRange = true;
  /** 目标间等待 tick（`Weapon.java:71`）。 */
  targetInterval = 40;
  /** 切换目标的等待 tick（`Weapon.java:71`）。 */
  targetSwitchInterval = 70;
  /** 启用旋转时武器的旋转速度（度/tick；`Weapon.java:73`）。 */
  rotateSpeed = 20;
  /** 装填时间，单位 tick（`Weapon.java:75`）。 */
  reload = 1;
  /** 每发的额外散布（度；`Weapon.java:77`）。 */
  inaccuracy = 0;
  /** 每发屏幕抖动的强度与时长（`Weapon.java:79`）。 */
  shake = 0;
  /** 视觉后坐力（`Weapon.java:81`）。 */
  recoil = 1.5;
  /** 后坐力计数器的额外数量（`Weapon.java:83`）。 */
  recoils = -1;
  /** 武器回到起始位置所需 tick（默认用 `reload`；`Weapon.java:85`）。 */
  recoilTime = -1;
  /** 视觉后坐力的幂曲线（`Weapon.java:87`）。 */
  recoilPow = 1.8;
  /** 热力图冷却所需 tick（`Weapon.java:89`）。 */
  cooldownTime = 20;
  /** 弹丸/特效相对武器中心的 X 偏移（`Weapon.java:91`）。 */
  shootX = 0;
  /** 弹丸/特效相对武器中心的 Y 偏移（`Weapon.java:91`）。 */
  shootY = 3;
  /** 武器在单位上的 X 偏移（`Weapon.java:93`）。 */
  x = 5;
  /** 武器在单位上的 Y 偏移（`Weapon.java:93`）。 */
  y = 0;
  /** X 轴随机偏移范围（`Weapon.java:95`）。 */
  xRand = 0;
  /** Y 轴随机偏移范围（`Weapon.java:95`）。 */
  yRand = 0;
  /**
   * 每次「扣扳机」发射的子弹数（`Weapon.java:97` 的 `ShootPattern.shots`，
   * `ShootPattern.java:8`）。⚠️ 拍平字段，见文件头第 1 条。
   */
  shots = 1;
  /**
   * 连发之间的间隔（`Weapon.java:97` 的 `ShootPattern.shotDelay`，`ShootPattern.java:11`）。
   * ⚠️ 拍平字段，见文件头第 1 条。
   */
  spacing = 0;
  /** 武器下方阴影半径；< 0 禁用（渲染；`Weapon.java:99`）。 */
  shadow = -1;
  /** 随机速度的比例（`Weapon.java:101`）。 */
  velocityRnd = 0;
  /** 作为比例叠加的额外速度（`Weapon.java:103`）。 */
  extraVelocity = 0;
  /** 随机寿命的比例（`Weapon.java:105`）。 */
  lifeRnd = 0;
  /** 作为比例叠加的额外寿命（`Weapon.java:107`）。 */
  extraLife = 0;
  /** 开始开火的锥形半角（`Weapon.java:109`）。 */
  shootCone = 5;
  /** 武器相对其挂载点可旋转的锥角（`Weapon.java:111`）。 */
  rotationLimit = 361;
  /** 开火前的最小预热（非线性，勿用 1；`Weapon.java:113`）。 */
  minWarmup = 0;
  /** 开火预热的 lerp 速度（仅供 parts 使用；`Weapon.java:115`）。 */
  shootWarmupSpeed = 0.1;
  /** 装填平滑速度（`Weapon.java:115`）。 */
  smoothReloadSpeed = 0.15;
  /** 预热是否线性（`Weapon.java:117`）。 */
  linearWarmup = false;
  /** 随机音高下限（`Weapon.java:119`）。 */
  soundPitchMin = 0.8;
  /** 随机音高上限（`Weapon.java:119`）。 */
  soundPitchMax = 1;
  /** 开火时是否忽略射手旋转（`Weapon.java:121`）。 */
  ignoreRotation = false;
  /** 为 true 时本武器不能用于攻击（`Weapon.java:123`）。 */
  noAttack = false;
  /** 开火所需的最小速度；-1 关闭限制（`Weapon.java:125`）。 */
  minShootVelocity = -1;
  /** 开火的最大速度；-1 关闭限制（`Weapon.java:127`）。 */
  maxShootVelocity = -1;
  /** 开火特效是否跟随单位（`Weapon.java:129`）。 */
  parentizeEffects = false;
  /** 交替开火用的内部值——勿改（`Weapon.java:131`）。 */
  otherSide = -1;
  /** 相对默认值的绘制 Z 偏移（渲染；`Weapon.java:133`）。 */
  layerOffset = 0;
  /** 持续开火时循环播放的音效（`Weapon.java:135`）。 */
  activeSound: Sound = Sounds.none;
  /** 持续音效音量（`Weapon.java:137`）。 */
  activeSoundVolume = 1;
  /** 开火音效（`Weapon.java:139`）。 */
  shootSound: Sound = Sounds.shoot;
  /** 开火音效音量（`Weapon.java:141`）。 */
  shootSoundVolume = 1;
  /** 持续武器首次开火的音效（`Weapon.java:143`）。 */
  initialShootSound: Sound = Sounds.none;
  /** 带延迟武器的蓄力音效（`Weapon.java:145`）。 */
  chargeSound: Sound = Sounds.none;
  /** 热力图着色（渲染；`Weapon.java:155`）。 */
  heatColor: Color = Pal.turretHeat;
  /** 开火时施加的状态（`Weapon.java:157`）。 */
  shootStatus: StatusEffect = StatusEffects.none;
  /** 施加状态的时长（`Weapon.java:161`）。 */
  shootStatusDuration = 60 * 5;
  /** 所有者死亡时是否开火（`Weapon.java:163`）。 */
  shootOnDeath = false;
  /** `shootOnDeath = true` 时覆盖开火特效（`Weapon.java:165`）。 */
  shootOnDeathEffect: Effect | null = null;

  /**
   * ⚠️ 相对 Java **新增**：Java 的 `Weapon` 无此字段（在 `BulletType.reloadMultiplier` 上）。
   * 保留一个便捷字段，供后续开火阶段驱动装填。默认 1（无倍率）。
   */
  reloadMultiplier = 1;

  // ---------------------------------------------------------------- 构造（:169-175）

  /** 对应 `Weapon(String name)`（`Weapon.java:169-171`）。 */
  constructor(name: string){
    this.name = name;
  }

  // ---------------------------------------------------------------- 派生值

  /** 对应 `hasStats(UnitType)`（`Weapon.java:177-179`）。`UnitType` 未用于判据 → 参数放宽。 */
  hasStats(_u: unknown): boolean{
    return this.display;
  }

  /** 对应 `dps()`（`Weapon.java:194-196`）：`(bullet.estimateDPS() / reload) * shoot.shots * 60`。 */
  dps(): number{
    if(this.bullet === null || this.reload <= 0) return 0;
    return (this.bullet.estimateDPS() / this.reload) * this.shots * 60;
  }

  /** 对应 `shotsPerSec()`（`Weapon.java:198-200`）：`shoot.shots * 60 / reload`。 */
  shotsPerSec(): number{
    if(this.reload <= 0) return 0;
    return (this.shots * 60) / this.reload;
  }

  /** 对应 `range()`（`Weapon.java:294-296`）：`bullet.range`。⚠️ `bullet` 可空（文件头第 2 条）。 */
  range(): number{
    return this.bullet === null ? 0 : this.bullet.range;
  }

  // ---------------------------------------------------------------- 生命周期

  /**
   * 对应 `load()`（`Weapon.java:575-585`）：从 atlas 取 4 个 region 并 `part.load(name)`。
   * ⚠️ 纯渲染（`TextureRegion` / `Core.atlas` / `DrawPart` 均未移植）→ **有意留空**。
   */
  load(): void{
    // region = Core.atlas.find(name);
    // heatRegion = Core.atlas.find(name + "-heat");
    // cellRegion = Core.atlas.find(name + "-cell");
    // outlineRegion = Core.atlas.find(name + "-outline");
    // for(const part of this.parts){ part.turretShading = false; part.load(name); }
  }

  /**
   * 对应 `init()`（`Weapon.java:568-573`）：`alwaysContinuous` 蕴含 `continuous`。
   * Java 标 `@CallSuper`，由 `UnitType.init()` 对每个武器调用。
   */
  init(): void{
    if(this.alwaysContinuous){
      this.continuous = true;
    }
  }

  /**
   * 对应 `flip()`（`Weapon.java:551-558`）：镜像是把 X 相关量取反。
   * ⚠️ Java 末尾还有 `shoot = shoot.copy(); shoot.flip();` —— `ShootPattern` 未移植（文件头
   * 第 1 条），故省略；拍平的 `shots`/`spacing` 是标量，无需翻转。
   */
  flip(): void{
    this.x *= -1;
    this.shootX *= -1;
    this.baseRotation *= -1;
    this.flipSprite = !this.flipSprite;
  }

  /**
   * 对应 `copy()`（`Weapon.java:560-566`）：`clone()` 的浅拷贝。TS 用 `Object.assign` 复刻。
   * 注意 `name` 已在构造器里赋值，`Object.assign` 会用源对象的值覆盖（与 Java 一致）。
   */
  copy(): Weapon{
    const copy = new Weapon(this.name);
    Object.assign(copy, this);
    return copy;
  }

  /** 对应 `toString()`（`Weapon.java:587-590`）。 */
  toString(): string{
    return this.name === null || this.name.length === 0 ? "Weapon" : "Weapon: " + this.name;
  }
}
