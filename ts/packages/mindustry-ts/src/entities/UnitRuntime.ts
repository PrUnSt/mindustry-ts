// 源: core/src/mindustry/entities/comp/UnitComp.java (1007 行) + VelComp.java + HitboxComp.java
//
// 为什么是**手写具象类**而不是 codegen 产物:
//   `UnitComp.def.ts` 标了 `@Component({ base: true })`，codegen 只发射**抽象基类**
//   `gen/Unit.ts`（字段 + `abstract` 方法声明，无方法体）。因此 `gen/Unit.ts` 不能 `new`，
//   也不能直接进 `Groups.unit`（其类型参数是抽象基类 `Unit`）。Java 侧的合并实体
//   `mindustry.gen.Unit` 由注解处理器 round 2 生成；TS 侧对应的**具象运行时**就是本文件。
//   先例见 `entities/BulletRuntime.ts`（S1）与 `world/blocks/distribution/Conveyor.ts`。
//
// ⚠️ 为什么行为必须写在这里: `.def.ts` 的方法体不能引用 arc-ts / mindustry 的类型
//   （codegen 只自动 import「组件接口名 / `Groups` / 基类名」），所以一切需要 `Time.delta`
//   的行为（位移 / `lastPosition` 刷新）只能落在具象子类里。见 `EntityComp.def.ts` 顶部。
//
// ⚠️ 逐 tick `update()` 由谁驱动（`Groups.unit` 的 `update` 标志是 **false**）:
//   Java 的驱动点是 `Logic.updateEntities()`（`Logic.java:495` 附近）里的**显式**调用
//   `Groups.unit.update();`。Java 的 `EntityGroup.update()` 只更新 `update = true` 的组
//   （`all` / `build`），而 `GroupDefs.java:7` 把 `Unitc` 排除出 `all` —— 所以**单位既不在
//   `Groups.all` 里，也不由 `Groups.update()` 更新**。TS 侧 `gen/Groups.ts` 的
//   `Groups.update()` 不含 `Groups.unit.update()`；`core/Logic.ts` 也原样沿用了这个省略
//   （`Logic.ts` 不在本阶段允许改动的文件范围内）→ 本文件导出 `updateUnits()` 作为该缺失
//   调用点的等价物（一行 `Groups.unit.update()`），测试直接调用它。见交付报告「遗留风险」。
//
// 移植范围（S2 · 单位子系统，**非** AI/寻路/渲染）:
//   - 组记账: `add()` / `remove()`（合并实体的 `EntityComp.add/remove` + `Group.addIndex`）。
//   - `setType(UnitType)`（`UnitComp.java:541-560`）的**纯数据部分**：`maxHealth` / `drag` /
//     `hitSize`。⚠️ Java 也设 `armor`（`UnitComp.java:545`），但冻结的组件集
//     （`UnitComp.def.ts`）**没有** `armor` 字段 → 省略（见下「未移植」）。
//   - 位移: `VelComp.update()`（`VelComp.java:21-34`，`@MethodPriority(-1)` —— 最先执行）
//     —— 逐 tick `move(vel × Time.delta)` + `max(1 - drag × Time.delta, 0)` 衰减。
//   - `HitboxComp.updateLastPosition()`（`HitboxComp.java:41-46`）。⚠️ Java 里它由
//     `EntityCollisions.collide(EntityGroup)` 每帧统一调用（`EntityCollisions.java:126`），
//     而 TS 的 `EntityCollisions` 是空实现（`EntityCollisions.ts:29-31`，且不在本阶段允许
//     改动的文件范围内）→ 改在本文件的 `update()` 里调用（与任务要求一致）。
//   - 生命/伤害闭环: `kill()` / `damage()` / `heal()` / `dead`（逐字照抄 `HealthComp.def.ts`
//     的冻结实现，语义与 `HealthComp.java` 一致）。
//   - 位置/速度/距离系列、`isAdded()` / `cheating()` / `inFogTo()` / `isValid()`。
//   - `checkTarget` / `isGrounded` / `isFlying`（`UnitComp.java:76-86`）、`speed()`
//     （`UnitComp.java:190-194` 的**收窄版**，见方法注释）。
//
// ⚠️ 与 Java 的**两处有意简化**（本阶段可观测行为，已尽量小）:
//   1. **`rotation` 由速度方向推导**（`update()` 末尾）。Java 的单位 `rotation` 由控制器/AI
//      写入（`UnitController.update` / `UnitComp.rotateMove`），本阶段**不做 AI**，若完全照抄
//      则 `rotation` 恒为 0、无任何可测行为。故这里用与子弹相同的判据（`Mathf.angle(velX, velY)`，
//      仅当速度非零）同步 `rotation`。接回 AI 后应删除这段（届时由 AI 主导朝向）。
//   2. **`solidity()` 恒 `null`**（不做固体检测）。Java 的地面单位有 `SolidPred`
//      （`EntityCollisions.java` 的 `solid` / `legsSolid`），依赖 `World` / `Tile`（未移植）
//      → 本阶段恒 `null`，`move()` 直接 `x += cx; y += cy;`（与 `VelComp.java:70-73` 同）。
//
// 未移植（逐条标注）:
//   - 单位 AI / 控制器 / 指令 / 姿态（`UnitController` / `UnitCommand` / `UnitStance`）——
//     后续阶段（波次/单位 AI）。`controller` / `aiController` 字段不移植。
//   - 寻路（`movePref` / `isPathImpassable` / `pathfinder`）—— 依赖 `World` / `Pathfinder`。
//   - `mounts` / `Weaponsc`（武器挂载与开火）—— 炮塔/开火是后续 agent 的活。
//   - 边界约束（`UnitComp.java:673-715` 的 `world.unitWidth()` / `state.rules.limitMapArea`）
//     —— 依赖 `World` / `GameState` 规则项。
//   - 溺水 / 地形速度倍率 / 踩踏 / 载荷 / 护盾 / 状态效果 —— 依赖 `Floor` / `Tile` /
//     `Statusc` / `Shieldc` / `Payloadc`（均未并入冻结组件集）。
//   - `armor`（`UnitComp.java:545` 的 `armor`）—— 冻结组件集无此字段；`UnitType.armor`
//     作为**纯数据**保留在 `type/UnitType.ts`（golden 对拍用）。
//   - `afterRead` / `read` / `write` / `serialize` —— 存档与网络 IO（S6）。
//   - `draw()` —— 渲染（计划 §9）。

