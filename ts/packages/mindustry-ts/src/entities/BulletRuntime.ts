// 源: core/src/mindustry/entities/comp/BulletComp.java (408 行)
//
// 为什么是**手写具象类**而不是 codegen 产物:
//   `BulletComp.def.ts` 标了 `@Component({ base: true })`，codegen 只发射**抽象基类**
//   `gen/Bullet.ts`（字段 + `abstract` 方法声明，无方法体；见 codegen README「renderBaseClass」）。
//   因此 `gen/Bullet.ts` 不能 `new`，也不能直接进 `Groups.bullet`。Java 侧的合并实体
//   `mindustry.gen.Bullet` 由注解处理器的 round 2 生成；TS 侧对应的**具象运行时**就是本文件。
//   先例见 `world/blocks/distribution/Conveyor.ts` 的 `ConveyorBuild extends Building`。
//
// ⚠️ 为什么行为必须写在这里：`.def.ts` 的方法体不能引用 arc-ts / mindustry 的类型
//   （codegen 只自动 import「组件接口名 / `Groups` / 基类名」），所以一切需要 `Time.delta`
//   的行为（移动 / `time` 累加 / 到期移除）只能落在具象子类里。见 `EntityComp.def.ts` 顶部。
//
// ⚠️ `Velc` 的复用方式（**必须知道**）: Java 的 `BulletComp` **不实现** `Velc` —— 它有自己
//   的 `Vec2 vel` 字段，位移也只在 `BulletComp.update()` 里做一次。TS 的冻结版
//   `BulletComp.def.ts` 把 `Velc` 加进了 `implements`（为了复用拆好的 `velX`/`velY`/`drag`
//   标量字段，避免重复声明）。后果是 `gen/Bullet.ts` 多了一批 `Velc` 抽象方法
//   （`moving` / `solidity` / `canPass` / `move` / `update`）。本文件**按 Java `BulletComp`
//   的语义**实现 `update()`（`BulletComp.java:158-199`：`justSpawned` 门控 + `type.drag`），
//   **不会**再走 `VelComp.update()` 的 `move(vel * delta)` —— 否则每 tick 会位移两次。
//   `Velc` 的其余方法按契约实现，但子弹的 `solidity()` 恒 `null`（子弹不做固体检测）。
//
// ⚠️ 逐 tick `update()` 由谁驱动（`Groups.bullet` 的 `update` 标志是 **false**）:
//   Java 的驱动点是 `Logic.updateEntities()` 里的 **显式** 调用（`Logic.java:495`）：
//       Groups.bullet.update();
//       Groups.bullet.collide();          // `Logic.java:496`
//   Java 的 `EntityGroup.update()` 只更新 `update = true` 的组（`all` / `build`），而
//   `GroupDefs.java:10` 的 bullet 组没有 `update = true`，`GroupDefs.java:7` 又把 `Bulletc`
//   排除出 `all` —— 所以**子弹既不在 `Groups.all` 里，也不由 `Groups.update()` 更新**。
//   TS 侧 `gen/Groups.ts` 的 `Groups.update()` 只做
//   `updatePooling + bullet/unit.updatePhysics + all.update + build.update + bullet.collide`，
//   **没有** `Groups.bullet.update()`；`Logic.ts:99-117` 也原样沿用了这个「S3 无子弹」的省略。
//   → 本文件导出 `updateBullets()` 作为该缺失调用点的等价物（一行 `Groups.bullet.update()`），
//     测试直接调用它；接回 `Logic` 需要在那 3 行注释处补一个调用（本阶段文件范围不允许改
//     `Logic.ts`）。见交付报告「遗留风险」。
//
// 未移植（逐条标注）:
//   - `draw()`（`BulletComp.java:321-333`）—— 渲染（计划 §9）。`Drawc` 也未并入本阶段组件集。
//   - `getCollisions(Cons<QuadTree>)`（`:60-68`）—— 需要 `state.teams.present` / `TeamData.tree`
//     （队伍空间索引未移植）。碰撞改为 `collideBullets()` 里扫描 `Groups.unit`（见下）。
//   - `isLocal()`（`:70-75`）/`sense()`/`setProp()`（`:353-407`）—— 网络 / 逻辑系统。
//   - `tileRaycast`（`:228-319`）—— `World` / `Tile` / `Building` 未移植（子弹暂不与地形碰撞）。
//   - `mover`（`:168-170`）—— `Mover` 类型未移植（字段保留为 `unknown | null`，恒 null）。
//   - `Trail` / `trailFade`（`BulletComp.java:54`、`BulletType.removed`）—— 渲染。
//   - `Pools` 复用：Java `Bullet.create()` 走 `Pools.obtain(...)`（`BulletType.java:963`）。
//     TS 侧改为**全新分配**（`new BulletRuntime()`）—— `Pools` 需要一个「归还时重置字段」的
//     协议，而本阶段的子弹字段（`added` / `collided` / `type` / `hit` …）没有对应的 reset，
//     复用会造成跨子弹状态泄漏。池化是纯性能优化，对这些测试的可观测量无影响。
//
// ⚠️ `collideBullets()` 是 `EntityCollisions.collide` 的**替代实现**，不是等价移植：
//   Java 的碰撞在 `EntityCollisions.collide(EntityGroup)`（`EntityCollisions.java:215-245`）里，
//   走 quadtree + 扫掠 AABB（`checkCollide` / `collide(...)`，`:144-213`）。TS 的
//   `src/entities/EntityCollisions.ts` 目前是**空实现**（`EntityCollisions.ts:29-31`），
//   而该文件不在本阶段的允许文件范围内 → 无法在其中补实现。因此这里用「扫描 `Groups.unit` +
//   AABB 重叠」的最小实现：够用、确定性、可测；待 `EntityCollisions` 补齐后应改为经它分派。

