// S2 · 单位子系统验收测试。
//
// 覆盖（对应交付要求 ①-⑧）:
//   ① `UnitTypes.dagger` / `mace` 与 `ts/golden/java-unit-table.txt` 逐字段一致
//      （含 `init()` 的镜像武器计数与装填翻倍）
//   ② `new UnitRuntime()` 的构造初值（对照 `gen/Unit.ts` + `UnitComp.def.ts`）
//   ③ 逐 tick 位移 `velX × speed`/`Time.delta`（给具体坐标；含 `Time.delta = 0.5` 的缩放）
//   ③b `drag` 按 `max(1 - drag × delta, 0)` 衰减
//   ④ `health` 扣减 → `dead` → 从 `Groups.unit` 移除
//   ⑤ `Groups.unit` 的 add/remove 计数与 id 分配
//   ⑥ `updateLastPosition()` 的 `deltaX/deltaY`
//   ⑦ `rotation` 同步（速度方向）
//   ⑧ `Weapon` 字段默认值 / `init` / `flip` / `copy` / `toString`
//   ⑨ `UnitType.create()` / `spawn()` 的 team / maxHealth / elevation / 位置
//
// ⚠️ 逐 tick `update()` 的驱动：本文件显式调用 `updateUnits()`（= `Groups.unit.update()`）。
//   `Groups.update()`（codegen 产物）**不含** `Groups.unit.update()`，而 unit 组又不在
//   `Groups.all` 里（`GroupDefs.java:7` 排除 `Unitc`），所以单位必须像 Java
//   `Logic.updateEntities()`（`Logic.java:495` 附近）那样被**显式**驱动。详见
//   `src/entities/UnitRuntime.ts` 文件头。
//
// ⚠️ 内容引导顺序：`Vars.bootstrap()` → `Bullets.load()` → `UnitTypes.load()`。与 Java
//   `ContentLoader.createBaseContent()` 的 `… → Bullets → UnitTypes` 顺序一致（单位 `init()`
//   算射程时要读 `weapon.bullet.range`，子弹必须先 init）。见 `content/UnitTypes.ts` 文件头。

import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { Time } from "@mindustry-ts/arc";
import { Vars } from "../Vars.js";
import { ContentType } from "../ctype/ContentType.js";
import { Bullets } from "../content/Bullets.js";
import { UnitTypes } from "../content/UnitTypes.js";
import { Team } from "../game/Team.js";
import { Groups } from "../gen/Groups.js";
import { UnitRuntime, updateUnits } from "../entities/UnitRuntime.js";
import { UnitType } from "../type/UnitType.js";
import { Weapon } from "../type/Weapon.js";
import { Fx } from "../mocks/Fx.js";
import { Sounds } from "../mocks/Sounds.js";
import { StatusEffects } from "../mocks/StatusEffects.js";
import { Pal } from "../arc-compat/Pal.js";

/** 内容引导只跑一次。`Vars.bootstrap()` 必须先于任何 `Content` 构造（构造器读 `Vars.content`）。 */
beforeAll(() => {
  Vars.bootstrap();
  Bullets.load();
  UnitTypes.load();
});

/** 每个用例都从「无单位」的干净状态开始。 */
afterEach(() => {
  Groups.unit.clear();
});

/** 造一个已入组、可测的裸单位（不经 `UnitType`，用于钉住运行时的纯粹行为）。 */
function bareUnit(x: number, y: number, velX = 0, velY = 0, drag = 0): UnitRuntime{
  const u = new UnitRuntime();
  u.team = Team.sharded.id;
  u.x = x;
  u.y = y;
  u.lastX = x;
  u.lastY = y;
  u.velX = velX;
  u.velY = velY;
  u.drag = drag;
  u.hitSize = 8;
  u.add();
  return u;
}

