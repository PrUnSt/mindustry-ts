// S0（防御闭环的共同地基）验收测试：新增/扩展的实体组件 + `EntityGroup.intersect`。
//
// 覆盖三类断言：
//  1. **类型组合**（编译期门禁）: `Bulletc` / `Unitc` 现在 extends 了
//     `Timedc` / `Damagec` / `Hitboxc` / `Ownerc` / `Rotc` / `Velc`。这些赋值在
//     `pnpm build`（tsc，`src/**/*.ts` 含 `__tests__`）下会静态校验 —— 接口没组合上会直接编译失败。
//  2. **字段默认值**（运行期）: 通过把生成的抽象基类 `Bullet` / `Unit` 当构造器实例化
//     （`abstract` 只在编译期生效），逐字段钉死默认值。下游 4 个 agent 直接依赖这份清单。
//     ⚠️ 注意 `deltaLen` / `deltaAngle` / `moving` / `fin` / `hitbox` 等**纯方法实现只存在于
//     合并实体里**（`codegen.renderEntity` 才写入方法体）；S0 尚无子弹/单位的 `@EntityDef`，
//     所以基类上它们是 `abstract`（无运行期实现），本阶段无法运行期调用 —— 其正确性由
//     `pnpm build` 的类型门禁 + S4 合并实体落地后的用例保证。
//  3. **`EntityGroup.intersect`**（运行期）: 三个重载的收集/遍历/短路行为，以及空组、
//     缓冲复用、与真实 `Groups.bullet` / `Groups.unit` 的集成。

import { beforeAll, describe, expect, test } from "vitest";
import { Rect, Seq } from "@mindustry-ts/arc";
import { Vars } from "../Vars.js";
import { EntityGroup } from "../entities/EntityGroup.js";
import { Groups } from "../gen/Groups.js";
import { Bullet } from "../gen/Bullet.js";
import { Unit } from "../gen/Unit.js";
import type { Entityc } from "../gen/Entityc.js";
import type { Posc } from "../gen/Posc.js";
import type { Teamc } from "../gen/Teamc.js";
import type { Healthc } from "../gen/Healthc.js";
import type { Bulletc } from "../gen/Bulletc.js";
import type { Unitc } from "../gen/Unitc.js";
import type { Timedc } from "../gen/Timedc.js";
import type { Damagec } from "../gen/Damagec.js";
import type { Hitboxc } from "../gen/Hitboxc.js";
import type { Ownerc } from "../gen/Ownerc.js";
import type { Rotc } from "../gen/Rotc.js";
import type { Velc } from "../gen/Velc.js";

/** 把生成期标成 `abstract` 的基类当构造器用（`abstract` 仅编译期约束，运行期字段初始化照常执行）。 */
function instantiate<T>(ctor: abstract new () => T): T{
  return new (ctor as unknown as new () => T)();
}

// `Groups.*` 由 `Vars.bootstrap()`（内部 `Groups.init()`）建好；本文件多处需要它非空。
beforeAll(() => {
  Vars.bootstrap();
});

/** 一个最小的、带 `hitbox` 的实体，用于往 `EntityGroup` 的 quadtree 里插元素。 */
class TestEntity implements Entityc{
  id = -1;
  added = false;
  x: number;
  y: number;
  readonly half: number;

  constructor(x: number, y: number, size = 8){
    this.x = x;
    this.y = y;
    this.half = size / 2;
  }

  isAdded(): boolean{
    return this.added;
  }

  update(): void{ }

  add(): void{
    this.added = true;
  }

  remove(): void{
    this.added = false;
  }

  hitbox(out: Rect): void{
    out.setCentered(this.x, this.y, this.half * 2, this.half * 2);
  }
}

/**
 * 建一个带 quadtree 的空间组并把元素插进去。
 *
 * ⚠️ 必须**同时**进数组与 quadtree：`isEmpty()` 判定的是 `array.size`，而 `intersect` 查的是
 * quadtree（Java 里两者由不同路径维护 —— `add()` 只碰数组，空间索引由外部 `fill`/`insert` 维护）。
 */
