// 源: core/src/mindustry/type/UnitType.java (2065 行)
//
// 移植范围（S2 · 单位子系统，**收窄移植**）:
//   - 继承 `UnlockableContent`（Java `UnitType extends UnlockableContent implements Senseable`，
//     `UnitType.java:43`；`Senseable` 属逻辑系统 → 不移植）。
//   - 字段区（`UnitType.java:48-398`）的**纯数据**部分逐字对照（字段名 / 默认值一致）；
//     引用渲染资源 / 未移植系统的字段逐条标注（见「未移植」）。
//   - 构造器（`UnitType.java:527-535`）、`postInit()`（`:537-550`）、`hasWeapons()`（`:633-635`）、
//     `isHidden()`（`:784-787`）、`getContentType()`（`:1451-1454`）、
//     `init()`（`:913-1127`）的**非渲染、非 Unit 依赖**部分、`estimateDps()`（`:1129-1142`）、
//     `create(Team)`（`:556-572`）、`spawn(...)`（`:575-623`）的**非分段**部分。
//
// ⚠️ 本项目已知陷阱（`ts/packages/codegen/README.md`「输入写法」+ `content/Items.ts` 顶部）:
//   Java 的 `UnitTypes.java:34` 在**字段**上标了 `@EntityDef({Unitc.class, Mechc.class})`，
//   注解处理器据此生成 `mindustry.gen.MechUnit` 等合并实体类。**不要**把这个注解照搬到 TS：
//   本阶段只声明 `UnitType` **实例**（纯数据，由 `content/UnitTypes.ts` 创建），实体类由手写的
//   `entities/UnitRuntime.ts` 承担。见 `content/UnitTypes.ts` 顶部同样说明。
//
// 未移植（逐条标注；均为「渲染 / 未移植系统」，不是静默省略）:
//   - 全部 `draw*`（`:1471-2018`）—— 渲染（计划 §9「渲染不做」）。`drawSize`/`region` 等同理。
//   - `setStats()`（`:790-853`）—— `Stat` / `StatValues`（UI）。
//   - `display()`（`:701-…`）/ `sense*` / `setProp` / `read` / `write` —— UI / 逻辑 / IO。
//   - `load()`（`:1144-…`）—— 加载 `region` 等贴图（渲染）。**有意留空**。
//   - `weapons` 镜像之外的一切武器执行逻辑（开火）—— 后续阶段（`mounts` / `Weapon.update`）。
//   - `abilities` / `immunities`（`:288,292`）—— `Ability` / `ObjectSet<StatusEffect>`
//     （前者未移植；后者可用数组，但本阶段无消费者 → 省略，`content/UnitTypes.ts` 里对应赋值同步省略）。
//   - `parts` / `engines`（`:337,339`）—— `DrawPart` / `UnitEngine`（渲染）。
//   - `aiController` / `controller` / `constructor` / `sample`（`:281-285,358`）—— 单位 AI /
//     构造器 / 样例实体，属后续阶段。
//   - `commands` / `stances` / `defaultCommand` / `targetFlags`（`:361-370`）—— `UnitCommand` /
//     `UnitStance` / `BlockFlag` 未移植。
//   - `mineItems`（`:398`）—— 依赖 `Items.*`（可移植，但本阶段无消费者 → 省略）。
//   - `pathCost` / `pathCostId` / `flowfieldPathType`（`:351-356`）—— 寻路。
//   - `envRequired` / `envEnabled` / `envDisabled`（`:49-53`）—— `Env` 类未移植 → 省略三字段。
//   - 全部 `TextureRegion` 区域字段（`:516-520`）—— 渲染资源。
//   - `buildTime` / `totalRequirements` / `cachedRequirements` / `firstRequirements`（`:524-525`）
//     —— 建造消耗（`ItemStack`），属「炮塔/建造」链路，本阶段不做。
//   - 地形相关字段（`groundLayer` / `flyingLayer` / `shadowElevation`* / `waveTrail*` /
//     `softShadowScl` / `engine*` 的渲染语义）中**纯渲染**者省略；保留的被标为「渲染专用」。
//
// 与 Java 的**两处结构性差异**:
//   1. `init()` 的「先算 `range`/`maxRange` 需要 `weapon.bullet.range`」依赖 `ContentLoader.init()`
//      的**类型顺序**（bullet 先于 unit 被 init）。TS 侧的 `UnitTypes.load()` 自己负责先给每个
//      `weapon.bullet` 调 `init()`，再调 `UnitType.init()`（与 Java 两段式等价，见 `content/UnitTypes.ts`）。
//   2. `create()` 在 Java 里 `controller`/`abilities`/`TimedKillc` 都要处理；TS 只保留
//      `team` / `setType` / `elevation` / 满血。`spawn()` 只保留非分段路径（`Segmentc` 未移植）。

