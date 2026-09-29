// S4 子步：玩家建造（放置/拆除 + 资源扣费）验收测试。
//
// 对应实现: `src/world/Build.ts`（简化子集）+ `src/world/BuildPlan.ts`。
//
// ⚠️ 核心依赖的处理方式（必读，交付自报项 #6）:
//   本测试**不 import** `world/blocks/storage/CoreBlock.ts`（该文件由并行 worker 编写，
//   在本测试运行时可能尚不存在）。改用任务给出的「替代方案」：
//     在测试内定义 `TestCoreBuild extends Building`（覆写构造器给它 `items = new ItemModule()`），
//     然后 `Vars.state.teams.get(team).cores.add(core)` 手工注入 `TeamData`。
//   因为 `Build` 只读 `core.items`（不调用 `CoreBuild` 的 `acceptItem/handleItem`），
//   这个最小核心足以覆盖全部扣费/退款路径。
//
// ⚠️ 每次跑测试前必须设置 TEMP/TMP（见任务说明），否则 vitest 会静默丢测试文件。

import { beforeEach, describe, expect, test } from "vitest";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Items } from "../content/Items.js";
import { Team } from "../game/Team.js";
import { Building } from "../gen/Building.js";
import { ItemModule } from "../world/modules/ItemModule.js";
import { Build } from "../world/Build.js";
import { createWorld, snapshot } from "../harness.js";

/** 最小核心：只提供 `items`（`Build` 唯一读取的字段）。 */
class TestCoreBuild extends Building{
  constructor(){
    super();
    this.items = new ItemModule();
  }
}

/** 手工把一个核心注入队伍（`TeamData.cores`），并预置铜。 */
function addTestCore(team: Team, copper: number): TestCoreBuild{
  const core = new TestCoreBuild();
  core.team = team.id;
  (core.items as ItemModule).add(Items.copper, copper);
  Vars.state.teams.get(team).cores.add(core);
  return core;
}

/** 读取核心当前铜数量（测试内的便捷断言目标）。 */
function copperOf(core: TestCoreBuild): number{
  return (core.items as ItemModule).get(Items.copper);
}

beforeEach(() => {
  createWorld(8, 8, 1);
});

describe("Build.beginPlace: 扣费", () => {
  test("① 资源充足 → true；tile 是 conveyor；铜精确减少 Math.round(1*mult)", () => {
    Vars.state.rules.buildCostMultiplier = 2;
    const core = addTestCore(Team.sharded, 100);
    expect(copperOf(core)).toBe(100);

    const ok = Build.beginPlace(2, 2, Blocks.conveyor, Team.sharded, 0);

    expect(ok).toBe(true);
    expect(Vars.world.tile(2, 2)!.block()).toBe(Blocks.conveyor);
    // conveyor 需求 = 1 copper；mult = 2 → 扣 Math.round(1*2) = 2
    expect(copperOf(core)).toBe(100 - Math.round(1 * 2));
    expect(copperOf(core)).toBe(98);
  });

  test("② 资源不足 → false；库存一个不少；tile 仍是 air", () => {
    Vars.state.rules.buildCostMultiplier = 2; // 需要 2
    const core = addTestCore(Team.sharded, 1); // 只有 1

    const ok = Build.beginPlace(2, 2, Blocks.conveyor, Team.sharded, 0);

    expect(ok).toBe(false);
    expect(copperOf(core)).toBe(1);
    expect(Vars.world.tile(2, 2)!.block()).toBe(Blocks.air);
  });

  test("③ 无核心 → false（core() 为 null 即拒绝）", () => {
    expect(Vars.state.teams.get(Team.sharded).core()).toBeNull();

    const ok = Build.beginPlace(2, 2, Blocks.conveyor, Team.sharded, 0);

    expect(ok).toBe(false);
    expect(Vars.world.tile(2, 2)!.block()).toBe(Blocks.air);
  });

  test("④ instantBuild=true → true；库存不变（对齐 Block.java:375 不消耗）", () => {
    Vars.state.rules.buildCostMultiplier = 2;
    const core = addTestCore(Team.sharded, 5);

    const ok = Build.beginPlace(2, 2, Blocks.conveyor, Team.sharded, 0, true);

    expect(ok).toBe(true);
    expect(Vars.world.tile(2, 2)!.block()).toBe(Blocks.conveyor);
    expect(copperOf(core)).toBe(5);
  });
});

describe("Build.breakBlock: 拆除 + 退款", () => {
  test("⑤ 拆除 → true；tile 变 air；退款额精确", () => {
    Vars.state.rules.buildCostMultiplier = 1;
    Vars.state.rules.deconstructRefundMultiplier = 0.5;
    const core = addTestCore(Team.sharded, 5);

    Build.beginPlace(2, 2, Blocks.conveyor, Team.sharded, 0); // -1 → 4
    expect(copperOf(core)).toBe(4);

    const ok = Build.breakBlock(2, 2, Team.sharded);

    expect(ok).toBe(true);
    expect(Vars.world.tile(2, 2)!.block()).toBe(Blocks.air);
    const refund = Math.round(1 * 1 * 0.5); // = 1
    expect(refund).toBe(1);
    expect(copperOf(core)).toBe(4 + refund);
    expect(copperOf(core)).toBe(5);
  });
});

