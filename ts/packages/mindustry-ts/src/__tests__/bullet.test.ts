// S1 · 子弹子系统验收测试。
//
// 覆盖：
//   ① `BulletRuntime` 的字段初值（对照 `gen/Bullet.ts` + `BulletComp.def.ts`）
//   ② 逐 tick 位移（`speed × Time.delta`，含 `justSpawned` 门控）与 `drag` 减速
//   ③ `time` 累加 / `lifetime` 到期移除 / `keepAlive` 冻结语义
//   ④ 命中路径：`pierce = false` 命中即移除、`pierce = true` 记录 `collided` 并扣血
//   ⑤ `damage` 真实扣减目标 `health`
//   ⑥ `Groups.bullet` 的 add/remove 计数与 id 分配
//   ⑦ 从 `Bullets.standardCopper` 构造的子弹与 `golden/java-bullet-table.txt` 数值一致
//   ⑧ `BulletType.init()` 的派生字段（pierce / lightningType / despawnHit / range …）
//
// ⚠️ 逐 tick `update()` 的驱动：本文件显式调用 `updateBullets()`（= `Groups.bullet.update()`）。
//   `Groups.update()`（codegen 产物）**不含** `Groups.bullet.update()`，而 bullet 组又不在
//   `Groups.all` 里（`GroupDefs.java:7` 排除 `Bulletc`），所以子弹必须像 Java
//   `Logic.updateEntities()`（`Logic.java:495`）那样被**显式**驱动。详见
//   `src/entities/BulletRuntime.ts` 文件头。

import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { Rect } from "@mindustry-ts/arc";
import { Vars } from "../Vars.js";
import { ContentType } from "../ctype/ContentType.js";
import { Bullets } from "../content/Bullets.js";
import { Team } from "../game/Team.js";
import { Groups } from "../gen/Groups.js";
import type { Unit } from "../gen/Unit.js";
import { BulletRuntime, collideBullets, updateBullets } from "../entities/BulletRuntime.js";
import { BulletType } from "../type/BulletType.js";

/** 内容引导只跑一次。`Vars.bootstrap()` 必须先于 `Bullets.load()`（`Content` 构造器读 `Vars.content`）。 */
beforeAll(() => {
  Vars.bootstrap();
  Bullets.load();
});

/** 每个用例都从「无子弹、无单位」的干净状态开始。 */
afterEach(() => {
  Groups.bullet.clear();
  Groups.unit.clear();
});

/** 供 `makeBullet` 复用的最小类型（速度/伤害无关紧要，测试直接写 `velX/velY`）。 */
let basicType: BulletType;

/** 直接构造一个已入组的子弹（等价 `BulletType.create` 的「设置 + add」两步）。 */
function makeBullet(opts: {
  x: number;
  y: number;
  velX?: number;
  velY?: number;
  lifetime?: number;
  type?: BulletType;
}): BulletRuntime{
  const type = opts.type ?? basicType;
  const b = new BulletRuntime();
  b.type = type;
  b.team = Team.sharded.id;
  b.set(opts.x, opts.y);
  b.lastX = opts.x;
  b.lastY = opts.y;
  b.velX = opts.velX ?? 0;
  b.velY = opts.velY ?? 0;
  b.lifetime = opts.lifetime ?? 100;
  b.hitSize = 4;
  // Java `BulletComp` 的 `damage` 由 `BulletType.create()` 从类型拷来（`BulletComp.java:52`）。
  b.damage = opts.type !== undefined ? opts.type.damage : 5;
  b.add();
  return b;
}

/**
 * 靶子单位的最小实现。⚠️ `UnitRuntime`（另一阶段）尚未落地，这里用一个**结构化**假单位
 * 顶替：`collideBullets()` 只按 `team` / `id` / `hitSizeValue` / `checkTarget` / `damage`
 * 这几个成员交互（见 `BulletRuntime.collides` 的说明）。
 */