import { Mathf } from "@mindustry-ts/arc";
import { Color } from "../arc-compat/Color.js";
import { Pal } from "../arc-compat/Pal.js";
import { Fx } from "../mocks/Fx.js";
import type { Effect } from "../mocks/Fx.js";
import { Sound, Sounds } from "../mocks/Sounds.js";
import { ContentType } from "../ctype/ContentType.js";
import { UnlockableContent } from "../ctype/UnlockableContent.js";
import { Weapon } from "./Weapon.js";
import { UnitRuntime } from "../entities/UnitRuntime.js";

/** 对应 `mindustry.type.UnitType`。 */
export class UnitType extends UnlockableContent{
  /** 单位阴影 X 偏移（`UnitType.java:44`）。 */
  static readonly shadowTX = -12;
  /** 单位阴影 Y 偏移（`UnitType.java:44`）。 */
  static readonly shadowTY = -13;

  // ---------------------------------------------------------------- 移动 / 物理（:55-158）

  /** 移动速度（世界单位/tick；`UnitType.java:56`）。 */
  speed = 1.1;
  /** 加速时的速度倍率（`UnitType.java:58`）。 */
  boostMultiplier = 1;
  /** 受地形影响的程度（`UnitType.java:60`）。 */
  floorMultiplier = 1;
  /** 本体旋转速度（度/tick；`UnitType.java:62`）。 */
  rotateSpeed = 5;
  /** 机甲底座旋转速度（度/tick；`UnitType.java:64`）。 */
  baseRotateSpeed = 5;
  /** 移动阻力系数（`UnitType.java:66`）。 */
  drag = 0.3;
  /** 加速度（速度的比例；`UnitType.java:68`）。 */
  accel = 0.5;
  /** 碰撞盒单边尺寸（`UnitType.java:70`）。 */
  hitSize = 6;
  /** 死亡抖动（`UnitType.java:72`）。 */
  deathShake = -1;
  /** 每步抖动（腿/机甲；`UnitType.java:74`）。 */
  stepShake = -1;
  /** 腿式单位的波纹/尘土尺寸（`UnitType.java:76`）。 */
  rippleScale = 1;
  /** 加速上升速度（比例；`UnitType.java:78`）。 */
  riseSpeed = 0.08;
  /** 加速下降速度（比例；`UnitType.java:80`）。 */
  descentSpeed = 0.08;
  /** 死亡下落速度（`UnitType.java:82`）。 */
  fallSpeed = 0.018;
  /** 导弹加速到满速所需 tick（`UnitType.java:84`）。 */
  missileAccelTime = 0;
  /** 原始血量（`UnitType.java:86`）。 */
  health = 200;
  /** 减伤护甲（`UnitType.java:88`）。 */
  armor = 0;
  /** 武器最小射程；可被 > 0 的值覆盖（`UnitType.java:90`）。 */
  range = -1;
  /** 武器最大射程（`UnitType.java:92`）。 */
  maxRange = -1;
  /** 采矿射程（`UnitType.java:94`）。 */
  mineRange = 70;
  /** `circleTarget` 时的环绕半径（`UnitType.java:98`）。 */
  circleTargetRadius = 80;
  /** 飞行单位撞击敌人时的伤害倍率（`UnitType.java:100`）。 */
  crashDamageMultiplier = 1;
  /** 飞行单位残骸血量相对最大血量的倍率（`UnitType.java:102`）。 */
  wreckHealthMultiplier = 0.25;
  /** 单位 DPS 的粗略估计（`init()` 里初始化；`UnitType.java:104`）。 */
  dpsEstimate = -1;
  /** 图形裁剪尺寸；< 0 自动计算（`UnitType.java:106`）。 */
  clipSize = -1;
  /** 溺水速度倍率（越大越慢；`UnitType.java:108`）。 */
  drownTimeMultiplier = 1;
  /** 逆向移动时的速度惩罚比例（`UnitType.java:110`）。 */
  strafePenalty = 0.5;
  /** 科技树研究成本倍率（`UnitType.java:112`）。 */
  researchCostMultiplier = 50;
  /** 击退倍率（`UnitType.java:114`）。 */
  knockbackMultiplier = 1;
  /** 载荷容量（世界单位²；`UnitType.java:121`）。 */
  payloadCapacity = 8;
  /** 建造速度倍率；< 0 禁用（`UnitType.java:123`）。 */
  buildSpeed = -1;
  /** 武器可瞄准的最小距离；-1 自动（`UnitType.java:125`）。 */
  aimDst = -1;
  /** 低优先级单位会在更近距离下被高优先级单位压制（`UnitType.java:131`）。 */
  targetPriority = 0;
  /** 光照半径；< 0 自动（`UnitType.java:145`）。 */
  lightRadius = -1;
  /** 光照透明度（`UnitType.java:147`）。 */
  lightOpacity = 0.6;
  /** 视野半径（tile）；< 0 自动（`UnitType.java:151`）。 */
  fogRadius = -1;

