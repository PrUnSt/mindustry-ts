// C28 · 液体系统基座（ConsumeLiquid + LiquidRouter 传输）验收测试。
//
// ⚠️ `createWorld()` 会 `bootstrap()`，其中 `ContentLoader.createBaseContent()` **已**调
//   `Liquids.load()`（见该文件）→ 液体内容就绪，无需手动加载。
// 反事实（已复原）：注释掉 `LiquidRouterBuild.updateTile()` 的 `dumpLiquid` → 「r1 -> r2 传输」
//   变红（`expected 0 to be greater than 0`），复原全绿。

import { beforeEach, describe, expect, test } from "vitest";
import { Vars } from "../Vars.js";
import { Liquids } from "../content/Liquids.js";
import { createWorld, placeBlock, runTicks } from "../harness.js";
import { LiquidBlock, LiquidBuild } from "../world/blocks/liquid/LiquidBlock.js";
import { LiquidRouter, LiquidRouterBuild } from "../world/blocks/liquid/LiquidRouter.js";
import type { Building } from "../gen/Building.js";

let blockSeq = 0;
function nextName(base: string): string{
  return base + "-t" + String(blockSeq++);
}

/** 一个「消耗指定液体」的液体方块夹具（hasLiquids + LiquidModule + ConsumeLiquid）。 */
function makeLiquidConsumer(liquid: import("../type/Liquid.js").Liquid, amount: number): LiquidBlock{
  const b = new LiquidBlock(nextName("liquid-consumer"));
  b.consumeLiquid(liquid, amount);
  b.init();
  return b;
}

/** 一个普通液体路由器夹具。 */
function makeRouter(): LiquidRouter{
  const b = new LiquidRouter(nextName("liquid-router"));
  b.init();
  return b;
}

function place<T extends Building>(x: number, y: number, block: LiquidBlock): T{
  placeBlock(x, y, block, 0);
  return Vars.world.tile(x, y)!.build as T;
}

beforeEach(() => {
  createWorld(16, 16, 1);
});

describe("liquid: ① ConsumeLiquid（液体消耗）", () => {
  test("有液 → efficiency 1 并逐 tick 扣液；缺液 → efficiency 按比例下降", () => {
    const b = place<LiquidBuild>(5, 5, makeLiquidConsumer(Liquids.cryofluid, 0.1));
    b.liquids.set(Liquids.cryofluid, 1);
    runTicks(1);
    expect(b.efficiency, "有液时效率 1").toBe(1);
    // 每 tick 扣 0.1（edelta=1、multiplier=1）
    const before = b.liquids.get(Liquids.cryofluid);
    runTicks(1);
    expect(b.liquids.get(Liquids.cryofluid), "扣 0.1").toBeCloseTo(before - 0.1, 6);
    expect(b.liquids.get(Liquids.cryofluid)).toBeCloseTo(0.8, 6);
  });

  test("efficiency = min(库存 / (amount * edelta), 1)：库存不足按比例", () => {
    const b = place<LiquidBuild>(5, 5, makeLiquidConsumer(Liquids.cryofluid, 0.5));
    b.liquids.set(Liquids.cryofluid, 0.1); // 0.1 / 0.5 = 0.2
    runTicks(1);
    expect(b.efficiency).toBeCloseTo(0.2, 6);
  });
});

describe("liquid: ② LiquidRouter 传输", () => {
  test("路由器把当前液体倒给相邻空箱（r1 -> r2）", () => {
    const r1 = place<LiquidRouterBuild>(5, 5, makeRouter());
    const r2 = place<LiquidRouterBuild>(6, 5, makeRouter());
    r1.liquids.set(Liquids.water, 10);
    runTicks(1);
    // r1.updateTile → dumpLiquid(water) → 倒 (1 - 0) * 10 / 2 = 5 给 r2
    expect(r2.liquids.get(Liquids.water), "r2 收到液体").toBeGreaterThan(0);
    expect(r1.liquids.get(Liquids.water), "r1 变少").toBeLessThan(10);
    expect(r1.liquids.get(Liquids.water) + r2.liquids.get(Liquids.water), "总量守恒").toBeCloseTo(10, 6);
  });

  test("接受方满箱 → 不再倒（总量不变）", () => {
    const r1 = place<LiquidRouterBuild>(5, 5, makeRouter());
    const r2 = place<LiquidRouterBuild>(6, 5, makeRouter());
    r1.liquids.set(Liquids.water, 10);
    r2.liquids.set(Liquids.water, 10); // r2 满
    runTicks(1);
    expect(r2.liquids.get(Liquids.water)).toBe(10);
    expect(r1.liquids.get(Liquids.water)).toBe(10);
  });
});

describe("liquid: ③ acceptLiquid 闸门 + Block.consumesLiquid", () => {
  test("只收 consumeLiquid 声明的那种液体", () => {
    const b = place<LiquidBuild>(5, 5, makeLiquidConsumer(Liquids.cryofluid, 0.1));
    expect(b.acceptLiquid(null as unknown as never, Liquids.cryofluid)).toBe(true);
    expect(b.acceptLiquid(null as unknown as never, Liquids.water)).toBe(false);
  });

  test("Block.consumesLiquid 反映声明；consumeLiquid 置 hasLiquids", () => {
    const b = makeLiquidConsumer(Liquids.cryofluid, 0.1);
    expect(b.hasLiquids).toBe(true);
    expect(b.consumesLiquid(Liquids.cryofluid)).toBe(true);
    expect(b.consumesLiquid(Liquids.water)).toBe(false);
  });
});
