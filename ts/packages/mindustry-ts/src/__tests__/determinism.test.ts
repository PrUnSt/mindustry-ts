// S3 子步 6（determinism）验收测试：`harness.snapshot()` 的确定性（硬断言 #6）。
//
// 「两次**全新建图**（同种子、同 tick 数、同方块摆放）→ 快照字符串完全相等」。
// 为了让这条断言真正有力，本测试的快照覆盖：
//   - `state.tick` / `Time.time`（虚拟时钟被 harness 归零 → 两次都从 0 起）
//   - `Mathf.rand` 的当前种子（seed0/seed1）
//   - 全部 10 个 `Groups.*.size()`
//   - 逐 tile 的 floor / overlay / block **名字**、`data`、建筑摘要（名字/队伍/血量/朝向）
//   - 地图尺寸
//
// 反事实（第二个用例）: 换一个种子（124）→ 快照**必须不同**。若快照退化成常量字符串，
//   或种子没有真正进入快照，这条断言必红。
//
// 另一条更强的反事实由「交付报告」演示：往 `snapshot()` 里塞 `Date.now()` 后，本文件的
//   主用例（a === b）会变红 —— 证明「两次构建相等」确实在检测非确定性。

import { describe, expect, test } from "vitest";
import { Blocks } from "../content/Blocks.js";
import { createWorld, placeBlock, runTicks, snapshot } from "../harness.js";

/** 一次「全新建图 → 固定摆放 → 跑 ticks → 取快照」。 */
function runFresh(seed: number, ticks: number): string{
  createWorld(16, 16, seed);
  placeBlock(2, 2, Blocks.conveyor, 0);
  placeBlock(3, 2, Blocks.conveyor, 1);
  placeBlock(4, 2, Blocks.router, 0);
  placeBlock(6, 6, Blocks.copperWall, 0);
  runTicks(ticks);
  return snapshot();
}

describe("determinism: 全新建图的确定性（硬断言 #6）", () => {
  test("两次全新建图（16x16, seed=123, 600 tick）→ snapshot() 字符串完全相等", () => {
    const a = runFresh(123, 600);
    const b = runFresh(123, 600);

    expect(a).toBe(b);

    // 证明这不是空快照：600 tick 已生效、三件 update=true 建筑已入组
    expect(a).toContain("tick=600");
    expect(a).toContain("time=600");
    expect(a).toContain("size=16x16");
    expect(a).toContain("unit=0 build=3");
    // 方块名字确实进入快照（避免「名字表为空」式的假相等）
    expect(a).toContain("block=conveyor");
    expect(a).toContain("block=router");
    expect(a).toContain("block=copper-wall");
  });

  test("反事实：不同种子（124）→ 快照必须不同", () => {
    const a = runFresh(123, 600);
    const c = runFresh(124, 600);

    // 差异来自 Mathf.rand 的种子（世界本身不消耗随机，故差异是确定性的种子编码）
    expect(c).not.toBe(a);
    expect(a).toContain("rand seed0=");
    expect(c).toContain("rand seed0=");
  });
});
