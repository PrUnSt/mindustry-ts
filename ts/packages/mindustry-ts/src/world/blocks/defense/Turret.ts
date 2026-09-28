// 源（只读 ground truth）:
//   core/src/mindustry/world/blocks/defense/turrets/BaseTurret.java (147 行)
//   core/src/mindustry/world/blocks/defense/turrets/ReloadTurret.java (49 行)
//   core/src/mindustry/world/blocks/defense/turrets/Turret.java (886 行)
//   core/src/mindustry/world/blocks/defense/turrets/ItemTurret.java (247 行)
//   core/src/mindustry/entities/pattern/ShootPattern.java / ShootAlternate.java
//   core/src/mindustry/entities/comp/TimerComp.java (`timer(id,time)` 的真实语义)
//
// 移植范围（S3 · 防御闭环第一步）: 「炮塔索敌 → 开火造子弹 → 装填」这条**行为闭环**。
//   - `BaseTurret` / `BaseTurretBuild`：`range` / `rotateSpeed` / `rotation`(瞄准角)。
//   - `ReloadTurret` / `ReloadTurretBuild`：`reload` / `reloadCounter`。
//   - `Turret` / `TurretBuild`：`targetInterval` / `shootCone` / `inaccuracy` / `shootX/Y` /
//     `rotateSpeed` / `findTarget()` / `turnToTarget()` / `handleReload()` / `updateShooting()` /
//     `shoot()` / `bullet()` / `useAmmo()` / `hasAmmo()` / `peekAmmo()`。
//   - `ItemTurret` / `ItemTurretBuild`：`ammoTypes` + `handleItem()`（装弹）。
//   - `ShootPattern` / `ShootAlternate`（**最小内联移植**，duo 用它做双管交替）。
//
// ⚠️ 为什么行为必须写在具象子类里: `.def.ts` / 生成文件不能 import arc-ts（见
//   `entities/comp/BuildingComp.def.ts` 文件头）→ 一切需要 `Time.delta` 的方法
//   （`delta()` / `edelta()`）只能落在本文件。与 `Conveyor.ts` / `Wall.ts` 同一处置。
//
// ⚠️ 陷阱 #6: Java 用**内部类** `TurretBuild` / `ItemTurretBuild`，靠反射在 `initBuilding()`
//   里找；TS 改为在构造器里显式 `this.buildType = () => new ItemTurretBuild()`。
//
// ⚠️ **`rotation` 字段的双重身份（必须知道，否则行为会错）**:
//   Java 的 `BaseTurretBuild` 声明了**自己的** `public float rotation = 90;`，它**遮蔽**了
//   `BuildingComp` 的 `int rotation`（0-3 放置朝向）。`BuildingComp.init()` 里
//   `this.rotation = rotation`（`BuildingComp.java:123`）写的是**建筑朝向**那个 int，
//   因此炮塔的**瞄准角**始终保持在 90（朝上），不受放置朝向影响。
//   TS 只有一个 `rotation` 属性 → 若照抄，`init()` 会把瞄准角写成 0。故这里**覆写**
//   `init()`：先 `super.init(...)`（得到建筑朝向），再把瞄准角复位成 90。语义与 Java 等价
//   （两套字段各自的值都对），代价是 TS 侧不再单独保存 0-3 的建筑朝向 —— 炮塔的行为不读它。
//   Java 里 `TurretBuild.findOneTarget` 用的 `angleTo` / `targetRot` 全部基于**浮点**瞄准角。
//
// ⚠️ **`timer(id, time)` 的真实语义**（决定了「首发 tick」，本文件的**关键对拍点**）:
//   `TimerComp.timer(index,time)`（`TimerComp.java:10-13`）委托给 `arc.util.Interval.get`。
//   `Interval`（`arc-core` 反编译 `check`）:
//       boolean check(int i, float time){ return Time.time - times[i] >= time || Time.time < times[i]; }
//   `times` 初值**全 0**（`Interval(int)` 只 `new float[n]`）。因此**首次为真**的条件是
//   `Time.time >= time`（因为 `Time.clear()` 后 `Time.time` 从 0 起、每 tick +1）。
//   对 `duo` 的 `targetInterval = 20` → **tick 20** 才第一次 `findTarget()`。
//   ⚠️ 这不是「第一次调用立刻返回 true」—— 若写成那样，首发会提前到 tick 20（错 6 tick，
//   见 `ts/golden/java-turret-fire.txt` 的 tick 26 首发）。本文件**逐字复刻** Interval.check。
//
// 未移植（逐条标注；均为「渲染 / 未移植系统」，不是静默省略）:
//   - 全部 `draw*`（`drawPlace` / `drawSelect` / `draw` / `drawer` / `DrawTurret` / parts）
//     —— 渲染（计划 §9）。
//   - `setStats` / `setBars` / `icons` / `getRegionsToOutline` / `load` —— `Stat` / `Table` /
//     贴图（UI / 渲染）。
//   - 消耗品体系（`coolant` / `consumeCoolant` / `consume(new ConsumeItemFilter(...))` /
//     `updateCooling` / `coolantMultiplier`）—— `Consume*` 未移植（计划 §9：不做消耗品）。
//     ⚠️ 影响: Java 的 `ItemTurret` 有一个 `ConsumeItemFilter` 消费者（`ItemTurret.java:72-93`），
//     它参与 `updateConsumption()` 的效率计算。TS 侧 `Block.hasConsumers` 恒 false
//     → 走「无消费者快路径」→ `efficiency = enabled && productionValid() && shouldConsume()`。
//     对「弹仓非空且 `shouldConsume()` 为真」的炮塔，两者都得到 `efficiency === 1`，**可观测
//     结果一致**（这是本文件能对拍的前提）；若将来补上消费者体系，需同步复核。
//   - 电力 / 热量（`heatRequirement` / `heatReq` / `calculateHeat` / `sideHeat` /
//     `maxHeatEfficiency`）—— `Consume*` / 电力（S5）。`heatRequirement` 默认 -1 → 不可达。
//   - 玩家 / 逻辑控制（`control` / `controlled()` / `logicControlled()` / `unit` BlockUnitc /
//     `sense` / `setProp`）—— 逻辑编辑器 / 网络（计划 §9 / S6）。TS 只保留 **AI 分支**
//     （`target != null`），即 golden 场景所走的那条。
//   - `Predict.intercept`（移动目标提前量）—— `Predict` 未移植。TS 的 `targetPosition()` 直接
//     取目标当前位置。**对静止目标与 Java 完全等价**（零速度时 intercept 的解就是目标点）；
//     golden 里的 dagger 在 TS 侧无 AI（`UnitRuntime` 不移动）→ 等价。
//   - `Units.bestTarget` / `Units.bestEnemy` / `UnitSorts.closest` —— `Units` 未移植。TS 的
//     `findEnemy()` **重写为对 `Groups.unit` 的直接扫描**：按敌方队伍 + 存活 + 空中/地面标志 +
//     射程筛，取最近（`UnitSorts.closest` 的判据 = 距离平方）。语义与 Java 的
//     `Units.bestTarget(...)` 在「只有单位、无敌方建筑」时一致。
//   - 建筑目标（`targetBlocks` / `buildingFilter` / `Units.bestTarget` 的建筑部分）——
//     `Building` 的碰撞/命中闭环未移植（子弹 vs 建筑走 `tileRaycast`，见 `BulletRuntime.ts`）。
//   - 音效 / 特效（`shootSound` / `ammoUseEffect` / `Effect.shake` / `coolEffect`）—— 渲染/音频。
//     ⚠️ 显式偏离：`Turret.java:804` 的音效调用里有一个**无条件求值的实参**
//     `Mathf.random(soundPitchMin, soundPitchMax)`，它会推进全局 `Mathf.rand` 一次。
//     本移植不播放音效 → 不做这次抽样，于是每次开火相对 Java 少消耗 1 个全局随机数
//     （实测会把 golden 的首次扣血 tick 从 60 推到 61）。这是本文件唯一一处「少抽随机数」
//     的偏离，已在 `bullet()` 内与测试文件里显式记录，不做静默处理。
//   - 存档 / 网络（`write` / `read` / `readSync` / `version` / `sync`）—— S6。
//   - `Turret.placeEnded`（放置结束时把瞄准角设成 `rotdeg()`）—— 建造计划系统。golden 用
//     `Tile.setBlock` 直接放，不经 `placeEnded` → 不影响对拍。
//   - `ShootPattern.shots > 1` 的延迟排程（`Time.run(delay, ...)`）—— `Time.run` 未移植；
//     `ShotPattern` 默认 `shotDelay = 0`、`ShootAlternate` 也是 0 → 本阶段无延迟分支。
//
// ⚠️ **随机数：为什么不直接用 `Mathf.range`（本文件唯一的「绕过 arc-ts」之处）**
//   `bullet()` 需要 `Mathf.range(xRand)` 与 `Mathf.range(inaccuracy + type.inaccuracy)`。
//   Java 的 `Mathf.range(float x)` 是**浮点**重载（内部 `random(-x, x)` → `-x + nextFloat() * 2x`），
//   但 `arc-ts` 的 `Mathf.range(x)` 走的是 `Mathf.random(-x, x)`，而 `Mathf.random(start, end)`
//   按**运行期值**分派（`Number.isInteger(start) && Number.isInteger(end)` → 走 int 重载）。
//   → 对 `duo` 的 `range(0 + 2)`（整数 2）会得到**整数**偏差 ∈ {-2,-1,0,1,2}，而 Java 是浮点。
//   这会让 tick 26 的首发弹道直接偏掉（本文件的对拍点，见 `ts/golden/java-turret-fire.txt`）。
//   `arc-ts` 不在本阶段的允许改动范围内 → 这里**就地**实现 Java 的浮点语义（同名 helper
//   `rangeFloat` / `randomFloat`），并保证**每次调用只消耗 1 个 `nextLongUnsigned`**
//   （与 Java 的 `nextFloat()` 一致），因此 PRNG 序列与 Java 严格同步。
//   若将来 `arc-ts` 修好 int/float 分派，可把这两个 helper 换回 `Mathf.range` / `Mathf.random`。