class FakeUnit{
  id = -1;
  added = false;
  x = 0;
  y = 0;
  team = Team.crux.id;
  health = 100;
  maxHealth = 100;
  hitSize = 8;
  dead = false;
  hitTime = 0;
  rotation = 0;
  lastX = 0;
  lastY = 0;
  deltaX = 0;
  deltaY = 0;
  velX = 0;
  velY = 0;
  drag = 0;
  elevation = 0;
  drowned = false;

  constructor(x: number, y: number, health = 100){
    this.x = x;
    this.y = y;
    this.health = health;
    this.maxHealth = health;
  }

  checkTarget(_air: boolean, _ground: boolean): boolean{
    return true;
  }

  isValid(): boolean{
    return !this.dead && this.added;
  }

  isAdded(): boolean{
    return this.added;
  }

  hitSizeValue(): number{
    return this.hitSize;
  }

  hitbox(out: Rect): void{
    out.setCentered(this.x, this.y, this.hitSize, this.hitSize);
  }

  updateLastPosition(): void{
    this.lastX = this.x;
    this.lastY = this.y;
  }

  damage(amount: number, _withEffect: boolean): void{
    this.health -= amount;
    if(this.health <= 0){
      this.health = 0;
      this.dead = true;
    }
  }

  update(): void{ }

  remove(): void{
    this.added = false;
  }
}

/** 注册一个假单位到 `Groups.unit`（`EntityGroup.add` 不负责 `added`，故手动置位）。 */
function spawnUnit(unit: FakeUnit): FakeUnit{
  Groups.unit.add(unit as unknown as Unit);
  unit.added = true;
  return unit;
}

beforeAll(() => {
  basicType = new BulletType(0, 0);
  basicType.lifetime = 1000;
});

describe("S1 子弹: 构造与字段初值", () => {
  test("① `new BulletRuntime()` 的字段初值与 `gen/Bullet.ts` 一致", () => {
    const b = new BulletRuntime();

    expect(b.id).toBe(-1);
    expect(b.added).toBe(false);
    expect(b.isAdded()).toBe(false);

    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
    expect(b.team).toBe(0); // Team.derelict 的 id

    expect(b.time).toBe(0);
    expect(b.lifetime).toBe(0);
    expect(b.damage).toBe(0);
    expect(b.hitSize).toBe(0);
    expect(b.hitSizeValue()).toBe(0);

    expect(b.lastX).toBe(0);
    expect(b.lastY).toBe(0);
    expect(b.deltaX).toBe(0);
    expect(b.deltaY).toBe(0);

    expect(b.velX).toBe(0);
    expect(b.velY).toBe(0);
    expect(b.drag).toBe(0);
    expect(b.rotation).toBe(0);

    // BulletComp 自有字段
    expect(b.justSpawned).toBe(true); // Java 初值就是 true
    expect(b.keepAlive).toBe(false);
    expect(b.shooter).toBeNull();
    expect(b.owner).toBeNull();
    expect(b.hit).toBe(false);
    expect(b.absorbed).toBe(false);
    expect(b.frags).toBe(0);
    expect(b.stickyTarget).toBeNull();
    expect(b.collided).toEqual([]);
    expect(b.type).toBeNull();

    // 具象类新增字段（Java 的引用型/transient 字段）
    expect(b.mover).toBeNull();
    expect(b.aimTile).toBeNull();
    expect(b.trail).toBeNull();
    expect(b.data).toBeNull();
    expect(b.fdata).toBe(0);

    // 纯计算方法
    expect(b.moving()).toBe(false);
    expect(b.solidity()).toBeNull();
    expect(b.ignoreSolids()).toBe(false);
    // ⚠️ Java `TeamComp.cheating()` 是 `team.rules().cheat`（`TeamComp.java:17-19`），derelict
    // 的 rules.cheat 为 false。但 TS 冻结的 `TeamComp.def.ts:25-27` 把契约简化为
    // `team === 0`（TS 侧 `Team` 无 `rules()`），故这里断言 true —— 与 def 契约一致。
    expect(b.cheating()).toBe(true); // team === 0（derelict）
    expect(b.inFogTo(0)).toBe(false); // team === viewer → 可见（`TeamComp.def.ts:30-32`）
  });
});