function spatialGroup(entities: readonly TestEntity[]): EntityGroup<TestEntity>{
  const group = new EntityGroup<TestEntity>(true, false);
  group.resize(0, 0, 100, 100);
  for(const entity of entities){
    group.add(entity);
    group.treeRef().insert(entity);
  }
  return group;
}

describe("S0 组件: Bulletc 的组合接口（类型门禁 + 字段默认值）", () => {
  test("Bulletc 现在 extends Timedc/Damagec/Hitboxc/Ownerc/Rotc/Velc，且字段默认值正确", () => {
    const bullet = instantiate(Bullet);

    // ---- 类型组合（编译期）: 若 Bulletc 未 extends 这些接口，下面每行都会 tsc 报错 ----
    const timed: Timedc = bullet;
    const damage: Damagec = bullet;
    const hitbox: Hitboxc = bullet;
    const owner: Ownerc = bullet;
    const rot: Rotc = bullet;
    const vel: Velc = bullet;
    const pos: Posc = bullet;
    const entity: Entityc = bullet;

    // ---- 字段默认值（运行期）: 下游直接依赖 ----
    expect(timed.time).toBe(0);
    expect(timed.lifetime).toBe(0);

    expect(damage.damage).toBe(0);

    expect(hitbox.hitSize).toBe(0);
    expect(hitbox.lastX).toBe(0);
    expect(hitbox.lastY).toBe(0);
    expect(hitbox.deltaX).toBe(0);
    expect(hitbox.deltaY).toBe(0);

    expect(owner.owner).toBeNull();

    expect(rot.rotation).toBe(0);

    expect(vel.velX).toBe(0);
    expect(vel.velY).toBe(0);
    expect(vel.drag).toBe(0);

    expect(pos.x).toBe(0);
    expect(pos.y).toBe(0);

    expect(entity.id).toBe(-1);
    expect(entity.added).toBe(false);
  });

  test("BulletComp 自有字段（含保留的 S3 桩 `speed`）默认值正确", () => {
    const bullet = instantiate(Bullet) as unknown as Bulletc & {
      aimX: number; aimY: number; originX: number; originY: number;
      buildingDamageMultiplier: number; stickyX: number; stickyY: number;
      stickyRotation: number; stickyRotationOffset: number;
    };

    expect(bullet.speed).toBe(0); // ⚠️ 非 Java 字段，S3 桩，保留
    expect(bullet.keepAlive).toBe(false);
    expect(bullet.justSpawned).toBe(true); // Java 初值就是 true
    expect(bullet.shooter).toBeNull();
    expect(bullet.hit).toBe(false);
    expect(bullet.absorbed).toBe(false);
    expect(bullet.frags).toBe(0);

    expect(bullet.aimX).toBe(0);
    expect(bullet.aimY).toBe(0);
    expect(bullet.originX).toBe(0);
    expect(bullet.originY).toBe(0);
    expect(bullet.buildingDamageMultiplier).toBe(0);
    expect(bullet.stickyX).toBe(0);
    expect(bullet.stickyY).toBe(0);
    expect(bullet.stickyRotation).toBe(0);
    expect(bullet.stickyRotationOffset).toBe(0);
  });
});

describe("S0 组件: Unitc 的组合接口（类型门禁 + 字段默认值）", () => {
  test("Unitc 现在 extends Rotc/Hitboxc/Velc（外加既有 Healthc），字段默认值正确", () => {
    const unit = instantiate(Unit);

    const rot: Rotc = unit;
    const hitbox: Hitboxc = unit;
    const vel: Velc = unit;
    const health: Healthc = unit;
    const pos: Posc = unit;
    const teamc: Teamc = unit;
    const entity: Entityc = unit;

    // UnitComp 自有字段
    expect(unit.elevation).toBe(0);
    expect(unit.drowned).toBe(false);

    expect(rot.rotation).toBe(0);

    expect(hitbox.hitSize).toBe(0);

    expect(vel.velX).toBe(0);
    expect(vel.velY).toBe(0);
    expect(vel.drag).toBe(0);

    expect(health.health).toBe(0);
    expect(health.maxHealth).toBe(1);
    expect(health.dead).toBe(false);
    expect(health.hitTime).toBe(0);

    expect(pos.x).toBe(0);
    expect(pos.y).toBe(0);

    expect(entity.id).toBe(-1);
    expect(entity.added).toBe(false);
    expect(teamc.team).toBe(0);
  });
});

