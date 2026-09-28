// 源: core/src/mindustry/entities/EntityCollisions.java (249 行)
//
// 移植范围（S3 · 防御闭环第一步 —— 「子弹命中单位」这条闭环）：**只**移植与
//   `Logic.updateEntities()` 的 headless 调用链相关的那一半：
//     - `updatePhysics(EntityGroup<T>)`（`EntityCollisions.java:122-127`）
//     - `collide(EntityGroup<T>)`（`EntityCollisions.java:215-218`）
//     - `updateCollision(Hitboxc)`（`EntityCollisions.java:220-245`）
//     - `checkCollide(Hitboxc, Hitboxc)`（`EntityCollisions.java:144-167`）
//     - `collide(float...)`（扫掠 AABB，`EntityCollisions.java:169-213`）
//   这条链由 `core/Logic.ts:124-138` 逐条驱动：
//     `Groups.bullet.updatePhysics()` / `Groups.unit.updatePhysics()` → … →
//     `Groups.bullet.update()` → `Groups.bullet.collide()`。
//   ⚠️ 顺序有语义：`update()`（推进位置）在先、`collide()`（按**新**位置判定）在后；
//      `updatePhysics()` 负责把上一步位置固化进 `lastX/lastY` 并重建四叉树。
//
// ⚠️ **取代关系（必须知道）**: 在本次改动之前，本文件是**空实现**，而子弹命中由
//   `entities/BulletRuntime.ts` 的 `collideBullets()`（扫描 `Groups.unit` + 中心距 AABB）
//   作为替代品，仅供 `__tests__/bullet.test.ts` 直接调用。现在生产路径改为本文件。
//   `collideBullets()` **保留**（S1 的测试仍直接调用它，且测试文件不在本次改动范围内），
//   但它**不在** `Logic` 的调用链上 → 同一 tick 内只会有一套碰撞逻辑生效，不会双重扣血：
//     - 生产/对拍路径: `Logic.updateEntities()` → `Groups.bullet.collide()` → 本文件；
//     - S1 子弹单测路径: `collideBullets()`（独立调用，不经过 `Logic`）。
//
// 未移植（逐条标注，避免静默丢失）:
//   - `move` / `moveCheck` / `moveDelta` / `overlapsTile` / `legsSolid` / `waterSolid` /
//     `solid`（`EntityCollisions.java:26-142`）—— 单位 vs **地形**的物理与固体检测。
//     依赖 `Tile.solid()` / `Floor.isLiquid` / `Geometry.overlap` 与 `SolidPred`
//     （`World`/`Tile` 的固体体系）。`UnitRuntime.solidity()` 已因此恒 `null`
//     （见 `entities/UnitRuntime.ts` 文件头「简化 2」）→ S3/S4 无地形碰撞。
//   - `state.teams.present` / `TeamData.unitTree`（见下「碰撞源」）。
//
// ⚠️ **碰撞源（唯一的语义收窄，必须知道）**: Java 的 `updateCollision` 通过
//   `solid.getCollisions(treeCons)`（`EntityCollisions.java:231`）取得「这个实体想和谁碰撞」。
//   `HitboxComp.getCollisions` 是**空实现**（`HitboxComp.java:37-39`），只有
//   `BulletComp.getCollisions`（`BulletComp.java:60-68`）覆写了它：
//       遍历 `state.teams.present`，对每个 `team != 子弹队伍` 的 TeamData 调
//       `team.tree().intersect(r2, arrOut)` —— `tree()` 即 `TeamData.unitTree`（`QuadTree<Unit>`）。
//   也就是「**所有敌对队伍的单位树的并集**」。
//   TS 的 `TeamData.unitTree` 未移植（`game/Teams.ts` 文件头已逐条标注 `unitTree`/`unitTree`
//   的缺失）→ 这里退化为 **`Groups.unit` 的单一四叉树**（「所有队伍单位的并集」）。
//   候选集合因此可能**多出同队单位**，但队伍判据由 `checkCollide` 里的
//   `a.collides(b) && b.collides(a)` 兜底（`BulletRuntime.collides` 会因
//   `target.team === this.team` 直接返回 false），**最终命中集合与 Java 完全一致**。
//   非子弹 solid 在 Java 里 `getCollisions` 为空 → 收集不到候选（什么都不会发生）；
//   本实现在这种情况下会去查单位树 —— 但本阶段的**唯一**调用点是
//   `Groups.bullet.collide()`（`Logic.ts:138`），该分支不可达。将来接入
//   `Groups.unit.collide()` 前，需先把 `Hitboxc.getCollisions` 真正移植出来。
//
// 复用的查询入口: `EntityGroup.intersect(...)`（`EntityGroup.ts:418-441`，逐字移植自
//   `EntityGroup.java`），它内部就是 `treeRef().intersect(...)`，与 Java 的
//   `solid.getCollisions(treeCons)` 落在同一个四叉树查询上。

import { Rect, Seq, Vec2 } from "@mindustry-ts/arc";
import type { EntityGroup } from "./EntityGroup.js";
import type { Entityc } from "../gen/Entityc.js";
import { Groups } from "../gen/Groups.js";