describe("S1 子弹: 逐 tick 物理", () => {
  test("② 位置按 `speed × Time.delta` 推进；`justSpawned` 帧不移动", () => {
    const b = makeBullet({ x: 100, y: 100, velX: 2, velY: 0, lifetime: 100 });

    // 第 1 帧：Java `BulletComp.java:161` 的 `justSpawned` 门控 —— 不移动。
    updateBullets();
    expect(b.x).toBe(100);
    expect(b.y).toBe(100);
    expect(b.justSpawned).toBe(false);

    // 第 2 帧起：每帧 +2（`Time.delta === 1`）。
    updateBullets();
    expect(b.x).toBe(102);
    updateBullets();
    expect(b.x).toBe(104);
    expect(b.y).toBe(100);

    // `rotation` 每帧末按 `Mathf.angle(velX, velY)` 同步（Java 的 `rotation()` getter 等价物）。
    // ⚠️ `Mathf.angle` 是 arc 的近似实现（`atn` 多项式），沿 +x 时约 9.6e-5，不是精确 0。
    expect(Math.abs(b.rotation)).toBeLessThan(0.001);
    expect(b.rotationValue()).toBeCloseTo(b.rotation, 10);
  });

  test("②b `drag` 按 `max(1 - drag × delta, 0)` 逐帧衰减速度", () => {
    const type = new BulletType(10, 1);
    type.drag = 0.1;
    const b = makeBullet({ x: 0, y: 0, velX: 10, velY: 0, lifetime: 100, type });

    // 第 1 帧（justSpawned）：既不动也不衰减。
    updateBullets();
    expect(b.x).toBe(0);
    expect(b.velX).toBe(10);

    // 第 2 帧：先位移 10，再衰减 ×0.9。
    updateBullets();
    expect(b.x).toBe(10);
    expect(b.velX).toBeCloseTo(9, 10);

    // 第 3 帧：位移 9（用衰减后的速度），再 ×0.9。
    updateBullets();
    expect(b.x).toBeCloseTo(19, 10);
    expect(b.velX).toBeCloseTo(8.1, 10);
  });
});

describe("S1 子弹: 计时与生命周期", () => {
  test("③ `time` 逐帧 +1，达到 `lifetime` 即自动移除", () => {
    const b = makeBullet({ x: 0, y: 0, lifetime: 3 });
    expect(Groups.bullet.size()).toBe(1);

    updateBullets();
    expect(b.time).toBe(1);
    expect(b.isAdded()).toBe(true);

    updateBullets();
    expect(b.time).toBe(2);
    expect(b.isAdded()).toBe(true);

    updateBullets();
    expect(b.time).toBe(3); // `Math.min(2 + 1, 3)`
    expect(b.fin()).toBe(1); // time / lifetime
    expect(b.isAdded()).toBe(false);
    expect(Groups.bullet.size()).toBe(0);
  });

  test("③b `keepAlive = true` 让本帧的 `time` 不增长（Java `BulletComp.java:195-198`）", () => {
    const b = makeBullet({ x: 0, y: 0, lifetime: 3 });
    b.keepAlive = true;

    updateBullets();
    expect(b.time).toBe(0); // -delta（keepAlive）+ delta（TimedComp）= 0
    expect(b.keepAlive).toBe(false); // 用完即复位
    expect(b.isAdded()).toBe(true);

    updateBullets();
    expect(b.time).toBe(1);
  });
});

