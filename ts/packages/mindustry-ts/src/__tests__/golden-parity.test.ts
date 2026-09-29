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
import { DrillBuild } from "../world/blocks/production/Drill.js";
import { CoreBuild } from "../world/blocks/storage/CoreBlock.js";
import { GenericCrafterBuild } from "../world/blocks/production/GenericCrafter.js";
import { ConsumeGeneratorBuild } from "../world/blocks/power/ConsumeGenerator.js";
import type { Item } from "../type/Item.js";

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

// =========================================================================================
// 采矿 / 核心入库（本阶段新增场景）
//
// golden 由 `GoldenExportTest.exportDrill` / `exportCore` 生成。这两张表各自带 `# [A]` / `# [B]`
// **两个不同布景**，因此不能用上面的 `loadGolden()`（它剥掉注释后会把两节拼成一条）。
// =========================================================================================

/**
 * 读取带 `# [A]` / `# [B]` 分节的 golden 文件，返回**各节**的数据行数组。
 *
 * ⚠️ 为什么需要它：`java-drill.txt`（1214 行）与 `java-core.txt`（298 行）各自包含两个
 * 不同布景的表，中间以 `# [A]` / `# [B]` 注释分隔。`loadGolden()` 会把所有注释行剥掉 →
 * 两节数据被拼成一个连续数组，逐 tick 对齐就错位了。
 * `[B]` 在 `java-core.txt` 里是**连续三行**注释（`:154-156`），所以用「tag 变化才切节」
 * 而不是「每见到一行就切」。
 */
function loadGoldenSections(name: string): string[][][]{
  const text = readFileSync(join(GOLDEN_DIR, name), "utf8");
  const sections: string[][][] = [];
  let current: string[][] = [];
  let lastTag: string | null = null;

  for(const raw of text.split(/\r?\n/)){
    const line = raw.trim();
    if(line.startsWith("#")){
      // ⚠️ 原正则是 `[A-Z]`（单个大写字母）。C21 新增的两个 golden 用的是
      //    `[1]`/`[2]`/`[3]`（java-power.txt）与 `[A]`/`[B]`/`[probe]`（java-crafter.txt），
      //    故放宽为「方括号内任意字母数字串」。
      const m = /^#\s*\[([A-Za-z0-9]+)\]/.exec(line);
      if(m !== null && m[1] !== lastTag){
        if(lastTag !== null) sections.push(current);
        current = [];
        lastTag = m[1]!;
      }
      continue;
    }
    if(line.length === 0 || lastTag === null) continue;
    const hash = line.indexOf("  #");
    const body = hash >= 0 ? line.slice(0, hash) : line;
    current.push(body.split("|").map((cell) => cell.trim()));
  }
  if(current.length > 0) sections.push(current);
  return sections;
}

/** golden 里的物品名 → `Item` 对象。 */
function itemByName(name: string): Item{
  const items = Vars.content.items();
  for(let i = 0; i < items.size; i++){
    const item = items.get(i)!;
    if(item.name === name) return item;
  }
  throw new Error("golden 引用了不存在的物品: " + name);
}

/**
 * **相对**容差比较 —— 用于累加型浮点量（`progress` 在 tick 600 已达 ~318）。
 *
 * 为什么不能用 `FP_TOL = 1e-4` 的绝对容差：Java 全程 `float`（32 位，相对精度 ~1.2e-7），
 * 累加 600 次后**相对**误差可达 ~1e-5，换算成 |expected| ≈ 318 的量级就是 ~3e-3 的绝对误差 ——
 * 比 1e-4 大 30 倍。这不是实现不一致，而是两种浮点位宽的固有差异（与文件头第 1 条同源）。
 * 离散量仍走 `closeTo(..., 0)` 严格相等，小值浮点量仍走 `FP_TOL`。
 */
function closeToRel(actual: number, expected: number, relTol: number, label: string): void{
  const tol = Math.max(1, Math.abs(expected)) * relTol;
  expect(
    Math.abs(actual - expected),
    label + ` (actual=${actual} expected=${expected} tol=${tol})`
  ).toBeLessThanOrEqual(tol);
}