import { Mathf, Time } from "@mindustry-ts/arc";
import { Unit as UnitBase } from "../gen/Unit.js";
import { Groups } from "../gen/Groups.js";
import type { Posc } from "../gen/Posc.js";
import type { UnitType } from "../type/UnitType.js";

/**
 * 推进 `Groups.unit` 一帧。等价 Java `Logic.updateEntities()` 里的 `Groups.unit.update()`
 * （见文件头关于「谁驱动 update」的说明）。
 */
export function updateUnits(): void{
  Groups.unit.update();
}

/** 对应 `mindustry.gen.Unit`（手写具象类，见文件头）。 */
export class UnitRuntime extends UnitBase{
  /**
   * 本单位的类型。Java `UnitComp.type`（`UnitComp.java:53`，默认 `UnitTypes.alpha`）。
   * ⚠️ codegen 不移植引用类型字段（见 `UnitComp.def.ts` 的分类说明），故由本类持有；
   * 默认 null（Java 默认是 `UnitTypes.alpha`，但本阶段单位类型需显式 `setType`）。
   */
  type: UnitType | null = null;

  /** `Groups.unit` 的索引（与 `BulletRuntime.index__bullet` 同型记账）。 */
  private index__unit = -1;

  /** 对应 codegen 合并实体的 `static create()`（Java `Pools.obtain(Unit.class, …)`）。 */
  static create(): UnitRuntime{
    return new UnitRuntime();
  }

