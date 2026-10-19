// C24 · 单位生产（UnitFactory）验收测试。
//
// ⚠️ 内容引导：`createWorld()` 会 `bootstrap()`，但 `ContentLoader.createBaseContent()` **没有**
//   接 `Bullets.load()` / `UnitTypes.load()`（见该文件 :215-216 原位注释）→ 每个用例显式按
//   Java 顺序补齐（与 `turret.test.ts` / `wave.test.ts` / `unit.test.ts` 同一约定）。
//
// ⚠️ 生产时序（实测，f64 确定性）：
//   · 工厂 `progress += edelta()`（efficiency=1 → 每 tick +1）；
//   · 第 1 tick 的 efficiency 恒 0（电网先结算、工厂后读到 coverage，同 `power.test.ts` 前提）
//     → 进度从 tick 2 起算 → `plan.time=60` 首次产出在 **tick 61**，之后每 60 tick 一台；
//   · 产出时 `consume()` 扣当前方案 requirements（× unitCostMultiplier），`progress %= 1`；
//   · 无 payload 系统 → 单位**直接原地生成**（`UnitType.spawn`，见 `UnitFactory.ts` 文件头）。
//
// 反事实（实测变红后复原）见文件尾注释。

import { beforeEach, describe, expect, test } from "vitest";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Bullets } from "../content/Bullets.js";
import { Items } from "../content/Items.js";
import { UnitTypes } from "../content/UnitTypes.js";
import { Groups } from "../gen/Groups.js";
import { createWorld, placeBlock, runTicks } from "../harness.js";
import { UnitFactory, UnitFactoryBuild, UnitPlan } from "../world/blocks/units/UnitFactory.js";
import { ConsumeGeneratorBuild } from "../world/blocks/power/ConsumeGenerator.js";
import { ItemStack } from "../type/ItemStack.js";
import type { UnitRuntime } from "../entities/UnitRuntime.js";

/** 唯一方块名计数器（理由同 `power.test.ts`）。 */
let blockSeq = 0;
function nextName(base: string): string{
  return base + "-t" + String(blockSeq++);
}

/** 建一个耗电 0.5、方案 dagger/time/需求可调的工厂夹具（自建实例，放置前 init）。 */
function makeFactory(time = 60, siliconReq = 1, leadReq = 1): UnitFactory{
  const b = new UnitFactory(nextName("unit-factory"));
  b.size = 2;
  b.consumePower(0.5);
  b.plans.add(new UnitPlan(UnitTypes.dagger, time, [
    new ItemStack(Items.silicon, siliconReq),
    new ItemStack(Items.lead, leadReq),
  ]));
  b.init();
  return b;
}

/** 放一台加满煤的燃烧发电机（产 1.0），返回建筑。 */
function placeGen(x: number, y: number): ConsumeGeneratorBuild{
  placeBlock(x, y, Blocks.combustionGenerator, 0);
  const g = Vars.world.tile(x, y)!.build as ConsumeGeneratorBuild;
  g.items.add(Items.coal, 60);
  return g;
}

/** 当前单位总数。 */
function unitCount(): number{
  return Groups.unit.size();
}

beforeEach(() => {
  createWorld(16, 16, 1);
  Bullets.load();
  UnitTypes.load();
});

describe("unit-factory: ① 生产闭环（C24）", () => {
  test("有电有料 → tick 61 产出第一台 dagger，之后每 60 tick 一台；每次扣料", () => {
    placeGen(4, 5);
    placeBlock(5, 5, makeFactory(), 0);
    const fb = Vars.world.tile(5, 5)!.build as UnitFactoryBuild;
    fb.items.setAmount(Items.silicon, 10);
    fb.items.setAmount(Items.lead, 10);
    // `created()` 已自动选中方案 0
    expect(fb.currentPlan).toBe(0);

    runTicks(60);
    expect(unitCount(), "tick60 尚未产出").toBe(0);

    runTicks(1); // tick 61
    expect(unitCount(), "tick61 产出第一台").toBe(1);
    expect(fb.items.get(Items.silicon), "扣料 si 10→9").toBe(9);
    expect(fb.items.get(Items.lead), "扣料 le 10→9").toBe(9);

    const u = Groups.unit.first() as UnitRuntime;
    expect(u.type!.name, "产出的是 dagger").toBe("dagger");
    expect(u.team, "队伍 = 放置队伍").toBe(Vars.state.rules.defaultTeam.id);

    // 之后每 60 tick 一台
    runTicks(60); // tick 121
    expect(unitCount(), "tick121 第二台").toBe(2);
    expect(fb.items.get(Items.silicon)).toBe(8);
    expect(fb.items.get(Items.lead)).toBe(8);
  });
});