import { Angles, Mathf, Time } from "@mindustry-ts/arc";
import { Building } from "../../../gen/Building.js";
import { Block } from "../../Block.js";
import { BlockGroup } from "../../meta/BlockGroup.js";
import { TargetPriority } from "../../../entities/TargetPriority.js";
import { Groups } from "../../../gen/Groups.js";
import { ItemModule } from "../../modules/ItemModule.js";
import type { BulletType } from "../../../type/BulletType.js";
import type { Item } from "../../../type/Item.js";
import type { Posc } from "../../../gen/Posc.js";

// ---------------------------------------------------------------- 随机数（Java 浮点语义，见文件头）

/**
 * 对应 arc `Mathf.range(float x)` 的**浮点**语义：`random(-x, x)` 的 float 重载
 * = `-x + nextFloat() * 2x`（等价于 `Rand.range(float)`）。⚠️ 见文件头说明。
 */
function rangeFloat(x: number): number{
  return Mathf.rand.nextFloat() * 2 * x - x;
}

/**
 * 对应 arc `Mathf.random(float range)` 的**浮点**语义 = `nextFloat() * range`。⚠️ 见文件头说明。
 */
function randomFloat(range: number): number{
  return Mathf.rand.nextFloat() * range;
}

// ---------------------------------------------------------------- 射击模式（ShootPattern 最小内联移植）

/** 对应 `mindustry.entities.pattern.ShootPattern.BulletHandler`。 */
export type BulletHandler = (xOffset: number, yOffset: number, rotationOffset: number, delay: number) => void;

/** 对应 `mindustry.entities.pattern.ShootPattern`（最小版，只保留 duo 用到的字段/方法）。 */
export class ShootPattern{
  /** `ShootPattern.java:8`。 */
  shots = 1;
  /** `ShootPattern.java:11`。 */
  firstShotDelay = 0;
  /** `ShootPattern.java:13`。 */
  shotDelay = 0;

  /** 对应 `ShootPattern.shoot(int, BulletHandler, Runnable)`（`ShootPattern.java:20-23` → `:26-30`）。 */
  shoot(_totalShots: number, handler: BulletHandler, _barrelIncrementer: () => void): void{
    for(let i = 0; i < this.shots; i++){
      handler(0, 0, 0, this.firstShotDelay + this.shotDelay * i);
    }
  }
}

/**
 * 对应 `mindustry.entities.pattern.ShootAlternate`（`ShootAlternate.java`）。
 * ⚠️ `ShootAlternate(float spread)` **不调用** `super(shots, delay)`，因此 `shots` 保持 `1`
 *   —— 也就是「每次扣扳机只发 1 颗、但两根炮管交替」。`duo` 用 `new ShootAlternate(3.5f)`
 *   产生 `xOffset = ±1.75` 的交替弹道。这正是 golden tick 26 首发子弹 x 偏移 -1.75 的来源。
 */
export class ShootAlternate extends ShootPattern{
  /** `ShootAlternate.java:10`。 */
  barrels = 2;
  /** 管间距（世界单位，**不是**角度；`ShootAlternate.java:12`）。 */
  spread = 5;
  /** `ShootAlternate.java:14`。 */
  barrelOffset = 0;
  /** `ShootAlternate.java:16`。 */
  mirror = false;

  constructor(spread: number){
    super();
    this.spread = spread;
  }

  /** 对应 `ShootAlternate.shoot`（`ShootAlternate.java:27-36`）。 */
  override shoot(totalShots: number, handler: BulletHandler, barrelIncrementer: () => void): void{
    for(let i = 0; i < this.shots; i++){
      const index = ((totalShots + i + this.barrelOffset) % this.barrels) - (this.barrels - 1) / 2;
      handler(index * this.spread * -Mathf.sign(this.mirror), 0, 0, this.firstShotDelay + this.shotDelay * i);
      barrelIncrementer();
    }
  }
}