  // ---------------------------------------------------------------- 行为标志（:160-278）

  /** 是否计入波次敌人计数（`UnitType.java:161`）。 */
  isEnemy = true;
  /** 是否恒处于 elevation 1（飞行；`UnitType.java:163`）。 */
  flying = false;
  /** 飞行单位是否摇摆（`UnitType.java:165`）。 */
  wobble = true;
  /** 是否攻击空中单位（`UnitType.java:167`）。 */
  targetAir = true;
  /** 是否攻击地面单位（`UnitType.java:169`）。 */
  targetGround = true;
  /** 射击/瞄准时是否面向目标（`UnitType.java:171`）。 */
  faceTarget = true;
  /** 轰炸机型 AI：是否环绕目标（`UnitType.java:173`）。 */
  circleTarget = false;
  /** 地毯式轰炸：是否在自身下方投弹（`UnitType.java:175`）。 */
  autoDropBombs = false;
  /** 移动端：玩家操控时是否自动瞄准可附着建筑（`UnitType.java:177`）。 */
  targetBuildingsMobile = true;
  /** 玩家/处理器操控时能否升空（`UnitType.java:179`）。 */
  canBoost = false;
  /** 建造 AI 时是否总是升空（`UnitType.java:181`）。 */
  boostWhenBuilding = true;
  /** 采矿 AI 时是否总是升空（`UnitType.java:183`）。 */
  boostWhenMining = true;
  /** 逻辑处理器能否控制（`UnitType.java:185`）。 */
  logicControllable = true;
  /** 玩家能否控制（`UnitType.java:187`）。 */
  playerControllable = true;
  /** 能否用全局选择热键选中（`UnitType.java:189`）。 */
  controlSelectGlobal = true;
  /** 能否被装入载荷（`UnitType.java:191`）。 */
  allowedInPayloads = true;
  /** 能否被子弹/爆炸命中（`UnitType.java:193`）。 */
  hittable = true;
  /** 是否免伤且不可 kill（`UnitType.java:195`）。 */
  killable = true;
  /** 是否可被瞄准（`UnitType.java:197`）。 */
  targetable = true;
  /** 携带载荷时是否可被命中（`UnitType.java:199`）。 */
  vulnerableWithPayloads = false;
  /** 载荷单位能否拾取单位（`UnitType.java:201`）。 */
  pickupUnits = true;
  /** 是否与其他单位发生物理碰撞（`UnitType.java:203`）。 */
  physics = true;
  /** 地面单位是否会在深水中溺水（`UnitType.java:205`）。 */
  canDrown = true;
  /** 是否计入单位上限（`UnitType.java:207`）。 */
  useUnitCap = true;
  /** 核心单位是否「停靠」（`UnitType.java:209`）。 */
  coreUnitDock = false;
  /** 死亡时是否生成残骸（`UnitType.java:211`）。 */
  createWreck = true;
  /** 死亡时是否生成焦痕（`UnitType.java:213`）。 */
  createScorch = true;
  /** 是否绘制在特效/子弹之下（视觉；`UnitType.java:215`）。 */
  lowAltitude = false;
  /** 是否看向正在建造的目标（`UnitType.java:217`）。 */
  rotateToBuilding = true;
  /** 腿式单位能否跨过方块（`UnitType.java:219`）。 */
  allowLegStep = false;
  /** 腿式单位是否强制在地面物理层（`UnitType.java:221`）。 */
  legPhysicsLayer = true;
  /** 是否不受脚下地形影响（`UnitType.java:223`）。 */
  hovering = false;
  /** 能否不依赖朝向任意移动（`UnitType.java:225`）。 */
  omniMovement = true;
  /** 移动前是否先转向移动方向（`UnitType.java:227`）。 */
  rotateMoveFirst = false;
  /** 被治疗时是否闪白（`UnitType.java:229`）。 */
  healFlash = true;
  /** 能否治疗建筑（`init()` 里初始化；`UnitType.java:231`）。 */
  canHeal = false;
  /** 所有武器是否攻击同一目标（`UnitType.java:233`）。 */
  singleTarget = false;
  /** 即使只有一个镜像武器也允许多目标（`UnitType.java:235`）。 */
  forceMultiTarget = false;
  /** 是否有可攻击武器（`UnitType.java:237`）。 */
  canAttack = true;
  /** 是否不出现在数据库与各种 UI 中（`UnitType.java:239`）。 */
  hidden = false;
  /** 是否仅供内部使用（不生成贴图；`UnitType.java:241`）。 */
  internal = false;
  /** 内部单位仍生成贴图（`UnitType.java:243`）。 */
  internalGenerateSprites = false;
  /** 是否被地图边缘推开（`UnitType.java:245`）。 */
  bounded = true;
  /** 是否被识别为海军（**勿手动设置**，`init()` 里初始化；`UnitType.java:247`）。 */
  naval = false;
  /** RTS AI 单位移动时是否自动攻击（`UnitType.java:249`）。 */
  autoFindTarget = true;
  /** 是否瞄准 conveyor 之类「下方」方块（`UnitType.java:251`）。 */
  targetUnderBlocks = true;
  /** 移动时是否无视减速持续射击（`UnitType.java:253`）。 */
  alwaysShootWhenMoving = false;
  /** 是否显示悬停提示（UI；`UnitType.java:256`）。 */
  hoverable = true;
  /** 模组单位是否总生成 -outline（`UnitType.java:258`）。 */
  alwaysCreateOutline = false;
  /** 原版内容：是否跳过完整图标生成（`UnitType.java:260`）。 */
  generateFullIcon = true;
  /** 是否方形阴影（`UnitType.java:262`）。 */
  squareShape = false;
  /** 是否绘制建造光束（渲染；`UnitType.java:264`）。 */
  drawBuildBeam = true;
  /** 是否绘制采矿光束（渲染；`UnitType.java:266`）。 */
  drawMineBeam = true;
  /** 是否绘制队伍指示格（渲染；`UnitType.java:268`）。 */
  drawCell = true;
  /** 是否绘制携带物品（渲染；`UnitType.java:270`）。 */
  drawItems = true;
  /** 是否绘制单位护盾（渲染；`UnitType.java:272`）。 */
  drawShields = true;
  /** 是否绘制本体（渲染；`UnitType.java:274`）。 */
  drawBody = true;
  /** 是否绘制软阴影（渲染；`UnitType.java:276`）。 */
  drawSoftShadow = true;
  /** 是否在小地图上绘制（渲染；`UnitType.java:278`）。 */
  drawMinimap = true;

