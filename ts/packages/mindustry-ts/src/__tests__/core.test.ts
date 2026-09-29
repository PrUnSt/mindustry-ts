// S5 子步：核心方块（`CoreBlock` / `CoreBuild`）验收测试。
//
// 覆盖 7 条（见任务说明）:
//   ① `acceptItem`（空核心 / `coreIncinerates` 两条路径）
//   ② `handleItem` 的库存写入
//   ③ **容量封顶**（第 3 次被拒）
//   ④ `placed()` / `onRemoved()` 与 `Teams.cores` 注册表
//   ⑤ **端到端**：核心 + 相邻传送带 → 喂 copper → 跑 tick → 核心库存增加
//   ⑥ **反事实**：钉死 `items.get(item) >= storageCapacity` 这个边界（去掉判断必红）
//   ⑦ 确定性：两次相同布景 → 关键状态字符串相等
//
// ⚠️ 本文件**不**依赖 `content/Blocks.ts`（编排方会在收口阶段统一注册 `core-shard`）——
//   每个用例自行 `new CoreBlock("core-shard")` 并逐字段赋值，参数照抄 `Blocks.java:3145-3157`。
//   `createWorld()`（`beforeEach`）已跑 `Vars.bootstrap()`，之后再 `new` 会**追加注册**到
//   当前 `ContentLoader`（不影响其它文件；下次 `bootstrap` 重建内容表）。
//
// ⚠️ 与 Java 的一处结构性差异（本文件的核心观测前提）: `Tile.setBlock` **不会**调用
//   `placed()`（Java 亦然 —— `placed()` 由 `ConstructBlock` / 生成器调用）。
//   因此「放一个核心 → 它出现在 `TeamData.cores` 里」这条链是**由 `onProximityUpdate()`
//   → `state.teams.registerCore(this)` 完成**的（`Tile.rebuildProximity` 必然执行它）。
//   `placed()` 本身单独覆盖（幂等）。

import { beforeEach, describe, expect, test } from "vitest";
import { Vars } from "../Vars.js";
import { Team } from "../game/Team.js";
import { Items } from "../content/Items.js";
import { Blocks } from "../content/Blocks.js";
import { Category } from "../type/Category.js";
import { ItemStack } from "../type/ItemStack.js";
import { BuildVisibility } from "../world/meta/BuildVisibility.js";
import { createWorld, placeBlock, runTicks } from "../harness.js";
import { CoreBlock } from "../world/blocks/storage/CoreBlock.js";
import type { CoreBuild } from "../world/blocks/storage/CoreBlock.js";
import { RouterBuild } from "../world/blocks/distribution/Router.js";
import { ConveyorBuild } from "../world/blocks/distribution/Conveyor.js";

let block: CoreBlock;

beforeEach(() => {
  // 每次重建世界（`bootstrap` 会重建 `Groups` / `state` / `content`），避免用例间污染。
  createWorld(16, 16, 1);
  block = makeCoreShard();
});

/**
 * 按 `Blocks.java:3145-3157` 的 `core-shard` 参数构造一个核心方块。
 * ⚠️ 与 Java 的两处偏差（均因依赖未移植系统）:
 *   - `requirements(..., BuildVisibility.coreZoneOnly, ...)`：`BuildVisibility.coreZoneOnly`
 *     未移植 → 这里用 `hidden`（`buildVisibility` 不参与本文件的任何断言）。
 *   - `unitType = UnitTypes.alpha`：依赖单位系统 → 不设置（`CoreBlock` 未移植该字段）。
 */
/**
 * 唯一方块名计数器。理由同 `drill.test.ts`：`ContentLoader.handleMappableContent`
 * 不允许同名内容（撞名抛 `Two content objects defined with the same name`），
 * 而**收口阶段 `Blocks.load()` 已注册真实 `core-shard`** → 测试自建实例必须换名。
 * 名字不参与本文件任何断言。
 */
let coreSeq = 0;

function makeCoreShard(): CoreBlock{
  const b = new CoreBlock("core-shard-t" + (coreSeq++));
  b.setRequirementsWithVisibility(Category.effect, BuildVisibility.hidden, [
    new ItemStack(Items.copper, 1000),
    new ItemStack(Items.lead, 800)
  ]);
  b.alwaysUnlocked = true;
  b.isFirstTier = true;
  b.health = 1100;
  b.itemCapacity = 4000;
  b.size = 3;
  b.buildCostMultiplier = 2;
  b.unitCapModifier = 8;
  return b;
}