describe("Build.validPlace: 几何子集", () => {
  test("⑥ 空地 true；被不可替换方块占用 false；越界 false", () => {
    // 空地
    expect(Build.validPlace(2, 2, Blocks.conveyor, Team.sharded, 0)).toBe(true);

    // 占用：copper-wall（group=walls）不能被 conveyor（group=transportation）替换
    Vars.world.tile(3, 3)!.setBlock(Blocks.copperWall, Team.sharded, 0);
    expect(Blocks.conveyor.canReplace(Blocks.copperWall)).toBe(false); // 钉死判据来源
    expect(Build.validPlace(3, 3, Blocks.conveyor, Team.sharded, 0)).toBe(false);

    // 越界：8×8 世界合法下标 0..7
    expect(Vars.world.tile(8, 8)).toBeNull();
    expect(Build.validPlace(8, 8, Blocks.conveyor, Team.sharded, 0)).toBe(false);
    expect(Build.validPlace(-1, -1, Blocks.conveyor, Team.sharded, 0)).toBe(false);
  });
});

// ───────────────────────── 反事实用例（任务要求 ⑦ ≥2 条）─────────────────────────
// 说明：这两组的断言**被特意设计成在对应变异下必红**。实测记录见交付报告：
//   变异 A：把 `Build.beginPlace` 里的扣费改成 `remove(item, stack.amount)`（丢掉 mult）
//           → 「反事实①」「反事实①b」变红。
//   变异 B：删掉 `hasStacksMultiplied(...)` 的不足检查 → 「反事实②」变红。
describe("⑦ 反事实（实测变红后复原）", () => {
  test("反事实①：扣费丢掉 rules.buildCostMultiplier → 本条变红", () => {
    Vars.state.rules.buildCostMultiplier = 3; // 只给 3 铜，正确实现恰好扣满
    const core = addTestCore(Team.sharded, 3);

    const ok = Build.beginPlace(2, 2, Blocks.conveyor, Team.sharded, 0);

    expect(ok).toBe(true);
    // 正确: remove(Math.round(1*3)) = 3 → 剩 0
    // 变异 A（丢掉 mult）: remove(1) → 剩 2 → 本断言变红
    expect(copperOf(core)).toBe(0);
  });

  test("反事实①b：mult 参与的足量门槛（忽略 mult 会让 2 铜也建成功）", () => {
    Vars.state.rules.buildCostMultiplier = 3; // 需要 3
    const core = addTestCore(Team.sharded, 2); // 只有 2

    const ok = Build.beginPlace(2, 2, Blocks.conveyor, Team.sharded, 0);

    expect(ok).toBe(false); // 变异 A 会返回 true（按 1 个扣费）
    expect(copperOf(core)).toBe(2);
    expect(Vars.world.tile(2, 2)!.block()).toBe(Blocks.air);
  });

  test("反事实②：删掉「资源不足检查」→ 本条变红", () => {
    Vars.state.rules.buildCostMultiplier = 2; // 需要 2
    const core = addTestCore(Team.sharded, 1); // 只有 1

    const ok = Build.beginPlace(2, 2, Blocks.conveyor, Team.sharded, 0);

    // 正确: hasStacksMultiplied 失败 → false、库存不变、tile 仍 air
    // 变异 B（删检查、直接 remove）: remove 被 ItemModule 截断到现有量 → true、tile 变 conveyor
    expect(ok).toBe(false);
    expect(copperOf(core)).toBe(1);
    expect(Vars.world.tile(2, 2)!.block()).toBe(Blocks.air);
  });
});

describe("⑧ 确定性", () => {
  test("两次相同操作序列 → 库存字符串与世界快照字符串相等", () => {
    function run(): { inv: string; world: string }{
      createWorld(8, 8, 7);
      Vars.state.rules.buildCostMultiplier = 2;
      const core = addTestCore(Team.sharded, 50);

      Build.beginPlace(2, 2, Blocks.conveyor, Team.sharded, 0); // -2  → 48
      Build.beginPlace(3, 2, Blocks.router, Team.sharded, 0);   // -6  → 42 (3*2)
      Build.breakBlock(2, 2, Team.sharded);                     // +1  → 43

      return { inv: (core.items as ItemModule).toString(), world: snapshot() };
    }

    const a = run();
    const b = run();

    expect(a.inv).toBe(b.inv);
    expect(a.world).toBe(b.world);
    // 钉死退款后的精确库存（48 - 6 + 1 = 43），避免「两次都错且一致」的假确定性
    expect(a.inv).toContain("copper:43");
  });
});