  // ---------------------------------------------------------------- 武器 / 颜色 / 音效（:289-398）

  /** 本单位的全部武器（`UnitType.java:290`）。`init()` 会为 `mirror` 武器补齐镜像副本。 */
  weapons: Weapon[] = [];

  /** 被治疗时闪烁的颜色（`UnitType.java:295`）。 */
  healColor: Color = Pal.heal;
  /** 光照颜色（`UnitType.java:297`）。 */
  lightColor: Color = Pal.powerLight;
  /** 护盾颜色覆盖（`UnitType.java:299`）。 */
  shieldColor: Color | null = null;

  /** 爆炸音效（非被击落；`UnitType.java:301`）。 */
  deathSound: Sound = Sounds.unset;
  /** 死亡音效音量（`UnitType.java:303`）。 */
  deathSoundVolume = 1;
  /** 残骸被击毁音效（`UnitType.java:305`）。 */
  wreckSound: Sound = Sounds.unset;
  /** 残骸落地音量（`UnitType.java:307`）。 */
  wreckSoundVolume = 1;
  /** 周围循环音效（`UnitType.java:309`）。 */
  loopSound: Sound = Sounds.none;
  /** 循环音效音量（`UnitType.java:311`）。 */
  loopSoundVolume = 0.5;
  /** 机甲/昆虫走一步的音效（`UnitType.java:313`）。 */
  stepSound: Sound = Sounds.mechStepSmall;
  /** 脚步声音量（`UnitType.java:315`）。 */
  stepSoundVolume = 0.5;
  /** 脚步声基础音高（`UnitType.java:317`）。 */
  stepSoundPitch = 1;
  /** 脚步声音高随机范围（`UnitType.java:317`）。 */
  stepSoundPitchRange = 0.1;
  /** 坦克移动循环音效（`UnitType.java:319`）。 */
  tankMoveSound: Sound = Sounds.tankMove;
  /** 移动循环音效（音量随速度；`UnitType.java:321`）。 */
  moveSound: Sound = Sounds.none;
  /** 移动音效音量（`UnitType.java:323`）。 */
  moveSoundVolume = 1;
  /** 按速度决定的移动音高下限（`UnitType.java:325`）。 */
  moveSoundPitchMin = 1;
  /** 按速度决定的移动音高上限（`UnitType.java:325`）。 */
  moveSoundPitchMax = 1;
  /** 坦克移动音效音量（`UnitType.java:327`）。 */
  tankMoveVolume = 0.5;

