// ④ 对拍验收：用 **Java 原版导出的 golden 快照**（`ts/golden/`）校验 TS 的行为。
//
// golden 由 `tests/src/test/java/GoldenExportTest.java` 生成：
//   ./gradlew :tests:test --tests GoldenExportTest
//
// 这是验收口径的**升级**：从「自己写断言」变成「与原版对拍」。断言值不再由 TS 作者
// 推导或实测得出，而是直接来自原版运行结果 —— 实现错了就必然对不上。
//
// ⚠️ 两条必须知道的比对约定（原因见 GoldenExportTest.java 文件头）:
//
//   1. **浮点带容差**：Java 的 `float` 是 32 位，TS 的 `number` 是 64 位 double。
//      `0.035` 累加 29 次：Java 约 `0.94500005`，TS 是 `0.9450000000000006`。
//      因此**离散量**（len / 物品名 / items.total）严格相等，**浮点量**用 FP_TOL 比较。
//      容差取 1e-4：float 相对精度 ~1e-7，累加 60 次后绝对误差仍 <1e-5，1e-4 留了一个量级余量。
//
//   2. **不比 state.tick**：两边 `state.tick += Core.graphics.getDeltaTime() * 60`，
//      但 headless 下 getDeltaTime() 取值不同（TS 的 MockGraphics 恒 1/60）。golden 里
//      的 `tick` 列是**迭代序号**，不是 `state.tick`，两边按序号对齐。
//
// 若 golden 目录不存在（未跑过 Java 侧导出），本文件整体跳过，不会误报失败。

import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Items } from "../content/Items.js";
import { createWorld, placeBlock, runTicks } from "../harness.js";
import { ConveyorBuild } from "../world/blocks/distribution/Conveyor.js";
import { RouterBuild } from "../world/blocks/distribution/Router.js";

const here = dirname(fileURLToPath(import.meta.url));
/** `ts/golden/`（`__tests__` → src → mindustry-ts → packages → ts）。 */
const GOLDEN_DIR = join(here, "..", "..", "..", "..", "golden");

/** 浮点比较容差（见文件头第 1 条）。 */
const FP_TOL = 1e-4;

/** 读取 golden 文件，剥掉 `#` 注释与空行，返回按 `|` 切分的行数组。 */
function loadGolden(name: string): string[][]{
  const path = join(GOLDEN_DIR, name);
  const text = readFileSync(path, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      // 行尾可能带 ` # ...` 注释（router-rotation 的 landed 标注）
      const hash = line.indexOf("  #");
      const body = hash >= 0 ? line.slice(0, hash) : line;
      return body.split("|").map((cell) => cell.trim());
    });
}

/** 断言两个数值在容差内相等（离散量传 FP_TOL=0 即可严格相等）。 */
function closeTo(actual: number, expected: number, tol: number, label: string): void{
  if(tol === 0){
    expect(actual, label).toBe(expected);
    return;
  }
  if(Number.isNaN(expected)){
    expect(Number.isNaN(actual), label + " (expected NaN)").toBe(true);
    return;
  }
  expect(Math.abs(actual - expected), label + ` (actual=${actual} expected=${expected})`).toBeLessThanOrEqual(tol);
}

