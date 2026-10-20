// C29 · 反应堆（NuclearReactor / ImpactReactor）验收测试。
//
// ⚠️ `createWorld()` 会 `bootstrap()`（含 Liquids.load()），测试无需手动加载液体。
// ⚠️ 核反应堆：产电 = fullness（燃料占比），产热 = fullness*heating，冷却液（cryofluid）
//   手动带走热量，过热（heat >= 0.999）→ kill。
// ⚠️ 冲击反应堆：**自耗电**（consumePower 25）—— 需要电网供电（power.status >= 0.99）
// 反事实（已复原）：注释掉 `NuclearReactorBuild.updateTile()` 的产热行 `heatRef += ...`
//   → ①产热/冷却/过热 3 条变红，复原全绿。
//   且原料（blastCompound）足 → 暖机 → productionEfficiency = warmup^5。

import { beforeEach, describe, expect, test } from "vitest";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Items } from "../content/Items.js";
import { Liquids } from "../content/Liquids.js";
import { Groups } from "../gen/Groups.js";
import { createWorld, placeBlock, runTicks } from "../harness.js";
import { ConsumeGenerator } from "../world/blocks/power/ConsumeGenerator.js";
import { ConsumeItemFlammable } from "../world/consumers/ConsumeItemFlammable.js";
import { ConsumeItemExplode } from "../world/consumers/ConsumeItemExplode.js";
import { NuclearReactorBuild } from "../world/blocks/power/NuclearReactor.js";
import { ImpactReactorBuild } from "../world/blocks/power/ImpactReactor.js";
import type { Building } from "../gen/Building.js";

let blockSeq = 0;
function nextName(base: string): string{
  return base + "-t" + String(blockSeq++);
}

/** 一台产 30 的燃烧发电机夹具（给冲击反应堆供电，覆盖其 25 自耗）。 */
function makeBigCombustion(): ConsumeGenerator{
  const b = new ConsumeGenerator(nextName("big-gen"));
  b.powerProduction = 30;
  b.itemDuration = 120;
  b.consume(new ConsumeItemFlammable());
  b.consume(new ConsumeItemExplode());
  b.itemDurationMultipliers.put(Items.pyratite, 3);
  b.init();
  return b;
}

function place<T extends Building>(x: number, y: number, block: any): T{
  placeBlock(x, y, block, 0);
  return Vars.world.tile(x, y)!.build as T;
}

beforeEach(() => {
  createWorld(24, 24, 1);
});

describe("reactor: ① NuclearReactor（核反应堆热循环）", () => {
  test("有燃料 → productionEfficiency = fullness；产热；烧燃料", () => {
    const r = place<NuclearReactorBuild>(5, 5, Blocks.thoriumReactor);
    r.items.setAmount(Items.thorium, 10);
    // 无冷却液 → 热量积累可观测（有冷却则被带走，见②）
    runTicks(2);
    expect(r.productionEfficiency, "fullness = 10/30").toBeCloseTo(10 / 30, 6);
    expect(r.heatRef, "产热（无冷却）").toBeGreaterThan(0);

    const fuel0 = r.items.get(Items.thorium);
    // 无冷却→ 热量上升使燃料间隔缩短（heat*heatConsumeRate）
    runTicks(200);
    expect(r.items.get(Items.thorium), "燃料被消耗").toBeLessThan(fuel0);
  });

  test("冷却液带走热量：有冷却液的反应堆热量更低", () => {
    const r1 = place<NuclearReactorBuild>(5, 5, Blocks.thoriumReactor);
    r1.items.setAmount(Items.thorium, 20);
    // r1 无冷却液
    const r2 = place<NuclearReactorBuild>(9, 5, Blocks.thoriumReactor);
    r2.items.setAmount(Items.thorium, 20);
    r2.liquids.set(Liquids.cryofluid, 10);

    runTicks(80);
    expect(r2.heatRef, "有冷却液热更低").toBeLessThan(r1.heatRef);
    expect(r1.heatRef).toBeGreaterThan(0);
  });

  test("无冷却液 + 满燃料 → 过热爆掉（heat >= 0.999 → kill）", () => {
    const r = place<NuclearReactorBuild>(5, 5, Blocks.thoriumReactor);
    r.items.setAmount(Items.thorium, 30); // 满
    const startCount = Groups.build.size();
    runTicks(600);
    expect(r.heatRef).toBeGreaterThanOrEqual(0.999);
    expect(Groups.build.count((b) => b === r), "爆掉后出组").toBe(0);
    expect(Groups.build.size()).toBeLessThan(startCount);
  });
});

describe("reactor: ② ImpactReactor（冲击反应堆暖机）", () => {
  test("有电 + 有料 → 暖机，productionEfficiency = warmup^5", () => {
    // impact size 4 以 (6,5) 为锚点覆盖 (5,4)..(8,7)，发电机放 (4,5) 与其左边紧邻。
    const gen = place<import("../world/blocks/power/ConsumeGenerator.js").ConsumeGeneratorBuild>(4, 5, makeBigCombustion());
    gen.items.add(Items.coal, 60);
    const r = place<ImpactReactorBuild>(6, 5, Blocks.impactReactor);
    r.items.setAmount(Items.blastCompound, 5);
    r.liquids.set(Liquids.cryofluid, 10);

    runTicks(5);
    expect(r.power.status, "电网供电").toBeGreaterThan(0.9);
    expect(r.warmupRef, "暖机开始").toBeGreaterThan(0);
    expect(r.productionEfficiency, "warmup^5 > 0").toBeGreaterThan(0);

    // 暖机是慢过程（warmupSpeed=0.001）→ 只断言正向增长与 warmup^5
    runTicks(200);
    expect(r.warmupRef).toBeGreaterThan(0.001);
    expect(r.productionEfficiency).toBeCloseTo(Math.pow(r.warmupRef, 5), 6);
    expect(r.productionEfficiency).toBeGreaterThan(0);
  });

  test("无电（孤立）→ 不暖机（warmup 0）", () => {
    const r = place<ImpactReactorBuild>(5, 5, Blocks.impactReactor);
    r.items.setAmount(Items.blastCompound, 5);
    r.liquids.set(Liquids.cryofluid, 10);
    runTicks(30);
    expect(r.power.status).toBe(0);
    expect(r.warmupRef).toBe(0);
  });
});