describe("S1 子弹: 命中与伤害", () => {
  test("④ `pierce = false`：命中一次后立即移除（`hit === true`）", () => {
    const type = new BulletType(0, 5);
    type.lifetime = 100;
    // 子弹 hitSize 4 + 靶子 hitSize 8 → 包围盒半径之和 6；把靶子放在 +6 处。
    const bullet = makeBullet({ x: 50, y: 50, lifetime: 100, type });
    const target = spawnUnit(new FakeUnit(56, 50, 150));

    expect(Groups.unit.size()).toBe(1);
    collideBullets();

    expect(bullet.hit).toBe(true);
    expect(bullet.isAdded()).toBe(false);
    expect(bullet.added).toBe(false);
    expect(Groups.bullet.size()).toBe(0);
    expect(target.health).toBe(145); // 150 - damage(5)
  });

  test("⑤ `damage` 真实扣减目标 `health`（多枚子弹累加）", () => {
    const type = new BulletType(0, 12);
    type.lifetime = 100;
    const target = spawnUnit(new FakeUnit(200, 200, 150));

    const a = makeBullet({ x: 206, y: 200, lifetime: 100, type });
    collideBullets();
    expect(a.isAdded()).toBe(false);
    expect(target.health).toBe(138); // 150 - 12

    const b = makeBullet({ x: 194, y: 200, lifetime: 100, type });
    collideBullets();
    expect(b.isAdded()).toBe(false);
    expect(target.health).toBe(126); // 138 - 12
  });

  test("④b `pierce = true`：不移除、记录 `collided`、同一目标不重复命中", () => {
    const type = new BulletType(0, 5);
    type.pierce = true;
    type.lifetime = 100;
    const bullet = makeBullet({ x: 50, y: 50, lifetime: 100, type });
    const target = spawnUnit(new FakeUnit(56, 50, 150));

    collideBullets();
    expect(bullet.hit).toBe(false);
    expect(bullet.isAdded()).toBe(true);
    expect(bullet.collided).toEqual([target.id]);
    expect(bullet.hasCollided(target.id)).toBe(true);
    expect(target.health).toBe(145);

    // 第二次碰撞：`collides()` 里的 `pierce && hasCollided(id)` 使同一目标不再命中。
    collideBullets();
    expect(target.health).toBe(145);
    expect(bullet.collided.length).toBe(1);
    expect(bullet.isAdded()).toBe(true);
  });

  test("④c 不同队伍的靶子才命中；同队伍不命中", () => {
    const type = new BulletType(0, 5);
    type.lifetime = 100;
    const friend = spawnUnit(new FakeUnit(56, 50, 150));
    friend.team = Team.sharded.id; // 与子弹同队

    const bullet = makeBullet({ x: 50, y: 50, lifetime: 100, type });
    collideBullets();

    expect(bullet.isAdded()).toBe(true);
    expect(bullet.hit).toBe(false);
    expect(friend.health).toBe(150);
  });
});

describe("S1 子弹: Groups.bullet 计数", () => {
  test("⑥ add/remove 后计数与 id 分配正确；重复 remove 幂等", () => {
    const a = makeBullet({ x: 0, y: 0, lifetime: 100 });
    const b = makeBullet({ x: 0, y: 0, lifetime: 100 });

    expect(Groups.bullet.size()).toBe(2);
    expect(a.id).toBeGreaterThanOrEqual(0);
    expect(b.id).toBeGreaterThanOrEqual(0);
    expect(a.id).not.toBe(b.id);
    expect(Groups.bullet.index(0)).toBe(a);
    expect(Groups.bullet.index(1)).toBe(b);

    b.remove();
    expect(b.isAdded()).toBe(false);
    expect(b.added).toBe(false);
    expect(Groups.bullet.size()).toBe(1);
    expect(Groups.bullet.index(0)).toBe(a);

    a.remove();
    expect(Groups.bullet.size()).toBe(0);

    // 幂等：已移除的实体再移除一次不应改变任何东西（`Building.remove()` 同型守卫）。
    a.remove();
    expect(Groups.bullet.size()).toBe(0);
  });
});