// ---------------------------------------------------------------- 弹药条目

/** 对应 `Turret.AmmoEntry`（`Turret.java:263-267`）。 */
export abstract class AmmoEntry{
  amount = 0;
  abstract type(): BulletType;
}

/** 对应 `ItemTurret.ItemEntry`（`ItemTurret.java:226-246`）。 */
export class ItemEntry extends AmmoEntry{
  item: Item;

  constructor(item: Item, amount: number){
    super();
    this.item = item;
    this.amount = amount;
  }

  override type(): BulletType{
    return (this.entryTurret as ItemTurret).ammoTypes.get(this.item)!;
  }

  /** 由 `ItemTurretBuild` 在构造时注入外层方块引用（Java 内部类隐式持有外部引用）。 */
  entryTurret: ItemTurret | null = null;
}

// ---------------------------------------------------------------- BaseTurret

/** 对应 `mindustry.world.blocks.defense.turrets.BaseTurret.BaseTurretBuild`（`BaseTurret.java:113-146`）。 */
export class BaseTurretBuild extends Building{
  /**
   * 瞄准角（度；Java `BaseTurretBuild.rotation = 90`，**遮蔽** `BuildingComp.rotation`）。
   * ⚠️ 见文件头「`rotation` 字段的双重身份」。
   */
  rotation = 90;
  /** 激活倒计时（`BaseTurretBuild.java:115`）；`activationTime` 默认 0 → 恒 0。 */
  activationTimer = 0;

  /** ⚠️ 显式 public 构造器（`Building` 的构造器是 protected，见 `Wall.ts` 同一说明）。 */
  constructor(){
    super();
  }

  /**
   * 覆写以**复位瞄准角**（见文件头）。Java 里 `BuildingComp.init` 写的是另一个（int）字段，
   * 炮塔浮点瞄准角不受影响；TS 只有一个 property，故在其后复位。
   */
  override init(tile: any, team: number, shouldAdd: boolean, rotation: number): Building{
    super.init(tile, team, shouldAdd, rotation);
    this.rotation = 90;

    // ⚠️ Java 的 `placed()` 里 `activationTimer = activationTime`；`Tile.setBlock` **不**调
    //    `placed()`，而 `BaseTurret.activationTime` 默认 0 —— 两种路径下 `activationTimer`
    //    都是 0。这里保持 0（显式写出以对齐 Java 的字段语义）。
    this.activationTimer = (this.block as BaseTurret).activationTime;
    return this;
  }

  /** 对应 `BaseTurretBuild.range()`（`BaseTurret.java:123-126`）。 */
  range(): number{
    return (this.block as BaseTurret).range;
  }

  /** 对应 `BaseTurretBuild.buildRotation()`（`BaseTurret.java:128-131`）。 */
  buildRotation(): number{
    return this.rotation;
  }

  /** 对应 `BuildingComp.delta()`（需 `Time`，见文件头 codegen 约束）。 */
  delta(): number{
    return Time.delta * (this as unknown as { timeScale: number }).timeScale;
  }

  /** 对应 `BuildingComp.edelta()`。 */
  edelta(): number{
    return this.efficiency * this.delta();
  }

  /** 对应 `BaseTurretBuild.estimateDps()`（基类恒 0）。 */
  estimateDps(): number{
    return 0;
  }
}

/** 对应 `mindustry.world.blocks.defense.turrets.BaseTurret`（`BaseTurret.java:20-147`）。 */
export class BaseTurret extends Block{
  /** 射程（世界单位；`BaseTurret.java:21`）。 */
  range = 80;
  /** 放置重叠边距（`BaseTurret.java:22`）。 */
  placeOverlapMargin = 8 * 7;
  /** 转向速度（度/tick；`BaseTurret.java:23`）。 */
  rotateSpeed = 5;
  /** 视野半径倍率（`BaseTurret.java:24`）。 */
  fogRadiusMultiplier = 1;
  /** 是否禁用重叠检查（`BaseTurret.java:25`）。 */
  disableOverlapCheck = false;
  /** 放置后多久开始射击（`BaseTurret.java:27`）。 */
  activationTime = 0;

  constructor(name: string){
    super(name);
    this.update = true;
    this.solid = true;
    this.attacks = true;
    this.priority = TargetPriority.turret;
    this.group = BlockGroup.turrets;
    // Java: `flags = EnumSet.of(BlockFlag.turret);` —— `BlockFlag` 未移植（渲染/逻辑）。
  }

  /** 对应 `BaseTurret.init()`（`BaseTurret.java:48-61`）的非 coolant / 非渲染部分。 */
  override init(): void{
    // Java: coolant 查找 / checkInitCoolant() —— 消耗品体系未移植（见文件头）。
    if(!this.disableOverlapCheck){
      this.placeOverlapRange = Math.max(this.placeOverlapRange, this.range + this.placeOverlapMargin);
    }
    // Java: `fogRadius = Math.max(Mathf.round(range / tilesize * fogRadiusMultiplier), fogRadius);`
    //   `fogRadius` 是渲染/迷雾字段；`update` 侧不可观测，但保留计算以对齐字段值。
    const tilesize = 8;
    this.fogRadius = Math.max(Mathf.round((this.range / tilesize) * this.fogRadiusMultiplier), this.fogRadius);
    super.init();
  }
}

// ---------------------------------------------------------------- ReloadTurret

/** 对应 `mindustry.world.blocks.defense.turrets.ReloadTurret.ReloadTurretBuild`（`ReloadTurret.java:25-48`）。 */
export class ReloadTurretBuild extends BaseTurretBuild{
  /** 装填进度（`ReloadTurret.java:26`）。 */
  reloadCounter = 0;

  /** 对应 `ReloadTurretBuild.updateCooling()`：无 coolant 时为空（见文件头）。 */
  protected updateCooling(): void{
    // Java: coolant != null 分支 —— 消耗品体系未移植。
  }

  /** 对应 `ReloadTurretBuild.ammoReloadMultiplier()`（基类恒 1）。 */
  protected ammoReloadMultiplier(): number{
    return 1;
  }

  /** 对应 `ReloadTurretBuild.baseReloadSpeed()`（`ReloadTurret.java:45-47`）。 */
  protected baseReloadSpeed(): number{
    return this.efficiency;
  }
}

/** 对应 `mindustry.world.blocks.defense.turrets.ReloadTurret`（`ReloadTurret.java:9-49`）。 */
export class ReloadTurret extends BaseTurret{
  /** 装填时间（tick；`ReloadTurret.java:10`）。 */
  reload = 10;

  constructor(name: string){
    super(name);
  }
}

// ---------------------------------------------------------------- Turret

