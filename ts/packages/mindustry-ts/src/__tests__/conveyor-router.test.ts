// S4 验收测试 ①：传送带 / 路由器的**真实行为**。
//
// 覆盖 §7 的验收条款:
//   1. 摆 `conveyor → conveyor → conveyor → router`，首端 `handleItem(copper)`，
//      断言物品**到达的精确 tick 数**（实测记录后钉死）+ `router.items.total() === 1`；
//   2. 断言物品的**位置坐标序列**（`xs` / `ys` / `ids`），不只是「最终有物品」；
//   3. 两次相同摆放 + 相同 tick 数 → `snapshot()` 字符串相等（确定性）。
//
// ⚠️ 精确 tick 与精确浮点值是**先跑探针实测、再写死**的（不是推导出来的）:
//   `E:\...` 见交付报告「怎么测出来的」一节。实测方法: 逐 tick `runTicks(1)` 打印
//   `c1.len / c1.ys[0] / c1.xs[0] / c2.len / c2.ys[0] / c2.xs[0] / router.items.total()`。
//   实测结论:
//     · tick 29 —— 物品离开第 2 格传送带（c2 同一 tick 收到，`ys[0] = 0.035`）
//     · tick 57 —— 物品进入路由器（`router.items.total() === 1`）
//   这两条来自源码里的常量（`speed = 0.035`、`Time.delta = 1`、`edgeDelta = efficiency * delta = 1`）
//   与 `ys >= 1` 的判定: 0.035 * 29 = 1.015 ≥ 1 → 29 tick 走完一格。
//
// 反事实用例（本文件里各条「判别性断言」，实测变红输出见交付报告）:
//   - 把 `ConveyorBuild.updateTile` 的 `moved` 改成 `speed`（漏乘 `edelta()`）→ 精确 tick 数全部错位
//   - 把 `RouterBuild.getTileTarget` 的 `cycles[id]` 递增去掉 → 「轮转」用例变红
//   - 把 `ConveyorBuild.acceptItem` 的 `direction === 0` 放宽成恒真 → 「正面拒收」用例变红

import { describe, expect, test } from "vitest";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Items } from "../content/Items.js";
import { createWorld, placeBlock, runTicks, snapshot } from "../harness.js";
import { ConveyorBuild } from "../world/blocks/distribution/Conveyor.js";
import { RouterBuild } from "../world/blocks/distribution/Router.js";

/**
 * 标准摆放: `conveyor(1,2) → conveyor(2,2) → conveyor(3,2) → router(4,2)`，全部朝 +x。
 *
 * `(1,2)` 的那条传送带只作为**物品来源**（`handleItem(feeder, …)` 的 `source`），
 * 它自己不参与搬运链 —— 这样「首端 handleItem」就精确对应 Java 里
 * 「一条传送带把物品交给下一条」的调用形状（`source` 在正后方 → `direction === 0`）。
 */
function buildChain(): { feeder: ConveyorBuild; c1: ConveyorBuild; c2: ConveyorBuild; router: RouterBuild }{
  createWorld(16, 16, 1);
  placeBlock(1, 2, Blocks.conveyor, 0);
  placeBlock(2, 2, Blocks.conveyor, 0);
  placeBlock(3, 2, Blocks.conveyor, 0);
  placeBlock(4, 2, Blocks.router, 0);

  return {
    feeder: Vars.world.tile(1, 2)!.build as ConveyorBuild,
    c1: Vars.world.tile(2, 2)!.build as ConveyorBuild,
    c2: Vars.world.tile(3, 2)!.build as ConveyorBuild,
    router: Vars.world.tile(4, 2)!.build as RouterBuild
  };
}

/** 一行确定性记录: `tick|len(xs0,ys0,ids0)|…`。用于「坐标序列」断言。 */
function record(c1: ConveyorBuild, c2: ConveyorBuild, router: RouterBuild, tick: number): string{
  return [
    tick,
    c1.len,
    c1.ys[0],
    c1.xs[0],
    c1.ids[0] === null ? "null" : c1.ids[0].name,
    c2.len,
    c2.ys[0],
    c2.xs[0],
    c2.ids[0] === null ? "null" : c2.ids[0].name,
    router.items.total()
  ].join("|");
}