describe.skipIf(!existsSync(join(GOLDEN_DIR, "java-drill.txt")))("golden 对拍 · 机械钻采矿", () => {
  const sections = loadGoldenSections("java-drill.txt");

  /**
   * Java 侧布景（见 `java-drill.txt` 头注释）：
   * 24×24 全 air / seed=1 / `Time.delta=1`；`mechanical-drill` @ (5,5) size=2 →
   * footprint (5,5)-(6,6)，4 格全铺 `oreCopper` → `countOre` 得 `dominantItem=copper, dominantItems=4`。
   */
  function setup(withConveyor: boolean): DrillBuild{
    createWorld(24, 24, 1);
    for(const [x, y] of [[5, 5], [6, 5], [5, 6], [6, 6]] as const){
      Vars.world.tile(x, y)!.setOverlay(Blocks.oreCopper);
    }
    placeBlock(5, 5, Blocks.mechanicalDrill, 0);
    if(withConveyor){
      placeBlock(7, 5, Blocks.conveyor, 0);
      placeBlock(8, 5, Blocks.conveyor, 0);
    }
    const build = Vars.world.tile(5, 5)!.build as DrillBuild;
    build.updateProximity();
    return build;
  }

  test("[A] 无出口：dominantItem/dominantItems/progress/warmup/lastDrillSpeed/itemsTotal 逐 tick 一致", () => {
    const rows = sections[0]!;
    // golden 头注释写明 `[A]` 是 tick 0..600
    expect(rows.length).toBe(601);

    const drill = setup(false);

    for(let i = 0; i < rows.length; i++){
      if(i > 0) runTicks(1);
      const g = rows[i]!;
      const label = `drill[A] tick#${i}`;

      expect(drill.dominantItem === null ? "null" : drill.dominantItem.name, label + " dominantItem").toBe(g[1]);
      closeTo(drill.dominantItems, Number(g[2]), 0, label + " dominantItems");
      // ⚠️ 容差必须按**取模前的累积规模**取，不能按取模后的值取。
      //    `progress` 会累加到 ~650 再 `%= delay`（`Drill.java:321`）；Java 的 float32 在
      //    650 量级上已积累 ~1e-4 的**绝对**误差，取模**不会**消掉它 →
      //    Java `2.659912` vs TS `2.660000000000082` 差 8.8e-5，用相对容差会被误判成不一致。
      //    取 1e-2（对应 650 量级的相对精度 1.5e-5，仍比 float32 eps 1.2e-7 紧两个量级）：
      //    足以抓住真实偏差 —— 反事实验证：把 `warmupSpeed` 改值，本列立刻偏出容差。
      closeTo(drill.progressRef, Number(g[3]), 1e-2, label + " progress");
      closeTo(drill.warmup, Number(g[4]), FP_TOL, label + " warmup");
      closeToRel(drill.lastDrillSpeed, Number(g[5]), 1e-4, label + " lastDrillSpeed");
      closeTo(drill.items.total(), Number(g[6]), 0, label + " itemsTotal");
    }

    // golden 注释：`1st item @ tick 196, 2nd @ 358, 3rd @ 521; itemsTotal @ tick 600 = 3`
    expect(drill.items.total(), "tick600 itemsTotal").toBe(3);
  });

  test("[B] 接传送带：产物在产出的同一 tick 进入 c1，且 c1→c2 的转移时刻一致", () => {
    const rows = sections[1]!;
    expect(rows.length).toBeGreaterThan(200);

    const drill = setup(true);
    const c1 = Vars.world.tile(7, 5)!.build as ConveyorBuild;
    const c2 = Vars.world.tile(8, 5)!.build as ConveyorBuild;

    for(let i = 0; i < rows.length; i++){
      if(i > 0) runTicks(1);
      const g = rows[i]!;
      const label = `drill[B] tick#${i}`;

      closeTo(drill.items.total(), Number(g[6]), 0, label + " itemsTotal");
      closeTo(c1.len, Number(g[7]), 0, label + " c1len");
      closeTo(c2.len, Number(g[9]), 0, label + " c2len");
      if(g[8] === "null"){
        // golden 约定：c1 为空时该列写字面量 "null"
        expect(c1.len, label + " c1 empty").toBe(0);
      }else{
        closeTo(c1.ys[0]!, Number(g[8]), FP_TOL, label + " c1ys0");
      }
    }

    // golden 注释：`c1 received its 1st item @ tick 196; that item left c1 for c2 @ tick 224`
    expect(c2.len, "tick601 c2len").toBe(Number(rows[rows.length - 1]![9]));
  });
});