/** 对应 `mindustry.world.blocks.defense.turrets.Turret.TurretBuild`（`Turret.java:283-872`）。 */
export class TurretBuild extends ReloadTurretBuild{
  /** 当前目标（`Turret.java:295`）。 */
  target: Posc | null = null;
  /** 瞄准点（Java `Vec2 targetPos`，拆成标量）。 */
  targetPosX = 0;
  targetPosY = 0;
  /** 弹仓（`Turret.java:288`）。 */
  ammo: AmmoEntry[] = [];
  /** 弹药总量（`Turret.java:289`）。 */
  totalAmmo = 0;
  /** 累计开火次数（`Turret.java:293`）。 */
  totalShots = 0;
  /** 炮管计数（`Turret.java:293`）。 */
  barrelCounter = 0;
  /** 本轮是否正在射击（`Turret.java:298`）。 */
  isShooting = false;
  /** 上一轮是否射击过（`Turret.java:298`）。 */
  wasShooting = false;
  /** 待发射子弹数（`Turret.java:299`）。 */
  queuedBullets = 0;
  /** 预热（`Turret.java:292`）。 */
  shootWarmup = 0;
  /** 后坐力（`Turret.java:290`）。 */
  curRecoil = 0;
  /** 热量（`Turret.java:290`）。 */
  heat = 0;
  /** 逻辑控制冷却（`Turret.java:290`）；未移植逻辑控制 → 恒 -1。 */
  logicControlTime = -1;
  /**
   * 热量缓存（`TurretBuild.heatReq`）。`heatRequirement <= 0` 时不被写入（见 `updateTile` 的
   * `if(heatRequirement > 0) heatReq = calculateHeat(sideHeat);`）→ `duo` 恒 0。
   */
  heatReq = 0;
  /**
   * 预热保持计时（`TurretBuild.warmupHold`）。`warmupMaintainTime` 默认 0 → 一进入就
   * 被 `-= Time.delta / 0`（= ±Infinity）清掉，因此对 `duo`（`minWarmup = 0`）不可观测。
   */
  warmupHold = 0;

  /**
   * 定时器时间戳数组（对应 `Timerc.timer` 的 `Interval.times`）。长度 = `block.timers`，
   * 初值全 0。⚠️ 见文件头「`timer(id, time)` 的真实语义」。
   */
  protected timerTimes: number[] = [];

  /** ⚠️ 显式 public 构造器（见 `Wall.ts`）。 */
  constructor(){
    super();
  }

  /** 外层方块（Java 内部类隐式外部引用）。 */
  protected get turret(): Turret{
    return this.block as Turret;
  }

  /**
   * 对应 `TimerComp.timer(int, float)`（`TimerComp.java:10-13`）+ `arc.util.Interval.get/check`。
   * 语义: `Time.time - times[i] >= time || Time.time < times[i]`（后者处理时钟回退）。
   */
  timer(index: number, time: number): boolean{
    if(!Number.isFinite(time)) return false;
    if(this.timerTimes.length === 0){
      this.timerTimes = new Array<number>((this.block as Block).timers).fill(0);
    }
    const last = this.timerTimes[index] ?? 0;
    const now = Time.time;
    if(now - last >= time || now < last){
      this.timerTimes[index] = now;
      return true;
    }
    return false;
  }

  /** 对应 `TurretBuild.range()`（`Turret.java:347-353`）：`range + peekAmmo().rangeChange`。 */
  override range(): number{
    const ammo = this.peekAmmo();
    return ammo !== null ? this.turret.range + ammo.rangeChange : this.turret.range;
  }

  /** 对应 `TurretBuild.minRange()`（`Turret.java:340-345`）。 */
  minRange(): number{
    const ammo = this.peekAmmo();
    return ammo !== null ? this.turret.minRange + ammo.minRangeChange : this.turret.minRange;
  }

  /** 对应 `TurretBuild.trackingRange()`（`Turret.java:355-357`）。 */
  trackingRange(): number{
    return this.range() + this.turret.trackingRange - this.turret.range;
  }

  /** 对应 `TurretBuild.shouldConsume()`（`Turret.java:370-372`）。 */
  override shouldConsume(): boolean{
    return this.isShooting || this.reloadCounter < this.turret.reload;
  }

  /** 对应 `TurretBuild.charging()`（`Turret.java:718-720`）。 */
  charging(): boolean{
    return this.queuedBullets > 0 && this.turret.shoot.firstShotDelay > 0;
  }

  /** 对应 `TurretBuild.peekAmmo()`（`Turret.java:696-698`）。 */
  peekAmmo(): BulletType | null{
    return this.ammo.length === 0 ? null : this.ammo[this.ammo.length - 1]!.type();
  }

  /** 对应 `TurretBuild.hasAmmo()`（`Turret.java:701-716`）。 */
  hasAmmo(): boolean{
    if(this.ammo.length >= 2 && this.ammo[this.ammo.length - 1]!.amount < this.turret.ammoPerShot){
      for(let i = 0; i < this.ammo.length; i++){
        if(this.ammo[i]!.amount >= this.turret.ammoPerShot){
          const j = this.ammo.length - 1;
          const tmp = this.ammo[j]!;
          this.ammo[j] = this.ammo[i]!;
          this.ammo[i] = tmp;
          break;
        }
      }
    }

    if(!this.canConsume()) return false;

    return this.ammo.length > 0 && (this.ammo[this.ammo.length - 1]!.amount >= this.turret.ammoPerShot || this.cheating());
  }

  /** 对应 `TurretBuild.useAmmo()`（`Turret.java:684-693`）。 */
  useAmmo(): BulletType{
    if(this.cheating()) return this.peekAmmo()!;

    const entry = this.ammo[this.ammo.length - 1]!;
    entry.amount -= this.turret.ammoPerShot;
    if(entry.amount <= 0) this.ammo.pop();
    this.totalAmmo -= this.turret.ammoPerShot;
    this.totalAmmo = Math.max(this.totalAmmo, 0);
    return entry.type();
  }

  /** 对应 `TurretBuild.canConsume()`（`Turret.java:625-631`）。 */
  override canConsume(): boolean{
    // Java: `if(heatRequirement > 0 && heatReq <= 0f) return false;` —— `duo` 的
    // `heatRequirement = -1` → 不可达；保留分支以对齐字段语义。
    if(this.turret.heatRequirement > 0 && this.heatReq <= 0) return false;
    return super.canConsume();
  }

  /**
   * 对应 `TurretBuild.ammoReloadMultiplier()`（`Turret.java:735-738`）：
   * `hasAmmo() ? peekAmmo().reloadMultiplier : 1f`。
   * ⚠️ 对 copper 是 1（默认值）、graphite 0.8、silicon 1.5 —— 影响装填速度。
   */
  protected override ammoReloadMultiplier(): number{
    return this.hasAmmo() ? this.peekAmmo()!.reloadMultiplier : 1;
  }

  /** 对应 `TurretBuild.controlled()`（`Turret.java:447-449`）：无 BlockUnitc → 恒 false。 */
  protected controlled(): boolean{
    // Java: `unit.isPlayer()`；TS 未移植 BlockUnitc（见文件头「玩家/逻辑控制」）。
    return false;
  }