describe("conveyor-router: 邻接接线（updateProximity 的产物）", () => {
  test("next / nextc / aligned 与 proximity 的精确内容", () => {
    const { feeder, c1, c2, router } = buildChain();

    // ---- proximity: 双向、同队伍、无重复、顺序 = 邻居的放置顺序（见文件头）----
    // 放置顺序: feeder(1,2) → c1(2,2) → c2(3,2) → router(4,2)
    // · (2,2) 在第二步落地 → 当时只有 (1,2) 一个邻居；随后 (3,2) 把自己追加进来
    //   → [(1,2), (3,2)]（这正是「反向写入」存在的证据）
    // · (3,2) 在第三步落地 → 当时只有 (2,2)；随后 (4,2) 追加 → [(2,2), (4,2)]
    // · (4,2) 在最后落地 → 只有 (3,2)
    // · (1,2) 最先落地 → 只有 (2,2)（由 (2,2) 的反向写入填上）
    expect(c1.proximity.length).toBe(2);
    expect(c1.proximity[0]).toBe(feeder);
    expect(c1.proximity[1]).toBe(c2);
    expect(c2.proximity.length).toBe(2);
    expect(c2.proximity[0]).toBe(c1);
    expect(c2.proximity[1]).toBe(router);
    expect(router.proximity.length).toBe(1);
    expect(router.proximity[0]).toBe(c2);
    expect(feeder.proximity.length).toBe(1);
    expect(feeder.proximity[0]).toBe(c1);

    // ---- next / nextc / aligned: `front()` + `instanceof ConveyorBuild` + 朝向比较 ----
    expect(c1.next).toBe(c2);
    expect(c1.nextc).toBe(c2);
    expect(c1.aligned).toBe(true); // 两条都是 rotation 0

    expect(c2.next).toBe(router);
    expect(c2.nextc).toBeNull(); // 路由器不是 ConveyorBuild
    expect(c2.aligned).toBe(false);

    expect(feeder.next).toBe(c1);
    expect(feeder.nextc).toBe(c1);
    expect(feeder.aligned).toBe(true);
  });
});