describe.skipIf(!existsSync(join(GOLDEN_DIR, "java-conveyor-chain.txt")))("golden 对拍 · 传送带链", () => {
  test("逐 tick 与 Java 原版一致（离散量严格、浮点带容差）", () => {
    const rows = loadGolden("java-conveyor-chain.txt");
    expect(rows.length).toBeGreaterThan(1);

    createWorld(16, 16, 1);
    placeBlock(1, 2, Blocks.conveyor, 0);
    placeBlock(2, 2, Blocks.conveyor, 0);
    placeBlock(3, 2, Blocks.conveyor, 0);
    placeBlock(4, 2, Blocks.router, 0);

    const feeder = Vars.world.tile(1, 2)!.build as ConveyorBuild;
    const c1 = Vars.world.tile(2, 2)!.build as ConveyorBuild;
    const c2 = Vars.world.tile(3, 2)!.build as ConveyorBuild;
    const router = Vars.world.tile(4, 2)!.build as RouterBuild;

    c1.handleItem(feeder, Items.copper);

    /** 把当前 TS 状态渲染成与 golden 同形的行。 */
    function currentRow(index: number): string[]{
      return [
        String(index),
        String(c1.len),
        String(c1.ys[0]),
        String(c1.xs[0]),
        c1.ids[0] === null ? "null" : c1.ids[0].name,
        String(c2.len),
        String(c2.ys[0]),
        String(c2.xs[0]),
        c2.ids[0] === null ? "null" : c2.ids[0].name,
        String(router.items.total())
      ];
    }

    // tick 0（注入瞬间，尚未推进）
    {
      const g = rows[0]!;
      expect(String(c1.len), "tick0 len1").toBe(g[1]);
      closeTo(c1.ys[0]!, Number(g[2]), FP_TOL, "tick0 ys1");
      expect(c1.ids[0] === null ? "null" : c1.ids[0].name, "tick0 item1").toBe(g[4]);
      expect(String(router.items.total()), "tick0 routerTotal").toBe(g[9]);
    }

    for(let i = 1; i < rows.length; i++){
      runTicks(1);
      const g = rows[i]!;
      const a = currentRow(i);
      const label = "row#" + i;

      // ---- 离散量：严格相等 ----
      closeTo(Number(a[1]), Number(g[1]), 0, label + " len1");
      closeTo(Number(a[5]), Number(g[5]), 0, label + " len2");
      closeTo(Number(a[9]), Number(g[9]), 0, label + " routerTotal");
      expect(a[4], label + " item1").toBe(g[4]);
      expect(a[8], label + " item2").toBe(g[8]);

      // ---- 浮点量：带容差 ----
      closeTo(Number(a[2]), Number(g[2]), FP_TOL, label + " ys1");
      closeTo(Number(a[3]), Number(g[3]), FP_TOL, label + " xs1");
      closeTo(Number(a[6]), Number(g[6]), FP_TOL, label + " ys2");
      closeTo(Number(a[7]), Number(g[7]), FP_TOL, label + " xs2");
    }
  });
});

describe.skipIf(!existsSync(join(GOLDEN_DIR, "java-router-rotation.txt")))("golden 对拍 · 路由器轮转", () => {
  test("三个物品的落点序列与 Java 原版一致", () => {
    const rows = loadGolden("java-router-rotation.txt");
    expect(rows.length).toBe(3);
    // golden 的 landed 标注（第三种列尾注释已被剥掉，这里用 len 列还原落点）
    const expectedLanded = rows.map((r) => (r[1] === "1" ? "A" : r[2] === "1" ? "B" : "none"));

    createWorld(16, 16, 1);
    placeBlock(3, 2, Blocks.conveyor, 0);
    placeBlock(4, 2, Blocks.router, 0);
    placeBlock(4, 3, Blocks.conveyor, 1);
    placeBlock(4, 1, Blocks.conveyor, 3);

    const input = Vars.world.tile(3, 2)!.build as ConveyorBuild;
    const router = Vars.world.tile(4, 2)!.build as RouterBuild;
    const outA = Vars.world.tile(4, 3)!.build as ConveyorBuild;
    const outB = Vars.world.tile(4, 1)!.build as ConveyorBuild;

    const actualLanded: string[] = [];

    for(let round = 0; round < 3; round++){
      router.handleItem(input, Items.copper);
      runTicks(40);
      actualLanded.push(outA.len === 1 ? "A" : outB.len === 1 ? "B" : "none");

      for(const out of [outA, outB]){
        out.items.clear();
        out.len = 0;
        out.ids.fill(null);
      }
      router.items.clear();
      router.lastItem = null;
      runTicks(1);
    }

    expect(actualLanded).toEqual(expectedLanded);
  });
});

describe.skipIf(!existsSync(join(GOLDEN_DIR, "java-side-input.txt")))("golden 对拍 · 侧面输入", () => {
  test("xs 收敛序列与 Java 原版一致", () => {
    const rows = loadGolden("java-side-input.txt");
    expect(rows.length).toBeGreaterThan(1);

    createWorld(16, 16, 1);
    placeBlock(2, 2, Blocks.conveyor, 0);
    placeBlock(2, 3, Blocks.conveyor, 1);
    placeBlock(3, 2, Blocks.conveyor, 0);

    const c1 = Vars.world.tile(2, 2)!.build as ConveyorBuild;
    const side = Vars.world.tile(2, 3)!.build as ConveyorBuild;
    const ahead = Vars.world.tile(3, 2)!.build as ConveyorBuild;

    c1.handleItem(side, Items.copper);

    for(let i = 0; i < rows.length; i++){
      if(i > 0) runTicks(1);
      const g = rows[i]!;
      const label = "side row#" + i;
      closeTo(c1.len, Number(g[1]), 0, label + " len1");
      closeTo(c1.ys[0]!, Number(g[2]), FP_TOL, label + " ys1");
      closeTo(c1.xs[0]!, Number(g[3]), FP_TOL, label + " xs1");
      closeTo(ahead.len, Number(g[4]), 0, label + " aheadLen");
    }
  });
});