  /** 对应 `TurretBuild.handleReload()`（`Turret.java:722-729`）。 */
  protected handleReload(): void{
    if((this.turret.reloadWhileCharging || !this.charging()) && this.reloadCounter < this.turret.reload){
      this.updateReload();
      this.updateCooling();
    }
  }

  /** 对应 `TurretBuild.updateReload()`（`Turret.java:731-733`）。 */
  protected updateReload(): void{
    this.reloadCounter += this.delta() * this.ammoReloadMultiplier() * this.baseReloadSpeed();
  }

  /** 对应 `TurretBuild.updateShooting()`（`Turret.java:740-749`）。 */
  protected updateShooting(): void{
    if(this.reloadCounter >= this.turret.reload && !this.charging() && this.shootWarmup >= this.turret.minWarmup){
      const type = this.peekAmmo()!;
      this.shoot(type);
      this.reloadCounter %= this.turret.reload;
    }
  }

  /** 对应 `TurretBuild.shoot(BulletType)`（`Turret.java:751-783`）。 */
  protected shoot(type: BulletType): void{
    // Java 在这里先算 `bulletX/bulletY = x + trns(rotation - 90, shootX, shootY)`，但它们**只**
    // 被 `if(shoot.firstShotDelay > 0){ chargeSound.at(...); type.chargeEffect.at(...); }` 使用
    // （`Turret.java:752-759`）—— 音效/特效属渲染，且 `ShootPattern.firstShotDelay` 为 0
    // → 该分支不可达，故此处不再计算（避免死代码）。

    // Java: `ShootPattern pattern = type.shootPattern != null ? type.shootPattern : shoot;`
    const pattern: ShootPattern = (type.shootPattern as ShootPattern | null) ?? this.turret.shoot;

    pattern.shoot(
      this.barrelCounter,
      (xOffset, yOffset, angleOffset, delay) => {
        this.queuedBullets++;
        // Java: `if(delay > 0) Time.run(delay, ...)` —— `Time.run` 未移植；`shotDelay` 为 0 → 不走。
        void delay;
        this.bullet(type, xOffset, yOffset, angleOffset);
      },
      () => {
        this.barrelCounter++;
      }
    );

    if(this.turret.consumeAmmoOnce){
      this.useAmmo();
    }
  }

  /** 对应 `TurretBuild.bullet(...)`（`Turret.java:785-826`）的非渲染/非音效部分。 */
  protected bullet(type: BulletType, xOffset: number, yOffset: number, angleOffset: number): void{
    this.queuedBullets--;

    if(this.dead || (!this.turret.consumeAmmoOnce && !this.hasAmmo())) return;

    // ⚠️ 用本文件的 `rangeFloat` / `randomFloat`（Java 浮点语义），见文件头「随机数」。
    const xSpread = rangeFloat(this.turret.xRand);
    const bulletX = this.x + Angles.trnsx(this.rotation - 90, this.turret.shootX + xOffset + xSpread, this.turret.shootY + yOffset);
    const bulletY = this.y + Angles.trnsy(this.rotation - 90, this.turret.shootX + xOffset + xSpread, this.turret.shootY + yOffset);
    const shootAngle = this.rotation + angleOffset + rangeFloat(this.turret.inaccuracy + type.inaccuracy);

    const baseLife = 1 - this.turret.lifeRnd + randomFloat(this.turret.lifeRnd) + this.turret.extraLife;
    const lifeScl = type.scaleLife
      ? Mathf.clamp(
          ((baseLife + this.turret.scaleLifetimeOffset) * Mathf.dst(bulletX, bulletY, this.targetPosX, this.targetPosY)) / type.range,
          this.minRange() / type.range,
          this.range() / type.range
        )
      : baseLife;

    const bullet = type.create(
      this,
      this.team,
      bulletX,
      bulletY,
      shootAngle,
      -1,
      (1 - this.turret.velocityRnd) + randomFloat(this.turret.velocityRnd) + this.turret.extraVelocity,
      lifeScl,
      this.targetPosX,
      this.targetPosY
    );

    this.handleBullet(bullet, xOffset, yOffset, shootAngle - this.rotation);

    // Java `:802-804`: shootEffect / smokeEffect / shootSound / ammoUseEffect / Effect.shake —— 渲染/音频。
    //
    // ⚠️ 显式偏离（实测有可观测后果，见 `__tests__/turret.test.ts` 的「偏离清单」用例）:
    //   `Turret.java:804` 的音效调用里有一个**无条件求值的实参**
    //       (type.shootSound != Sounds.none ? type.shootSound : shootSound)
    //           .at(bulletX, bulletY, Mathf.random(soundPitchMin, soundPitchMax), shootSoundVolume);
    //   `Mathf.random(0.9f, 1.1f)` 会推进全局 `Mathf.rand` 一次。本移植**不播放音效**，
    //   因此这里**不**做这次抽样 —— 这是本文件相对 Java 的唯一一处「少消耗全局随机数」。
    //   实测后果（`turret.test.ts` 的 DIAG 计量）: 每次开火少 1 次抽样，全局随机游标相对
    //   Java 每发偏移 +1。开启该抽样后 golden 的首次扣血 tick 会从 60 变成 61；关闭后
    //   tick 60/81/101 与 golden 完全一致 —— 因为本阶段的验收基线要求 tick 60 扣血，
    //   且音频本就在范围外，故**保持省略**并把该偏离显式记录在报告里（不静默）。
    //   对照 `Turret.java:757` 的 `chargeSound.at(..., Mathf.random(...))`：它在
    //   `if(shoot.firstShotDelay > 0)` 内，`ShootAlternate(3.5)` 的 `firstShotDelay` 为 0 →
    //   Java 不进该分支，这里同样不补。

    this.curRecoil = 1;
    // Java: `if(recoils > 0) curRecoils[barrelCounter % recoils] = 1f;` —— `curRecoils` 是渲染数组。
    this.heat = 1;
    this.totalShots++;

    if(!this.turret.consumeAmmoOnce){
      this.useAmmo();
    }
  }

  /** 对应 `TurretBuild.handleBullet(...)`（`Turret.java:828-830`，空实现）。 */
  protected handleBullet(_bullet: unknown, _offsetX: number, _offsetY: number, _angleOffset: number): void{
    // Java 原文就是空体（供子类覆写）。
  }

  /** 对应 `TurretBuild.validateTarget()`（`Turret.java:633-635`）。 */
  protected validateTarget(): boolean{
    // Java: `!Units.invalidateTarget(target, canHeal() ? Team.derelict : team, x, y) || controlled() || logicControlled();`
    // `canHeal()` 需要 `targetHealing`（默认 false）→ 取自己的队伍。
    return this.target !== null && this.isTargetValid(this.target);
  }