/** 放一个核心并返回它的建筑（`(x,y)` 是 3×3 的中心）。 */
function placeCore(b: CoreBlock, x: number, y: number): CoreBuild{
  placeBlock(x, y, b);
  return Vars.world.tile(x, y)!.build as CoreBuild;
}

describe("core: acceptItem / getMaximumAccepted", () => {
  test("空核心 coreIncinerates=false → true；塞满到容量 → false；coreIncinerates=true 恒 true", () => {
    const core = placeCore(block, 8, 8);
    // 单核：容量 = itemCapacity = 4000（见 onProximityUpdate 的单核分支）
    expect(core.storageCapacity).toBe(4000);

    Vars.state.rules.coreIncinerates = false;
    expect(core.getMaximumAccepted(Items.copper)).toBe(4000);
    expect(core.items.total()).toBe(0);
    expect(core.acceptItem(core, Items.copper)).toBe(true);

    // 填到恰好满：`items.get(item) < getMaximumAccepted(item)` 为 false → 拒收
    core.items.setAmount(Items.copper, 4000);
    expect(core.acceptItem(core, Items.copper)).toBe(false);

    // `coreIncinerates = true` → 无条件接收（多余的被焚化），上限是 Integer.MAX_VALUE/2
    Vars.state.rules.coreIncinerates = true;
    expect(core.getMaximumAccepted(Items.copper)).toBe(1073741823);
    expect(core.acceptItem(core, Items.copper)).toBe(true);
  });
});

describe("core: handleItem 写入库存", () => {
  test("handleItem → items.get(copper)===1 且 items.total()===1", () => {
    const core = placeCore(block, 8, 8);
    expect(core.items.get(Items.copper)).toBe(0);
    expect(core.items.total()).toBe(0);

    core.handleItem(core, Items.copper);

    expect(core.items.get(Items.copper)).toBe(1);
    expect(core.items.total()).toBe(1);
  });
});

describe("core: 容量封顶（storageCapacity）", () => {
  test("storageCapacity=2 时连续 handleItem 3 次 → 只进 2 个", () => {
    const core = placeCore(block, 8, 8);
    Vars.state.rules.coreIncinerates = false; // 必须关掉焚化，否则上限不生效
    core.storageCapacity = 2;

    core.handleItem(core, Items.copper);
    core.handleItem(core, Items.copper);
    core.handleItem(core, Items.copper); // 第 3 次：items.get(2) >= storageCapacity(2) → 拒绝

    expect(core.items.get(Items.copper)).toBe(2);
    expect(core.items.total()).toBe(2);
  });

  test("反事实边界：容量-1 处接收、容量处拒收（钉死 `>= storageCapacity`）", () => {
    const core = placeCore(block, 8, 8);
    Vars.state.rules.coreIncinerates = false;
    core.storageCapacity = 2;

    core.items.setAmount(Items.copper, 1); // 1 / 2
    core.handleItem(core, Items.copper); // 1 → 2 ✓（`1 >= 2` 为假）
    expect(core.items.get(Items.copper)).toBe(2);

    core.handleItem(core, Items.copper); // 2 → 拒绝 ✓（`2 >= 2` 为真）
    expect(core.items.get(Items.copper)).toBe(2);
    expect(core.items.total()).toBe(2);
  });

  test("incinerateNonBuildable=true 时不可建造物品（sand）不入库，可建造物品（copper）仍入库", () => {
    const core = placeCore(block, 8, 8);
    Vars.state.rules.coreIncinerates = false;
    expect(Items.sand.buildable).toBe(false); // Items.ts 显式置 false
    expect(Items.copper.buildable).toBe(true);

    core.block.incinerateNonBuildable = true;

    core.handleItem(core, Items.sand); // incinerate = true → 不入库
    expect(core.items.get(Items.sand)).toBe(0);
    expect(core.items.total()).toBe(0);

    core.handleItem(core, Items.copper); // buildable → 正常入库
    expect(core.items.get(Items.copper)).toBe(1);
  });
});