describe("S2 单位: 与 golden/java-unit-table.txt 对齐", () => {
  test("① `UnitTypes.dagger`：health/speed/hitSize/armor/flying/weapons 与 golden:4 一致", () => {
    // golden: `dagger|150.0|0.5|8.0|0.0|false|2|large-weapon,large-weapon`
    const type = UnitTypes.dagger;

    expect(type.health).toBe(150);
    expect(type.speed).toBe(0.5);
    expect(type.hitSize).toBe(8);
    expect(type.armor).toBe(0);
    expect(type.flying).toBe(false);

    // golden 的 weaponCount=2 是 `UnitType.init()` 镜像后的结果（源码只写 1 把）。
    expect(type.weapons.length).toBe(2);
    expect(type.weapons.map((w) => w.name).join(",")).toBe("large-weapon,large-weapon");

    // 镜像后 `reload` / `recoilTime` 翻倍（`UnitType.java:1050-1053`），并互相记下 otherSide。
    expect(type.weapons[0]!.reload).toBe(26); // 13 * 2
    expect(type.weapons[1]!.reload).toBe(26);
    expect(type.weapons[0]!.recoilTime).toBe(26);
    expect(type.weapons[0]!.otherSide).toBe(1);
    expect(type.weapons[1]!.otherSide).toBe(0);

    // 镜像是 X 取反的副本（`Weapon.flip()`）。
    expect(type.weapons[0]!.x).toBe(4);
    expect(type.weapons[1]!.x).toBe(-4);
    expect(type.weapons[0]!.flipSprite).toBe(false);
    expect(type.weapons[1]!.flipSprite).toBe(true);
    // 浅拷贝 → 共享同一个 bullet 实例
    expect(type.weapons[1]!.bullet).toBe(type.weapons[0]!.bullet);

    // 武器子弹：`BasicBulletType(2.5f, 9){{ lifetime = 60f; }}`（`UnitTypes.java:113-117`）
    const bullet = type.weapons[0]!.bullet!;
    expect(bullet.speed).toBe(2.5);
    expect(bullet.damage).toBe(9);
    expect(bullet.lifetime).toBe(60);
    expect(bullet.range).toBe(150); // 2.5 * 60（drag === 0）
    expect(type.weapons[0]!.range()).toBe(150);

    // `UnitType.init()` 的射程派生：`weapon.range() - margin(4)`
    expect(type.range).toBe(146);
    expect(type.maxRange).toBe(146);

    // dpsEstimate = Σ weapon.dps() = 2 * (9 / 26 * 1 * 60)
    expect(type.dpsEstimate).toBeCloseTo(41.53846153846154, 9);

    // `singleTarget` 在 Java 里于**镜像之前**求值（`UnitType.java:959` 早于 `:1037`），
    // 所以判据是「源码里只写了 1 把武器」→ true，而不是镜像后的 2。
    expect(type.singleTarget).toBe(true);
    expect(type.canAttack).toBe(true);
    expect(type.canHeal).toBe(false);
    expect(type.getContentType()).toBe(ContentType.unit);
  });

  test("①b `UnitTypes.mace`：health/speed/hitSize/armor/flying/weapons 与 golden:5 一致", () => {
    // golden: `mace|550.0|0.5|10.0|4.0|false|2|flamethrower,flamethrower`
    const type = UnitTypes.mace;

    expect(type.health).toBe(550);
    expect(type.speed).toBe(0.5);
    expect(type.hitSize).toBe(10);
    expect(type.armor).toBe(4);
    expect(type.flying).toBe(false);
    expect(type.weapons.length).toBe(2);
    expect(type.weapons.map((w) => w.name).join(",")).toBe("flamethrower,flamethrower");
    expect(type.weapons[0]!.reload).toBe(44); // 22 * 2

    // `new BulletType(4.2f, 37f*2f){{ … }}`（`UnitTypes.java:135-149`）
    const bullet = type.weapons[0]!.bullet!;
    expect(bullet.speed).toBe(4.2);
    expect(bullet.damage).toBe(74); // 37 * 2
    expect(bullet.hitSize).toBe(7);
    expect(bullet.lifetime).toBe(13);
    expect(bullet.pierce).toBe(true);
    expect(bullet.pierceBuilding).toBe(true);
    expect(bullet.pierceCap).toBe(2);
    expect(bullet.ammoMultiplier).toBe(3);
    expect(bullet.hittable).toBe(false);
    expect(bullet.keepVelocity).toBe(false);

    expect(type.weapons[0]!.shootSound).toBe(Sounds.shootFlame);
    expect(type.weapons[0]!.shootY).toBe(2);
    expect(type.range).toBeCloseTo(50.6, 9); // 4.2 * 13 - 4
  });

  test("①c 单位内容的 id ≡ 下标（`ContentLoader.logContent()` 的同一判据）", () => {
    const units = Vars.content.getBy<UnitType>(ContentType.unit);
    expect(units.get(UnitTypes.dagger.id)).toBe(UnitTypes.dagger);
    expect(units.get(UnitTypes.mace.id)).toBe(UnitTypes.mace);
    expect(UnitTypes.dagger.id).not.toBe(UnitTypes.mace.id);
  });

  test("①d `isHidden()` 跟随 `hidden` 字段", () => {
    expect(UnitTypes.dagger.hidden).toBe(false);
    expect(UnitTypes.dagger.isHidden()).toBe(false);

    UnitTypes.dagger.hidden = true;
    try{
      expect(UnitTypes.dagger.isHidden()).toBe(true);
    }finally{
      UnitTypes.dagger.hidden = false;
    }
    expect(UnitTypes.dagger.isHidden()).toBe(false);
  });
});