import { Angles, Mathf, Time } from "@mindustry-ts/arc";
import { Bullet as BulletBase } from "../gen/Bullet.js";
import { Groups } from "../gen/Groups.js";
import type { Entityc } from "../gen/Entityc.js";
import type { Posc } from "../gen/Posc.js";
import type { BulletType } from "../type/BulletType.js";

/**
 * 推进 `Groups.bullet` 一帧。等价 Java `Logic.updateEntities()` 的
 * `Groups.bullet.update()`（`Logic.java:495`）。
 */
export function updateBullets(): void{
  Groups.bullet.update();
}

/**
 * 子弹碰撞一帧。等价 Java `Logic.updateEntities()` 的 `Groups.bullet.collide()`
 * （`Logic.java:496`），但按文件头说明用自包含的最小实现替代 `EntityCollisions.collide`。
 */
export function collideBullets(): void{
  // 快照：`collision()` 可能把子弹/单位从组里摘掉，直接遍历活数组会跳元素。
  const bullets = Groups.bullet.copy();
  const units = Groups.unit.copy();

  for(let i = 0; i < bullets.size; i++){
    const bullet = bullets.items[i] as unknown as BulletRuntime;
    if(!(bullet instanceof BulletRuntime) || !bullet.isAdded()) continue;

    for(let j = 0; j < units.size; j++){
      const other = units.items[j] as unknown as BulletTarget | null;
      if(other === null || other === undefined) continue;
      if(other.isAdded !== undefined && !other.isAdded()) continue;
      if(!bullet.collides(other)) continue;
      if(!BulletRuntime.overlaps(bullet, other)) continue;

      bullet.collision(other, bullet.x, bullet.y);
      // 命中后子弹可能已被移除（非穿透）；Java 在 `!solid.isAdded()` 时立即停止。
      if(!bullet.isAdded()) break;
    }
  }
}

/** `collideBullets()` 需要的最小目标视图（单位在 TS 侧尚未落地，见文件头）。 */
interface BulletTarget{
  id: number;
  x: number;
  y: number;
  team: number;
  hitSize?: number;
  health?: number;
  hitSizeValue?: () => number;
  isAdded?: () => boolean;
  /** 单位专用：是否与空中/地面目标发生碰撞（`Unitc.checkTarget`）。 */
  checkTarget?: (air: boolean, ground: boolean) => boolean;
}

/** 对应 `mindustry.gen.Bullet`（手写具象类，见文件头）。 */
export class BulletRuntime extends BulletBase{
  /**
   * 本弹的类型。Java `BulletComp.type`（`BulletComp.java:34`）。
   * ⚠️ codegen 不移植引用类型字段（见 `BulletComp.def.ts` 的分类 3），故由本类持有。
   */
  type: BulletType | null = null;

  /** 已碰撞过的实体 id（Java `IntSeq collided`，`BulletComp.java:33`）。 */
  collided: number[] = [];

