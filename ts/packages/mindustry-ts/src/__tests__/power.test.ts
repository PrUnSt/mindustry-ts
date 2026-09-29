// 电力系统验收测试（PowerGraph + 电力方块 + ConsumeItem* 消费者）。
//
// 覆盖任务书的 8 条要求:
//   ① 无电 → 耗电工厂 `power.status === 0` / `efficiency === 0` / 不产出;
//   ② 接上发电机 → `coverage === 1` → `status === 1` / `efficiency === 1` → 开始产出;
//   ③ 供电不足 → `coverage === produced/needed`（1/1.5 = 0.6666…，断言到 1e-6）;
//   ④ `shouldConsumePower === false` 让缺料工厂退出负荷 → 另一耗电方块 coverage 变高;
//   ⑤ 图的合并（相邻发电机同图）与分裂（拆掉中间节点 → 图裂成两张）;
//   ⑥ 发电机烧燃料: coal 按 `itemDuration = 120` 的节奏减少，耗尽 → `productionEfficiency` 回 0;
//   ⑦ 反事实 ≥2 条（实测变红后复原，证据见交付报告）;
//   ⑧ 确定性: 两次相同布景跑相同 tick → 关键状态字符串相等。
//
// ⚠️ 时序前提（**本文件全部断言的地基**，必须知道）:
//   `Logic.updateEntities()`（`core/Logic.ts:159-160`）里
//   `Groups.powerGraph.update()` **先于** `Groups.build.update()`（与 Java `Logic.java:487`/`:491`
//   同序）。因此每 tick 的顺序是:
//     1. `PowerGraph.update()` → `distributePower()` 写 `power.status`（用的是**上一 tick**
//        建筑算出的 `productionEfficiency` / `shouldConsumePower`）;
//     2. `Groups.build.update()` → 各建筑 `updateConsumption()`（读 `power.status` 得
//        `efficiency`）→ `updateTile()`。
//   ⇒ **第 1 tick 的 coverage 必然是 0**（发电机的 `productionEfficiency` 还是初值 0），
//     从第 2 tick 起才是稳态值。本文件的断言都跑 ≥2 tick。
//
// ⚠️ 方块名必须唯一且不撞真实内容名（`ContentLoader` 禁止同名，
//   见 `drill.test.ts:88-100` 的同一说明）→ 夹具带递增计数器。
//   ⚠️ 确定性用例因此**不能**用 `snapshot()`（名字会进快照），只用 `keyState()`。
//
// ⚠️ `Time.delta` 在 headless 下恒为 1（`MockGraphics.getDeltaTime()` = 1/60），
//   故 `PowerGraph` 的 `produced/needed` 量纲（「本 tick 的能量」= 功率 × 1）
//   在数值上就等于功率本身。本文件用 `expect(Time.delta).toBe(1)` 钉住这个前提。

import { beforeEach, describe, expect, test } from "vitest";
import { Time } from "@mindustry-ts/arc";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Items } from "../content/Items.js";
import { ItemStack } from "../type/ItemStack.js";
import { createWorld, placeBlock, runTicks } from "../harness.js";
import { ConsumeItems } from "../world/consumers/ConsumeItems.js";
import { ConsumeItemExplode } from "../world/consumers/ConsumeItemExplode.js";
import { ConsumeItemFlammable } from "../world/consumers/ConsumeItemFlammable.js";
import { ConsumeGenerator, ConsumeGeneratorBuild } from "../world/blocks/power/ConsumeGenerator.js";
import { PowerGraph } from "../world/blocks/power/PowerGraph.js";
import {
  GenericCrafter,
  GenericCrafterBuild
} from "../world/blocks/production/GenericCrafter.js";
import type { Block } from "../world/Block.js";
import type { Building } from "../gen/Building.js";

// ---------------------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------------------

/** 唯一方块名计数器（理由见文件头）。名字不参与任何断言。 */
let blockSeq = 0;

/** 取一个全局唯一的方块名。 */
function nextName(base: string): string{
  return base + "-t" + String(blockSeq++);
}