describe("S2 单位: UnitRuntime 构造与字段初值", () => {
  test("② `new UnitRuntime()` 的字段初值与 `gen/Unit.ts` 一致", () => {
    const u = new UnitRuntime();

    expect(u.id).toBe(-1);
    expect(u.added).toBe(false);
    expect(u.isAdded()).toBe(false);

    expect(u.x).toBe(0);
    expect(u.y).toBe(0);
    expect(u.team).toBe(0); // Team.derelict 的 id

    expect(u.health).toBe(0);
    expect(u.maxHealth).toBe(1);
    expect(u.dead).toBe(false);
    expect(u.hitTime).toBe(0);
    expect(u.isValid()).toBe(false);
    expect(u.healthf()).toBe(0);

    expect(u.rotation).toBe(0);
    expect(u.hitSize).toBe(0);
    expect(u.hitSizeValue()).toBe(0);

    expect(u.lastX).toBe(0);
    expect(u.lastY).toBe(0);
    expect(u.deltaX).toBe(0);
    expect(u.deltaY).toBe(0);
    expect(u.deltaLen()).toBe(0);

    expect(u.velX).toBe(0);
    expect(u.velY).toBe(0);
    expect(u.drag).toBe(0);
    expect(u.moving()).toBe(false);

    expect(u.elevation).toBe(0);
    expect(u.drowned).toBe(false);

    // 具象类自有
    expect(u.type).toBeNull();
    expect(u.speed()).toBe(0); // type === null
    expect(u.isGrounded()).toBe(true);
    expect(u.isFlying()).toBe(false);
    expect(u.checkTarget(true, true)).toBe(true); // 落地 && targetGround

    // 纯计算方法
    expect(u.solidity()).toBeNull();
    expect(u.ignoreSolids()).toBe(false);
    // 与冻结的 TeamComp 契约一致：derelict (team 0) → cheating 为 true
    expect(u.cheating()).toBe(true);
    expect(u.inFogTo(0)).toBe(false); // team === viewer → 可见
  });
});