  /** 下落时产生的特效（`UnitType.java:329`）。 */
  fallEffect: Effect = Fx.fallSmoke;
  /** 引擎处的下落特效（`UnitType.java:331`）。 */
  fallEngineEffect: Effect = Fx.fallSmoke;
  /** 死亡爆炸特效（`UnitType.java:333`）。 */
  deathExplosionEffect: Effect = Fx.dynamicExplosion;
  /** 坦克移动时的可选特效（`UnitType.java:335`）。 */
  treadEffect: Effect | null = null;

  /** 引擎是否按 elevation 缩放（`UnitType.java:341`）。 */
  useEngineElevation = true;
  /** 全部引擎的颜色覆盖（`UnitType.java:343`）。 */
  engineColor: Color | null = null;
  /** 引擎内部颜色（`UnitType.java:345`）。 */
  engineColorInner: Color = Color.white;
  /** 引擎/尾迹长度（`UnitType.java:347`）。 */
  trailLength = 0;
  /** 引擎尾迹颜色覆盖（`UnitType.java:349`）。 */
  trailColor: Color | null = null;

  /** 引擎相对中心的向后偏移（`UnitType.java:137`）。 */
  engineOffset = 5;
  /** 引擎主半径（`UnitType.java:139`）。 */
  engineSize = 2.5;
  /** 引擎层；< 0 用默认（渲染；`UnitType.java:141`）。 */
  engineLayer = -1;
  /** 单位上物品的视觉 Y 偏移（`UnitType.java:143`）。 */
  itemOffsetY = 3;

