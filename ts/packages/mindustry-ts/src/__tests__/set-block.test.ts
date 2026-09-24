// S3 子步 4（setBlock）验收测试：`Tile.setBlock` 与 `Groups.build` 的入组判据。
//
// 对应硬断言 #4（§6.7 已修正）:
//   放 `conveyor`（`update = true`）→ `tile.build !== null` 且 `Groups.build.size() === 1`；
//   放 `copper-wall`（`update = false`）→ `tile.build !== null` 但 `Groups.build.size() === 0`。
//
// 判据链（Java 源码）:
//   `Tile.changeBuild` → `shouldAdd = block.update && !state.isEditor()`
//   `BuildingComp.init(tile, team, shouldAdd, rotation)` → `if(shouldAdd) add()`
//   `Building.add()` → `Groups.build.addIndex(this)`
// 因此「是否入组」由 `block.update` 与「是否编辑器」两个布尔共同决定。
//
// 反事实用例（本文件后两个）:
//   ① copper-wall 半边 —— 若入组判据被写成「有建筑就入组」，`size === 0` 断言必红。
//   ② 编辑器半边 —— 把 `rules.editor = true` 后连 conveyor 也不入组；若判据漏掉
//      `!state.isEditor()`，`size === 0` 断言必红。

import { beforeEach, describe, expect, test } from "vitest";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Groups } from "../gen/Groups.js";
import { Team } from "../game/Team.js";
import { createWorld } from "../harness.js";

beforeEach(() => {
  // 每次重建世界（`bootstrap` 会重建 `Groups`，故组从 0 开始），避免用例间污染。
  createWorld(8, 8, 1);
});

describe("set-block: conveyor 入组（硬断言 #4 正向半边）", () => {
  test("放 conveyor → build 存在、入组 size===1；再放一个 → 2；移除 → 1（对象身份精确）", () => {
    // 前置：判据的两个布尔来源
    expect(Blocks.conveyor.update).toBe(true);
    expect(Vars.state.isEditor()).toBe(false);
    expect(Groups.build.size()).toBe(0);

    const t1 = Vars.world.tile(2, 2)!;
    t1.setBlock(Blocks.conveyor, Team.sharded, 0);

    expect(t1.build).not.toBeNull();
    expect(t1.build!.block).toBe(Blocks.conveyor);
    expect(t1.build!.team).toBe(Team.sharded.id);
    expect(t1.build!.health).toBe(45); // Blocks.ts 显式赋值 conveyor.health = 45
    expect(t1.build!.isAdded()).toBe(true);
    expect(Groups.build.size()).toBe(1);
    expect(Groups.build.first()).toBe(t1.build);

    const t2 = Vars.world.tile(3, 2)!;
    t2.setBlock(Blocks.conveyor, Team.sharded, 1);

    expect(t2.build).not.toBeNull();
    expect(t2.build!.rotation).toBe(1);
    expect(Groups.build.size()).toBe(2);
    const firstBuild = t1.build;

    // 移除第二个：`Tile.remove()` → `setBlock(air)` → `changeBuild` → `build.remove()` → 出组
    t2.remove();

    expect(t2.build).toBeNull();
    expect(Groups.build.size()).toBe(1);
    // 剩下的那个就是 t1 的建筑（身份不变，且仍在组内）
    expect(Groups.build.size()).toBe(1);
    expect(Groups.build.first()).toBe(firstBuild);
    expect(firstBuild!.isAdded()).toBe(true);
  });
});

describe("set-block: 反事实半边 —— copper-wall 会建实例但不入组", () => {
  test("放 copper-wall → tile.build !== null，但 Groups.build.size() === 0", () => {
    expect(Blocks.copperWall.update).toBe(false); // 全文件无 `update = true`
    expect(Blocks.copperWall.destructible).toBe(true); // 但可被摧毁 → hasBuilding() 为 true

    const tile = Vars.world.tile(5, 5)!;
    tile.setBlock(Blocks.copperWall, Team.sharded, 0);

    // 建筑实例**确实被创建**（可被打、可被拆）
    expect(tile.build).not.toBeNull();
    expect(tile.build!.block).toBe(Blocks.copperWall);
    expect(tile.build!.health).toBe(320); // 80 * wallHealthMultiplier(4)
    // 但**没有**进入 Groups.build（shouldAdd = update && !editor = false）
    expect(tile.build!.isAdded()).toBe(false);
    expect(Groups.build.size()).toBe(0);
  });
});

describe("set-block: 反事实半边 —— 编辑器下即使 conveyor 也不入组", () => {
  test("rules.editor = true 时放 conveyor → build 存在但 size===0（钉死 !state.isEditor()）", () => {
    Vars.state.rules.editor = true;
    expect(Vars.state.isEditor()).toBe(true);

    const tile = Vars.world.tile(4, 4)!;
    tile.setBlock(Blocks.conveyor, Team.sharded, 0);

    expect(tile.build).not.toBeNull();
    expect(Blocks.conveyor.update).toBe(true); // 方块本身是 update=true
    // 但编辑器模式下 shouldAdd 为 false → 不入组
    expect(tile.build!.isAdded()).toBe(false);
    expect(Groups.build.size()).toBe(0);

    // 复原后同一个方块再放一次会入组（证明差异确实来自 editor 标志）
    Vars.state.rules.editor = false;
    const tile2 = Vars.world.tile(6, 4)!;
    tile2.setBlock(Blocks.conveyor, Team.sharded, 0);
    expect(Groups.build.size()).toBe(1);
  });
});