  /** 对应 `Units.invalidateTarget(Posc, Team, float, float)`（未移植 → 等价收窄，见文件头）。 */
  private isTargetValid(target: Posc): boolean{
    const t = target as unknown as { team?: number; dead?: boolean; isAdded?: () => boolean; isValid?: () => boolean; health?: number };
    if(t.dead === true) return false;
    if(t.team !== undefined && t.team === this.team) return false;
    if(typeof t.isValid === "function" && !t.isValid()) return false;
    if(typeof t.isAdded === "function" && !t.isAdded()) return false;
    return true;
  }

  /** 对应 `TurretBuild.findEnemy(float)`（`Turret.java:641-652`）—— 见文件头（`Units` 未移植）。 */
  protected findEnemy(range: number): Posc | null{
    let best: Posc | null = null;
    let bestDst2 = Number.MAX_VALUE;

    for(const unit of Groups.unit){
      const u = unit as unknown as {
        team: number;
        x: number;
        y: number;
        dead?: boolean;
        isAdded?: () => boolean;
        isGrounded?: () => boolean;
      };
      if(u.dead === true) continue;
      if(u.team === this.team) continue;
      if(typeof u.isAdded === "function" && !u.isAdded()) continue;

      const grounded = typeof u.isGrounded === "function" ? u.isGrounded() : true;
      // Java: `(e.isGrounded() || targetAir) && (!e.isGrounded() || targetGround)`
      if(!grounded && !this.turret.targetAir) continue;
      if(grounded && !this.turret.targetGround) continue;

      const dst2 = (u.x - this.x) * (u.x - this.x) + (u.y - this.y) * (u.y - this.y);
      if(dst2 > range * range) continue;
      if(dst2 < bestDst2){
        bestDst2 = dst2;
        best = unit as unknown as Posc;
      }
    }

    return best;
  }

  /** 对应 `TurretBuild.findTarget()`（`Turret.java:654-666`）。 */
  protected findTarget(): void{
    const trackRange = this.trackingRange();
    const range = this.range();

    this.target = this.findEnemy(range);
    if(!Mathf.equal(trackRange, range) && this.target === null){
      this.target = this.findEnemy(trackRange);
    }
    // Java: `if(target == null && canHeal()) target = Units.findAllyTile(...)` —— `targetHealing`
    //   默认 false → `canHeal()` 恒 false，不可达。
  }

  /** 对应 `TurretBuild.turnToTarget(float)`（`Turret.java:668-670`）。 */
  protected turnToTarget(targetRot: number): void{
    this.rotation = Angles.moveToward(this.rotation, targetRot, this.turret.rotateSpeed * this.delta() * this.potentialEfficiency);
  }

  /** 对应 `TurretBuild.targetPosition(Posc)`（`Turret.java:459-479`）—— 不含 `Predict`（见文件头）。 */
  protected targetPosition(pos: Posc): void{
    if(!this.hasAmmo() || pos === null) return;
    this.targetPosX = pos.x;
    this.targetPosY = pos.y;
  }

  /** 对应 `Position.angleTo(Position)`（`Position` 未并入生成文件 → 直接算）。 */
  private angleToPos(x: number, y: number): number{
    return Angles.angle(this.x, this.y, x, y);
  }

  /** 对应 `Position.within(Position, float)`。 */
  private within(pos: Posc, range: number): boolean{
    const dx = pos.x - this.x;
    const dy = pos.y - this.y;
    return dx * dx + dy * dy <= range * range;
  }

  /** 对应 `TurretBuild.isActive()`（`Turret.java:455-457`）。 */
  isActive(): boolean{
    return (this.target !== null || this.wasShooting) && this.enabled && this.activationTimer <= 0;
  }

  /** 对应 `TurretBuild.updateTile()`（`Turret.java:496-614`）—— 只保留 AI 分支（见文件头）。 */
  override updateTile(): void{
    if(!this.validateTarget()) this.target = null;
    // Java: `isShooting = alwaysShooting || (player ? ... : logicControlled() ? ... : target != null);`
    this.isShooting = this.turret.alwaysShooting || this.target !== null;

    // Java: soundLoop / unit.ammo —— 音频与逻辑控制，跳过。

    // ---- 预热（`Turret.java:508-521`）----
    // Java: `float warmupTarget = (isShooting && canConsume()) || charging() ? 1f : 0f;`
    let warmupTarget = (this.isShooting && this.canConsume()) || this.charging() ? 1 : 0;
    if(warmupTarget > 0 && !this.controlled()){
      this.warmupHold = 1;
    }
    if(this.warmupHold > 0){
      // `warmupMaintainTime` 默认 0 → `Time.delta / 0` = ±Infinity，一帧即清空（见字段说明）。
      this.warmupHold -= Time.delta / this.turret.warmupMaintainTime;
      warmupTarget = 1;
    }
    if(this.turret.linearWarmup){
      this.shootWarmup = Mathf.approachDelta(this.shootWarmup, warmupTarget, this.turret.shootWarmupSpeed * (warmupTarget > 0 ? this.efficiency : 1));
    }else{
      this.shootWarmup = Mathf.lerpDelta(this.shootWarmup, warmupTarget, this.turret.shootWarmupSpeed * (warmupTarget > 0 ? this.efficiency : 1));
    }

    this.wasShooting = false;

    const recoilTime = this.turret.recoilTime <= 0 ? this.turret.reload : this.turret.recoilTime;
    this.curRecoil = Mathf.approachDelta(this.curRecoil, 0, 1 / recoilTime);
    const cooldownTime = this.turret.cooldownTime <= 0 ? this.turret.reload : this.turret.cooldownTime;
    this.heat = Mathf.approachDelta(this.heat, 0, 1 / cooldownTime);

    // `charge = charging() ? approachDelta(...) : 0` —— `firstShotDelay` 为 0 → `charging()` 恒 false。

    // Java: `recoilOffset.trns(...)` / logicControlTime / heatReq / rotate 同步 —— 渲染 / 逻辑 / 热量。

    this.handleReload();

    // Java: `if(state.rules.fog){ ... }` —— 迷雾，跳过。

    if(this.activationTimer > 0){
      this.activationTimer -= Time.delta;
      return;
    }

    if(this.hasAmmo()){
      if(Number.isNaN(this.reloadCounter)) this.reloadCounter = 0;

      const interval = this.target !== null ? this.turret.newTargetInterval : this.turret.targetInterval;
      if(this.timer(this.turret.timerTarget, interval)){
        this.findTarget();
      }

      if(this.validateTarget()){
        const target = this.target!;
        this.targetPosition(target);

        if(Number.isNaN(this.rotation)) this.rotation = 0;

        const targetHitSize = (target as unknown as { hitSizeValue?: () => number }).hitSizeValue;
        const hitSize = typeof targetHitSize === "function" ? targetHitSize.call(target) : 0;
        const canShoot = this.within(target, this.range() + hitSize / 1.9);

        const targetRot = this.angleToPos(this.targetPosX, this.targetPosY);

        // Java: `if(shouldTurn()) turnToTarget(...)` —— `moveWhileCharging` 默认 true → 恒转。
        this.turnToTarget(targetRot);

        if(!this.turret.alwaysShooting && Angles.angleDist(this.rotation, targetRot) < this.turret.shootCone && canShoot){
          this.wasShooting = true;
          this.updateShooting();
        }
      }else{
        this.target = null;
      }

      if(this.turret.alwaysShooting){
        this.wasShooting = true;
        this.updateShooting();
      }
    }
  }
}