describe.skipIf(!existsSync(join(GOLDEN_DIR, "java-core.txt")))("golden 对拍 · 核心入库", () => {
  const sections = loadGoldenSections("java-core.txt");

  /**
   * Java 侧布景（见 `java-core.txt` 头注释）：
   * 24×24 全 air；`core-shard` @ (11,11) size=3 → footprint (10,10)-(12,12)；
   * `conveyor(8,10)r0 → conveyor(9,10)r0 → core`，物品注入 (9,10)。
   *
   * ⚠️ `state.rules.coreIncinerates = false`：原版默认是 `true`，那时 `acceptItem` **恒 true**
   * （`getMaximumAccepted` 返回 `Integer.MAX_VALUE/2`）、超容量走焚化 —— 观测不到「拒收」。
   * golden 关掉它来观测封顶语义，这里必须一致。
   */
  function setup(): { c9: ConveyorBuild; core: CoreBuild }{
    createWorld(24, 24, 1);
    Vars.state.rules.coreIncinerates = false;
    placeBlock(8, 10, Blocks.conveyor, 0);
    placeBlock(9, 10, Blocks.conveyor, 0);
    placeBlock(11, 11, Blocks.coreShard, 0);
    return {
      c9: Vars.world.tile(9, 10)!.build as ConveyorBuild,
      core: Vars.world.tile(11, 11)!.build as CoreBuild
    };
  }

  test("[A] 正常接收：copper(tick0 注入) 于 tick 29 入库、lead(tick60 注入) 于 tick 89 入库", () => {
    const rows = sections[0]!;
    expect(rows.length).toBe(141);

    const { c9, core } = setup();
    const copper = itemByName("copper");
    const lead = itemByName("lead");

    for(let i = 0; i < rows.length; i++){
      // ⚠️ 顺序必须是「先推进本 tick，再注入」—— 与 Java 导出器一致。
      //    若把注入放在 `runTicks` 之前，物品会**多走一步**，到达时刻整体提前 1 tick
      //    （实测：lead 变成 tick 88 入库，而 golden 是 tick 89）。
      if(i > 0) runTicks(1);
      // golden 头注释：`copper injected @ tick 0, lead @ tick 60`
      if(i === 0) c9.handleStack(copper, 1, null);
      if(i === 60) c9.handleStack(lead, 1, null);

      const g = rows[i]!;
      const label = `core[A] tick#${i}`;

      closeTo(core.items.get(copper), Number(g[1]), 0, label + " copper");
      closeTo(core.items.get(lead), Number(g[2]), 0, label + " lead");
      closeTo(core.items.total(), Number(g[3]), 0, label + " coreTotal");
      expect(String(core.acceptItem(c9, copper)), label + " acceptCopper").toBe(g[4]);
      expect(String(core.acceptItem(c9, lead)), label + " acceptLead").toBe(g[5]);
    }

    // 收口事实：copper 在 tick 29 入库、lead 在 tick 89 入库（golden 尾注释）
    expect(core.items.get(copper), "final copper").toBe(1);
    expect(core.items.get(lead), "final lead").toBe(1);
  });

  test("[B] 容量封顶：copper 满 4000 后 acceptItem(copper)=false，但 lead 仍可入（封顶是**按物品类型**）", () => {
    const rows = sections[1]!;
    expect(rows.length).toBeGreaterThan(100);

    const { c9, core } = setup();
    const copper = itemByName("copper");
    const lead = itemByName("lead");

    // golden 头注释：`storageCapacity=4000`；[B] 段起点即 `copper=4000`（已满）。
    // Java 导出器用 4000 次 `handleItem` 填满；这里直接写终态（`setAmount` 绕过容量检查，
    // 与 Java 循环的结果**在 items 数组上完全等价**）。
    core.items.setAmount(copper, 4000);
    expect(core.storageCapacity, "storageCapacity").toBe(4000);

    for(let i = 0; i < rows.length; i++){
      // 顺序同 [A]：先推进本 tick，再注入。
      if(i > 0) runTicks(1);
      // golden：`lead injected @ tick 0` 被接收；copper 在 tick 60 注入后被拒、堵在 c(9,10)
      if(i === 0) c9.handleStack(lead, 1, null);
      if(i === 60) c9.handleStack(copper, 1, null);

      const g = rows[i]!;
      const label = `core[B] tick#${i}`;

      closeTo(core.items.get(copper), Number(g[1]), 0, label + " copper");
      closeTo(core.items.get(lead), Number(g[2]), 0, label + " lead");
      closeTo(core.items.total(), Number(g[3]), 0, label + " coreTotal");
      expect(String(core.acceptItem(c9, copper)), label + " acceptCopper").toBe(g[4]);
      expect(String(core.acceptItem(c9, lead)), label + " acceptLead").toBe(g[5]);
    }
  });
});

