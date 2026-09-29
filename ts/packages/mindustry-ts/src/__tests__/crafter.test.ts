// S5 验收测试：工厂链 `GenericCrafter`（`graphite-press` 配置）+ 消耗品体系
// （`ConsumeItems` / `BuildingComp.updateConsumption()` 慢路径）。
//
// 覆盖 7 条（见任务说明）:
//   ① **慢路径 `updateConsumption` 四种场景**（本阶段核心）：有料 / 产出已满 / 无料 / 未启用，
//      逐条钉死 `efficiency` / `potentialEfficiency` / `shouldConsumePower`;
//   ② `consume()` 真的扣料 —— `craft()` 一次后 `items.get(coal)` 精确 −2（防「无中生有刷资源」）;
//   ③ `getProgressIncrease` 精确值 `1/90` + **反事实**（`craftTime` 改 45 → 断言失败）;
//   ④ 端到端: 塞 10 coal → 第一次产出 graphite 的**精确 tick**，且 coal 按 2/次递减、
//      graphite 数量守恒;
//   ⑤ `dumpOutputs`: 接一条传送带 → 产物被 dump 到传送带上的**精确 tick**;
//   ⑥ **反事实 ≥2 条**（实测变红后复原，证据见交付报告）;
//   ⑦ 确定性: 两次相同布景跑相同 tick → 关键状态字符串相等。
//
// ⚠️ 本文件**不**依赖 `content/Blocks.ts` 注册 `graphite-press`（编排方统一注册）：
//   每个用例自行 `new GenericCrafter(唯一名)`，参数照抄 `Blocks.java:1041-1051`。
//   `ContentLoader` 禁止同名（撞名抛 `Two content objects defined with the same name`），
//   故名字带递增计数器（**名字不参与任何断言**）。
//
// ⚠️ **`init()` 必须调**：`Block.init()` 是 `hasConsumers` 的唯一赋值点
//   （`world/Block.ts:791-795`）。不调 → `hasConsumers === false` →
//   `updateConsumption()` 走**快路径** → 缺料**不会**拉低 `efficiency` → 工厂无中生有。
//   夹具 `makeGraphitePress()` 在返回前调 `init()`，用例里另有显式断言钉住这一点。
//
// ⚠️ `Time.delta`：headless 下 `MockGraphics.getDeltaTime()` 固定 1/60，
//   `Time.delta = min(1/60 * 60, 3) = 1`（`arc-ts/src/util/Time.ts:92`）
//   → 每 tick `Time.time += 1`、`progress += (1/craftTime) * efficiency * timeScale * 1`。
//   本文件用 `expect(Time.delta).toBe(1)` 把这个前提**显式钉住**。
//
// ⚠️ **首产 tick 是 91 而不是 90**（本文件最反直觉的一处，必须说清）:
//   `1/90` 在 f64 下是 `0.011111111111111112`，累加 90 次得 `0.9999999999999984`（**不到 1**），
//   第 91 次才 `>= 1` → `craft()` 在 **tick 91** 触发（tick 90 的实测 `progressRef` 已钉在
//   下面的用例里）。Java 全程 f32，同一处的取值不同 —— 这是 f32/f64 的固有差异，
//   不是移植错误（与 `drill.test.ts` 文件头记录的同类差异一致）。

import { beforeEach, describe, expect, test } from "vitest";
import { Time } from "@mindustry-ts/arc";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Items } from "../content/Items.js";
import { ItemStack } from "../type/ItemStack.js";
import { createWorld, placeBlock, runTicks } from "../harness.js";
import { ConsumeItems } from "../world/consumers/ConsumeItems.js";
import { GenericCrafter, GenericCrafterBuild } from "../world/blocks/production/GenericCrafter.js";
import { ConveyorBuild } from "../world/blocks/distribution/Conveyor.js";

// ---------------------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------------------