describe("S2 单位: 逐 tick 物理", () => {
  test("③ 位置按 `velX × Time.delta` 推进（Time.delta = 1，给具体坐标）", () => {
    expect(Time.delta).toBe(1);

    const u = bareUnit(100, 100, 0.5, 0, 0);

    updateUnits();
    expect(u.x).toBe(100.5); // 100 + 0.5 * 1
    expect(u.y).toBe(100);
    expect(u.velX).toBe(0.5);

    updateUnits();
    expect(u.x).toBe(101); // 100.5 + 0.5
    expect(u.y).toBe(100);

    // rotation 跟随速度方向（沿 +x → 约 0；`Mathf.angle` 是 arc 近似实现）
    expect(u.rotation).toBeCloseTo(0, 3);
  });

  test("③b 位移严格随 `Time.delta` 缩放（Time.delta = 0.5 → 位移减半）", () => {
    const prev = Time.delta;
    Time.delta = 0.5;
    try{
      const u = bareUnit(0, 0, 2, 0, 0);
      updateUnits();
      expect(u.x).toBe(1); // 2 * 0.5，不是 2
      expect(u.velX).toBe(2); // drag === 0 → 不衰减
    }finally{
      Time.delta = prev;
    }
  });

  test("③c `drag` 按 `max(1 - drag × delta, 0)` 逐帧衰减速度", () => {
    const u = bareUnit(0, 0, 10, 0, 0.5);

    updateUnits();
    expect(u.x).toBe(10); // 本帧用衰减前的 10
    expect(u.velX).toBeCloseTo(5, 10); // 10 * (1 - 0.5)

    updateUnits();
    expect(u.x).toBeCloseTo(15, 10); // 10 + 5
    expect(u.velX).toBeCloseTo(2.5, 10); // 5 * 0.5
  });

  test("③d `speed()` = `type.speed`（elevation 0，`canBoost` false → boost = 1）", () => {
    const u = UnitTypes.dagger.create(Team.crux.id);
    expect(u.speed()).toBe(0.5);

    // canBoost = true 的单位在 elevation 1 时乘上 boostMultiplier
    const flying = new UnitType("unit-test-flying-probe");
    flying.speed = 3;
    flying.flying = true;
    flying.canBoost = true;
    flying.boostMultiplier = 2;
    const f = flying.create(Team.crux.id);
    expect(f.elevation).toBe(1); // flying → elevation 1
    expect(f.isFlying()).toBe(true);
    expect(f.isGrounded()).toBe(false);
    expect(f.checkTarget(true, false)).toBe(true); // 飞行 && targetAir
    expect(f.speed()).toBe(6); // 3 * lerp(1, 2, 1)
    f.remove();
  });
});

describe("S2 单位: 组记账与 id", () => {
  test("⑤ `Groups.unit` 的 add/remove 计数、id 分配与幂等", () => {
    const a = UnitTypes.dagger.create(Team.sharded.id);
    const b = UnitTypes.dagger.create(Team.crux.id);
    expect(Groups.unit.size()).toBe(0);

    a.add();
    b.add();
    expect(Groups.unit.size()).toBe(2);
    expect(a.isAdded()).toBe(true);
    expect(a.id).toBeGreaterThanOrEqual(0);
    expect(b.id).toBeGreaterThanOrEqual(0);
    expect(a.id).not.toBe(b.id);
    expect(Groups.unit.index(0)).toBe(a);
    expect(Groups.unit.index(1)).toBe(b);

    b.remove();
    expect(b.isAdded()).toBe(false);
    expect(b.added).toBe(false);
    expect(Groups.unit.size()).toBe(1);
    expect(Groups.unit.index(0)).toBe(a);

    a.remove();
    expect(Groups.unit.size()).toBe(0);

    // 幂等：已移除的实体再移除一次不应改变任何东西
    a.remove();
    expect(Groups.unit.size()).toBe(0);
  });

  test("⑨ `UnitType.create()` / `spawn()` 设置 team / maxHealth / elevation / 位置", () => {
    const u = UnitTypes.dagger.create(Team.crux.id);
    expect(u.type).toBe(UnitTypes.dagger);
    expect(u.team).toBe(Team.crux.id);
    expect(u.maxHealth).toBe(150);
    expect(u.health).toBe(150); // 满血生成（Java `UnitType.create` 的 `unit.heal()`）
    expect(u.hitSize).toBe(8);
    expect(u.drag).toBe(0.3); // setType 从 type.drag 拷入
    expect(u.elevation).toBe(0); // flying = false
    expect(u.isAdded()).toBe(false); // `create()` 不入组

    const s = UnitTypes.dagger.spawn(Team.crux.id, 64, 96, 45);
    expect(s.x).toBe(64);
    expect(s.y).toBe(96);
    expect(s.rotation).toBe(45);
    expect(s.lastX).toBe(64); // `add()` 里刷新的
    expect(s.lastY).toBe(96);
    expect(s.isAdded()).toBe(true);
    expect(Groups.unit.size()).toBe(1);
  });
});