describe("S0 EntityGroup.intersect 重载", () => {
  test("收集式 intersect(x,y,w,h) 返回恰好相交的元素（身份相等）", () => {
    const a = new TestEntity(10, 10, 8);
    const b = new TestEntity(80, 80, 8); // 远离查询区
    const c = new TestEntity(30, 30, 8);
    const group = spatialGroup([a, b, c]);

    const out: Seq<TestEntity> = group.intersect(0, 0, 40, 40);

    expect(out.size).toBe(2);
    const ids = new Set([out.items[0], out.items[1]]);
    expect(ids.has(a)).toBe(true);
    expect(ids.has(c)).toBe(true);
    expect(ids.has(b)).toBe(false);
  });

  test("收集式 intersect 复用内部缓冲（Java `intersectArray` 语义）", () => {
    const group = spatialGroup([new TestEntity(10, 10, 8)]);
    const first = group.intersect(0, 0, 100, 100);
    const second = group.intersect(0, 0, 100, 100);
    expect(second).toBe(first); // 同一 Seq 实例
    expect(second.size).toBe(1);
  });

  test("Cons 重载遍历所有相交元素、返回值被忽略", () => {
    const a = new TestEntity(10, 10, 8);
    const b = new TestEntity(80, 80, 8);
    const group = spatialGroup([a, b]);

    const seen: TestEntity[] = [];
    // 回调无返回值 → 绑定 Cons 重载（TS 重载顺序：Boolf 在前，void 回调落到 Cons）
    group.intersect(0, 0, 40, 40, (e) => {
      seen.push(e);
    });

    expect(seen.length).toBe(1);
    expect(seen[0]).toBe(a);
  });

  test("Boolf 重载在回调返回 true 时短路并返回 true", () => {
    const a = new TestEntity(10, 10, 8);
    const b = new TestEntity(20, 20, 8);
    const group = spatialGroup([a, b]);

    const seen: TestEntity[] = [];
    const hit = group.intersect(0, 0, 100, 100, (e) => {
      seen.push(e);
      return e === a;
    });

    expect(hit).toBe(true);
    expect(seen.length).toBe(1); // 命中 a 后立即退出，不再访问 b
    expect(seen[0]).toBe(a);

    const seen2: TestEntity[] = [];
    const none = group.intersect(0, 0, 100, 100, (e) => {
      seen2.push(e);
      return false;
    });
    expect(none).toBe(false);
    expect(seen2.length).toBe(2); // 全部遍历
  });

  test("空组: 收集式返回空 Seq、Cons 无输出、Boolf 返回 false", () => {
    const group = spatialGroup([]);

    const out = group.intersect(0, 0, 10, 10);
    expect(out.size).toBe(0);

    const seen: TestEntity[] = [];
    group.intersect(0, 0, 10, 10, (e) => {
      seen.push(e);
    });
    expect(seen.length).toBe(0);

    expect(group.intersect(0, 0, 10, 10, () => true)).toBe(false);
  });

  test("非空间组 + 空组: intersect 不触碰 quadtree（与 Java 一致，不抛错）", () => {
    const group = new EntityGroup<TestEntity>(false, false);
    expect(group.intersect(0, 0, 10, 10).size).toBe(0);
    expect(group.intersect(0, 0, 10, 10, () => true)).toBe(false);
  });

  test("集成: Groups.bullet / Groups.unit 的 intersect 在空组上安全返回", () => {
    expect(Groups.bullet.size()).toBe(0);
    expect(Groups.unit.size()).toBe(0);

    const bullets = Groups.bullet.intersect(0, 0, 1000, 1000);
    expect(bullets.size).toBe(0);

    const units = Groups.unit.intersect(0, 0, 1000, 1000);
    expect(units.size).toBe(0);

    expect(Groups.unit.intersect(0, 0, 1000, 1000, () => true)).toBe(false);
  });
});