// ---------------------------------------------------------------------------
// C21：工厂链（graphite-press）与电力系统（combustion-generator → silicon-smelter）
// ---------------------------------------------------------------------------

describe.skipIf(!existsSync(join(GOLDEN_DIR, "java-crafter.txt")))("golden 对拍 · 石墨压机（工厂链）", () => {
  const sections = loadGoldenSections("java-crafter.txt");

  /**
   * Java 侧布景（见 `java-crafter.txt` 头注释）：
   * 24×24 全 air，`graphite-press` @ (5,5) size=2（footprint (5,5)-(6,6)），**无邻居**。
   * `craftTime=90` / `consumeItem(coal,2)` / `outputItem=graphite×1`。
   *
   * ⚠️ 关键：`consumeItem` 让 `hasConsumers === true` → 走 `updateConsumption()` 的**慢路径**，
   *   `efficiency = ConsumeItems.efficiency = items.has(coal,2) ? 1 : 0`。
   *   这与「快路径恒 1」的区别正是本节要钉住的东西。
   */
  function setup(coal: number): GenericCrafterBuild{
    createWorld(24, 24, 1);
    placeBlock(5, 5, Blocks.graphitePress, 0);
    const build = Vars.world.tile(5, 5)!.build as GenericCrafterBuild;
    build.items.add(Items.coal, coal);
    return build;
  }

  test("[A] coal=20：慢路径 efficiency=1，progress/warmup/totalProgress 逐 tick 一致（到首次 craft 前）", () => {
    const rows = sections[0]!;
    const build = setup(20);
    const coal = itemByName("coal");
    const graphite = itemByName("graphite");

    // ⚠️ 为什么只比到 tick 89：Java 全程 **f32**，TS 是 **f64**。
    //   `1/90` 累加 90 次：f32 会略微超过 1（→ 第 90 tick 触发 craft），
    //   f64 得 0.9999999999999999（→ 第 91 tick 才触发）。
    //   这是浮点精度的固有差异，不是移植错误，故分段处理：
    //   · tick 0..89 **逐 tick 严格对拍**（含 progress/warmup/totalProgress 三条浮点列）；
    //   · craft 时机的 1 tick 偏差单独在下一个 test 里显式钉住。
    const STRICT_UNTIL = 89;

    for(let i = 0; i <= STRICT_UNTIL; i++){
      if(i > 0) runTicks(1);
      const g = rows[i]!;
      const label = `crafter[A] tick#${i}`;
      closeTo(build.progressRef, Number(g[1]), FP_TOL, label + " progress");
      closeTo(build.warmupRef, Number(g[2]), FP_TOL, label + " warmup");
      closeTo(build.totalProgressRef, Number(g[3]), FP_TOL, label + " totalProgress");
      closeTo(build.items.get(coal), Number(g[4]), 0, label + " coal");
      closeTo(build.items.get(graphite), Number(g[5]), 0, label + " graphite");
      closeTo(build.efficiency, Number(g[6]), 0, label + " efficiency");
      closeTo(build.potentialEfficiency, Number(g[7]), 0, label + " potentialEfficiency");
      expect(String(build.shouldConsumePower), label + " shouldConsumePower").toBe(g[8]);
    }
  });

  test("[A] 首次 craft 的时机：Java 第 90 tick，TS 第 91 tick（f32 vs f64，偏差已钉死）", () => {
    /**
     * ⚠️ 这是一条**已知且必须显式建模**的分叉，不能静默跳过。
     *   Java `float` 累加 `1/90f` 90 次 ≥ 1f → 第 90 tick 触发 `craft()`；
     *   TS `number`(f64) 累加得 `0.9999999999999999` < 1 → 第 91 tick 才触发。
     *   用具名常量把两边各自的时刻写出来，若将来任一侧改变，这里立刻变红。
     */
    const JAVA_FIRST_CRAFT_TICK = 90;
    const TS_FIRST_CRAFT_TICK = 91;
    const F64_ROUNDING_SHIFT = TS_FIRST_CRAFT_TICK - JAVA_FIRST_CRAFT_TICK;
    expect(F64_ROUNDING_SHIFT, "分叉幅度必须恰好 1 tick").toBe(1);

    const build = setup(20);
    const coal = itemByName("coal");
    const graphite = itemByName("graphite");

    runTicks(JAVA_FIRST_CRAFT_TICK);
    // golden 注释：`graphite reached 1 @ tick 90` —— Java 此刻已 craft；TS 还没有。
    expect(build.items.get(graphite), "tick90：Java 已产出，TS 尚未（这就是分叉本身）").toBe(0);
    expect(build.items.get(coal), "tick90：Java 已扣 2 coal，TS 尚未").toBe(20);

    runTicks(F64_ROUNDING_SHIFT);
    // TS 此刻才 craft：graphite 进库（无邻居 → offload 回落到 items.add）
    expect(build.items.get(graphite), "TS 在第 91 tick 产出第 1 个 graphite").toBe(1);
    expect(build.items.get(coal), "每次 craft 扣 2 coal").toBe(18);
  });

  test("[B] coal=1（缺料）：efficiency/potentialEfficiency 恒 0，shouldConsumePower=false，永不消耗", () => {
    const rows = sections[1]!;
    const build = setup(1);
    const coal = itemByName("coal");
    const graphite = itemByName("graphite");

    for(let i = 0; i < rows.length; i++){
      if(i > 0) runTicks(1);
      const g = rows[i]!;
      const label = `crafter[B] tick#${i}`;
      closeTo(build.progressRef, Number(g[1]), FP_TOL, label + " progress");
      closeTo(build.warmupRef, Number(g[2]), FP_TOL, label + " warmup");
      closeTo(build.items.get(coal), Number(g[4]), 0, label + " coal");
      closeTo(build.items.get(graphite), Number(g[5]), 0, label + " graphite");
      closeTo(build.efficiency, Number(g[6]), 0, label + " efficiency");
      closeTo(build.potentialEfficiency, Number(g[7]), 0, label + " potentialEfficiency");
      expect(String(build.shouldConsumePower), label + " shouldConsumePower").toBe(g[8]);
    }
  });

  test("[probe] 单次 updateConsumption()：coal=1 → 全 0；coal=2 → 全 1", () => {
    const rows = sections[2]!;
    expect(rows.length, "probe 只有两行").toBe(2);

    for(let r = 0; r < rows.length; r++){
      const g = rows[r]!;
      const build = setup(Number(g[0]));
      build.updateConsumption();
      const label = `crafter[probe] coal=${g[0]}`;
      closeTo(build.efficiency, Number(g[1]), 0, label + " efficiency");
      closeTo(build.potentialEfficiency, Number(g[2]), 0, label + " potentialEfficiency");
      expect(String(build.shouldConsumePower), label + " shouldConsumePower").toBe(g[3]);
    }
  });
});