  /** 单位可携带的物品量；< 0 按 `hitSize` 决定（`UnitType.java:380`）。 */
  itemCapacity = -1;
  /** 已废弃，仅为兼容保留（`UnitType.java:383`）。 */
  ammoCapacity = 1;
  /** 可采矿石的最大硬度；< 0 禁用（`UnitType.java:386`）。 */
  mineTier = -1;
  /** 采矿速度（`UnitType.java:388`）。 */
  mineSpeed = 1;
  /** 能否开采墙体 / 地板矿石（`UnitType.java:390`）。 */
  mineWalls = false;
  /** 能否开采地板矿石（`UnitType.java:390`）。 */
  mineFloor = true;
  /** 更硬的材料是否更慢（`UnitType.java:392`）。 */
  mineHardnessScaling = true;
  /** 采矿时的连续音效（`UnitType.java:394`）。 */
  mineSound: Sound = Sounds.loopMineBeam;
  /** 采矿音效音量（`UnitType.java:396`）。 */
  mineSoundVolume = 0.6;

  // ---------------------------------------------------------------- 轮廓 / 导弹（:373-511）

  /** 贴图轮廓颜色（`UnitType.java:373`）。 */
  outlineColor: Color = Pal.darkerMetal;
  /** 轮廓厚度（`UnitType.java:375`）。 */
  outlineRadius = 3;
  /** 是否生成轮廓（`UnitType.java:377`）。 */
  outlines = true;

  /** 本导弹单位的寿命（`UnitType.java:509`）。 */
  lifetime = 60 * 5;
  /** 本导弹开始追踪前所需 tick（`UnitType.java:511`）。 */
  homingDelay = 10;

  // ---------------------------------------------------------------- 构造 / 生命周期

  /**
   * 对应 `UnitType(String name)`（`UnitType.java:527-535`）。
   * ⚠️ 必须显式声明 **public** 构造器：`UnlockableContent` 的构造器是 `protected`，TS 对
   * 「未声明构造器」的子类会继承 protected 可访问性，外部 `new UnitType(...)` 会报
   * `TS2674`（与 `ConveyorBuild` / `BulletType` 同一处置）。
   *
   * ⚠️ Java 构造器还会 `constructor = EntityMapping.map(name)` 与 `selectionSize = 30f`；
   * 前者依赖生成的实体映射（本阶段用 `UnitRuntime`，见文件头陷阱说明），后者是 UI → 均省略。
   */
  constructor(name: string){
    super(name);
  }

  /**
   * 对应 `postInit()`（`UnitType.java:537-550`）：按飞行/海军给 `databaseTag` 兜底，再 `super`。
   * ⚠️ `naval` 在 Java 里由 `init()` 依据 `WaterMovec` 判定（未移植）→ 本阶段恒 `false`。
   */
  override postInit(): void{
    if(this.databaseTag === null || this.databaseTag.length === 0){
      if(this.flying){
        this.databaseTag = "unit-air";
      }else if(this.naval){
        this.databaseTag = "unit-naval";
      }else{
        this.databaseTag = "unit-ground";
      }
    }
    super.postInit();
  }

  /** 对应 `hasWeapons()`（`UnitType.java:633-635`）。 */
  hasWeapons(): boolean{
    return this.weapons.length > 0;
  }

  /** 对应 `isHidden()`（`UnitType.java:784-787`）。 */
  override isHidden(): boolean{
    return this.hidden;
  }

  /** 对应 `getContentType()`（`UnitType.java:1451-1454`）。 */
  override getContentType(): ContentType{
    return ContentType.unit;
  }