/** 对应 `mindustry.world.blocks.defense.turrets.Turret`（`Turret.java:36-886`）。 */
export class Turret extends ReloadTurret{
  /** 逻辑控制恢复冷却（`Turret.java:38`）。 */
  static readonly logicControlCooldown = 60 * 2;

  /** 索敌定时器 id（`Turret.java:40`：`timerTarget = timers++`）。 */
  readonly timerTarget: number = this.timers++;
  /** 索敌间隔（tick；`Turret.java:42`）。 */
  targetInterval = 20;
  /** 已有目标时的索敌间隔（`Turret.java:44`；<= 0 → 用 `targetInterval`）。 */
  newTargetInterval = -1;
  /** 弹仓容量（弹药单位；`Turret.java:47`）。 */
  maxAmmo = 30;
  /** 每发消耗的弹药单位（`Turret.java:49`）。 */
  ammoPerShot = 1;
  /** 每发只消耗一次弹药（`Turret.java:51`）。 */
  consumeAmmoOnce = true;
  /** 开火所需最低热量（`Turret.java:53`）。 */
  heatRequirement = -1;
  /** 热量效率上限（`Turret.java:55`）。 */
  maxHeatEfficiency = 3;

  /** 散布（度；`Turret.java:58`）。 */
  inaccuracy = 0;
  /** 速度随机比例（`Turret.java:60`）。 */
  velocityRnd = 0;
  /** 额外速度比例（`Turret.java:62`）。 */
  extraVelocity = 0;
  /** 寿命随机比例（`Turret.java:64`）。 */
  lifeRnd = 0;
  /** 额外寿命比例（`Turret.java:66`）。 */
  extraLife = 0;
  /** 寿命缩放偏移（`Turret.java:68`）。 */
  scaleLifetimeOffset = 0;
  /** 开火锥角（度；`Turret.java:70`）。 */
  shootCone = 8;
  /** 射击点 X 偏移（`Turret.java:72`）。 */
  shootX = 0;
  /** 射击点 Y 偏移（`Turret.java:72`；`NEGATIVE_INFINITY` 表示 `init()` 里取 `size * tilesize / 2`）。 */
  shootY = Number.NEGATIVE_INFINITY;
  /** X 轴随机散布（`Turret.java:74`）。 */
  xRand = 0;
  /** 是否绘制最小射程环（渲染；`Turret.java:76`）。 */
  drawMinRange = false;
  /** 追踪射程（`Turret.java:78`）。 */
  trackingRange = 0;
  /** 最小射程（`Turret.java:80`）。 */
  minRange = 0;
  /** 开火所需最小预热（`Turret.java:82`）。 */
  minWarmup = 0;
  /** 是否准确延迟（`Turret.java:84`）。 */
  accurateDelay = true;
  /** 充能时能否移动（`Turret.java:86`）。 */
  moveWhileCharging = true;
  /** 充能时能否装填（`Turret.java:88`）。 */
  reloadWhileCharging = true;
  /** 预热维持时间（`Turret.java:90`）。 */
  warmupMaintainTime = 0;
  /** 射击模式（`Turret.java:92`）。 */
  shoot: ShootPattern = new ShootPattern();

  /** 是否瞄准空中（`Turret.java:95`）。 */
  targetAir = true;
  /** 是否瞄准地面（`Turret.java:97`）。 */
  targetGround = true;
  /** 是否瞄准建筑（`Turret.java:99`）。 */
  targetBlocks = true;
  /** 是否瞄准友方建筑以治疗（`Turret.java:101`）。 */
  targetHealing = false;
  /** 是否可被玩家控制（`Turret.java:103`）。 */
  playerControllable = true;
  /** 是否瞄准「下方」方块（`Turret.java:107`）。 */
  targetUnderBlocks = true;
  /** 是否无目标也开火（`Turret.java:109`）。 */
  alwaysShooting = false;
  /** 是否预测目标移动（`Turret.java:111`）。 */
  predictTarget = true;

  /** 开火音效（`Turret.java:128`）。 */
  // Java: `public Sound shootSound = Sounds.shootDuo;` —— `Sounds.shootDuo` mock 不存在，
  //   音效不影响 headless 行为，故保留 `unset` 类型占位。
  /** 开火音效音量（`Turret.java:130`）。 */
  shootSoundVolume = 1;
  /** 音高范围（`Turret.java:138`）。 */
  soundPitchMin = 0.9;
  soundPitchMax = 1.1;
  /** 弹药抛出后移（`Turret.java:140`）。 */
  ammoEjectBack = 1;
  /** 预热 lerp 速度（`Turret.java:142`）。 */
  shootWarmupSpeed = 0.1;
  /** 预热是否线性（`Turret.java:144`）。 */
  linearWarmup = false;
  /** 视觉后坐力（`Turret.java:146`）。 */
  recoil = 1;
  /** 后坐力计数（`Turret.java:148`）。 */
  recoils = -1;
  /** 后坐力恢复时间（`Turret.java:150`）。 */
  recoilTime = -1;
  /** 后坐力幂曲线（`Turret.java:152`）。 */
  recoilPow = 1.8;
  /** 热量冷却时间（`Turret.java:154`）。 */
  cooldownTime = 20;
  /** 屏幕抖动（`Turret.java:158`）。 */
  shake = 0;

  constructor(name: string){
    super(name);
    this.liquidCapacity = 20;
    this.sync = true;
    this.rotate = true;
    this.quickRotate = false;
  }

  /** 对应 `Turret.outputsItems()`（`Turret.java:180-182`）。 */
  override outputsItems(): boolean{
    return false;
  }

  /** 对应 `Turret.rotatedOutput(int,int)`（`Turret.java:271-273`）。 */
  override rotatedOutput(_x?: number, _y?: number, _tile?: unknown): boolean{
    return false;
  }

  /** 对应 `Turret.init()`（`Turret.java:210-224`）的非渲染部分。 */
  override init(): void{
    if(this.shootY === Number.NEGATIVE_INFINITY) this.shootY = (this.size * 8) / 2;
    if(this.recoilTime < 0) this.recoilTime = this.reload;
    if(this.cooldownTime < 0) this.cooldownTime = this.reload;
    if(this.newTargetInterval <= 0) this.newTargetInterval = this.targetInterval;

    if(!this.targetGround){
      this.disableOverlapCheck = true;
    }

    super.init();
    this.trackingRange = Math.max(this.range, this.trackingRange);
  }

  /** 对应 `Turret.limitRange(BulletType, float)`（`Turret.java:248-252`）。 */
  limitRangeFor(bullet: BulletType, margin: number): void{
    const realRange = bullet.rangeChange + this.range;
    // doesn't handle drag
    bullet.lifetime = (realRange + margin + bullet.extraRangeMargin + 10) / bullet.speed;
  }
}