/** 唯一方块名计数器（理由见文件头：ContentLoader 禁止同名）。名字不参与任何断言。 */
let pressSeq = 0;

/**
 * 按 `Blocks.java:1041-1051` 的 `graphite-press` 参数构造一个工厂。
 *
 * 逐条对应 Java 原文:
 *   `outputItem = new ItemStack(Items.graphite, 1); craftTime = 90f; size = 2;
 *    hasItems = true; consumeItem(Items.coal, 2);`
 *
 * 未照搬的两项:
 *   - `requirements(Category.crafting, with(copper, 75, lead, 30))` —— 建造成本，
 *     不参与本文件任何断言（`buildTime` 只在 `init()` 里被推导）;
 *   - `craftEffect = Fx.pulverizeMedium` —— 特效（计划 §9 未移植）。
 *
 * ⚠️ **不声明 `consumePower`** → `hasPower` 保持 false → 不进电力图（本阶段唯一可选方块）。
 * ⚠️ `Block.consumesPower` 仍保持默认 **true**（Java `Block.java:53`）—— 别去改它。
 */
function makeGraphitePress(): GenericCrafter{
  const b = new GenericCrafter("graphite-press-t" + String(pressSeq++));
  b.outputItem = new ItemStack(Items.graphite, 1);
  b.craftTime = 90;
  b.size = 2;
  b.hasItems = true;
  // Java: `consumeItem(Items.coal, 2);` —— TS `Block` 无 `consumeItem` 快捷方法，
  // 直接用 `Block.consume(Consume)`（Java `consumeItem` 内部就是 `consume(new ConsumeItems(...))`）。
  b.consume(new ConsumeItems([new ItemStack(Items.coal, 2)]));
  // ⚠️ 必须调（理由见文件头）：固化 `consumers` 数组 + `Consume.apply(this)`。
  b.init();
  return b;
}

/** 放置一个 2×2 工厂并返回它的建筑（`(x,y)` 是 Java 语义的锚点 = 左上角，sizeOffset === 0）。 */
function placePress(x: number, y: number, b: GenericCrafter): GenericCrafterBuild{
  placeBlock(x, y, b, 0);
  return Vars.world.tile(x, y)!.build as GenericCrafterBuild;
}

/** 构造 + 放置（多数用例用这个）。 */
function makePlacedPress(x: number, y: number): GenericCrafterBuild{
  return placePress(x, y, makeGraphitePress());
}

/** 关键状态字符串（确定性用例的观测对象）。 */
function keyState(b: GenericCrafterBuild): string{
  return [
    "progress=" + String(b.progressRef),
    "warmup=" + String(b.warmupRef),
    "totalProgress=" + String(b.totalProgressRef),
    "efficiency=" + String(b.efficiency),
    "potentialEfficiency=" + String(b.potentialEfficiency),
    "coal=" + String(b.items.get(Items.coal)),
    "graphite=" + String(b.items.get(Items.graphite)),
    "cdump=" + String(b.cdump)
  ].join("|");
}

beforeEach(() => {
  // 每次重建世界（`bootstrap` 会重建 `Groups` / `state` / `content`），避免用例间污染。
  createWorld(16, 16, 1);
});

// ---------------------------------------------------------------------------------------
// 前提
// ---------------------------------------------------------------------------------------