/**
 * 本文件需要的 `Hitboxc` 子集。
 * ⚠️ 生成接口 `gen/Hitboxc.ts` 的 `hitbox(out)` 形参放宽为 `any`（`Rect` 不能进 `.def.ts`），
 *   且不含 `getCollisions`；这里就地声明一个结构化视图，避免把 `Rect` 类型要求推给生成层。
 */
interface HitboxLike{
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  /** 对应 `HitboxComp.hitbox(Rect)`。 */
  hitbox(out: Rect): void;
  /** 对应 `HitboxComp.updateLastPosition()`。 */
  updateLastPosition(): void;
  /** 对应 `HitboxComp.collides(Hitboxc)`（单位恒 true，子弹按队伍/穿透判据）。 */
  collides(other: HitboxLike): boolean;
  /** 对应 `HitboxComp.collision(Hitboxc, float, float)`（子弹在此扣血并可能自毁）。 */
  collision(other: HitboxLike, x: number, y: number): void;
  /** 对应 `EntityComp.isAdded()`。 */
  isAdded(): boolean;
}

/** 对应 `mindustry.entities.EntityCollisions`。 */
export class EntityCollisions{
  /** `seg` / `maxDelta`（`EntityCollisions.java:15`）只在未移植的 `move` 里用到，故省略。 */

  // ---- 未移植方法用到的临时量（`EntityCollisions.java:18-19`）----
  // `vector` / `tmp` 只服务 `moveDelta` / `overlapsTile`（未移植）。
  // `l1` 是 `checkCollide` 的输出交点，`r1`/`r2` 是两个实体的碰撞盒（在用，见下）。

  /** 扫掠 AABB 求出的交点在实体 a 上的位置（`EntityCollisions.java:18`）。 */
  private readonly l1 = new Vec2();
  /** 实体 a 的碰撞盒（先放「上一 tick」位置，再合并出扫掠区域）。`EntityCollisions.java:19`。 */
  private readonly r1 = new Rect();
  /** 实体 b 的碰撞盒 / 扫掠区域的并集。`EntityCollisions.java:19`。 */
  private readonly r2 = new Rect();

  /** 候选实体缓冲（`EntityCollisions.java:22` 复用同一个 `Seq`，每次 `updateCollision` 先清空）。 */
  private readonly arrOut = new Seq<HitboxLike>();

  /**
   * 对应 `EntityCollisions.updatePhysics(EntityGroup<T extends Hitboxc>)`（`EntityCollisions.java:122-127`）：
   *   1. `group.tree().fill(group.rawSeq())` —— 用**当前**位置重建四叉树；
   *   2. `group.each(Hitboxc::updateLastPosition)` —— 固化上一 tick 位置，
   *      使随后 `collide()` 里的 `lastX/lastY → x/y` 构成一步位移（扫掠盒的依据）。
   *
   * ⚠️ 顺序不可换：先 `fill` 再 `updateLastPosition` 只是 Java 的原文顺序；两者互不依赖
   *   （`fill` 只读 `hitbox`，`updateLastPosition` 只写 `lastX/lastY/deltaX/deltaY`）。
   * ⚠️ `UnitRuntime.update()` 末尾也会调一次 `updateLastPosition()`（`UnitRuntime.ts:376`），
   *   那是 S2 阶段在本文件还是空实现时的临时处置。对**静止**单位两者等价（`last == x`）；
   *   对移动单位，Java 的 `lastX` 是「本 tick 移动前」的位置，TS 会变成「移动后」。
   *   golden 场景里的 `dagger` 静止（无 AI / 无速度）→ 不可观测，见交付报告「遗留风险」。
   */
  updatePhysics<T extends Entityc>(group: EntityGroup<T>): void{
    group.treeRef().fill(group.rawSeq() as unknown as Seq<{ hitbox(out: Rect): void }>);
    group.each((entity) => {
      (entity as unknown as HitboxLike).updateLastPosition();
    });
  }

  /**
   * 对应 `EntityCollisions.collide(EntityGroup<T extends Hitboxc>)`（`EntityCollisions.java:215-218`）：
   * `groupa.each(hitCons)`。
   *
   * ⚠️ 遍历中 `solid` 可能被 `collision()` 摘出组（非穿透子弹命中即 `remove()`）。
   *   `EntityGroup.each` 用的是**字段** `iterIndex`，`remove`/`removeIndex` 会同步修正它
   *   （`EntityGroup.ts:346-350`、`:382-386`）—— 这正是 Java 把迭代下标写成字段的原因，
   *   此处依赖该行为，与 Java 一致。
   */
  collide<T extends Entityc>(group: EntityGroup<T>): void{
    group.each((solid) => {
      this.updateCollision(solid as unknown as HitboxLike);
    });
  }