describe.skipIf(!existsSync(join(GOLDEN_DIR, "java-power.txt")))("golden 对拍 · 电力系统", () => {
  const sections = loadGoldenSections("java-power.txt");

  /** 读某建筑所属电网的「上一 tick 需求 / 产量」。 */
  function graphStats(build: any): { needed: number; produced: number }{
    return {
      needed: build.power.graph.getLastPowerNeeded(),
      produced: build.power.graph.getLastPowerProduced()
    };
  }

  test("[1] 孤立冶炼炉（无发电机）：needed=0.5 produced=0 → coverage=0，永不产出", () => {
    const rows = sections[0]!;

    createWorld(24, 24, 1);
    placeBlock(5, 5, Blocks.siliconSmelter, 0);
    const smelter = Vars.world.tile(5, 5)!.build as GenericCrafterBuild;
    // golden 头注释：smelter 预先备好 coal=10 / sand=10，让**电力成为唯一限制**
    smelter.items.add(Items.coal, 10);
    smelter.items.add(Items.sand, 10);

    const silicon = itemByName("silicon");

    for(let i = 0; i < rows.length; i++){
      if(i > 0) runTicks(1);
      const g = rows[i]!;
      const label = `power[1] tick#${i}`;
      const stats = graphStats(smelter);
      closeTo(stats.needed, Number(g[1]), FP_TOL, label + " needed");
      closeTo(stats.produced, Number(g[2]), FP_TOL, label + " produced");
      closeTo(smelter.power.status, Number(g[3]), FP_TOL, label + " coverage");
      closeTo(smelter.efficiency, Number(g[4]), FP_TOL, label + " efficiency");
      closeTo(smelter.progressRef, Number(g[7]), FP_TOL, label + " progress");
      closeTo(smelter.items.get(silicon), Number(g[8]), 0, label + " silicon");
    }
  });

  test("[2] 一台发电机供一台冶炼炉：produced=1 needed=0.5 → coverage=1，每 40 tick 出 1 silicon", () => {
    const rows = sections[1]!;

    createWorld(24, 24, 1);
    placeBlock(5, 5, Blocks.combustionGenerator, 0);
    placeBlock(6, 5, Blocks.siliconSmelter, 0);
    const gen = Vars.world.tile(5, 5)!.build as ConsumeGeneratorBuild;
    const smelter = Vars.world.tile(6, 5)!.build as GenericCrafterBuild;
    gen.items.add(Items.coal, 60);
    smelter.items.add(Items.coal, 10);
    smelter.items.add(Items.sand, 10);

    const coal = itemByName("coal");
    const silicon = itemByName("silicon");

    // ⚠️ 与 graphite-press 同一类偏差，但**方向相反**：`1/40` 累加 40 次，
    //   f32 略**小于** 1（Java 第 42 tick 才 craft），f64 略**大于** 1（TS 第 41 tick 就 craft）。
    //   故逐 tick 严格对拍到 tick 40（首次 craft 之前），偏差本身在下一段显式钉住。
    const STRICT_UNTIL = 40;

    for(let i = 0; i <= STRICT_UNTIL; i++){
      if(i > 0) runTicks(1);
      const g = rows[i]!;
      const label = `power[2] tick#${i}`;
      const stats = graphStats(smelter);
      closeTo(stats.needed, Number(g[1]), FP_TOL, label + " needed");
      closeTo(stats.produced, Number(g[2]), FP_TOL, label + " produced");
      closeTo(smelter.power.status, Number(g[3]), FP_TOL, label + " coverage");
      closeTo(smelter.efficiency, Number(g[4]), FP_TOL, label + " efficiency");
      closeTo(gen.productionEfficiency, Number(g[5]), FP_TOL, label + " genProductionEfficiency");
      closeTo(gen.items.get(coal), Number(g[6]), 0, label + " genCoal");
      closeTo(smelter.progressRef, Number(g[7]), FP_TOL, label + " progress");
      closeTo(smelter.items.get(silicon), Number(g[8]), 0, label + " silicon");
    }

    // 首次 craft 的时刻：Java tick 42，TS tick 41（f32 vs f64，偏差已钉死）
    const JAVA_FIRST_CRAFT_TICK = 42;
    const TS_FIRST_CRAFT_TICK = 41;
    expect(TS_FIRST_CRAFT_TICK - JAVA_FIRST_CRAFT_TICK, "分叉幅度必须恰好 -1 tick").toBe(-1);

    runTicks(JAVA_FIRST_CRAFT_TICK - STRICT_UNTIL);
    expect(smelter.items.get(silicon), "tick41：TS 已产出第 1 个 silicon，Java 尚未").toBe(1);
    expect(smelter.items.get(Items.coal), "每次 craft 扣 coal 1 + sand 2").toBe(9);

    // 收口事实（golden 尾注释）：tick 120 时 silicon=2、发电机煤 60→59
    runTicks(120 - JAVA_FIRST_CRAFT_TICK);
    expect(smelter.items.get(silicon), "tick120 silicon").toBe(2);
    expect(gen.items.get(coal), "tick120 genCoal").toBe(59);
  });

  // ⚠️ [3]（一机供三炉 → coverage=0.6666667）**暂不对拍**：它依赖 `powerNode`
  //    手拉线把三个互不导通的冶炼炉串进同一张图（`Block.conductivePower` 默认 false，
  //    冶炼炉之间不互相导通）。`PowerNode` 属本阶段明确不移植的范围（528 行），
  //    故该节不在此断言 —— 已在 `ts/golden/java-power.txt` 里保留基准，
  //    待 `PowerNode` 落地后补。TS 侧的 coverage 公式本身由 `power.test.ts` 单独覆盖。
});