  /**
   * 对应 `init()`（`UnitType.java:913-1127`）的**非渲染、非 Unit 依赖**部分。
   *
   * ⚠️ 与 Java 的关键差异：Java 由 `ContentLoader.init()` 统一按**类型顺序**调用 `init()`
   * （bullet 先于 unit），因此这里读 `weapon.bullet.range` 时子弹已 init。TS 侧
   * `content/UnitTypes.ts` 负责先把每个 `weapon.bullet` 初始化，再调本方法（见其文件头）。
   */
  override init(): void{
    super.init();

    // Java `:918-936` —— `constructor.get()` / `checkEntityMapping` / `allowLegStep`
    //   （Legsc/Crawlc）/ 水上预设（WaterMovec/WaterCrawlc）/ `initPathType()` ——
    //   分别依赖生成的实体类、Legs/Crawl 组件、寻路 → 均未移植，跳过。

    // Java `:938-940` `if(flying) envEnabled |= Env.space;` —— `Env` 未移植 → 跳过。

    // 死亡音效按体积选择（`UnitType.java:942-947`）。
    if(this.deathSound === Sounds.unset){
      this.deathSound =
        this.hitSize < 12 ? Sounds.unitExplode1 :
        this.hitSize < 22 ? Sounds.unitExplode2 : Sounds.unitExplode3;
    }

    // 残骸音效按体积选择（`UnitType.java:949-951`）。
    if(this.wreckSound === Sounds.unset){
      this.wreckSound = this.hitSize >= 22 ? Sounds.wreckFallBig : Sounds.wreckFall;
    }

    // 光照半径兜底（`UnitType.java:953-955`）。
    if(this.lightRadius === -1){
      this.lightRadius = Math.max(60, this.hitSize * 2.3);
    }

    // Java `:957` `if(flyingLayer < 0) flyingLayer = …` —— flyingLayer（渲染层）未移植 → 跳过。
    this.clipSize = Math.max(this.clipSize, this.lightRadius * 1.1);
    this.singleTarget = this.singleTarget || (this.weapons.length <= 1 && !this.forceMultiTarget);

    // 物品容量兜底（`UnitType.java:961-963`）。
    if(this.itemCapacity < 0){
      this.itemCapacity = Math.max(Mathf.round(this.hitSize * 4), 10);
    }

    const margin = 4;

    // 默认射程（`UnitType.java:968-977`）。
    if(this.range < 0){
      this.range = Number.MAX_VALUE;
      for(const weapon of this.weapons){
        if(!weapon.useAttackRange) continue;
        this.range = Math.min(this.range, weapon.range() - margin);
        this.maxRange = Math.max(this.maxRange, weapon.range() - margin);
      }
    }

    // 默认最大射程（`UnitType.java:979-987`）。
    if(this.maxRange < 0){
      this.maxRange = Math.max(0, this.range);
      for(const weapon of this.weapons){
        if(!weapon.useAttackRange) continue;
        this.maxRange = Math.max(this.maxRange, weapon.range() - margin);
      }
    }

    // 视野半径兜底（`UnitType.java:989-992`）。
    if(this.fogRadius < 0){
      this.fogRadius = Math.max(58 * 3, this.hitSize * 2) / 8;
    }

    // 无攻击武器时退回采矿射程（`UnitType.java:994-997`）。
    if(!this.weapons.some((w) => w.useAttackRange)){
      if(this.range < 0 || this.range === Number.MAX_VALUE) this.range = this.mineRange;
      if(this.maxRange < 0 || this.maxRange === Number.MAX_VALUE) this.maxRange = this.mineRange;
    }

    // Java `:999-1005` mechStride / segmentSpacing —— Mechc / Segmentc 未移植 → 跳过。
    // Java `:1007-1009` 瞄准距离兜底。
    if(this.aimDst < 0){
      this.aimDst = this.weapons.some((w) => !w.rotate) ? this.hitSize * 2 : this.hitSize / 2;
    }

    // Java `:1011-1014` stepShake + mechStepParticles（后者是 Mechc 字段 → 省略）。
    if(this.stepShake < 0){
      this.stepShake = Mathf.round((this.hitSize - 11) / 9);
    }

    // Java `:1016-1029` engines.add / treadEffect —— 均为渲染（UnitEngine / Effect 生成）→ 跳过。
    // Java `:1031` mineBeamOffset —— 渲染偏移，字段未保留 → 跳过。
    // Java `:1033-1035` `abilities` 的 init —— abilities 未移植 → 跳过。

    // ---- 镜像武器副本（`UnitType.java:1037-1061`）----
    // 每把 `mirror` 武器生成一份 X 取反的副本，并把两者的 `reload` / `recoilTime` **翻倍**
    // （因为现在有两把武器，交替开火以维持总输出节奏），同时互相记下 `otherSide`。
    const mapped: Weapon[] = [];
    for(const w of this.weapons){
      if(w.recoilTime < 0) w.recoilTime = w.reload;
      mapped.push(w);

      if(w.mirror){
        const copy = w.copy();
        copy.flip();
        mapped.push(copy);

        // 既然现在有两把武器，装填与后坐力时间必须翻倍
        w.recoilTime *= 2;
        copy.recoilTime *= 2;
        w.reload *= 2;
        copy.reload *= 2;

        w.otherSide = mapped.length - 1;
        copy.otherSide = mapped.length - 2;
      }
    }
    this.weapons = mapped;

    for(const w of this.weapons) w.init();

    this.canHeal = this.weapons.some((w) => w.bullet !== null && w.bullet.heals());
    this.canAttack = this.weapons.some((w) => !w.noAttack);

    // Java `:1067-1107` 默认 commands —— `UnitCommand` 未移植 → 跳过。
    // Java `:1109-1121` 默认 stances —— `UnitStance` 未移植 → 跳过。

    this.estimateDps();

    // Java `:1126` `sample = constructor.get();` —— 没有实体构造器，跳过（本阶段用 UnitRuntime）。
  }

