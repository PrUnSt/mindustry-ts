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
//
// ⚠️ **S4 补上的前置依赖**（计划 §7 的「前置依赖」条款）: 本文件原本**没有**覆盖
//   `BuildingComp.updateProximity`（`grep -n "updateProximity" src/__tests__/*.ts` 在 S3 交付时
//   零命中）。S4 把邻接做成了真实现（`Tile.rebuildProximity` / `removeBuildProximity`，
//   对应 `BuildingComp.java:1866-1914`），因此在这里补上 **G3↔G4 的真双向循环**覆盖 ——
//   断言必须钉死「双向」而不是「长度不为 0」: `self ∈ other.proximity` **且**
//   `other ∈ self.proximity`（Java 的 `other.proximity.addUnique(self())` 正是这么写的）。

import { beforeEach, describe, expect, test } from "vitest";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Items } from "../content/Items.js";
import { Groups } from "../gen/Groups.js";
import { Team } from "../game/Team.js";
import { createWorld } from "../harness.js";
import { ConveyorBuild } from "../world/blocks/distribution/Conveyor.js";
import { RouterBuild } from "../world/blocks/distribution/Router.js";

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

// ---------------------------------------------------------------------------------------
// S4 新增: `BuildingComp.updateProximity` / `removeFromProximity` 的**双向**循环
// （`BuildingComp.java:1886-1914` / `:1866-1884`）。
//
// 为什么必须单独测（计划 §7 把它列为 S4 的前置依赖）:
//   邻接缓存是「物品投递协议」的**全部前提** —— `Conveyor.next` / `Conveyor.nextc` /
//   `Router.getTileTarget` 都直接读 `proximity`。而 Java 的 `updateProximity` 有两个方向:
//       for(edge) { other.proximity.addUnique(self()); tmp.add(other); }   // 反向: 把自己塞进对方
//       for(tmp) proxy.add(tile);                                          // 正向: 把对方放进自己
//   只做正向也能让 `proximity.length > 0` —— 所以「长度不为 0」是**假断言**；必须钉死
//   「A 的列表里有 B **且** B 的列表里有 A」，才能抓住「只做了一半」的实现。
//
// 关键观察（本测试的判别力来源）: 先放 A、再放 B 时，**A 的列表是 B 触发的反向写入填上的**
//   （A 放置时邻居 B 还不存在）。因此若 `other.proximity.addUnique(self())` 被删掉，
//   `A.proximity` 会保持空 —— 断言①必红。
// ---------------------------------------------------------------------------------------
describe("set-block: 邻接（proximity）的双向性 —— updateProximity / removeFromProximity", () => {
  test("A→B 两次 setBlock: 两个方向的列表都含对方；next/nextc/aligned 同 tick 生效", () => {
    const t1 = Vars.world.tile(2, 2)!;
    const t2 = Vars.world.tile(3, 2)!;

    // 先放 A（此时 (3,2) 还是空气 → A 的邻接为空）
    t1.setBlock(Blocks.conveyor, Team.sharded, 0);
    const a = t1.build as ConveyorBuild;
    const b = t2.build; // null
    expect(b).toBeNull();
    expect(a.proximity.length).toBe(0);

    // 再放 B。B 的 `updateProximity()` 必须**双向**写: 把 A 加进 B 的列表，
    // **并且**把 B 加进 A 的列表（老代码/半实现只会做前者）。
    t2.setBlock(Blocks.conveyor, Team.sharded, 0);
    const b2 = t2.build as ConveyorBuild;

    // ① 双向: 两个方向都必须在
    expect(a.proximity.includes(b2)).toBe(true);
    expect(b2.proximity.includes(a)).toBe(true);
    // ② 且没有重复（`addUnique` 语义）: 每条邻域恰好 1 个邻居
    expect(a.proximity.length).toBe(1);
    expect(b2.proximity.length).toBe(1);
    expect(a.proximity[0]).toBe(b2);
    expect(b2.proximity[0]).toBe(a);

    // ③ `onProximityUpdate()` 的副作用（`next` / `nextc` / `aligned`）在**同一次**
    //    `setBlock` 内就绪: A 的 `front()` 是 B，B 的 front 是空气
    expect(a.next).toBe(b2);
    expect(a.nextc).toBe(b2);
    expect(a.aligned).toBe(true);
    expect(b2.next).toBeNull();
    expect(b2.nextc).toBeNull();
    expect(b2.aligned).toBe(false);

    // ④ 反向再触发一次 `updateProximity()`（放第三个方块时 A/B 都会被重新扫描）
    const t3 = Vars.world.tile(4, 2)!;
    t3.setBlock(Blocks.conveyor, Team.sharded, 0);
    const c = t3.build as ConveyorBuild;
    expect(a.proximity.length).toBe(1); // 仍然是 1（没有因为重复扫描而累积）
    expect(b2.proximity.length).toBe(2); // B 现在是 A 与 C 的中间段
    expect(b2.proximity.includes(a)).toBe(true);
    expect(b2.proximity.includes(c)).toBe(true);
    expect(c.proximity.includes(b2)).toBe(true);
    expect(c.proximity.length).toBe(1);
    // B 的 `next` 随邻接更新变成 C（`onProximityUpdate` 被重跑过）
    expect(b2.next).toBe(c);
    expect(b2.nextc).toBe(c);
  });

  test("移除一端 → 另一端立即摘除（removeFromProximity），且 next 归零", () => {
    const t1 = Vars.world.tile(2, 2)!;
    const t2 = Vars.world.tile(3, 2)!;
    t1.setBlock(Blocks.conveyor, Team.sharded, 0);
    t2.setBlock(Blocks.conveyor, Team.sharded, 0);
    const a = t1.build as ConveyorBuild;
    const b = t2.build as ConveyorBuild;
    expect(a.proximity.includes(b)).toBe(true);
    expect(b.proximity.includes(a)).toBe(true);
    expect(a.next).toBe(b);

    // 移除 B: `Tile.setBlock(air)` → `preChanged()` → `build.removeFromProximity()`
    // → `other.proximity.remove(self(), true)` + `other.onProximityUpdate()`（对 A 也做）
    t2.remove();

    expect(t2.build).toBeNull();
    // 双向都要清理干净（只清一半会让 A 持有一个已死对象）
    expect(a.proximity.length).toBe(0);
    expect(a.proximity.includes(b)).toBe(false);
    expect(b.proximity.length).toBe(0);
    // `next` 是 `onProximityUpdate` 重算的 → 必须归零
    expect(a.next).toBeNull();
    expect(a.nextc).toBeNull();
    expect(a.aligned).toBe(false);
  });

  test("异队方块不进入邻接（Java `if(other == null || other.team != team) continue;`）", () => {
    const t1 = Vars.world.tile(2, 2)!;
    const t2 = Vars.world.tile(3, 2)!;
    t1.setBlock(Blocks.conveyor, Team.sharded, 0);
    t2.setBlock(Blocks.conveyor, Team.crux, 0); // 敌对队伍

    const a = t1.build as ConveyorBuild;
    const b = t2.build as ConveyorBuild;

    // 两个方向都不建立邻接
    expect(a.proximity.length).toBe(0);
    expect(b.proximity.length).toBe(0);
    // 因此 `next` 也不成立（`pass()` 里还有一次 `next.team === team` 兜底）
    expect(a.next).toBeNull();
  });

  test("路由器与传送带互相进入对方邻接（跨方块类型，不只是同类）", () => {
    const t1 = Vars.world.tile(2, 2)!;
    const t2 = Vars.world.tile(3, 2)!;
    t1.setBlock(Blocks.conveyor, Team.sharded, 0);
    t2.setBlock(Blocks.router, Team.sharded, 0);

    const conv = t1.build as ConveyorBuild;
    const router = t2.build as RouterBuild;

    expect(conv.proximity.includes(router)).toBe(true);
    expect(router.proximity.includes(conv)).toBe(true);
    expect(conv.next).toBe(router);
    expect(conv.nextc).toBeNull(); // 路由器不是传送带
    // 路由器把 conv 记为「来源」（它唯一的邻居）
    expect(router.proximity.length).toBe(1);
    expect(router.proximity[0]).toBe(conv);
    // 跨类型邻接的实际用途: 空路由器愿意接收同队传送带送来的物品
    // （`RouterBuild.acceptItem` 覆写了基类实现 → 走的不是「基类恒 false」那条路径）
    expect(router.acceptItem(conv, Items.copper)).toBe(true);
    expect(router.lastItem).toBeNull();
    expect(router.items.total()).toBe(0);
  });
});