describe("conveyor-router: 精确 tick 与精确坐标序列", () => {
  test("copper 在 tick 29 离开第 2 格、在 tick 57 进入路由器；逐 tick 坐标实测值", () => {
    const { feeder, c1, c2, router } = buildChain();

    // 首端放入 1 个铜。`source` 在正后方 → `direction === 0` → 落在 `ids[0]`、`ys[0] = 0`。
    c1.handleItem(feeder, Items.copper);

    // 放入的瞬间: 三条平行数组的**精确初值**（idx 0 之外全为空）
    expect(c1.len).toBe(1);
    expect(c1.ys[0]).toBe(0);
    expect(c1.xs[0]).toBe(0);
    expect(c1.ids[0]).toBe(Items.copper);
    expect(c1.items.total()).toBe(1);
    // `handleItem` 里 `insertAt(0)` 只前移已有元素；len=1 时其余槽位保持 null/0
    expect(c1.ids[1]).toBeNull();
    expect(c1.ids[2]).toBeNull();
    expect(c1.ys[1]).toBe(0);
    expect(c1.ys[2]).toBe(0);

    const records: string[] = [];
    const xsSeen = new Set<number>();
    const ticks = { leftC1: -1, arrivedC2: -1, arrivedRouter: -1 };

    for(let tick = 1; tick <= 60; tick++){
      runTicks(1);
      records.push(record(c1, c2, router, tick));
      xsSeen.add(c1.xs[0]!);
      xsSeen.add(c2.xs[0]!);

      if(ticks.leftC1 === -1 && c1.len === 0) ticks.leftC1 = tick;
      if(ticks.arrivedC2 === -1 && c2.len === 1) ticks.arrivedC2 = tick;
      if(ticks.arrivedRouter === -1 && router.items.total() === 1) ticks.arrivedRouter = tick;
    }

    // ---- ① 精确 tick（先实测后钉死）----
    expect(ticks.leftC1).toBe(29);
    expect(ticks.arrivedC2).toBe(29);
    expect(ticks.arrivedRouter).toBe(57);

    // ---- ② 精确坐标序列（采样窗口，逐字段写死）----
    // 注意 ys[0] 是「反复 +0.035」的 IEEE-754 累积结果，因此尾数不是干净的 0.945 —— 这里
    // **钉死实测到的精确 double**，任何改动 `moved` 计算的笔误都会让它变红。
    expect(records[0]).toBe("1|1|0.035|0|copper|0|0|0|null|0"); // tick 1
    expect(records[1]).toBe("2|1|0.07|0|copper|0|0|0|null|0"); // tick 2
    expect(records[2]).toBe("3|1|0.10500000000000001|0|copper|0|0|0|null|0"); // tick 3
    // tick 27..29 —— 跨越 c1 → c2 的交接
    expect(records[26]).toBe("27|1|0.9450000000000006|0|copper|0|0|0|null|0");
    expect(records[27]).toBe("28|1|0.9800000000000006|0|copper|0|0|0|null|0");
    expect(records[28]).toBe("29|0|1|0|copper|1|0.035|0|copper|0");
    // tick 55..57 —— 跨越 c2 → router 的交接
    expect(records[54]).toBe("55|0|1|0|copper|1|0.9450000000000006|0|copper|0");
    expect(records[55]).toBe("56|0|1|0|copper|1|0.9800000000000006|0|copper|0");
    expect(records[56]).toBe("57|0|1|0|copper|0|1|0|copper|1");
    // 路由器收到后**原地保持**（没有输出端可投递）
    expect(records[57]).toBe("58|0|1|0|copper|0|1|0|copper|1");

    // ---- ③ 全程不变量: 物品没有横向漂移（`xs` 恒 0）----
    // 侧面输入才会给 xs 非 0（见下一条用例）→ 这里 xs 恒 0 证明「正后方输入」这一支被走到。
    expect([...xsSeen]).toEqual([0]);

    // ---- ④ 最终状态: 路由器持有 1 个铜，且 `lastItem` 与库存一致 ----
    expect(router.items.total()).toBe(1);
    expect(router.items.first()).toBe(Items.copper);
    expect(router.lastItem).toBe(Items.copper);
    expect(router.lastItem).toBe(Items.copper);
    // 路由器只在「目标也是路由器」时才等待；这里没有输出端 → 没有任何转移
    expect(router.items.total()).toBe(1);
  });

  test("侧面输入给出非零 xs（证明 xs 真的参与位置计算，而不是恒 0 的摆设）", () => {
    createWorld(16, 16, 1);
    // (2,2) 朝向 +x；(2,3) 朝向 +y（rotation 1 → front = (2,4)）
    placeBlock(2, 2, Blocks.conveyor, 0);
    placeBlock(2, 3, Blocks.conveyor, 1);
    placeBlock(3, 2, Blocks.conveyor, 0); // c1 的前方（输出端）

    const side = Vars.world.tile(2, 3)!.build as ConveyorBuild;
    const c1 = Vars.world.tile(2, 2)!.build as ConveyorBuild;
    const ahead = Vars.world.tile(3, 2)!.build as ConveyorBuild;

    // 放置瞬间 (2,3) 的 front 是 (2,4)，不是 (2,2) → 不是「侧向输入」的 next；
    // 但 (2,2) 的邻域里有 (2,3)，所以 proximity 里必须有它。
    expect(c1.proximity.includes(side)).toBe(true);

    // 由 (2,3) 送入: 相对 (2,2) 的方向是 (0,+1) → relativeTo 3；`ang = 3 - 0 = 3`
    // → `x = 1`（正向偏离），且 `|3 - 0| = 3 ≠ 0` → 走 `mid` 分支、`ys = 0.5`
    c1.handleItem(side, Items.copper);
    expect(c1.len).toBe(1);
    expect(c1.xs[0]).toBe(1);
    expect(c1.ys[0]).toBe(0.5);
    expect(c1.ids[0]).toBe(Items.copper);
    // `mid` 在 `updateTile` 里才被赋值 → 此刻仍是 0，故物品落在 idx 0
    expect(c1.mid).toBe(0);

    // ---- 推进 tick: `ys` 从 0.5 起走（不是 0），`xs` 以 `moved * 2 = 0.07`/tick 收敛到 0 ----
    runTicks(1);
    expect(c1.ys[0]).toBe(0.535); // 0.5 + 0.035
    expect(c1.xs[0]).toBeCloseTo(0.93, 12); // 1 - 0.07
    expect(c1.len).toBe(1);

    runTicks(1);
    expect(c1.ys[0]).toBe(0.5700000000000001); // 实测值（0.5 + 0.035 * 2 的 IEEE 累积结果）
    expect(c1.xs[0]).toBeCloseTo(0.86, 12); // 1 - 0.07 * 2

    // 第 14 tick: `xs` 只剩 0.02（`Mathf.approach` 到达目标即停，不会越过 0）
    runTicks(12);
    expect(c1.xs[0]).toBeCloseTo(0.02, 12);
    expect(c1.ys[0]).toBeCloseTo(0.99, 12);
    expect(c1.len).toBe(1);

    // 第 15 tick: `xs` 归零、`ys` 到 1.0 → 交给前方的 (3,2)。侧面输入比正后方输入
    // **早 14 tick 到达**（`ys` 从 0.5 起 vs 从 0 起）—— 这是 `ys = 0.5` 的直接后果。
    runTicks(1);
    expect(c1.xs[0]).toBe(0);
    expect(c1.len).toBe(0);
    expect(c1.items.total()).toBe(0);
    expect(ahead.len).toBe(1);
    expect(ahead.ids[0]).toBe(Items.copper);
    expect(ahead.items.total()).toBe(1);
  });
});