describe("unit-factory: ② 停产闸门（缺料 / 无电 / 停方案）", () => {
  test("缺料 → efficiency 0 → 不产（progress 保持 0）", () => {
    placeGen(4, 5);
    placeBlock(5, 5, makeFactory(), 0);
    const fb = Vars.world.tile(5, 5)!.build as UnitFactoryBuild;
    // 没放硅/铅
    runTicks(100);
    expect(unitCount()).toBe(0);
    expect(fb.efficiency).toBe(0);
    expect(fb.progress).toBe(0);
  });

  test("无电 → efficiency 0 → 不产（power.status 恒 0）", () => {
    placeBlock(5, 5, makeFactory(), 0);
    const fb = Vars.world.tile(5, 5)!.build as UnitFactoryBuild;
    fb.items.setAmount(Items.silicon, 10);
    fb.items.setAmount(Items.lead, 10);
    runTicks(100);
    expect(unitCount()).toBe(0);
    expect(fb.power.status).toBe(0);
    expect(fb.efficiency).toBe(0);
  });

  test("configure(-1) 停产；configure(0) 恢复", () => {
    placeGen(4, 5);
    const f = makeFactory();
    placeBlock(5, 5, f, 0);
    const fb = Vars.world.tile(5, 5)!.build as UnitFactoryBuild;
    fb.items.setAmount(Items.silicon, 10);
    fb.items.setAmount(Items.lead, 10);

    fb.configure(-1);
    expect(fb.currentPlan).toBe(-1);
    runTicks(61);
    expect(unitCount(), "停产后不产").toBe(0);

    fb.configure(0);
    expect(fb.currentPlan).toBe(0);
    runTicks(61);
    expect(unitCount(), "恢复方案 0 后照常产出").toBe(1);
  });
});

describe("unit-factory: ③ 收料 / 容量 / 注册装配", () => {
  test("acceptItem 只收当前方案的物品；getMaximumAccepted = 容量（2×需求）", () => {
    placeBlock(5, 5, makeFactory(60, 1, 1), 0);
    const fb = Vars.world.tile(5, 5)!.build as UnitFactoryBuild;
    expect(fb.getMaximumAccepted(Items.silicon)).toBe(2);
    expect(fb.getMaximumAccepted(Items.lead)).toBe(2);
    expect(fb.getMaximumAccepted(Items.copper), "不在方案 → 容量 0").toBe(0);
    expect(fb.acceptItem(null as unknown as never, Items.silicon)).toBe(true);
    expect(fb.acceptItem(null as unknown as never, Items.lead)).toBe(true);
    expect(fb.acceptItem(null as unknown as never, Items.copper)).toBe(false);
  });

  test("注册的 groundFactory：planBinder 惰性装配方案 + created 自动选中 + 字段", () => {
    placeBlock(8, 5, Blocks.groundFactory, 0);
    const gb = Vars.world.tile(8, 5)!.build as UnitFactoryBuild;
    // 方案依赖 `UnitTypes`（bootstrap 不加载）→ `created()` 触发 planBinder 补建
    expect(Blocks.groundFactory.plans.size, "planBinder 已填充方案").toBe(1);
    expect(Blocks.groundFactory.plans.get(0)!.unit, "方案单位是 dagger").toBe(UnitTypes.dagger);
    expect(gb.currentPlan, "created 自动选中第一个方案").toBe(0);
    expect(Blocks.groundFactory.size, "Java 注册 size=3").toBe(3);
    // 容量 = 方案需求 ×2（si10/le10 → 20）
    expect(Blocks.groundFactory.itemCapacity).toBe(20);
    expect(gb.getMaximumAccepted(Items.silicon)).toBe(20);
  });
});

// ---------------------------------------------------------------------------------------
// 反事实（实测变红后复原，证据见交付报告）
// ---------------------------------------------------------------------------------------
//
//  ① 把 `UnitFactoryBuild.updateTile()` 里的 `this.progress %= 1` 改成 `= 0`
//     → 「① 有电有料」在 tick 121 的第二台会**晚 1 tick**（`unitCount` 变红）。
//  ② 把 `ConsumeItemDynamic.trigger()` 的扣料删掉（`remove` 注释掉）
//     → 「① 有电有料」的 `si/le` 不再扣（10 而非 9）变红 —— 证明扣料不是 no-op。
//  ③ 把 `UnitFactoryBuild.shouldConsume()` 的 `this.enabled` 改成 `false`
//     → 缺料用例之外，所有生产用例的 `efficiency` 归 0 → 全部变红。
//
//  ⚠️ 全部已复原（门禁跑通即证明）。