  /** 移动器（Java `Mover mover`，未移植 → 恒 null）。 */
  mover: unknown | null = null;
  /** 瞄准点所在 tile（Java `Tile aimTile`，未移植 → 恒 null）。 */
  aimTile: unknown | null = null;
  /** 尾迹（Java `Trail trail`，渲染专用 → 恒 null）。 */
  trail: unknown | null = null;
  /** 粘附目标（Java `Posc stickyTarget`）。 */
  stickyTarget: Posc | null = null;
  /** 自由数据字段（Java `Object data`）。 */
  data: unknown | null = null;
  /** 自由浮点数据字段（Java `float fdata`，`BulletComp.java:38`）。 */
  fdata = 0;

  /** `Groups.bullet` 的索引（`Building.index__build` 的同型记账，见 codegen 产物）。 */
  private index__bullet = -1;

  /** 对应 codegen 合并实体的 `static create()`（Java `Pools.obtain(Bullet.class, Bullet::new)`）。 */
  static create(): BulletRuntime{
    return new BulletRuntime();
  }

  /** 对应 Java `BulletComp.rotation()`（getter）。⚠️ TS 的 `rotation` 是字段（`Rotc`）→ 另起名。 */
  rotationValue(): number{
    return this.velX * this.velX + this.velY * this.velY < 0.001
      ? this.rotation
      : Mathf.angle(this.velX, this.velY);
  }

  // ---------------------------------------------------------------- Entityc / Posc / Teamc

  /** 对应 `EntityComp.isAdded()`（`EntityComp.java:16-18`）。 */
  isAdded(): boolean{
    return this.added;
  }

  /** 对应 `HitboxComp.hitSize()`（因与字段同名而改名，见 `HitboxComp.def.ts`）。 */
  hitSizeValue(): number{
    return this.hitSize;
  }