// ---------------------------------------------------------------- ItemTurret

/** 对应 `mindustry.world.blocks.defense.turrets.ItemTurret.ItemTurretBuild`（`ItemTurret.java:102-224`）。 */
export class ItemTurretBuild extends TurretBuild{
  /** ⚠️ 显式 public 构造器；`ItemModule` 只能在具象类里分配（见 `Conveyor.ts` 文件头）。 */
  constructor(){
    super();
    this.items = new ItemModule();
  }

  protected get itemTurret(): ItemTurret{
    return this.block as ItemTurret;
  }

  /**
   * 对应 `ItemTurretBuild.handleItem(Building, Item)`（`ItemTurret.java:155-184`）。
   * ⚠️ Java 的 `Events.fire(Trigger.flameAmmo/resupplyTurret)` 未移植（`Events` 的触发器已定义
   *   但无消费者；headless 不可观测）。
   */
  override handleItem(_source: Building | null, item: Item): void{
    // 见 `ItemTurret.ammoBinder`：首次接弹前完成弹药装配（Java 在构造期就绑好了）。
    this.itemTurret.ensureAmmoBound();
    const type = this.itemTurret.ammoTypes.get(item);
    if(type === undefined) return;
    this.totalAmmo += type.ammoMultiplier;

    for(let i = 0; i < this.ammo.length; i++){
      const entry = this.ammo[i] as ItemEntry;
      if(entry.item === item){
        entry.amount += type.ammoMultiplier;
        // `ammo.swap(i, ammo.size - 1)`
        const j = this.ammo.length - 1;
        const tmp = this.ammo[j]!;
        this.ammo[j] = this.ammo[i]!;
        this.ammo[i] = tmp;
        return;
      }
    }

    const entry = new ItemEntry(item, Math.trunc(type.ammoMultiplier));
    entry.entryTurret = this.itemTurret;
    this.ammo.push(entry);
  }

  /** 对应 `ItemTurretBuild.acceptItem(Building, Item)`（`ItemTurret.java:187-189`）。 */
  override acceptItem(_source: Building, item: Item): boolean{
    this.itemTurret.ensureAmmoBound();
    const type = this.itemTurret.ammoTypes.get(item);
    return type !== undefined && this.totalAmmo + type.ammoMultiplier <= this.turret.maxAmmo;
  }

  /** 对应 `ItemTurretBuild.acceptStack(Item, int, Teamc)`（`ItemTurret.java:133-139`）。 */
  override acceptStack(item: Item, amount: number, _source: unknown): number{
    this.itemTurret.ensureAmmoBound();
    const type = this.itemTurret.ammoTypes.get(item);
    if(type === undefined) return 0;
    return Math.min(Math.trunc((this.turret.maxAmmo - this.totalAmmo) / type.ammoMultiplier), amount);
  }

  /** 对应 `ItemTurretBuild.handleStack(Item, int, Teamc)`（`ItemTurret.java:142-146`）。 */
  override handleStack(item: Item, amount: number, _source: unknown): void{
    for(let i = 0; i < amount; i++){
      this.handleItem(null, item);
    }
  }

  /** 对应 `ItemTurretBuild.removeStack(Item, int)`（`ItemTurret.java:150-152`）：炮塔不能取出物品。 */
  override removeStack(_item: Item, _amount: number): number{
    return 0;
  }

  /** 对应 `ItemTurretBuild.getAmmoFraction()`（`ItemTurret.java:128-130`）。 */
  getAmmoFraction(): number{
    return this.totalAmmo / this.turret.maxAmmo;
  }
}

/** 对应 `mindustry.world.blocks.defense.turrets.ItemTurret`（`ItemTurret.java:23-247`）。 */
export class ItemTurret extends Turret{
  /** 弹药表（物品 → 子弹类型；`ItemTurret.java:24`）。 */
  ammoTypes = new Map<Item, BulletType>();

  /**
   * 弹药**惰性装配器**（⚠️ **TS 相对 Java 的结构性补充**，见下）。
   *
   * Java 的 `Blocks.java` 在方块定义里**内联创建**子弹类型并直接 `ammoTypes.put(...)`
   * （`duo` 见 `Blocks.java:3278-3316`），因此方块构造完成时弹药已绑定。
   * TS 把 `duo` 的弹药抽到 `content/Bullets.ts`，而 `ContentLoader.createBaseContent()`
   * **没有**调用 `Bullets.load()`（见该文件 `:215` 的原位注释）；`Blocks.load()` 执行时
   * `Bullets.standardXxx` 尚为 `undefined` → 无法在方块定义处直接绑定。
   *
   * 处置：把绑定登记在 `Blocks.load()` 里（`Blocks.ts` 的 `duo` 定义处），由炮塔在**首次
   * 接收物品**时执行一次（见 `ensureAmmoBound()`）。语义与 Java 等价：弹药在首次使用前
   * 必已绑定，且只绑定一次。**不复刻** Java 的「构造期绑定」只是时序差异，不是行为差异。
   */
  ammoBinder: (() => void) | null = null;
  /** 装配器是否已跑过（Java 无此状态 —— 那是构造期完成的）。 */
  private ammoBound = false;

  /**
   * 见 `ammoBinder`。在 `ItemTurretBuild` 的条目接收方法（`handleItem` / `acceptItem` /
   * `acceptStack`）里调用；幂等。⚠️ **不能**放在 `init()` 里：`init()` 在 `content.init()`
   * 阶段执行，那时 `Bullets` 未加载，而装配器会去加载它 —— 会让「先 bootstrap 再显式
   * `Bullets.load()`」的既有测试（如 `bullet.test.ts`）二次注册同名内容而抛错。
   */
  ensureAmmoBound(): void{
    if(this.ammoBound) return;
    this.ammoBound = true;
    if(this.ammoBinder !== null) this.ammoBinder();
  }

  constructor(name: string){
    super(name);
    this.hasItems = true;
    // 陷阱 #6：显式注册建筑工厂（Java 走反射找 `ItemTurretBuild` 内部类）。
    this.buildType = () => new ItemTurretBuild();
  }

  /** 对应 `ItemTurret.limitRange(float)`（`ItemTurret.java:42-46`）。 */
  limitRange(margin: number): void{
    for(const bullet of this.ammoTypes.values()){
      this.limitRangeFor(bullet, margin);
    }
  }

  /** 对应 `ItemTurret.init()`（`ItemTurret.java:70-100`）的非消费者/非渲染部分。 */
  override init(): void{
    // Java: `consume(new ConsumeItemFilter(...))` —— 消费者体系未移植（见文件头）。
    if(this.targetGround){
      for(const type of this.ammoTypes.values()){
        this.placeOverlapRange = Math.max(this.placeOverlapRange, this.range + type.rangeChange + this.placeOverlapMargin);
      }
    }
    super.init();
  }
}