describe("S1 子弹: 与 golden 表对齐", () => {
  test("⑦ `Bullets.standardCopper` 的字段与 `golden/java-bullet-table.txt:6` 一致", () => {
    // golden: `BasicBulletType|2.5|9.0|70.0|4.0|false|true|true`
    const type = Bullets.standardCopper;

    expect(type.speed).toBe(2.5);
    expect(type.damage).toBe(9);
    expect(type.lifetime).toBe(70);
    expect(type.hitSize).toBe(4);
    expect(type.pierce).toBe(false);
    expect(type.collidesAir).toBe(true);
    expect(type.collidesGround).toBe(true);

    // `init()` 的派生值：`calculateRange()`（drag === 0 → speed × lifetime）
    expect(type.range).toBe(2.5 * 70);

    // 内容表不变量：id ≡ 下标（`ContentLoader.logContent()` 的同一判据）
    const bullets = Vars.content.getBy<BulletType>(ContentType.bullet);
    expect(type.getContentType()).toBe(ContentType.bullet);
    expect(bullets.get(type.id)).toBe(type);
  });

  test("⑦b 由 `Bullets.standardCopper.create(...)` 造出的子弹带上同样的数值", () => {
    const type = Bullets.standardCopper;
    const bullet = type.create(null, Team.sharded.id, 64, 64, 0);

    expect(bullet).not.toBeNull();
    const b = bullet!;

    expect(b.type).toBe(type);
    expect(b.team).toBe(Team.sharded.id);
    expect(b.owner).toBeNull();
    expect(b.shooter).toBeNull();

    expect(b.damage).toBe(9);
    expect(b.lifetime).toBe(70);
    expect(b.hitSize).toBe(4);
    expect(b.buildingDamageMultiplier).toBe(type.buildingDamageMultiplier);

    // 位置 / 初速度：速度 2.5，角度 0 → (+2.5, ~0)
    expect(b.x).toBe(64);
    expect(b.y).toBe(64);
    expect(b.lastX).toBe(64);
    expect(b.lastY).toBe(64);
    expect(b.velX).toBeCloseTo(2.5, 10);
    expect(Math.abs(b.velY)).toBeLessThan(1e-6);
    expect(b.justSpawned).toBe(true);
    expect(b.time).toBe(0);
    expect(b.added).toBe(true);
    expect(Groups.bullet.size()).toBe(1);
  });

  test("⑦c duo / scatter 的其余弹药也对齐 golden 表（保留 `lifetime` 为结算后值）", () => {
    // duo graphite: `3.5|18.0|54.57143`；duo silicon: `3.0|12.0|58.333332`
    expect(Bullets.standardGraphite.speed).toBe(3.5);
    expect(Bullets.standardGraphite.damage).toBe(18);
    expect(Bullets.standardGraphite.lifetime).toBeCloseTo(54.57142857142857, 9);
    expect(Bullets.standardGraphite.rangeChange).toBe(16);

    expect(Bullets.standardSilicon.speed).toBe(3);
    expect(Bullets.standardSilicon.damage).toBe(12);
    expect(Bullets.standardSilicon.lifetime).toBeCloseTo(58.333333333333336, 9);
    expect(Bullets.standardSilicon.homingPower).toBe(0.2);

    // scatter: `FlakBulletType|4.0|3.0|58.0|4|false|true|false` ×2 + `4.2|3.0|55.2381`
    for(const flak of [Bullets.flakScrap, Bullets.flakLead, Bullets.flakMetaglass]){
      expect(flak.damage).toBe(3);
      expect(flak.hitSize).toBe(4);
      expect(flak.pierce).toBe(false);
      expect(flak.collidesAir).toBe(true);
      expect(flak.collidesGround).toBe(false); // FlakBulletType.java:18
    }
    expect(Bullets.flakScrap.speed).toBe(4);
    expect(Bullets.flakScrap.lifetime).toBeCloseTo(58, 9);
    expect(Bullets.flakScrap.splashDamage).toBeCloseTo(33, 9); // 22 * 1.5
    expect(Bullets.flakScrap.splashDamageRadius).toBe(24);

    expect(Bullets.flakLead.speed).toBe(4.2);
    expect(Bullets.flakLead.lifetime).toBeCloseTo(55.23809523809524, 9);

    expect(Bullets.flakMetaglass.speed).toBe(4);
    expect(Bullets.flakMetaglass.lifetime).toBeCloseTo(58, 9);
    expect(Bullets.flakMetaglass.fragBullets).toBe(6);
    expect(Bullets.flakMetaglass.fragBullet).toBe(Bullets.glassFrag);
    expect(Bullets.flakMetaglass.despawnHit).toBe(true); // fragBullet !== null → setDefaults 打开

    // `Bullets.java:18-42` 的 placeholder / damageLightning 系
    expect(Bullets.placeholder.speed).toBe(2.5);
    expect(Bullets.placeholder.damage).toBe(9);
    expect(Bullets.placeholder.lifetime).toBe(60);

    expect(Bullets.damageLightning.hittable).toBe(false);
    expect(Bullets.damageLightning.lifetime).toBe(10); // Fx.lightning.lifetime（Fx.java:189）
    expect(Bullets.damageLightningGround.collidesAir).toBe(false);
    expect(Bullets.damageLightningAir.collidesGround).toBe(false);
    expect(Bullets.damageLightningAir.collidesTiles).toBe(false);
    // `copy()` 必须分配新 id（否则 id ≡ 下标不变量被破坏）
    expect(Bullets.damageLightningGround.id).not.toBe(Bullets.damageLightning.id);
    expect(Bullets.damageLightningAir.id).not.toBe(Bullets.damageLightning.id);
  });
});

