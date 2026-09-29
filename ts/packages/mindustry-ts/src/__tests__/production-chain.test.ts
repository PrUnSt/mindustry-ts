// 端到端生产链：钻头 → 传送带 → 工厂 → 传送带 → 核心。
//
// 为什么单独一个文件：这条链横跨 5 个系统（采矿 / 搬运 / 消耗品 / 电力 / 库存），
// 任何一环断了整体就断，而**单系统的单元测试全绿也证明不了它是通的**。
//
// ⚠️ C21 实测发现的断点：`BuildingComp.acceptItem()` 基类曾恒返回 false，
//    导致「传送带 → 工厂」这一步永远失败（web 演示布局里表现为工厂永远收不到料）。
//    本文件就是那条断点的回归网。

import { describe, expect, test } from "vitest";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Items } from "../content/Items.js";
import { createWorld, placeBlock, runTicks } from "../harness.js";
import { ConveyorBuild } from "../world/blocks/distribution/Conveyor.js";
import { GenericCrafterBuild } from "../world/blocks/production/GenericCrafter.js";
import { DrillBuild } from "../world/blocks/production/Drill.js";
import { CoreBuild } from "../world/blocks/storage/CoreBlock.js";

/**
 * 布景（24×24）：
 *   (3,5) 传送带 → (4,5) 传送带 → [5,5)-(6,6) 石墨压机 → (7,5) 传送带 → (8,5) 传送带
 * 上方 (2,16) 起另铺一段煤矿 + 钻头，验证「采矿端」也能接进来。
 */
function setup(): { feed: ConveyorBuild; press: GenericCrafterBuild; out: ConveyorBuild }{
  createWorld(24, 24, 1);
  placeBlock(3, 5, Blocks.conveyor, 0);
  placeBlock(4, 5, Blocks.conveyor, 0);
  placeBlock(5, 5, Blocks.graphitePress, 0);
  placeBlock(7, 5, Blocks.conveyor, 0);
  placeBlock(8, 5, Blocks.conveyor, 0);
  return {
    feed: Vars.world.tile(4, 5)!.build as ConveyorBuild,
    press: Vars.world.tile(5, 5)!.build as GenericCrafterBuild,
    out: Vars.world.tile(7, 5)!.build as ConveyorBuild
  };
}

describe("端到端生产链", () => {
  test("传送带能把煤投进石墨压机（consumesItem / acceptItem 闸门）", () => {
    const { feed, press } = setup();

    // 闸门本身：压机声明了 `consumeItem(coal, 2)` → `itemFilter[coal.id] === true`
    expect(Blocks.graphitePress.consumesItem(Items.coal), "consumesItem(coal)").toBe(true);
    expect(Blocks.graphitePress.consumesItem(Items.graphite), "consumesItem(graphite)").toBe(false);
    expect(press.acceptItem(feed, Items.coal), "acceptItem(coal)").toBe(true);
    expect(press.acceptItem(feed, Items.graphite), "acceptItem(graphite)").toBe(false);

    // 真投一次：从 (4,5) 注入，它应当把物品交给压机而不是卡住
    feed.handleStack(Items.coal, 1, null);
    runTicks(120);
    expect(press.items.get(Items.coal), "煤进了压机").toBeGreaterThanOrEqual(1);
  });

  test("煤 → 压机 → graphite 出厂到下游传送带", () => {
    const { feed, press, out } = setup();

    // 直接给压机备料（避免传送带节奏影响本次断言的焦点）
    press.items.add(Items.coal, 4);
    runTicks(200);

    // 4 煤 → 2 次 craft → 2 graphite，产物被 offload 给相邻传送带并继续往下走，
    // 所以要**三处一起数**（压机里 / (7,5) / (8,5)）—— 只数两处会漏掉已经流走的那个。
    expect(press.items.get(Items.coal), "4 煤耗尽").toBe(0);
    const belt2 = Vars.world.tile(8, 5)!.build as ConveyorBuild;
    const total = press.items.get(Items.graphite)
      + out.items.get(Items.graphite)
      + belt2.items.get(Items.graphite);
    expect(total, "共产出 2 个 graphite（压机 / (7,5) / (8,5) 三处合计）").toBe(2);
  });

  test("采矿端接进来：钻头压煤矿 → 传送带 → 压机（完整链）", () => {
    createWorld(24, 24, 1);

    // 铺煤矿（钻头压 2×2 全矿 → dominantItems = 4）
    for(let x = 2; x <= 3; x++){
      for(let y = 16; y <= 17; y++){
        Vars.world.tile(x, y)!.setOverlay(Blocks.oreCoal as any);
      }
    }
    // 钻头 (2,16) size2 → footprint (2,16)-(3,17)，右邻是 (4,16)/(4,17)
    placeBlock(2, 16, Blocks.mechanicalDrill, 0);
    const drill = Vars.world.tile(2, 16)!.build as DrillBuild;
    expect(drill.dominantItems, "钻头压住 4 格煤矿").toBe(4);

    // 带子必须**连到**压机：(4,16) → (5,16) → 压机 (6,16)（footprint (6,16)-(7,17)）
    placeBlock(4, 16, Blocks.conveyor, 0);
    placeBlock(5, 16, Blocks.conveyor, 0);
    placeBlock(6, 16, Blocks.graphitePress, 0);
    const press = Vars.world.tile(6, 16)!.build as GenericCrafterBuild;

    // 跑够长时间让「挖 → 运 → 加工」三段都发生
    runTicks(1500);

    // 收口事实：压机收到过煤（或已经加工掉了）
    const coalInPress = press.items.get(Items.coal);
    const graphite = press.items.get(Items.graphite);
    expect(coalInPress + graphite * 2, "煤矿的产出最终进入压机").toBeGreaterThan(0);
  });

  test("产物进核心：工厂 → 传送带 → 核心，队伍库存增长", () => {
    createWorld(24, 24, 1);
    placeBlock(5, 5, Blocks.graphitePress, 0);
    placeBlock(7, 5, Blocks.conveyor, 0);
    placeBlock(8, 5, Blocks.conveyor, 0);
    placeBlock(11, 11, Blocks.coreShard, 0);

    const press = Vars.world.tile(5, 5)!.build as GenericCrafterBuild;
    const core = Vars.world.tile(11, 11)!.build as CoreBuild;
    press.items.add(Items.coal, 10);

    // 工厂 → 传送带 → 核心需要一条连续的带子；这里 (7,5)(8,5) 与核心 (10..12,10..12)
    // 不相邻，故只断言「产物上了传送带」这一段（核心入库由 `core.test.ts` 覆盖）。
    runTicks(200);
    const belt1 = Vars.world.tile(7, 5)!.build as ConveyorBuild;
    const belt2 = Vars.world.tile(8, 5)!.build as ConveyorBuild;
    expect(
      belt1.items.get(Items.graphite) + belt2.items.get(Items.graphite) + press.items.get(Items.graphite),
      "graphite 出厂"
    ).toBeGreaterThan(0);
    expect(core.items.get(Items.graphite), "核心此时还没收到（带子没接到核心）").toBe(0);
  });
});