  /**
   * 对应 `EntityCollisions.updateCollision(Hitboxc solid)`（`EntityCollisions.java:220-245`）。
   */
  private updateCollision(solid: HitboxLike): void{
    // r1 = solid 的「上一 tick」碰撞盒
    solid.hitbox(this.r1);
    this.r1.x += solid.lastX - solid.x;
    this.r1.y += solid.lastY - solid.y;

    // r2 = solid 的当前碰撞盒 ∪ r1 = 本 tick 的**扫掠**区域
    solid.hitbox(this.r2);
    this.r2.merge(this.r1);

    this.arrOut.clear();

    // 对应 `solid.getCollisions(treeCons)` —— 见文件头「碰撞源」。
    // ⚠️ 形式必须与 Java 一致: `EntityCollisions.java:24` 的
    //     `private Cons<QuadTree> treeCons = tree -> tree.intersect(r2, arrOut);`
    //   用的是 **`intersect(Rect, Seq)` 收集式**（副作用填入 `arrOut`），**不是**回调式
    //   `intersect(..., Cons)`。两者在 arc 里走**不同**的分派（`intersectSeq` vs `intersectPred`），
    //   本实现严格跟随 Java 的收集式。
    Groups.unit.treeRef().intersect(this.r2, this.arrOut as unknown as Seq<{ hitbox(out: Rect): void }>);

    const items = this.arrOut.items;
    const size = this.arrOut.size;

    for(let i = 0; i < size; i++){
      const sc = items[i]!;
      sc.hitbox(this.r1);
      if(this.r2.overlaps(this.r1)){
        this.checkCollide(solid, sc);
        // 命中后 solid 可能已被移除（非穿透子弹）—— Java 在此时立即停止。
        if(!solid.isAdded()) return;
      }
    }
  }

  /**
   * 对应 `EntityCollisions.checkCollide(Hitboxc a, Hitboxc b)`（`EntityCollisions.java:144-167`）。
   *
   * 两段判定：
   *   1. `r1.overlaps(r2)` —— 「上一 tick 就已经叠在一起」（快速路径）；
   *   2. 否则做扫掠 AABB（`collide(...)`），求出**首次接触**的位置写进 `l1`。
   * 两侧都必须 `collides()`：`a.collides(b)` 过滤队伍/穿透，`b.collides(a)` 是对方的判据。
   */
  private checkCollide(a: HitboxLike, b: HitboxLike): void{
    a.hitbox(this.r1);
    b.hitbox(this.r2);

    this.r1.x += a.lastX - a.x;
    this.r1.y += a.lastY - a.y;
    this.r2.x += b.lastX - b.x;
    this.r2.y += b.lastY - b.y;

    const vax = a.x - a.lastX;
    const vay = a.y - a.lastY;
    const vbx = b.x - b.lastX;
    const vby = b.y - b.lastY;

    if(a !== b && a.collides(b) && b.collides(a)){
      this.l1.set(a.x, a.y);
      const collide =
        this.r1.overlaps(this.r2) ||
        EntityCollisions.collide(
          this.r1.x,
          this.r1.y,
          this.r1.width,
          this.r1.height,
          vax,
          vay,
          this.r2.x,
          this.r2.y,
          this.r2.width,
          this.r2.height,
          vbx,
          vby,
          this.l1
        );
      if(collide){
        a.collision(b, this.l1.x, this.l1.y);
        b.collision(a, this.l1.x, this.l1.y);
      }
    }
  }

  /**
   * 对应 `EntityCollisions.collide(float x1, …, Vec2 out)`（`EntityCollisions.java:169-213`）——
   * 两轴分离的扫掠 AABB，返回是否相交；相交时把**首次接触点**写进 `out`。
   *
   * 逐字移植（含除零产生 ±Infinity / NaN 的边界行为：Java 与 JS 的 float 除法一致，
   * `Math.max/min` 对 NaN 的传播也一致 → 判定结果相同）。
   */
  static collide(
    x1: number,
    y1: number,
    w1: number,
    h1: number,
    vx1: number,
    vy1: number,
    x2: number,
    y2: number,
    w2: number,
    h2: number,
    vx2: number,
    vy2: number,
    out: Vec2
  ): boolean{
    const px = vx1;
    const py = vy1;

    vx1 -= vx2;
    vy1 -= vy2;

    let xInvEntry: number;
    let yInvEntry: number;
    let xInvExit: number;
    let yInvExit: number;

    if(vx1 > 0){
      xInvEntry = x2 - (x1 + w1);
      xInvExit = x2 + w2 - x1;
    }else{
      xInvEntry = x2 + w2 - x1;
      xInvExit = x2 - (x1 + w1);
    }

    if(vy1 > 0){
      yInvEntry = y2 - (y1 + h1);
      yInvExit = y2 + h2 - y1;
    }else{
      yInvEntry = y2 + h2 - y1;
      yInvExit = y2 - (y1 + h1);
    }

    const xEntry = xInvEntry / vx1;
    const xExit = xInvExit / vx1;
    const yEntry = yInvEntry / vy1;
    const yExit = yInvExit / vy1;

    const entryTime = Math.max(xEntry, yEntry);
    const exitTime = Math.min(xExit, yExit);

    if(entryTime > exitTime || xExit < 0 || yExit < 0 || xEntry > 1 || yEntry > 1){
      return false;
    }

    const dx = x1 + w1 / 2 + px * entryTime;
    const dy = y1 + h1 / 2 + py * entryTime;
    out.set(dx, dy);
    return true;
  }
}