describe("S1 子弹: BulletType.init() 的派生行为", () => {
  test("⑧ `pierceCap >= 1` → pierce；`lightningType` 按碰撞标志选择；`range` = calculateRange()", () => {
    const t = new BulletType(3, 4);
    t.pierceCap = 2;
    t.lifetime = 10;
    t.hitSize = 5;
    t.init();

    expect(t.pierce).toBe(true); // pierceCap >= 1 → pierce
    expect(t.pierceBuilding).toBe(false); // 不跟着打开
    expect(t.range).toBe(30); // 3 * 10（drag === 0）
    expect(t.lightRadius).toBe(25); // max(18, 5 * 5)
    expect(t.lightningType).toBe(Bullets.damageLightning); // collidesAir && collidesGround
    expect(t.despawnHit).toBe(false); // 无 frag / splash / lightning
    expect(t.drawSize).toBe(40); // max(40, trailLength(-1) * 3 * 2)

    // `rangeOverride > 0` 直接短路
    const override = new BulletType(1, 1);
    override.lifetime = 10;
    override.rangeOverride = 500;
    override.init();
    expect(override.range).toBe(500);

    // `lightning > 0` → despawnHit（setDefaults）
    const lightning = new BulletType(1, 1);
    lightning.lightning = 1;
    lightning.init();
    expect(lightning.despawnHit).toBe(true);

    // 碰撞标志决定默认 `lightningType`
    const ground = new BulletType(1, 1);
    ground.collidesAir = false;
    ground.init();
    expect(ground.lightningType).toBe(Bullets.damageLightningGround);

    const air = new BulletType(1, 1);
    air.collidesGround = false;
    air.init();
    expect(air.lightningType).toBe(Bullets.damageLightningAir);

    // `fragBullet` → despawnHit 打开，并把破片的 `keepVelocity` 关掉
    const frag = new BulletType(1, 1);
    const parent = new BulletType(1, 1);
    parent.fragBullet = frag;
    parent.init();
    expect(parent.despawnHit).toBe(true);
    expect(frag.keepVelocity).toBe(false);
    expect(frag.scaleKeepVelocity).toBe(false);

    // drag > 0 时的射程公式：speed * (1 - (1-drag)^lifetime) / drag
    const drag = new BulletType(2, 1);
    drag.lifetime = 3;
    drag.drag = 0.5;
    drag.init();
    // 2 * (1 - 0.5^3) / 0.5 = 2 * 0.875 / 0.5 = 3.5
    expect(drag.range).toBeCloseTo(3.5, 10);
  });
});