describe("core: placed() / onRemoved() 与 Teams.cores 注册表", () => {
  test("放置后 cores.size===1 且 core() 就是它；placed() 幂等；onRemoved() 后回到 0", () => {
    const core = placeCore(block, 8, 8);

    const data = Vars.state.teams.get(Team.sharded);
    // 注册由 onProximityUpdate → registerCore 完成（setBlock 不调 placed）
    expect(data.cores.size).toBe(1);
    expect(data.core()).toBe(core);
    expect(core.team).toBe(Team.sharded.id);

    // `placed()` 幂等（`registerCore` 内部 `contains` 去重）
    core.placed();
    expect(data.cores.size).toBe(1);
    expect(data.core()).toBe(core);

    // `teamItems()` 访问路径就是该核心的库存实例
    expect(data.teamItems()).toBe(core.items);

    // `onRemoved()` → unregisterCore
    core.onRemoved();
    expect(data.cores.size).toBe(0);
    expect(data.core()).toBeNull();
    expect(data.teamItems()).toBeNull();
  });

  test("两个同队核心 → 注册表 2 项、core() 是第一个，且**共享同一个 items 实例**", () => {
    const a = placeCore(block, 4, 4);
    // 第二个核心必须换一块 `CoreBlock` 实例吗？不需要 —— 同一方块可放多个建筑。
    const b = placeCore(block, 11, 11);

    const data = Vars.state.teams.get(Team.sharded);
    expect(data.cores.size).toBe(2);
    expect(data.core()).toBe(a); // cores.first()

    // 多核共享（`onProximityUpdate` 的第一个循环）: `b.items` 指向 `a.items`
    expect(b.items).toBe(a.items);

    // 往共享池里加物品 → 两核看到同一个数
    a.handleItem(a, Items.copper);
    expect(a.items.get(Items.copper)).toBe(1);
    expect(b.items.get(Items.copper)).toBe(1);

    // 容量累计: 4000 + 4000
    expect(a.storageCapacity).toBe(8000);
    expect(b.storageCapacity).toBe(8000);
  });
});

describe("core: 端到端（传送带喂入）", () => {
  test("核心 + 相邻传送带：路由器注入 → 传送带搬运 → 核心库存 +1", () => {
    // 核心占 (7..9, 7..9)；传送带 (10,8) 朝西（rotation 2）→ front = (9,8) 即核心
    const core = placeCore(block, 8, 8);
    placeBlock(10, 8, Blocks.conveyor, 2);
    placeBlock(11, 8, Blocks.router, 0);

    const conveyor = Vars.world.tile(10, 8)!.build as ConveyorBuild;
    const router = Vars.world.tile(11, 8)!.build as RouterBuild;

    // 邻接已建立: 传送带的 next 是核心（同队）
    expect(conveyor.proximity.includes(core)).toBe(true);
    expect(conveyor.next).toBe(core);
    expect(router.proximity.includes(conveyor)).toBe(true);

    // 注入 1 个 copper 到路由器 → 它会在下一 tick 投给传送带
    router.handleItem(router, Items.copper);
    expect(router.items.total()).toBe(1);

    runTicks(120);

    // 路由器已清空，铜已抵达核心
    expect(router.items.total()).toBe(0);
    expect(conveyor.items.total()).toBe(0);
    expect(core.items.get(Items.copper)).toBe(1);
  });
});

describe("core: 确定性", () => {
  test("两次相同布景 → 关键状态字符串相等", () => {
    const a = runScenario();
    const b = runScenario();
    expect(a).toBe(b);
    // 防止「两边都是空场景」的假绿
    expect(a).toContain("core=1:1");
    expect(a).toContain("cores=1");
  });
});

/**
 * 一次完整的「核心 + 传送带 + 路由器」布景，返回**确定性**状态字符串。
 * ⚠️ 内部再次 `createWorld`（重建世界与内容表），因此与 `beforeEach` 的 `block` 无关。
 */
function runScenario(): string{
  createWorld(16, 16, 1);
  const b = makeCoreShard();
  placeBlock(8, 8, b);
  placeBlock(10, 8, Blocks.conveyor, 2);
  placeBlock(11, 8, Blocks.router, 0);

  const core = Vars.world.tile(8, 8)!.build as CoreBuild;
  const router = Vars.world.tile(11, 8)!.build as RouterBuild;

  router.handleItem(router, Items.copper);
  runTicks(120);

  return (
    "core=" +
    core.items.total() +
    ":" +
    core.items.get(Items.copper) +
    " storage=" +
    core.storageCapacity +
    " cores=" +
    Vars.state.teams.get(Team.sharded).cores.size
  );
}
