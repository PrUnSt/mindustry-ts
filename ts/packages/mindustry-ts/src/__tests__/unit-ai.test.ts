// C27 · 单位 AI（AIController）验收测试。
//
// ⚠️ 内容引导：`createWorld()` 会 `bootstrap()`，但 `ContentLoader.createBaseContent()` 没接
//   `Bullets.load()` / `UnitTypes.load()` → 每个用例显式补齐（同 `unit.test.ts` 约定）。
// ⚠️ 驱动：`runTicks` → `Logic.updateEntities()` → `Groups.unit.update()`（`Logic.ts:157`）
//   → 每个 `UnitRuntime.update()` 开头调 `controller.updateUnit()`（AI 设速度，随后位移）。
//
// ⚠️ 与 Java 的差异（见 `AIController.ts` 文件头）：无 WeaponMount → 只打第一把武器；
//   目标策略简化为「最近敌方建筑/单位」；精确开火门限简化为「射程内即开火」。
// 反事实（已复原）：把 `UnitRuntime.update()` 里的 `controller?.updateUnit()` 注释掉
//   → ②移动 / ③索敌 / ④开火 三条变红（`Tests 3 failed`），证明 AI 闭环确实由它驱动。

import { beforeEach, describe, expect, test } from "vitest";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Bullets } from "../content/Bullets.js";
import { UnitTypes } from "../content/UnitTypes.js";
import { Team } from "../game/Team.js";
import { Groups } from "../gen/Groups.js";
import { createWorld, placeBlock, runTicks } from "../harness.js";
import { SpawnGroup } from "../game/Spawner.js";
import { AIController } from "../entities/units/AIController.js";
import type { UnitRuntime } from "../entities/UnitRuntime.js";

beforeEach(() => {
  createWorld(48, 16, 1);
  Bullets.load();
  UnitTypes.load();
});

/** 生成一个敌方 dagger（crux）并装配 AI。 */
function enemyDagger(x: number, y: number): UnitRuntime{
  const u = UnitTypes.dagger.spawn(Team.crux.id, x, y);
  u.controller = new AIController(u);
  return u;
}

describe("unit-ai: ① moveTo（速度控制）", () => {
  test("距目标 > radius → 速度朝目标；距目标 <= radius → 速度清零", () => {
    const u = enemyDagger(40, 40);
    const ai = u.controller!;
    const target = { x: 80, y: 40, team: Team.sharded.id };

    ai.moveTo(target, 10, 0.5);
    expect(u.velX, "朝右（目标在右侧）").toBeGreaterThan(0);
    expect(u.velY, "y 无变化").toBe(0);

    // 把单位放到目标 8 格内 → 停下
    u.x = 72;
    ai.moveTo(target, 10, 0.5);
    expect(u.velX).toBe(0);
    expect(u.velY).toBe(0);
  });
});

describe("unit-ai: ② 移动闭环（AI 驱动速度 → 单位位移）", () => {
  test("有目标 → 单位朝它移动（持续靠近、不越过）", () => {
    const u = enemyDagger(40, 40);
    const target = { x: 200, y: 40, team: Team.sharded.id };
    u.controller!.target = target;
    // 缩小射程，避免默认大射程导致「一出生就在射程内停下」
    u.type!.range = 24;

    const d0 = Math.abs(target.x - u.x);
    runTicks(60);
    expect(u.x, "向右移动了").toBeGreaterThan(40);
    expect(u.x, "未越过目标").toBeLessThan(200);
    const d1 = Math.abs(target.x - u.x);
    expect(d1, "持续靠近").toBeLessThan(d0);
  });

  test("无目标 → 减速停下（不漂移）", () => {
    const u = enemyDagger(40, 40);
    u.velX = 5;
    u.controller!.target = null;
    const x0 = u.x;
    runTicks(20);
    expect(Math.abs(u.velX), "速度衰减到接近 0").toBeLessThan(0.5);
    expect(u.x - x0, "位移有限").toBeLessThan(40);
  });
});

describe("unit-ai: ③ 索敌", () => {
  test("敌方建筑在场上 → 锁定为 target 并朝它移动", () => {
    placeBlock(30, 5, Blocks.conveyor, 0); // 玩家（sharded）建筑
    const u = enemyDagger(5 * 8, 5 * 8); // 敌方（crux）
    runTicks(5);
    expect(u.controller!.target, "找到敌方建筑").not.toBeNull();
    expect(u.controller!.target!.team, "目标是我方队伍").toBe(Team.sharded.id);
    const x0 = u.x;
    runTicks(60);
    expect(u.x, "朝建筑移动").toBeGreaterThan(x0);
  });

  test("无敌方建筑 → target 保持 null，单位原地", () => {
    const u = enemyDagger(40, 40);
    runTicks(20);
    expect(u.controller!.target).toBeNull();
    expect(Math.abs(u.velX) + Math.abs(u.velY)).toBeLessThan(1);
  });
});

describe("unit-ai: ④ 武器开火", () => {
  test("目标在武器射程内且装填完毕 → 生成一颗子弹", () => {
    const u = enemyDagger(40, 40);
    const ai = u.controller!;
    ai.target = { x: 50, y: 40, team: Team.sharded.id }; // 距 10 < dagger weapon.range
    ai.reload = 0;
    expect(Groups.bullet.size()).toBe(0);
    runTicks(1);
    expect(Groups.bullet.size(), "射程内开火").toBe(1);
    expect(u.isShooting, "isShooting 标记").toBe(true);
    // 之后进入装填（reload=13），不再连发
    runTicks(3);
    expect(Groups.bullet.size(), "装填期间不再开火").toBe(1);
  });

  test("目标在射程外 → 不开火", () => {
    const u = enemyDagger(40, 40);
    const ai = u.controller!;
    ai.target = { x: 400, y: 40, team: Team.sharded.id }; // 距 360 > range
    ai.reload = 0;
    runTicks(5);
    expect(Groups.bullet.size()).toBe(0);
  });
});

describe("unit-ai: ⑤ 波次装配", () => {
  test("SpawnGroup.createUnit 给波次单位装 AI（controller 非 null）", () => {
    const sg = new SpawnGroup();
    sg.type = UnitTypes.dagger;
    const u = sg.createUnit(Team.crux.id, 40, 40, 0, 1);
    expect(u.controller, "波次单位有 AI").not.toBeNull();
    expect(u.controller!.unit, "控制器绑定单位").toBe(u);
    expect(Groups.unit.count((x) => x === u)).toBe(1);
  });
});
