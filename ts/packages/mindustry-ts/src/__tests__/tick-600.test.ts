// S3 子步 5（tick600）验收测试：`Logic.update()` 的 600 tick 闭环。
//
// 对应硬断言 #5: 跑 600 次 `logic.update()` → `state.tick === 600`、`Time.time === 600`、
//   所有 tile 数值非 NaN、tick 序列**严格单调递增**。
//
// 数值锚点: `delta = Core.graphics.getDeltaTime() = 1/60`（MockGraphics 固定值），
//   `(1/60) * 60 === 1` 在 IEEE-754 double 下**精确成立** → 每帧 `state.tick += 1`。
//   `Time.update()` 里 `Time.delta = min((1/60)*60, 3) = 1` → 每帧 `Time.time += 1`。
//
// 反事实用例（本文件第二个）: 暂停时 `state.tick` 必须**不动**。若 `Logic.update()` 漏掉
//   `if(!state.isPaused())` 门控，该断言必红。

import { describe, expect, test } from "vitest";
import { Time } from "@mindustry-ts/arc";
import { Vars } from "../Vars.js";
import { State } from "../core/GameState.js";
import { Blocks } from "../content/Blocks.js";
import { Groups } from "../gen/Groups.js";
import { Tile } from "../world/Tile.js";
import { createWorld, placeBlock, runTicks } from "../harness.js";

describe("tick-600: Logic.update() 的 tick 闭环（硬断言 #5）", () => {
  test("600 次 runTicks(1) → tick 序列精确等于 [1..600]、Time.time===600、updateId===600", () => {
    createWorld(8, 8, 1);

    expect(Vars.state.tick).toBe(0);
    expect(Time.time).toBe(0);
    expect(Vars.state.isPlaying()).toBe(true);

    const tickSeq: number[] = [];
    for(let i = 0; i < 600; i++){
      runTicks(1);
      tickSeq.push(Vars.state.tick);
    }

    // 每一帧恰好 +1（精确，不是「大约」）
    const expected = Array.from({ length: 600 }, (_v, i) => i + 1);
    expect(tickSeq).toEqual(expected);
    expect(Vars.state.tick).toBe(600);
    expect(Time.time).toBe(600);
    expect(Vars.state.updateId).toBe(600);

    // 严格单调递增（单独显式断言，便于定位回归）
    for(let i = 1; i < tickSeq.length; i++){
      expect(tickSeq[i]!).toBeGreaterThan(tickSeq[i - 1]!);
    }
  });

  test("全部 tile 的数值字段有限（block/floor/data/坐标/建筑血量），且地板/方块仍是 air", () => {
    createWorld(8, 8, 1);
    placeBlock(3, 3, Blocks.conveyor, 0);
    runTicks(600);

    const tiles = Vars.world.tiles;
    expect(tiles.array.length).toBe(64);

    for(const tile of tiles){
      expect(tile).toBeInstanceOf(Tile);
      // 坐标
      expect(Number.isFinite(tile.x)).toBe(true);
      expect(Number.isFinite(tile.y)).toBe(true);
      // 内容 id（block/floor/overlay 的名字由 id 索引而来，id 必须是有限数）
      expect(Number.isFinite(tile.block().id)).toBe(true);
      expect(Number.isFinite(tile.floor().id)).toBe(true);
      expect(Number.isFinite(tile.overlay().id)).toBe(true);
      // 数值数据字段
      expect(Number.isFinite(tile.data)).toBe(true);
      expect(Number.isFinite(tile.extraData)).toBe(true);
      expect(Number.isFinite(tile.floorData)).toBe(true);
      expect(Number.isFinite(tile.overlayData)).toBe(true);
      // 默认全 air 世界：地板与**除 conveyor 外的**方块仍是 air（没有被 tick 意外改写）
      if(tile.build === null){
        expect(tile.block()).toBe(Blocks.air);
      }
      expect(tile.floor()).toBe(Blocks.air.asFloor());
      // 建筑（仅 conveyor 那格有）的血量有限
      if(tile.build !== null){
        expect(Number.isFinite(tile.build.health)).toBe(true);
        expect(Number.isFinite(tile.build.maxHealth)).toBe(true);
      }
    }

    // 600 tick 后 conveyor 仍在组内、未被 tick 循环意外移除
    const conv = Vars.world.tile(3, 3)!;
    expect(conv.build).not.toBeNull();
    expect(conv.build!.block).toBe(Blocks.conveyor);
    expect(Groups.build.size()).toBe(1);
    expect(Groups.all.size()).toBe(0);
    expect(Groups.unit.size()).toBe(0);
  });

  test("反事实：暂停时不推进 tick（isPaused 门控）", () => {
    createWorld(8, 8, 1);
    runTicks(5);
    expect(Vars.state.tick).toBe(5);
    expect(Time.time).toBe(5);

    Vars.state.set(State.paused);
    runTicks(10);
    // 暂停期间 tick / time 必须不动
    expect(Vars.state.tick).toBe(5);
    expect(Time.time).toBe(5);
    expect(Vars.state.updateId).toBe(5);

    Vars.state.set(State.playing);
    runTicks(3);
    expect(Vars.state.tick).toBe(8);
    expect(Time.time).toBe(8);
  });
});