describe("S2 单位: 生命 / 伤害闭环", () => {
  test("④ `damage` 扣血；归零 → `dead` → 从 `Groups.unit` 移除", () => {
    const u = UnitTypes.dagger.create(Team.crux.id);
    u.add();
    expect(Groups.unit.size()).toBe(1);
    expect(u.health).toBe(150);

    u.damage(60, true);
    expect(u.health).toBe(90);
    expect(u.hitTime).toBe(1);
    expect(u.dead).toBe(false);
    expect(u.damaged()).toBe(true);
    expect(u.isAdded()).toBe(true);

    u.damage(50, true);
    expect(u.health).toBe(40);
    expect(u.dead).toBe(false);
    expect(u.isValid()).toBe(true);
    expect(u.healthf()).toBeCloseTo(40 / 150, 10);

    u.damage(50, true);
    // 40 - 50 = -10，`kill()` 里 `health = min(health, 0)` 保留 -10（Java 原样行为）
    expect(u.health).toBe(-10);
    expect(u.dead).toBe(true);
    expect(u.isAdded()).toBe(false);
    expect(u.isValid()).toBe(false);
    expect(Groups.unit.size()).toBe(0);

    // 死后继续受伤不再触发 kill()（`if(dead) return`），但 `health` 仍按 Java 语义继续扣减；
    // 关键是 `dead` / 组计数不变（`kill()` 幂等，不会重复 remove）。
    u.damage(100, true);
    expect(u.dead).toBe(true);
    expect(Groups.unit.size()).toBe(0);
  });

  test("④b `heal` 直接治疗并 clamp 到 `maxHealth`", () => {
    const u = bareUnit(0, 0);
    u.maxHealth = 100;
    u.health = 30;

    u.heal(20);
    expect(u.health).toBe(50);
    expect(u.damaged()).toBe(true);

    u.heal(1000);
    expect(u.health).toBe(100); // clampHealth
    expect(u.damaged()).toBe(false);
    expect(u.healthf()).toBe(1);
  });
});

describe("S2 单位: Hitbox / rotation", () => {
  test("⑥ `updateLastPosition()` 计算 delta 并前移 lastX/lastY", () => {
    const u = bareUnit(100, 100, 0.5, 0, 0);

    updateUnits();
    // update() 内已调用过 updateLastPosition
    expect(u.x).toBe(100.5);
    expect(u.lastX).toBe(100.5);
    expect(u.lastY).toBe(100);
    expect(u.deltaX).toBe(0.5);
    expect(u.deltaY).toBe(0);
    expect(u.deltaLen()).toBeCloseTo(0.5, 10);

    // 手动置位 → 纯计算方法
    u.set(20, 30);
    u.lastX = 10;
    u.lastY = 10;
    u.updateLastPosition();
    expect(u.deltaX).toBe(10);
    expect(u.deltaY).toBe(20);
    expect(u.lastX).toBe(20);
    expect(u.lastY).toBe(30);
  });

  test("⑦ `rotation` 每 tick 按速度方向同步；静止时不改变", () => {
    // 沿 +y → 90（`Mathf.angle(0, 1)` 恰好是 90）
    const u = bareUnit(0, 0, 0, 1, 0);
    updateUnits();
    expect(u.rotation).toBe(90);
    expect(u.y).toBe(1);

    // 沿 -x → ~180
    u.velX = -1;
    u.velY = 0;
    updateUnits();
    expect(u.rotation).toBeCloseTo(180, 3);

    // 速度为零 → rotation 保持不变
    u.velX = 0;
    u.velY = 0;
    u.rotation = 42;
    updateUnits();
    expect(u.rotation).toBe(42);
  });

  test("⑥b `deltaAngle()` 按 `atan2(deltaY, deltaX)` 得到角度 0..360", () => {
    const u = bareUnit(0, 0);
    u.deltaX = 0;
    u.deltaY = 10;
    // 内联公式用的是 arc 的 `Mathf.PI = 3.1415927`（不是 Math.PI）→ 与精确 90 有 ~1.3e-6 偏差
    expect(u.deltaAngle()).toBeCloseTo(90, 4);

    u.deltaX = -10;
    u.deltaY = 0;
    expect(u.deltaAngle()).toBeCloseTo(180, 4);
  });
});