describe("conveyor-router: 输入协议（acceptItem 的方向判定）", () => {
  test("传送带拒收来自正前方的物品，接受来自正后方的物品", () => {
    createWorld(16, 16, 1);
    placeBlock(1, 2, Blocks.conveyor, 0); // 后方（输入）
    placeBlock(2, 2, Blocks.conveyor, 0); // 目标
    placeBlock(3, 2, Blocks.conveyor, 0); // 前方（输出）

    const back = Vars.world.tile(1, 2)!.build as ConveyorBuild;
    const mid = Vars.world.tile(2, 2)!.build as ConveyorBuild;
    const front = Vars.world.tile(3, 2)!.build as ConveyorBuild;

    // 后方 → `direction 0`，且 `minitem === 1`（初始值）→ 接受
    expect(mid.acceptItem(back, Items.copper)).toBe(true);
    // 前方 → `direction 2`（既不是 0 也不是奇数）→ 拒绝（否则物品会原地回弹）
    expect(mid.acceptItem(front, Items.copper)).toBe(false);

    // 容量上限: 塞满 3 个之后一律拒收（`len >= capacity`）
    mid.handleItem(back, Items.copper);
    mid.handleItem(back, Items.copper);
    mid.handleItem(back, Items.copper);
    expect(mid.len).toBe(3);
    expect(mid.items.total()).toBe(3);
    expect(mid.acceptItem(back, Items.copper)).toBe(false);
    // 第 4 次 `handleItem` 也不会越界写数组（`len >= capacity` 早退）
    mid.handleItem(back, Items.copper);
    expect(mid.len).toBe(3);
    expect(mid.items.total()).toBe(3);
  });
});