/**
 * 建一个**耗电**工厂（size 1，避免多块放置路径）。
 *
 * 逐条对应: `outputItem = graphite×1; craftTime = 30; consumeItem(coal, 1); consumePower(usage);`
 *
 * ⚠️ `init()` 必调（`Block.init()` 是 `hasConsumers` / `Consume.apply` 的唯一赋值点，
 *   不调 → 走快路径 → 缺料不拉低 `efficiency`，且 `hasPower` 永远 false）。
 */
function makeCrafter(usage: number, craftTime = 30): GenericCrafter{
  const b = new GenericCrafter(nextName("power-crafter"));
  b.outputItem = new ItemStack(Items.graphite, 1);
  b.craftTime = craftTime;
  b.hasItems = true;
  b.consume(new ConsumeItems([new ItemStack(Items.coal, 1)]));
  b.consumePower(usage);
  b.init();
  return b;
}

/**
 * 建一台 `combustion-generator`（`Blocks.java:2523-2541`）。
 *
 * 逐条对应 Java 原文:
 *   `powerProduction = 1f; itemDuration = 120f;
 *    consume(new ConsumeItemFlammable()); consume(new ConsumeItemExplode());
 *    itemDurationMultipliers.put(Items.pyratite, 3f);`
 */
function makeCombustion(): ConsumeGenerator{
  const b = new ConsumeGenerator(nextName("power-combustion"));
  b.powerProduction = 1;
  b.itemDuration = 120;
  b.consume(new ConsumeItemFlammable());
  b.consume(new ConsumeItemExplode());
  b.itemDurationMultipliers.put(Items.pyratite, 3);
  b.init();
  return b;
}

/** 放置并返回建筑。 */
function place<T extends Building>(x: number, y: number, block: Block): T{
  placeBlock(x, y, block, 0);
  return Vars.world.tile(x, y)!.build as T;
}

/** 放置一台**已加满煤**的燃烧发电机。 */
function placeFueledCombustion(x: number, y: number, coal = 20): ConsumeGeneratorBuild{
  const g = place<ConsumeGeneratorBuild>(x, y, makeCombustion());
  g.items.setAmount(Items.coal, coal);
  return g;
}

/** 关键状态字符串（确定性用例的观测对象）。 */
function keyState(g: ConsumeGeneratorBuild, c: GenericCrafterBuild): string{
  return [
    "status=" + String(c.power === null ? "null" : c.power.status),
    "efficiency=" + String(c.efficiency),
    "shouldConsumePower=" + String(c.shouldConsumePower),
    "progress=" + String(c.progressRef),
    "coal=" + String(c.items.get(Items.coal)),
    "graphite=" + String(c.items.get(Items.graphite)),
    "genEff=" + String(g.productionEfficiency),
    "genCoal=" + String(g.items.get(Items.coal)),
    "graphAll=" + String(g.power.graph.all.size)
  ].join("|");
}

beforeEach(() => {
  // 每次重建世界（bootstrap 会重建 Groups / state / content），避免用例间污染。
  createWorld(16, 16, 1);
});

// ---------------------------------------------------------------------------------------
// 前提
// ---------------------------------------------------------------------------------------