  /**
   * 对应 `estimateDps()`（`UnitType.java:1129-1142`）：
   * `dpsEstimate = Σ weapon.dps()`；若有 `killShooter` 武器则 `/ 15`（自爆兵）。
   */
  estimateDps(): number{
    if(this.dpsEstimate < 0){
      this.dpsEstimate = this.weapons.reduce((sum, w) => sum + w.dps(), 0);

      // 自爆兵：把 DPS 缩到无关紧要
      if(this.weapons.some((w) => w.bullet !== null && w.bullet.killShooter)){
        this.dpsEstimate /= 15;
      }
    }
    return this.dpsEstimate;
  }

  // ---------------------------------------------------------------- 创建 / 生成（:556-623）

  /**
   * 对应 `create(Team)`（`UnitType.java:556-572`）的**最小版**：`team` / `setType` /
   * `elevation` / 满血。`controller` / `abilities` / `TimedKillc` 未移植（见文件头）。
   * ⚠️ 不调用 `add()`（Java 也不调用；入组由调用方即 `spawn()` 负责）。
   */
  create(team: number): UnitRuntime{
    const unit = UnitRuntime.create();
    unit.team = team;
    unit.setType(this);
    unit.elevation = this.flying ? 1 : 0;
    // Java `:567` `unit.heal()`（无参）等价于 `health = maxHealth`（HealthComp）。
    unit.health = unit.maxHealth;
    return unit;
  }

  /**
   * 对应 `spawn(Team, float, float, float)`（`UnitType.java:609-611`）。
   * ⚠️ Java 的 5 参重载（`:575-607`）还处理分段单位（`Segmentc` / `cons` 回调）→ 未移植。
   */
  spawn(team: number, x: number, y: number, rotation = 0): UnitRuntime{
    const unit = this.create(team);
    unit.rotation = rotation;
    unit.set(x, y);
    unit.add();
    return unit;
  }
}