  /** 对应 `TimedComp.fin()`（`TimedComp.java:23-26`）：`time / lifetime`。 */
  fin(): number{
    return this.time / this.lifetime;
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

  // ---------------------------------------------------------------- Hitboxc

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

  /** 对应 `HitboxComp.hitbox(Rect)`（`HitboxComp.java:64-67`）。 */
  hitbox(out: any): void{
    out.setCentered(this.x, this.y, this.hitSize, this.hitSize);
  }

  /** 对应 `HitboxComp.hitboxTile(Rect)`（`HitboxComp.java:69-76`）。 */
  hitboxTile(out: any): void{
    const size = Math.min(this.hitSize * 0.66, 7.8);
    out.setCentered(this.x, this.y, size, size);
  }

  /**
   * 对应 `BulletComp.collides(Hitboxc other)`（`BulletComp.java:114-120`）。
   *
   * ⚠️ 一处被迫的结构化改写: Java 用 `other instanceof Unit f && !f.checkTarget(...)`
   * 过滤空中/地面目标。TS 的具象单位类（`UnitRuntime`）由别的阶段落地，本文件**不能**依赖它，
   * 故改为「有 `checkTarget` 方法即为单位」的结构判定（`Unitc` 的契约方法）。
   */
  collides(other: any): boolean{
    if(this.type === null) return false;
    const target = other as BulletTarget | null;
    if(target === null || target === undefined) return false;
    if(target.team === this.team) return false;
    if(
      typeof target.checkTarget === "function" &&
      !target.checkTarget(this.type.collidesAir, this.type.collidesGround)
    ){
      return false;
    }
    if(this.type.pierce && this.hasCollided(target.id)) return false;
    return this.stickyTarget === null;
  }

  /** 对应 `BulletComp.collision(Hitboxc, float, float)`（`BulletComp.java:122-145`）。 */
  collision(other: any, x: number, y: number): void{
    const type = this.type;
    if(type === null) return;

    if(type.sticky){
      if(this.stickyTarget === null){
        // 稍微「扎进」目标一点，视觉更好（Java 原注释）
        this.x = x + this.velX;
        this.y = y + this.velY;
        this.stickTo(other as Posc);
      }
      return;
    }

    type.hitSelf(this);

    // 必须是最后一步（Java 原注释）：非穿透子弹命中即移除。
    if(!type.pierce){
      this.hit = true;
      this.remove();
    }else{
      this.collided.push(other.id);
    }

    type.hitEntity(this, other, typeof other.health === "number" ? other.health : 0);
  }

  /** 对应 `BulletComp.stickTo(Posc)`（`BulletComp.java:147-155`）。 */
  stickTo(other: Posc): void{
    const type = this.type;
    if(type === null) return;
    this.lifetime += type.stickyExtraLifetime;
    this.stickyX = this.x - other.x;
    this.stickyY = this.y - other.y;
    this.stickyTarget = other;
    this.stickyRotationOffset = this.rotation;
    const rot = (other as unknown as { rotation?: number }).rotation;
    this.stickyRotation = typeof rot === "number" ? rot : 0;
  }

  /** 对应 `BulletComp.hasCollided(int)`（`BulletComp.java:105-107`）。 */
  hasCollided(id: number): boolean{
    return this.collided.length !== 0 && this.collided.includes(id);
  }

  // ---------------------------------------------------------------- Velc

  /** 对应 `VelComp.moving()`（`VelComp.java:57-59`；`isZero(0.01f)` 是 len² 比较）。 */
  moving(): boolean{
    return !(this.velX * this.velX + this.velY * this.velY < 0.01);
  }

  /** 对应 `VelComp.solidity()`：子弹不做固体检测 → 恒 null。 */
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

  // ---------------------------------------------------------------- BulletComp 自有

  /** 对应 `BulletComp.initVel(float, float)`（`BulletComp.java:335-338`）。 */
  initVel(angle: number, amount: number): void{
    this.velX = Angles.trnsx(angle, amount);
    this.velY = Angles.trnsy(angle, amount);
    this.rotation = angle;
  }

  /** 对应 `BulletComp.rotation(float angle)`（setter，`BulletComp.java:341-344`）。 */
  setRotation(angle: number): void{
    this.rotation = angle;
    const len = Math.sqrt(this.velX * this.velX + this.velY * this.velY);
    this.velX = Angles.trnsx(angle, len);
    this.velY = Angles.trnsy(angle, len);
  }

  /** 对应 `BulletComp.damageMultiplier()`（`BulletComp.java:94-97`）。 */
  damageMultiplier(): number{
    return this.type === null ? 1 : this.type.damageMultiplier(this);
  }

  /** 对应 `BulletComp.absorb()`（`BulletComp.java:99-103`）。 */
  absorb(): void{
    this.absorbed = true;
    this.remove();
  }

  /** 对应 `BulletComp.moveRelative(float, float)`（`BulletComp.java:201-205`）。 */
  moveRelative(x: number, y: number): void{
    const rot = this.rotationValue();
    this.x += Angles.trnsx(rot, x * Time.delta, y * Time.delta);
    this.y += Angles.trnsy(rot, x * Time.delta, y * Time.delta);
  }

  /** 对应 `BulletComp.turn(float, float)`（`BulletComp.java:207-210`）。 */
  turn(x: number, y: number): void{
    const ang = Mathf.angle(this.velX, this.velY);
    let vx = this.velX + Angles.trnsx(ang, x * Time.delta, y * Time.delta);
    let vy = this.velY + Angles.trnsy(ang, x * Time.delta, y * Time.delta);
    // `vel.limit(type.speed)`
    const len = Math.sqrt(vx * vx + vy * vy);
    const speed = this.type === null ? 0 : this.type.speed;
    if(len > speed && len > 0){
      const f = speed / len;
      vx *= f;
      vy *= f;
    }
    this.velX = vx;
    this.velY = vy;
  }

  // ---------------------------------------------------------------- 组记账（codegen 合并实体同型）

  /**
   * 对应合并实体的 `add()`：`HitboxComp.add()` (刷新 lastPosition) +
   * `EntityComp.add()` (added = true) + `BulletComp.add()` (`type.init(self())`)，
   * 外加 `Groups.bullet.addIndex(this)` 的组记账（与 `gen/Building.ts` 的 `add()` 同型）。
   *
   * ⚠️ `BulletType.init(Bullet)` 在 TS 侧改名为 `initBullet(...)`（陷阱 #16，见其文档）。
   */
  add(): void{
    if(this.added) return;
    this.updateLastPosition();
    this.index__bullet = Groups.bullet.addIndex(this);
    this.added = true;
    if(this.type !== null) this.type.initBullet(this);
  }

  /** codegen 合并实体的组索引 setter（`Groups.bullet` 的 indexer 会调用）。 */
  setIndex__bullet(index: number): void{
    this.index__bullet = index;
  }

  /**
   * 对应 `EntityComp.remove()` + `BulletComp.remove()`（`BulletComp.java:82-92`）：
   * 摘出 `Groups.bullet` → `added = false` → （非 clearing 时）`despawned` / `removed` / 清空 `collided`。
   */
  remove(): void{
    if(this.added){
      Groups.bullet.removeIndex(this, this.index__bullet);
      this.index__bullet = -1;
      this.added = false;
    }

    if(Groups.isClearing) return;

    // `despawned` 只在「被外部销毁 / 寿命到期」时计数（Java 原注释）
    if(!this.hit && this.type !== null) this.type.despawned(this);
    if(this.type !== null) this.type.removedBullet(this);
    this.collided.length = 0;
  }

  // ---------------------------------------------------------------- update

  /**
   * 对应 Java 合并实体 `Bullet.update()` 的**完整语义**：
   *   - `BulletComp.update()`（`BulletComp.java:158-199`）
   *   - `TimedComp.update()`（`TimedComp.java:15-21`，`@MethodPriority(100)` → **最后**执行）
   * 合并顺序即 `BulletComp` 主体 → `TimedComp` 的 `time` 累加 / 到期移除。
   *
   * ⚠️ 与 Java 的三处差异（均为「依赖未移植系统」，见文件头）:
   *   1. `mover` 恒 null → 跳过（`BulletComp.java:168-170`）。
   *   2. `stickyTarget` 为空时的 `tileRaycast` 跳过（`World`/`Tile` 未移植，`:186-188`）。
   *   3. `rotation` 的同步：Java 的 `rotation()` 是 getter（`vel` 非零时取 `vel.angle()`），
   *      TS 的 `rotation` 是字段（`Rotc`）→ 在每 tick 末按同一判据同步一次（见本方法尾部）。
   */
  update(): void{
    const type = this.type;
    if(type === null) return;

    if(!this.justSpawned){
      this.x += this.velX * Time.delta;
      this.y += this.velY * Time.delta;
      const scl = Math.max(1 - type.drag * Time.delta, 0);
      this.velX *= scl;
      this.velY *= scl;
    }
    this.justSpawned = false;

    // Java: `if(mover != null) mover.move(self());` —— Mover 未移植。

    if(type.accel !== 0){
      const len = Math.sqrt(this.velX * this.velX + this.velY * this.velY);
      const newLen = len + type.accel * Time.delta;
      if(len > 0){
        const f = newLen / len;
        this.velX *= f;
        this.velY *= f;
      }
    }

    type.update(this);

    if(this.stickyTarget !== null){
      const target = this.stickyTarget as unknown as BulletTarget & { isValid?: () => boolean; rotation?: number };
      const exists = typeof target.isValid === "function" ? target.isValid() : true;
      if(exists){
        const rotate = typeof target.rotation === "number" ? target.rotation - this.stickyRotation : 0;
        const nx = Angles.trnsx(rotate, this.stickyX, this.stickyY) + target.x;
        const ny = Angles.trnsy(rotate, this.stickyX, this.stickyY) + target.y;
        this.set(nx, ny);
        this.rotation = rotate + this.stickyRotationOffset;
        const len = Math.sqrt(this.velX * this.velX + this.velY * this.velY);
        this.velX = Angles.trnsx(this.rotation, len);
        this.velY = Angles.trnsy(this.rotation, len);
      }
    }
    // Java: `else if(type.collidesTiles && type.collides && type.collidesGround) tileRaycast(...)`
    // —— World/Tile 未移植（见文件头）。

    if(type.removeAfterPierce && type.pierceCap !== -1 && this.collided.length >= type.pierceCap){
      this.hit = true;
      this.remove();
    }

    // `keepAlive`：本帧不衰减 `lifetime`（Java `BulletComp.java:195-198`）—— 做法是
    // **先减掉**本帧 `TimedComp` 即将加上的 `Time.delta`，净效果为 0。
    if(this.keepAlive){
      this.time -= Time.delta;
      this.keepAlive = false;
    }

    // TimedComp.update()（@MethodPriority(100)，最后执行）
    this.time = Math.min(this.time + Time.delta, this.lifetime);
    if(this.time >= this.lifetime){
      this.remove();
    }

    // `rotation` 同步（Java getter `BulletComp.rotation()`，`BulletComp.java:347-350`）：
    //   `vel.isZero(0.001f) ? rotation : vel.angle()`
    if(!(this.velX * this.velX + this.velY * this.velY < 0.001)){
      this.rotation = Mathf.angle(this.velX, this.velY);
    }
  }

  /** `collideBullets()` 的 AABB 重叠判定（`hitSize` 半径之和的包围盒）。 */
  static overlaps(bullet: BulletRuntime, other: BulletTarget): boolean{
    const otherSize =
      typeof other.hitSizeValue === "function" ? other.hitSizeValue() : (other.hitSize ?? 0);
    const reach = (bullet.hitSize + otherSize) / 2;
    return Math.abs(bullet.x - other.x) <= reach && Math.abs(bullet.y - other.y) <= reach;
  }
}