describe("S2 单位: Weapon 默认值与工具方法", () => {
  test("⑧ `new Weapon(name)` 的字段默认值", () => {
    const w = new Weapon("test");

    expect(w.name).toBe("test");
    expect(w.bullet).toBeNull(); // Java 是 Bullets.placeholder；TS 收窄为 null
    expect(w.reload).toBe(1);
    expect(w.x).toBe(5);
    expect(w.y).toBe(0);
    expect(w.shootX).toBe(0);
    expect(w.shootY).toBe(3);
    expect(w.rotateSpeed).toBe(20);
    expect(w.rotate).toBe(false);
    expect(w.shots).toBe(1); // ≡ ShootPattern.shots
    expect(w.spacing).toBe(0); // ≡ ShootPattern.shotDelay
    expect(w.inaccuracy).toBe(0);
    expect(w.velocityRnd).toBe(0);
    expect(w.recoil).toBe(1.5);
    expect(w.top).toBe(true);
    expect(w.mirror).toBe(true);
    expect(w.alternate).toBe(true);
    expect(w.shake).toBe(0);
    expect(w.reloadMultiplier).toBe(1); // 新增字段
    expect(w.shootSound).toBe(Sounds.shoot);
    expect(w.ejectEffect).toBe(Fx.none);
    expect(w.heatColor).toBe(Pal.turretHeat);
    expect(w.shootStatus).toBe(StatusEffects.none);
    expect(w.otherSide).toBe(-1);
    expect(w.useAttackRange).toBe(true);

    expect(w.range()).toBe(0); // bullet === null
    expect(w.dps()).toBe(0);

    expect(w.toString()).toBe("Weapon: test");
    expect(new Weapon("").toString()).toBe("Weapon");
  });

  test("⑧b `Weapon.init()` / `flip()` / `copy()`", () => {
    const w = new Weapon("w");
    w.alwaysContinuous = true;
    w.init();
    expect(w.continuous).toBe(true); // alwaysContinuous 蕴含 continuous

    w.x = 5;
    w.shootX = 2;
    w.baseRotation = 30;
    w.flip();
    expect(w.x).toBe(-5);
    expect(w.shootX).toBe(-2);
    expect(w.baseRotation).toBe(-30);
    expect(w.flipSprite).toBe(true);

    const w2 = new Weapon("copy-src");
    w2.reload = 7;
    const copy = w2.copy();
    expect(copy).not.toBe(w2);
    expect(copy.name).toBe("copy-src");
    expect(copy.reload).toBe(7);
  });

  test("⑧c dagger 武器的 `shotsPerSec()`（镜像后 reload 翻倍）", () => {
    const w = UnitTypes.dagger.weapons[0]!;
    // shots = 1, reload = 26 → 60 / 26
    expect(w.shotsPerSec()).toBeCloseTo(60 / 26, 10);
    expect(w.useAttackRange).toBe(true);
  });
});