  /**
   * 对应 `UnitComp.setType(UnitType)`（`UnitComp.java:541-560`）的**纯数据部分**。
   * ⚠️ Java 同处还设 `armor = type.armor`（`:545`）与武器挂载（`:548`），前者容器无
   * `armor` 字段、后者属开火阶段 → 均省略（见文件头「未移植」）。
   */
  setType(type: UnitType): void{
    this.type = type;
    this.maxHealth = type.health;
    this.drag = type.drag;
    this.hitSize = type.hitSize;
  }

  // ---------------------------------------------------------------- Entityc / Posc / Teamc

  /** 对应 `EntityComp.isAdded()`（`EntityComp.java:16-18`）。 */
  isAdded(): boolean{
    return this.added;
  }

  /**
   * 对应合并实体的 `add()`：`HitboxComp.add()`（刷新 lastPosition，`HitboxComp.java:23-25`）
   * + `EntityComp.add()`（`added = true`）+ `Groups.unit.addIndex(this)` 的组记账。
   * ⚠️ Java `UnitComp.add()`（`:601-612`）里的队伍计数/单位上限/物理注册均未移植（见文件头）。
   */
  add(): void{
    if(this.added) return;
    this.updateLastPosition();
    this.index__unit = Groups.unit.addIndex(this);
    this.added = true;
  }

  /** codegen 合并实体的组索引 setter（`Groups.unit` 的 indexer 会调用）。 */
  setIndex__unit(index: number): void{
    this.index__unit = index;
  }

  /**
   * 对应 `EntityComp.remove()` + `UnitComp.remove()`（`UnitComp.java:615-623`）的组记账部分：
   * 摘出 `Groups.unit` → `added = false`。`Groups.isClearing` 时提前返回（与 Java 一致）。
   */
  remove(): void{
    if(this.added){
      Groups.unit.removeIndex(this, this.index__unit);
      this.index__unit = -1;
      this.added = false;
    }
    if(Groups.isClearing) return;
  }

  /** 对应 `PosComp.set(float, float)`（`PosComp.java:18-21`）。 */
  set(x: number, y: number): void{
    this.x = x;
    this.y = y;
  }

  /** 对应 `PosComp.trns(float, float)`（`PosComp.java:27-29`）。 */
  trns(x: number, y: number): void{
    this.x += x;
    this.y += y;
  }