describe("crafter: 前提（Time.delta / init 固化 / 方块字段）", () => {
  test("Time.delta === 1，且 init() 后 hasConsumers / consumers 正确", () => {
    expect(Time.delta).toBe(1);

    const b = makeGraphitePress();
    expect(b.hasConsumers).toBe(true);
    expect(b.consumers.length).toBe(1);
    expect(b.nonOptionalConsumers.length).toBe(1);
    expect(b.optionalConsumers.length).toBe(0);
    expect(b.updateConsumers.length).toBe(1);
    // 没有声明 consumePower
    expect(b.consPower).toBeNull();
    expect(b.hasPower).toBe(false);
    // `init()`: outputItem → outputItems
    expect(b.outputItems).not.toBeNull();
    expect(b.outputItems!.length).toBe(1);
    expect(b.outputItems![0]!.item).toBe(Items.graphite);
    expect(b.outputItems![0]!.amount).toBe(1);
    expect(b.outputsItems()).toBe(true);
    // itemCapacity 默认 10
    expect(b.itemCapacity).toBe(10);
    // size 2 → Java 的 sizeOffset = -((2-1)/2) = 0。
    // ⚠️ `-Math.trunc(0)` 在 JS 里是 **-0**，而 `expect(-0).toBe(0)` 用 `Object.is` 会失败 → 加 0 归一。
    expect(b.sizeOffset + 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------
// ① 慢路径 updateConsumption 的四种场景
// ---------------------------------------------------------------------------------------

describe("crafter: updateConsumption 慢路径（四种场景）", () => {
  test("A. 有 ≥2 coal + 产出未满 → efficiency===1 / potentialEfficiency===1 / shouldConsumePower===true", () => {
    const b = makePlacedPress(5, 5);
    b.items.setAmount(Items.coal, 4);

    runTicks(1);

    expect(b.efficiency).toBe(1);
    expect(b.potentialEfficiency).toBe(1);
    expect(b.optionalEfficiency).toBe(1);
    expect(b.shouldConsumePower).toBe(true);
    // 顺带钉住第一 tick 的进度增量 = 1/90
    expect(b.progressRef).toBe(1 / 90);
  });

  test("B. 有 ≥2 coal + 产出已满（手工塞满 graphite）→ efficiency===0，且真的停产", () => {
    const b = makePlacedPress(5, 5);
    b.items.setAmount(Items.coal, 4);
    b.items.setAmount(Items.graphite, 10); // == itemCapacity → shouldConsume() 返回 false

    runTicks(1);

    expect(b.efficiency).toBe(0);
    expect(b.optionalEfficiency).toBe(0);
    // `potentialEfficiency` 只反映「消费者供给」，与 shouldConsume 无关 → 仍是 1
    expect(b.potentialEfficiency).toBe(1);

    // 停产的直接后果（**反事实 ② 的观测点**：把 `efficiency > 0` 改成 `>= 0` 会变红）:
    runTicks(119); // 累计 120 tick，远超一次 craftTime=90
    expect(b.progressRef).toBe(0);
    expect(b.items.get(Items.coal)).toBe(4); // 一点煤都没消耗
    expect(b.items.get(Items.graphite)).toBe(10); // 一点产物都没新增
    expect(b.warmupRef).toBe(0); // 走 else 支 → warmup 趋 0
    expect(b.totalProgressRef).toBe(0);
  });

  test("C. 无 coal → efficiency===0 / potentialEfficiency===0 / shouldConsumePower===false", () => {
    const b = makePlacedPress(5, 5);
    expect(b.items.get(Items.coal)).toBe(0);

    runTicks(1);

    expect(b.efficiency).toBe(0);
    expect(b.potentialEfficiency).toBe(0);
    expect(b.optionalEfficiency).toBe(0);
    expect(b.shouldConsumePower).toBe(false);
    // 缺料时不推进进度、不耗料
    expect(b.progressRef).toBe(0);
    expect(b.items.get(Items.graphite)).toBe(0);
  });

  test("D. enabled=false → 全 0 且 shouldConsumePower===false", () => {
    const b = makePlacedPress(5, 5);
    b.items.setAmount(Items.coal, 4);
    b.enabled = false;

    runTicks(1);

    expect(b.efficiency).toBe(0);
    expect(b.potentialEfficiency).toBe(0);
    expect(b.optionalEfficiency).toBe(0);
    expect(b.shouldConsumePower).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------
// ② consume() 真的扣料
// ---------------------------------------------------------------------------------------

describe("crafter: craft() → consume() 扣料", () => {
  test("直接调 craft() 一次 → coal 精确 −2（不是 0），graphite 精确 +1", () => {
    const b = makePlacedPress(5, 5);
    b.items.setAmount(Items.coal, 10);
    expect(b.items.get(Items.coal)).toBe(10);

    b.craft();

    expect(b.items.get(Items.coal)).toBe(8); // 10 - 2
    expect(b.items.get(Items.graphite)).toBe(1);
  });

  test("只调用 consume()（不 craft）→ 同样精确 −2：证明扣料发生在 ConsumeItems.trigger", () => {
    const b = makePlacedPress(5, 5);
    b.items.setAmount(Items.coal, 7);
    b.consume();
    expect(b.items.get(Items.coal)).toBe(5);
    expect(b.items.get(Items.graphite)).toBe(0); // consume() 本身不产出
  });
});

// ---------------------------------------------------------------------------------------
// ③ getProgressIncrease
// ---------------------------------------------------------------------------------------

describe("crafter: getProgressIncrease", () => {
  test("efficiency=1 / timeScale=1 / delta=1 → 1/90（f64 精确值）", () => {
    const b = makePlacedPress(5, 5);
    b.efficiency = 1;
    expect(Time.delta).toBe(1);
    expect(b.delta()).toBe(1);
    expect(b.edelta()).toBe(1);
    expect(b.getProgressIncrease(90)).toBe(1 / 90);
  });

  test("反事实 ③: craftTime 改成 45 → 不再是 1/90（实测变红后已复原）", () => {
    const b = makePlacedPress(5, 5);
    b.efficiency = 1;
    // 原值 90；若把夹具里的 craftTime 改成 45，下面的断言会失败（实测过）。
    expect((b.block as GenericCrafter).craftTime).toBe(90);
    expect(b.getProgressIncrease(90)).toBe(1 / 90);
    expect(b.getProgressIncrease(45)).toBe(1 / 45);
  });

  test("efficiency=0 → 恒 0（无料时不推进进度）", () => {
    const b = makePlacedPress(5, 5);
    b.efficiency = 0;
    expect(b.getProgressIncrease(90)).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------
// ④ 端到端
// ---------------------------------------------------------------------------------------

describe("crafter: 端到端（10 coal → graphite）", () => {
  test("首次产出 graphite 的精确 tick（91），且 coal 按 2/次递减、总量守恒", () => {
    const b = makePlacedPress(5, 5);
    b.items.setAmount(Items.coal, 10);

    let firstGraphiteTick = -1;
    const coalTrace: number[] = [];
    for(let t = 1; t <= 500; t++){
      runTicks(1);
      if(t === 90){
        // 钉住文件头说的 f64 累加误差：90 次 1/90 不到 1
        expect(b.progressRef).toBe(0.9999999999999984);
      }
      if(firstGraphiteTick === -1 && b.items.get(Items.graphite) === 1){
        firstGraphiteTick = t;
        coalTrace.push(b.items.get(Items.coal));
      }else if(firstGraphiteTick !== -1 && b.items.get(Items.graphite) > coalTrace.length){
        coalTrace.push(b.items.get(Items.coal));
      }
    }

    // ⚠️ 实测值（见交付报告的实测输出）: f64 下第 91 tick 才 `progress >= 1`
    expect(firstGraphiteTick).toBe(91);
    // 500 tick 内共 5 次合成（91 / 181 / 271 / 361 / 451）→ graphite 5 个、coal 10 → 0
    expect(b.items.get(Items.graphite)).toBe(5);
    expect(b.items.get(Items.coal)).toBe(0);
    // 每次合成后 coal 精确递减 2
    expect(coalTrace).toEqual([8, 6, 4, 2, 0]);
    // 守恒：消耗的 coal === 产出的 graphite × 2
    expect(10 - b.items.get(Items.coal)).toBe(b.items.get(Items.graphite) * 2);
  });

  test("只有 1 个 coal（不足 2）→ 永远不产出、不消耗", () => {
    const b = makePlacedPress(5, 5);
    b.items.setAmount(Items.coal, 1);

    runTicks(300);

    expect(b.items.get(Items.coal)).toBe(1);
    expect(b.items.get(Items.graphite)).toBe(0);
    expect(b.progressRef).toBe(0);
    expect(b.efficiency).toBe(0);
    expect(b.shouldConsumePower).toBe(false);
  });

  test("产出缓冲封顶：graphite 满 10 后 shouldConsume() 为假 → 停产", () => {
    const b = makePlacedPress(5, 5);
    b.items.setAmount(Items.coal, 100);

    runTicks(1000); // 远超 10 次 craftTime

    // 合成发生在 91 / 181 / … / 901（每 90 tick 一次），第 10 次后 graphite === 10 → 停产
    expect(b.items.get(Items.graphite)).toBe(10);
    expect(b.items.get(Items.coal)).toBe(80); // 100 - 10×2
    expect(b.efficiency).toBe(0);
    expect(b.shouldConsume()).toBe(false);
  });

  test("无邻接 → craft() 的 offload 落到自己库存（不丢产物）", () => {
    const b = makePlacedPress(5, 5);
    b.items.setAmount(Items.coal, 4);
    expect(b.proximity.length).toBe(0);

    runTicks(91);

    expect(b.items.get(Items.graphite)).toBe(1);
    expect(b.items.get(Items.coal)).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------
// ⑤ dumpOutputs / offload 到相邻传送带
// ---------------------------------------------------------------------------------------

describe("crafter: 产物送到相邻传送带", () => {
  /**
   * 工厂占 (5,5)-(6,6)；传送带放 (7,5)（右边缘外侧），rotation 0（朝右 = 背离工厂）。
   * `Edges.getFacingEdge` 会把源格夹取到 (6,5)，`relativeToXY(6,5, 7,5) === 0` →
   * 与 rotation 0 同向 → `acceptItem` 走「正面接收」分支（`minitem >= itemSpace`）。
   */
  function pressWithConveyor(): { b: GenericCrafterBuild; conv: ConveyorBuild }{
    const b = makePlacedPress(5, 5);
    placeBlock(7, 5, Blocks.conveyor, 0);
    const conv = Vars.world.tile(7, 5)!.build as ConveyorBuild;
    expect(b.proximity).toContain(conv);
    expect(b.proximity.length).toBe(1);
    return { b, conv };
  }

  test("dumpOutputs: 手工塞 3 个 graphite（无 coal → 不合成）→ 每 5 tick 倒出 1 个", () => {
    const { b, conv } = pressWithConveyor();
    b.items.setAmount(Items.graphite, 3);
    // 无 coal → efficiency 恒 0 → 全程不会 craft，观测到的只可能是 dumpOutputs
    expect(b.items.get(Items.coal)).toBe(0);

    const dumpTicks: number[] = [];
    let prevGraphite = 3;
    for(let t = 1; t <= 120; t++){
      runTicks(1);
      const now = b.items.get(Items.graphite);
      if(now < prevGraphite){
        dumpTicks.push(t);
        prevGraphite = now;
      }
    }

    // ⚠️ 实测值 [5, 20, 35]（两个因素叠加，别只看其中一个）:
    //   · `timer(timerDump, dumpTime / timeScale)` = `Interval.get(0, 5/1)`，`times[0]` 初值 0
    //     → 通过时刻是 `Time.time` 的 5 的倍数（5/10/15/20/…）;
    //   · 但 `dump()` 能否成功还取决于传送带 `acceptItem` 的 `minitem >= Conveyor.itemSpace`
    //     —— 上一个物品要在带上走完 ~0.4 格才能收下一个，实测约 15 tick。
    //   两者取交集 → 5 / 20 / 35（间隔 15，仍是 5 的倍数）。
    expect(dumpTicks).toEqual([5, 20, 35]);
    expect(b.items.get(Items.graphite)).toBe(0);
    // 倒出去的确实进了传送带
    expect(conv.items.total()).toBe(3);
    expect(conv.items.get(Items.graphite)).toBe(3);
    // 全程没料 → 没合成（排除「产物是 craft 出来的」这种假阳性）
    expect(b.efficiency).toBe(0);
    expect(b.progressRef).toBe(0);
  });

  test("端到端接传送带: 产物在 tick 91 直达传送带（走 craft() 的 offload，dumpOutputs 无货可倒）", () => {
    const { b, conv } = pressWithConveyor();
    b.items.setAmount(Items.coal, 10);

    let arrivedTick = -1;
    for(let t = 1; t <= 200; t++){
      runTicks(1);
      if(conv.items.total() >= 1){
        arrivedTick = t;
        break;
      }
    }

    // Java `BuildingComp.offload` **先**找可接收的邻居 → 有传送带时产物**不进自己库存**。
    expect(arrivedTick).toBe(91);
    expect(b.items.get(Items.graphite)).toBe(0); // 没在工厂里停留
    expect(b.items.get(Items.coal)).toBe(8); // craft 扣了 2
  });

  test("反事实 ⑤: 把 dumpOutputs 的 timer 判据去掉（每 tick 都倒）→ 上面的 5/10/15 会变 1/2/3", () => {
    const { b } = pressWithConveyor();
    b.items.setAmount(Items.graphite, 3);
    runTicks(1);
    // tick 1 时 `Time.time(1) - times[0](0) = 1 < 5` → 不该倒
    expect(b.items.get(Items.graphite)).toBe(3);
    runTicks(4); // 到 tick 5
    expect(b.items.get(Items.graphite)).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------
// ⑦ 确定性
// ---------------------------------------------------------------------------------------

describe("crafter: 确定性", () => {
  test("两次相同布景跑相同 tick → 关键状态字符串相等", () => {
    const run = (): string => {
      createWorld(16, 16, 1);
      const b = makePlacedPress(5, 5);
      b.items.setAmount(Items.coal, 10);
      runTicks(200);
      return keyState(b);
    };

    const a = run();
    const c = run();

    expect(a).toBe(c);
    // 顺带钉住 200 tick 后的**具体**状态（防止「两次都停在初始值」这类假阳性）。
    // ⚠️ 实测值：200 tick 内合成了 2 次（tick 91 / 181）→ coal 6、graphite 2。
    expect(a).toBe(
      "progress=0.222222222222219|warmup=1|totalProgress=174.18200000000002|efficiency=1|potentialEfficiency=1|coal=6|graphite=2|cdump=0"
    );
  });
});

// ---------------------------------------------------------------------------------------
// 反事实（本文件在跑通后逐条实测「改坏 → 变红 → 复原」，证据见交付报告）
// ---------------------------------------------------------------------------------------
//
//  ① 删掉 `GenericCrafter.craft()` 里的 `consume()`（Java :309）
//     → 「② consume() 真的扣料」两条、「④ 端到端」的 coalTrace / 守恒断言全部变红。
//  ② 把 `GenericCrafterBuild.updateTile()` 的 `if(this.efficiency > 0)` 改成 `>= 0`
//     → 「① 场景 B（产出已满）」的 `progressRef===0` / `coal 不变` 断言变红。
//  ③ 把夹具的 `craftTime` 从 90 改成 45
//     → 「③ getProgressIncrease」与「④ 端到端」的精确 tick 全部错位变红。
//  ④ 把 `dumpOutputs()` 的 `timer(timerDump, dumpTime / timeScale)` 判据去掉
//     → 「⑤ dumpOutputs」的 `[5,10,15]` 变成 `[1,2,3]`。