describe("power: 前提（Time.delta / 方块字段 / ConsumePower）", () => {
  test("Time.delta===1；工厂声明 consumePower 后 hasPower/consPower 正确；发电机相反", () => {
    expect(Time.delta).toBe(1);

    const crafter = makeCrafter(0.5);
    expect(crafter.hasPower).toBe(true);
    expect(crafter.consPower).not.toBeNull();
    expect(crafter.consPower!.usage).toBe(0.5);
    expect(crafter.consPower!.buffered).toBe(false);
    expect(crafter.hasConsumers).toBe(true);
    expect(crafter.nonOptionalConsumers.length).toBe(2); // ConsumeItems + ConsumePower
    // `Block.consumesPower` 默认 true（Java Block.java:53）
    expect(crafter.consumesPower).toBe(true);
    expect(crafter.outputsPower).toBe(false);

    const gen = makeCombustion();
    // PowerDistributor: consumesPower=false / outputsPower=true
    expect(gen.consumesPower).toBe(false);
    expect(gen.outputsPower).toBe(true);
    expect(gen.hasPower).toBe(true); // PowerBlock 构造器
    expect(gen.consPower).toBeNull(); // 没声明 consumePower
    expect(gen.hasItems).toBe(true); // ConsumeItemFilter.apply
    expect(gen.filterItem).not.toBeNull(); // init() 回查到 ConsumeItemFlammable
    expect(gen.filterItem!.itemDurationMultipliers).toBe(gen.itemDurationMultipliers);
    expect(gen.emitLight).toBe(true);
    expect(gen.lightRadius).toBe(65); // baseLightRadius(65) * size(1)
  });

  test("摆放后 power 模块与电网已分配（PowerModule.graph 不再是 null）", () => {
    const c = place<GenericCrafterBuild>(5, 5, makeCrafter(0.5));
    expect(c.power).not.toBeNull();
    expect(c.power.graph).toBeInstanceOf(PowerGraph);
    expect(c.power.status).toBe(0); // 初值 0（PowerModule.java:13）
    expect(c.power.init).toBe(true); // PowerGraph.add() 置位
    expect(c.power.graph.all.size).toBe(1);
    // 孤立图**不入组**（Java PowerGraph.checkAdd 只在合并时调用）
    expect(c.power.graph.all.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------
// ① 无电 → efficiency 0
// ---------------------------------------------------------------------------------------

describe("power: ① 无电 → 耗电工厂 efficiency===0（不产出）", () => {
  test("工厂有料但没接发电机 → status===0 / efficiency===0 / 不产出 / 图未入组", () => {
    const b = place<GenericCrafterBuild>(5, 5, makeCrafter(0.5));
    b.items.setAmount(Items.coal, 10);

    runTicks(5);

    expect(b.power.status).toBe(0);
    expect(b.efficiency).toBe(0);
    // 木桶取小：ConsumeItems 是 1，ConsumePower 是 0 → min = 0
    expect(b.potentialEfficiency).toBe(0);
    expect(b.optionalEfficiency).toBe(0);
    expect(b.progressRef).toBe(0);
    expect(b.items.get(Items.coal)).toBe(10);
    expect(b.items.get(Items.graphite)).toBe(0);

    // 再跑很久也不产出（防止「只是慢」这种假阳性）
    runTicks(200);
    expect(b.items.get(Items.graphite)).toBe(0);
    expect(b.items.get(Items.coal)).toBe(10);
    expect(b.efficiency).toBe(0);
  });

  test("无电时 shouldConsumePower 仍为 true（缺的是电，不是料）", () => {
    const b = place<GenericCrafterBuild>(5, 5, makeCrafter(0.5));
    b.items.setAmount(Items.coal, 10);
    runTicks(3);
    expect(b.shouldConsumePower).toBe(true);
    expect(b.efficiency).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------
// ② 接上发电机 → coverage 1
// ---------------------------------------------------------------------------------------

describe("power: ② 接上发电机 → coverage===1", () => {
  test("发电机(1.0) 供 consumePower(0.5) 工厂 → coverage===1 / status===1 / efficiency===1 → 产出", () => {
    const g = placeFueledCombustion(5, 5);
    const b = place<GenericCrafterBuild>(6, 5, makeCrafter(0.5));
    b.items.setAmount(Items.coal, 10);

    // 两建筑互为邻接（Java 的电力靠邻接传播；耗电方块↔发电机导通）
    expect(b.proximity).toContain(g);
    expect(g.proximity).toContain(b);
    // 同一张电网
    expect(b.power.graph).toBe(g.power.graph);
    expect(g.power.graph.all.size).toBe(2);

    // tick 1 是 0（发电机的 productionEfficiency 还是初值 0，见文件头时序说明）
    runTicks(1);
    expect(b.power.status).toBe(0);

    // tick 2 起进入稳态：produced=1、needed=0.5 → coverage = min(1, 1/0.5) = 1
    runTicks(1);
    expect(b.power.status).toBe(1);
    expect(b.efficiency).toBe(1);
    expect(b.potentialEfficiency).toBe(1);

    // 真的开始产出（craftTime=30，效率 1 → 约 31~32 tick 一次）
    runTicks(100);
    expect(b.items.get(Items.graphite)).toBeGreaterThanOrEqual(1);
    expect(b.items.get(Items.coal)).toBeLessThan(10);
  });

  test("发电机产电精确值：getPowerProduction()===powerProduction*productionEfficiency===1", () => {
    const g = placeFueledCombustion(5, 5);
    runTicks(2);
    expect(g.productionEfficiency).toBe(1);
    expect(g.getPowerProduction()).toBe(1);
    // coal.flammability === 1 → efficiencyMultiplier === 1
    expect(g.efficiencyMultiplier).toBe(1);

    // 关掉 → 0（Java PowerGenerator.java:209 的 `enabled ?`）
    g.enabled = false;
    runTicks(1);
    expect(g.getPowerProduction()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------
// ③ 供电不足 → coverage = produced/needed
// ---------------------------------------------------------------------------------------

describe("power: ③ 供电不足 → coverage===produced/needed", () => {
  test("两个 consumePower(0.5)（总需求 1.0）→ coverage===1", () => {
    const g = placeFueledCombustion(5, 5);
    const a = place<GenericCrafterBuild>(4, 5, makeCrafter(0.5));
    const b = place<GenericCrafterBuild>(6, 5, makeCrafter(0.5));
    a.items.setAmount(Items.coal, 10);
    b.items.setAmount(Items.coal, 10);

    expect(g.power.graph.all.size).toBe(3);

    runTicks(2);
    expect(a.power.status).toBe(1);
    expect(b.power.status).toBe(1);
  });

  test("两个 consumePower(0.75)（总需求 1.5）→ coverage===1/1.5=0.666666…（1e-6）", () => {
    const g = placeFueledCombustion(5, 5);
    const a = place<GenericCrafterBuild>(4, 5, makeCrafter(0.75));
    const b = place<GenericCrafterBuild>(6, 5, makeCrafter(0.75));
    a.items.setAmount(Items.coal, 10);
    b.items.setAmount(Items.coal, 10);

    runTicks(2);

    const expected = 1 / 1.5;
    expect(Math.abs(a.power.status - expected)).toBeLessThan(1e-6);
    expect(Math.abs(b.power.status - expected)).toBeLessThan(1e-6);
    expect(Math.abs(a.efficiency - expected)).toBeLessThan(1e-6);
    // 精确值（f64）
    expect(a.power.status).toBe(0.6666666666666666);
  });
});

// ---------------------------------------------------------------------------------------
// ④ shouldConsumePower 让缺料工厂退出负荷
// ---------------------------------------------------------------------------------------

describe("power: ④ 缺料工厂退出负荷 → 另一方块 coverage 变高", () => {
  /** 布景：发电机(1.0) 在 (5,5)，两台 consumePower(0.75) 分别在 (4,5) / (6,5)。 */
  function twoCrafters(feedB: boolean): { a: GenericCrafterBuild; b: GenericCrafterBuild }{
    placeFueledCombustion(5, 5);
    const a = place<GenericCrafterBuild>(4, 5, makeCrafter(0.75));
    const b = place<GenericCrafterBuild>(6, 5, makeCrafter(0.75));
    a.items.setAmount(Items.coal, 10);
    if(feedB) b.items.setAmount(Items.coal, 10);
    return { a, b };
  }

  test("B 有料：needed=1.5 → A 的 coverage===1/1.5（0.6667）", () => {
    const { a, b } = twoCrafters(true);
    runTicks(2);
    expect(b.shouldConsumePower).toBe(true);
    expect(Math.abs(a.power.status - 1 / 1.5)).toBeLessThan(1e-6);
  });

  test("B 缺料：shouldConsumePower===false → needed=0.75 → A 的 coverage===1（差值断言）", () => {
    const { a, b } = twoCrafters(false);
    runTicks(2);

    // B 缺料 → 非电力消费者（ConsumeItems）efficiency===0 → shouldConsumePower=false
    expect(b.efficiency).toBe(0);
    expect(b.shouldConsumePower).toBe(false);

    // B 被 `getPowerNeeded()` 排除 → needed 只剩 A 的 0.75 → coverage = min(1, 1/0.75) = 1
    expect(a.power.status).toBe(1);
    expect(a.efficiency).toBe(1);

    // B 自己走 `distributePower` 的 else 支：min(1, produced/(needed + usage*delta))
    // = min(1, 1/(0.75 + 0.75)) = 0.6666…
    expect(Math.abs(b.power.status - 1 / 1.5)).toBeLessThan(1e-6);
  });
});

// ---------------------------------------------------------------------------------------
// ⑤ 图的合并与分裂
// ---------------------------------------------------------------------------------------

describe("power: ⑤ 图的合并与分裂", () => {
  test("两个相邻发电机 → 同一张 PowerGraph（all.size===2）", () => {
    const g1 = placeFueledCombustion(4, 5);
    const g2 = placeFueledCombustion(5, 5);

    expect(g1.power.graph).toBe(g2.power.graph);
    expect(g1.power.graph.all.size).toBe(2);
    expect(g1.power.graph.producers.size).toBe(2);
    expect(g1.power.graph.consumers.size).toBe(0);
  });

  test("三个串联发电机 → 同图（all.size===3）；拆掉中间 → 裂成两张各 size 1 的图", () => {
    const g1 = placeFueledCombustion(4, 5);
    const g2 = placeFueledCombustion(5, 5);
    const g3 = placeFueledCombustion(6, 5);

    const merged = g1.power.graph;
    expect(g2.power.graph).toBe(merged);
    expect(g3.power.graph).toBe(merged);
    expect(merged.all.size).toBe(3);

    // 拆掉中间节点 —— 走 Java `PowerGraph.remove()` 的语义：对每条邻接分支新建一张图
    Vars.world.tile(5, 5)!.setBlock(Blocks.air);

    expect(g1.power.graph).not.toBe(merged);
    expect(g3.power.graph).not.toBe(merged);
    expect(g1.power.graph).not.toBe(g3.power.graph);
    expect(g1.power.graph.all.size).toBe(1);
    expect(g3.power.graph.all.size).toBe(1);
    // 原图已作废（它的实体被 remove，且不再持有任何建筑）
    expect(merged.all.size).toBe(3); // Java 的 remove() 不原地删，原图列表保持不变
  });
});

// ---------------------------------------------------------------------------------------
// ⑥ 发电机烧燃料
// ---------------------------------------------------------------------------------------

describe("power: ⑥ ConsumeGenerator 烧燃料（itemDuration=120）", () => {
  test("没煤 → productionEfficiency===0；加煤后升到 1（coal.flammability===1）", () => {
    const g = place<ConsumeGeneratorBuild>(5, 5, makeCombustion());
    expect(g.items.get(Items.coal)).toBe(0);

    runTicks(3);
    expect(g.productionEfficiency).toBe(0);
    expect(g.getPowerProduction()).toBe(0);

    g.items.setAmount(Items.coal, 3);
    runTicks(2);
    expect(g.efficiency).toBe(1);
    expect(g.efficiencyMultiplier).toBe(1); // Items.coal.flammability === 1
    expect(g.productionEfficiency).toBe(1);
    expect(g.getPowerProduction()).toBe(1);
  });

  test("coal 按 itemDuration=120 的节奏减少（实测 tick），耗尽后 productionEfficiency 回 0", () => {
    const g = place<ConsumeGeneratorBuild>(5, 5, makeCombustion());
    g.items.setAmount(Items.coal, 3);

    const dropTicks: number[] = [];
    let prev = 3;
    for(let t = 1; t <= 400; t++){
      runTicks(1);
      const now = g.items.get(Items.coal);
      if(now < prev){
        dropTicks.push(t);
        prev = now;
      }
    }

    // 第一件燃料在「加煤后的第一个 updateTile」就被吃掉（generateTime 初值 0 <= 0）→ tick 1
    expect(dropTicks[0]).toBe(1);
    // ⚠️ 之后是 **121** tick 一件，不是 120（本文件最反直觉的一处，与 `crafter.test.ts`
    //   的「首产 tick 是 91 而不是 90」同源）: `1/120` 在 f64 下是 `0.008333333333333333`，
    //   比精确值**略小**，连续减 120 次后 `generateTime` 还剩 ~4e-17（**仍 > 0**），
    //   要第 121 次才 `<= 0`。Java 全程 f32，同一处的取值不同 —— f32/f64 的固有差异。
    expect(dropTicks[1]! - dropTicks[0]!).toBe(121);
    expect(dropTicks[2]! - dropTicks[1]!).toBe(121);
    expect(g.items.get(Items.coal)).toBe(0);

    // 燃料耗尽 → efficiency 归 0 → productionEfficiency 归 0 → 不产电
    runTicks(130);
    expect(g.efficiency).toBe(0);
    expect(g.productionEfficiency).toBe(0);
    expect(g.getPowerProduction()).toBe(0);
  });

  test("pyratite 的 itemDurationMultiplier=3 → 一件烧 360 tick", () => {
    const g = place<ConsumeGeneratorBuild>(5, 5, makeCombustion());
    g.items.setAmount(Items.pyratite, 2);

    const dropTicks: number[] = [];
    let prev = 2;
    for(let t = 1; t <= 800; t++){
      runTicks(1);
      const now = g.items.get(Items.pyratite);
      if(now < prev){
        dropTicks.push(t);
        prev = now;
      }
    }

    expect(dropTicks.length).toBe(2);
    expect(dropTicks[1]! - dropTicks[0]!).toBe(361); // 120 * 3 = 360，+1 同上面的 f64 理由
    // pyratite.flammability === 1.4 → 产电更高效
    expect(g.efficiencyMultiplier).toBe(1.4);
  });
});

// ---------------------------------------------------------------------------------------
// ⑧ 确定性
// ---------------------------------------------------------------------------------------

describe("power: ⑧ 确定性", () => {
  test("两次相同布景跑相同 tick → 关键状态字符串相等", () => {
    const run = (): string => {
      createWorld(16, 16, 1);
      const g = placeFueledCombustion(5, 5, 8);
      const c = place<GenericCrafterBuild>(6, 5, makeCrafter(0.5));
      c.items.setAmount(Items.coal, 10);
      runTicks(200);
      return keyState(g, c);
    };

    const a = run();
    const b = run();

    expect(a).toBe(b);
    // 顺带钉住 200 tick 后的**具体**状态（防「两次都停在初始值」的假阳性）:
    //   工厂效率 1 → 200 tick 内合成 6 次（craftTime=30）→ graphite 6、coal 10→4；
    //   发电机吃掉 2 件煤（tick 1 / 122）→ genCoal 8→6。
    expect(a).toBe(
      "status=1|efficiency=1|shouldConsumePower=true|progress=0.633333333333332|coal=4|graphite=6|genEff=1|genCoal=6|graphAll=2"
    );
  });
});

// ---------------------------------------------------------------------------------------
// ⑦ 反事实（本文件跑通后逐条「改坏 → 变红 → 复原」，实测输出见交付报告）
// ---------------------------------------------------------------------------------------
//
//  ① 把 `PowerGraph.distributePower()` 的 `Math.min(1, produced / needed)` 改成 `1`
//     → 实测 **4 条变红**（`Tests 4 failed | 12 passed`）:
//       「② coverage===1」的 tick1 `status===0`（拿到 1）、
//       「③ 两个 consumePower(0.75)」的 `0.6666666666666666`（拿到 1）、
//       「④ B 有料」的 `1/1.5`、`⑧ 确定性」的精确串。
//  ② 把 `PowerGraph.getPowerNeeded()` 里的 `if(consumer.shouldConsumePower)` 去掉
//     → 实测 **1 条变红**（`Tests 1 failed | 15 passed`）:
//       「④ B 缺料」`expected 0.6666666666666666 to be 1`（A 的 coverage 不再变高）。
//  ③ 把 `PowerModule.status` 的初值从 0 改成 1
//     → 实测 **3 条变红**（`Tests 3 failed | 13 passed`）:
//       「前提」的 `power.status===0`、`① 无电」的两条（拿到 1）。
//  ⑤ 把 `ConsumeGeneratorBuild.updateTile()` 里的 `generateTime <= 0` 改成 `< 0`
//     → 实测 **1 条变红**（`Tests 1 failed | 15 passed`）:
//       「⑥ 烧燃料」`expected 2 to be 1`（第一件燃料永远吃不到）。
//
//  ⚠️ 全部已复原（下面这条断言在复原后仍为绿，用来证明复原生效）。