  /** 对应 `PosComp.dst(Position)`（`PosComp.java`）。 */
  dst(other: Posc): number{
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** 对应 `TeamComp.cheating()`（TS 侧与 `TeamComp.def.ts` 的冻结实现一致：derelict 即 id 0）。 */
  cheating(): boolean{
    return this.team === 0;
  }

  /** 对应 `TeamComp.inFogTo(Team)`（TS 侧与 `TeamComp.def.ts` 的冻结实现一致）。 */
  inFogTo(viewer: number): boolean{
    return this.team !== viewer && this.x > 0;
  }

  // ---------------------------------------------------------------- Healthc

  /** 对应 `HealthComp.isValid()`（`HealthComp.java`）。 */
  isValid(): boolean{
    return !this.dead && this.isAdded();
  }

  /** 对应 `HealthComp.healthf()`。 */
  healthf(): number{
    return this.health / this.maxHealth;
  }

  /** 对应 `HealthComp.killed()`：基类空实现（Java `UnitComp.killed()` 的存档/特效部分未移植）。 */
  killed(): void{ }

  /** 对应 `HealthComp.kill()`（`HealthComp.java:33-45`）。 */
  kill(): void{
    if(this.dead) return;

    this.health = Math.min(this.health, 0);
    this.dead = true;
    this.killed();
    this.remove();
  }

  /** 对应 `HealthComp.heal(float)`（`HealthComp.java:85-88` 的直接治疗分支）。 */
  heal(amount: number): void{
    this.health += amount;
    this.clampHealth();
  }

  /** 对应 `HealthComp.damaged()`。 */
  damaged(): boolean{
    return this.health < this.maxHealth - 0.001;
  }

  /**
   * 对应 `HealthComp.damage(float, boolean)`。⚠️ TS 的 `Healthc.damage` 是 2 参（codegen 去掉了
   * 默认参数，见 `HealthComp.def.ts`）→ 调用点必须显式传 `withEffect`。
   */
  damage(amount: number, withEffect: boolean): void{
    if(Number.isNaN(this.health)) this.health = 0;

    const pre = this.hitTime;
    this.health -= amount;
    this.hitTime = 1;
    if(!withEffect) this.hitTime = pre;

    if(this.health <= 0 && !this.dead){
      this.kill();
    }
  }

  /** 对应 `HealthComp.clampHealth()`。 */
  clampHealth(): void{
    this.health = Math.min(this.health, this.maxHealth);
    if(Number.isNaN(this.health)) this.health = 0;
  }

  // ---------------------------------------------------------------- Hitboxc

  /** 对应 `HitboxComp.hitSize()`（因与字段同名而改名，见 `HitboxComp.def.ts`）。 */
  hitSizeValue(): number{
    return this.hitSize;
  }

  /** 对应 `HitboxComp.updateLastPosition()`（`HitboxComp.java:41-46`）。 */
  updateLastPosition(): void{
    this.deltaX = this.x - this.lastX;
    this.deltaY = this.y - this.lastY;
    this.lastX = this.x;
    this.lastY = this.y;
  }

  /** 对应 `HitboxComp.deltaLen()`（内联 `Mathf.len`，与 `HitboxComp.def.ts` 一致）。 */
  deltaLen(): number{
    return Math.sqrt(this.deltaX * this.deltaX + this.deltaY * this.deltaY);
  }

  /** 对应 `HitboxComp.deltaAngle()`（内联 `Mathf.angle`，与 `HitboxComp.def.ts` 一致）。 */
  deltaAngle(): number{
    let result = Math.atan2(this.deltaY, this.deltaX) * (180 / 3.1415927);
    if(result < 0) result += 360;
    return result;
  }

  /** 对应 `HitboxComp.collides(Hitboxc other)`：基类恒 `true`。 */
  collides(_other: any): boolean{
    return true;
  }

  /** 对应 `HitboxComp.hitbox(Rect)`（`HitboxComp.java:64-67`）。 */
  hitbox(out: any): void{
    out.setCentered(this.x, this.y, this.hitSize, this.hitSize);
  }

  /** 对应 `HitboxComp.hitboxTile(Rect)`（`HitboxComp.java:69-76`）。 */
  hitboxTile(out: any): void{
    const size = Math.min(this.hitSize * 0.66, 7.8);
    out.setCentered(this.x, this.y, size, size);
  }

  /** 对应 `HitboxComp.collision(Hitboxc, float, float)`：空实现（原文就是空体）。 */
  collision(_other: any, _x: number, _y: number): void{ }

  // ---------------------------------------------------------------- Velc

  /** 对应 `VelComp.moving()`（`VelComp.java:57-59`；`isZero(0.01f)` 是 len² 比较）。 */
  moving(): boolean{
    return !(this.velX * this.velX + this.velY * this.velY < 0.01);
  }

  /**
   * 对应 `VelComp.solidity()`：恒 `null`（不做固体检测，见文件头「简化 2」）。
   */
  solidity(): any{
    return null;
  }

  /** 对应 `VelComp.ignoreSolids()`（基类恒 false）。 */
  ignoreSolids(): boolean{
    return false;
  }

  /** 对应 `VelComp.canPass(int, int)`（`VelComp.java:47-50`）。 */
  canPass(tileX: number, tileY: number): boolean{
    const s = this.solidity();
    return s === null || s === undefined || !s.solid(tileX, tileY);
  }

  /** 对应 `VelComp.move(float, float)`（`VelComp.java:65-74`；`solidity() === null` 分支）。 */
  move(cx: number, cy: number): void{
    const check = this.solidity();
    if(check !== null && check !== undefined){
      // Java: `collisions.move(self(), cx, cy, check)` —— `EntityCollisions.move` 未移植。
      return;
    }
    this.x += cx;
    this.y += cy;
  }

  // ---------------------------------------------------------------- UnitComp 自有

  /** 对应 `UnitComp.isGrounded()`（`UnitComp.java:80-82`）。 */
  isGrounded(): boolean{
    return this.elevation < 0.001;
  }

  /** 对应 `UnitComp.isFlying()`（`UnitComp.java:84-86`）。 */
  isFlying(): boolean{
    return this.elevation >= 0.09;
  }

  /** 对应 `UnitComp.checkTarget(boolean, boolean)`（`UnitComp.java:76-78`）。 */
  checkTarget(targetAir: boolean, targetGround: boolean): boolean{
    return (this.isGrounded() && targetGround) || (this.isFlying() && targetAir);
  }

  /**
   * 对应 `UnitComp.speed()`（`UnitComp.java:190-194`）的**收窄版**：
   *   Java = `type.speed * strafePenalty * boost * floorSpeedMultiplier()`。
   *   `strafePenalty` 需要 `Angles.angleDist(vel.angle(), rotation)` 与玩家态；
   *   `floorSpeedMultiplier` 需要 `Floor`（未移植）→ 本阶段只保留 **boost** 项：
   *   `boost = lerp(1, canBoost ? boostMultiplier : 1, elevation)`。
   * 地面/elevation 为 0 时与 Java **完全相等**（boost = 1）。
   */
  speed(): number{
    const type = this.type;
    if(type === null) return 0;
    const boost = Mathf.lerp(1, type.canBoost ? type.boostMultiplier : 1, this.elevation);
    return type.speed * boost;
  }

  // ---------------------------------------------------------------- update

  /**
   * 对应 Java 合并实体 `Unit.update()` 的**最小语义**（见文件头）：
   *   1. `VelComp.update()`（`VelComp.java:21-34`，`@MethodPriority(-1)` → 最先）：
   *      `move(vel × delta)` → 位置未变则清零该轴速度 → `vel.scl(max(1 - drag × delta, 0))`。
   *      ⚠️ Java 的 `drag` 是**每实体 transient 字段**（`VelComp.java:18`），由
   *      `UnitComp.setType` 从 `type.drag` 拷入（`UnitComp.java:544`）。
   *   2. `HitboxComp.updateLastPosition()`（Java 由 `EntityCollisions.java:126` 每帧调用，
   *      TS 侧改在此处，见文件头）。
   *   3. `rotation` 同步（本阶段简化，见文件头「简化 1」）。
   */
  update(): void{
    // Java `UnitComp.update()`（`:668-671`）的 NaN 守卫。
    if(!Number.isFinite(this.x) || !Number.isFinite(this.y)){
      this.remove();
      return;
    }

    // ---- VelComp.update()（@MethodPriority(-1)，最先执行）----
    const px = this.x;
    const py = this.y;
    this.move(this.velX * Time.delta, this.velY * Time.delta);
    if(Mathf.equal(px, this.x)) this.velX = 0;
    if(Mathf.equal(py, this.y)) this.velY = 0;

    const scl = Math.max(1 - this.drag * Time.delta, 0);
    this.velX *= scl;
    this.velY *= scl;

    // ---- HitboxComp.updateLastPosition()（见文件头）----
    this.updateLastPosition();

    // ---- rotation 同步（本阶段简化，见文件头「简化 1」）----
    if(!(this.velX * this.velX + this.velY * this.velY < 0.001)){
      this.rotation = Mathf.angle(this.velX, this.velY);
    }
  }
}