describe("conveyor-router: 路由器轮转投递", () => {
  test("两个输出端时轮流投递（去掉 cycles 递增即变红）", () => {
    createWorld(16, 16, 1);
    placeBlock(3, 2, Blocks.conveyor, 0); // 输入
    placeBlock(4, 2, Blocks.router, 0);
    placeBlock(4, 3, Blocks.conveyor, 1); // 输出 A（+y 方向，front 朝外）
    placeBlock(4, 1, Blocks.conveyor, 3); // 输出 B（-y 方向，front 朝外）

    const router = Vars.world.tile(4, 2)!.build as RouterBuild;
    const input = Vars.world.tile(3, 2)!.build as ConveyorBuild;
    const outA = Vars.world.tile(4, 3)!.build as ConveyorBuild;
    const outB = Vars.world.tile(4, 1)!.build as ConveyorBuild;

    // proximity 的顺序 = **邻居被放置的顺序**（见文件头），不是 `Edges` 的环序:
    // 放置顺序是 输入(3,2) → router(4,2) → outA(4,3) → outB(4,1)，router 在第二步落地，
    // 它的邻居是随后两步被追加进来的 → [输入, outA, outB]。
    // 顺序是**行为性**的: `getTileTarget` 用 `cycles[id]` 索引 `proximity`，顺序变则投递目标变。
    expect(router.proximity.length).toBe(3);
    expect(router.proximity[0]).toBe(input);
    expect(router.proximity[1]).toBe(outA);
    expect(router.proximity[2]).toBe(outB);
    // `cycles` 是 `protected`（Java 同）→ 测试用一次显式窄化读它，直接钉死轮转游标
    const cycles = (router as unknown as { cycles: number[] }).cycles;
    expect(cycles.length).toBe(Vars.content.items().size);
    expect(cycles[Items.copper.id]).toBe(0);

    // 输入传送带的 front 正对路由器 → 它的 `direction` 是 2 → **拒收**来自路由器的物品。
    // 这条断言是「轮转真的换目标」的前提: 若不拒收，路由器会一直把物品塞回输入端。
    expect(input.acceptItem(router, Items.copper)).toBe(false);
    expect(outA.acceptItem(router, Items.copper)).toBe(true);
    expect(outB.acceptItem(router, Items.copper)).toBe(true);

    /** 喂一个物品，跑到它离开路由器，返回它落到了哪个输出端。 */
    function feedOnce(): "A" | "B" | "none"{
      router.handleItem(input, Items.copper);
      runTicks(40);
      const landed: "A" | "B" | "none" = outA.len === 1 ? "A" : outB.len === 1 ? "B" : "none";
      // 清空，准备下一轮
      for(const out of [outA, outB]){
        out.items.clear();
        out.len = 0;
        out.ids.fill(null);
      }
      router.items.clear();
      router.lastItem = null;
      runTicks(1);
      return landed;
    }

    // 三个物品 → A, B, A（严格轮转）；游标每次前移 1 并环绕（size = 3）
    expect(feedOnce()).toBe("A");
    expect(cycles[Items.copper.id]).toBe(2);
    expect(feedOnce()).toBe("B");
    expect(cycles[Items.copper.id]).toBe(0);
    expect(feedOnce()).toBe("A");
    expect(cycles[Items.copper.id]).toBe(2);
    // 每一步都确实转移出去了（路由器没有囤积）
    expect(router.items.total()).toBe(0);
    expect(router.lastItem).toBeNull();
  });

  test("没有输出端时路由器**持有**物品，且 time 每 tick 累加 1/8（speed = 8）", () => {
    createWorld(16, 16, 1);
    placeBlock(3, 2, Blocks.conveyor, 0);
    placeBlock(4, 2, Blocks.router, 0);
    const router = Vars.world.tile(4, 2)!.build as RouterBuild;
    const input = Vars.world.tile(3, 2)!.build as ConveyorBuild;

    expect(router.items.total()).toBe(0);
    expect(router.lastItem).toBeNull();

    router.handleItem(input, Items.copper);
    expect(router.items.total()).toBe(1);
    expect(router.lastItem).toBe(Items.copper);
    expect(router.time).toBe(0);
    // `handleItem` 记录了来源 tile（用于排除「回投到输入端」，见 `getTileTarget`）
    expect(router.lastInput).toBe(input.tile);

    // 只要唯一邻居是拒收的输入端 → 物品出不去，`time` 每 tick +1/8 = 0.125
    for(let i = 1; i <= 8; i++){
      runTicks(1);
      expect(router.time).toBeCloseTo(i * 0.125, 10);
      expect(router.items.total()).toBe(1);
    }
    expect(router.time).toBe(1);
  });
});

describe("conveyor-router: 确定性（硬断言 #6 的 S4 版本）", () => {
  test("两次全新建图 + 相同摆放 + 相同 tick → snapshot() 字符串完全相等", () => {
    function runFresh(): string{
      const { feeder, c1 } = buildChain();
      c1.handleItem(feeder, Items.copper);
      c1.handleItem(feeder, Items.copper);
      runTicks(120);
      return snapshot();
    }

    const a = runFresh();
    const b = runFresh();

    expect(a).toBe(b);
    // 证明快照不是空的: 120 tick 已生效、4 个建筑在组里、方块名进了快照
    expect(a).toContain("tick=120");
    expect(a).toContain("build=4");
    expect(a).toContain("block=conveyor");
    expect(a).toContain("block=router");
  });
});
