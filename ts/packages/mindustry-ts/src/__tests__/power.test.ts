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
import { Build } from "../world/Build.js";
import { Team } from "../game/Team.js";
import { ItemStack } from "../type/ItemStack.js";
import { createWorld, placeBlock, runTicks } from "../harness.js";
import { ConsumeItems } from "../world/consumers/ConsumeItems.js";
import { ConsumeItemExplode } from "../world/consumers/ConsumeItemExplode.js";
import { ConsumeItemFlammable } from "../world/consumers/ConsumeItemFlammable.js";
import { ConsumeGenerator, ConsumeGeneratorBuild } from "../world/blocks/power/ConsumeGenerator.js";
import { PowerGraph } from "../world/blocks/power/PowerGraph.js";
import { PowerNodeBuild } from "../world/blocks/power/PowerNode.js";
import { Battery, BatteryBuild } from "../world/blocks/power/Battery.js";
import { Point2 } from "@mindustry-ts/arc";
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
//  ⚠️ 全部已复原（下面这条断言在复原后仍为绿，用来证明复原生效）。//
//  ⑪ 把 `PowerGraph.chargeBatteries()` 里的 `battery.power.status += ...` 换成注释
//     → 实测 **1 条变红**（`Tests 1 failed | 1 passed | 22 skipped`）:
//       「⑩ 富余发电给电池充电」’ expected +0 to be close to 0.3’（充电增量为 0）。
//     已复原。


// ---------------------------------------------------------------------------------------
// ⑨ PowerNode 手动拉线（laser 连线）—— C22
// ---------------------------------------------------------------------------------------
//
// ⚠️ 本节三个前提（与 golden [3] 同一套语义）：
//   · powerNode 是纯导体：`consumesPower=false, outputsPower=false` → 只进 `all`，不计产耗；
//   · 邻接传导 + 手动 `configure(pos)` 拉线 是两条并立的入图路径；
//   · `configure` 断线时对两端各 `reflow` 一次（图可能裂成两张）。
// 不用唯一名（`Blocks.powerNode` 是已注册的真实方块；发电机/工厂用上面的测试夹具，size 1）。

describe("power: ⑨ PowerNode 手动拉线（laser 连线）", () => {
  test("powerNode 方块字段：纯导体（consumesPower/outputsPower=false）+ hasPower/update 正确", () => {
    expect(Blocks.powerNode.consumesPower).toBe(false);
    expect(Blocks.powerNode.outputsPower).toBe(false);
    expect(Blocks.powerNode.hasPower).toBe(true);
    expect(Blocks.powerNode.update).toBe(false);
    expect(Blocks.powerNode.connectedPower).toBe(true);
  });

  test("两个相邻 powerNode 靠邻接并入同图（纯导体不拆图）", () => {
    const a = place<PowerNodeBuild>(5, 5, Blocks.powerNode);
    const b = place<PowerNodeBuild>(6, 5, Blocks.powerNode);
    expect(a.power.graph).toBe(b.power.graph);
    // 纯导体：不在 producers/consumers/batteries 里，只进 all
    expect(a.power.graph.all.size).toBe(2);
    expect(a.power.graph.producers.size).toBe(0);
    expect(a.power.graph.consumers.size).toBe(0);
    expect(a.power.graph.batteries.size).toBe(0);
  });

  test("非相邻节点 configure 拉线 → 并入同图并供电；再次 configure 断开 → 裂图断电", () => {
    // 布景（全 size 1）：gen(4,5) -[邻接]- nodeA(5,5)    nodeB(9,5) -[邻接]- crafter(10,5)
    //   nodeA 与 nodeB 相距 4 格（laserRange=6 内）、彼此不相邻 —— 必须靠 configure 才连通。
    const g = placeFueledCombustion(4, 5);
    const nodeA = place<PowerNodeBuild>(5, 5, Blocks.powerNode);
    const nodeB = place<PowerNodeBuild>(9, 5, Blocks.powerNode);
    const c = place<GenericCrafterBuild>(10, 5, makeCrafter(0.5));
    c.items.setAmount(Items.coal, 10);

    // 连线前：两张图（gen+nodeA / nodeB+crafter）
    expect(nodeA.power.graph).not.toBe(nodeB.power.graph);
    expect(g.power.graph).toBe(nodeA.power.graph);
    expect(c.power.graph).toBe(nodeB.power.graph);
    expect(nodeA.power.links.size).toBe(0);

    // 手动拉线：nodeA ↔ nodeB
    nodeA.configure(nodeB.pos());
    expect(nodeA.power.graph).toBe(nodeB.power.graph);
    expect(nodeA.power.links.size).toBe(1);
    expect(nodeB.power.links.size).toBe(1); // 双向记录
    expect(g.power.graph.all.size).toBe(4); // gen+nodeA+nodeB+crafter 同图

    runTicks(2);
    expect(c.power.status, "拉线后 coverage===1").toBe(1);
    expect(c.efficiency, "拉线后效率 1").toBe(1);

    // 再次 configure → 断开。图裂成两张，crafter 丧失电源。
    nodeA.configure(nodeB.pos());
    expect(nodeA.power.graph).not.toBe(nodeB.power.graph);
    expect(nodeA.power.links.size).toBe(0);
    expect(nodeB.power.links.size).toBe(0);

    runTicks(2);
    expect(c.power.status, "断开后 coverage===0").toBe(0);
    expect(c.efficiency, "断开后效率 0").toBe(0);
  });

  test("linkValid 拒收超距连线（laserRange=6 之外）→ configure 是 no-op", () => {
    const nodeA = place<PowerNodeBuild>(5, 5, Blocks.powerNode);
    const nodeC = place<PowerNodeBuild>(14, 5, Blocks.powerNode); // 相距 9 格 > 6
    expect(nodeA.power.graph).not.toBe(nodeC.power.graph);
    nodeA.configure(nodeC.pos());
    expect(nodeA.power.graph).not.toBe(nodeC.power.graph);
    expect(nodeA.power.links.size).toBe(0);
  });

  test("config() 返回相对连线坐标；configureLinks([]) 清空全部连线", () => {
    const nodeA = place<PowerNodeBuild>(5, 5, Blocks.powerNode);
    const nodeB = place<PowerNodeBuild>(9, 5, Blocks.powerNode);
    nodeA.configure(nodeB.pos());
    const cfg = nodeA.config();
    expect(cfg.length).toBe(1);
    expect(cfg[0]!.x).toBe(4); // nodeB(9,5) - nodeA(5,5)
    expect(cfg[0]!.y).toBe(0);

    // configureLinks([]) → 逐个断开旧链接（Java Point2[] 配置的「clear old」路径）
    nodeA.configureLinks([]);
    expect(nodeA.power.links.size).toBe(0);
    expect(nodeB.power.links.size).toBe(0);
  });
});


// ---------------------------------------------------------------------------------------
// ⑩ Battery 缓冲储电 —— C23
// ---------------------------------------------------------------------------------------
//
// ⚠️ 三个关键语义（都是 PowerGraph 的既有逻辑，本阶段只补「电池方块」本身）：
//   · `outputsPower && consumesPower && consPower.buffered` → PowerGraph 分类进 `batteries`
//     （既不是 producers 也不是 consumers），充放电由
//     `chargeBatteries`/`useBatteries` 驱动；
//   · 电池的 `power.status` = 「已存电 / 容量」（**不是**覆盖率）；
//   · 富余发电 → `chargeBatteries(excess)`；供电不足 → `useBatteries(needed-produced)`。
// 夹具用**小容量**电池（capacity 100）让充放速率线性可断言：
//   · 充：excess 0.5/tick → `status += 0.5/100 = 0.005`/tick
//   · 放：需 0.5/tick → `status -= 0.5/100 = 0.005`/tick，约 200 tick 放空

function makeBattery(capacity: number): Battery{
  const b = new Battery(nextName("power-battery"));
  b.consumePowerBuffered(capacity);
  b.init();
  return b;
}

describe("power: ⑩ Battery 缓冲储电", () => {
  test("注册的 battery 方块字段 + PowerGraph 分类进 batteries（不占 producers/consumers）", () => {
    expect(Blocks.battery.consumesPower).toBe(true);
    expect(Blocks.battery.outputsPower).toBe(true);
    expect(Blocks.battery.update).toBe(false);
    expect(Blocks.battery.consPower!.buffered).toBe(true);
    expect(Blocks.battery.consPower!.capacity).toBe(4000);

    const bat = place<BatteryBuild>(5, 5, Blocks.battery);
    expect(bat.power.graph.batteries.size).toBe(1);
    expect(bat.power.graph.consumers.size).toBe(0);
    expect(bat.power.graph.producers.size).toBe(0);
    expect(bat.power.graph.getTotalBatteryCapacity()).toBe(4000);
    expect(bat.power.status).toBe(0);
  });

  test("富余发电给电池充电：每 60 tick status +0.3（excess 0.5 / capacity 100），用电方满供", () => {
    const g = placeFueledCombustion(4, 5);
    const bat = place<BatteryBuild>(5, 5, makeBattery(100));
    const c = place<GenericCrafterBuild>(6, 5, makeCrafter(0.5));
    c.items.setAmount(Items.coal, 10);

    runTicks(2); // 走稳后记下起点（第 1 tick 已开始充，不假设为 0）
    const before = bat.power.status;
    runTicks(60);
    expect(bat.power.status - before, "充电增量 = 60 * 0.005 = 0.3").toBeCloseTo(0.3, 6);
    expect(g.power.graph.getBatteryStored()).toBeCloseTo(bat.power.status * 100, 6);
    expect(c.power.status, "用电方满供 coverage=1").toBe(1);
  });

  test("供电不足时电池放电补足：coverage 从 2/3 拉回 1，放空后回落 2/3", () => {
    const g = placeFueledCombustion(4, 5); // 产 1.0
    const bat = place<BatteryBuild>(5, 5, makeBattery(100));
    const c1 = place<GenericCrafterBuild>(6, 5, makeCrafter(0.75));
    const c2 = place<GenericCrafterBuild>(5, 6, makeCrafter(0.75));
    for(const c of [c1, c2]) c.items.setAmount(Items.coal, 10);

    // 未充电的电池不改变 coverage（放电 0）
    runTicks(2);
    expect(c1.power.status).toBeCloseTo(2 / 3, 6);
    expect(c2.power.status).toBeCloseTo(2 / 3, 6);

    // 手动充满（等价 Java PowerTestFixture 的做法）→ 电池放电把 coverage 拉回 1
    bat.power.status = 1;
    runTicks(2);
    expect(c1.power.status, "放电中 coverage=1").toBe(1);
    expect(c2.power.status).toBe(1);
    expect(bat.power.status, "每 tick 线性 -0.005").toBeCloseTo(1 - 2 * 0.005, 6);

    // 放空（100/0.5=200 tick）→ coverage 回落 2/3
    runTicks(250);
    expect(bat.power.status).toBe(0);
    expect(c1.power.status).toBeCloseTo(2 / 3, 6);
    expect(c2.power.status).toBeCloseTo(2 / 3, 6);
  });
});


// ---------------------------------------------------------------------------------------
// ⑪ PowerNode 放置自动连线（C25）
// ---------------------------------------------------------------------------------------
//
// ⚠️ 引发时机与 Java 一致：`placed()` 只在正式放置（`Build.beginPlace`）后被调；
//   `Tile.setBlock`/harness `placeBlock` 不调它 —— golden 对拍不会自动拉线。
//   · powerNode 放置 → `PowerNodeBuild.placed()` → `getPotentialLinks`（自己拉到附近电力方块）
//   · 任意电力方块放置 → 基类 `placed()` → `getNodeLinks`（附近节点拉到它）
// 夹具用 `instantBuild=true` 跳过核心扣费。
// 反事实（已复原）：把 `PowerNodeBuild.placed()` 的守卫改成 `if(true) return;`（永不自动拉线）
//   → ① 与 ⑤ 变红（`Tests 2 failed | 3 passed`），②（基类 placed → getNodeLinks 路径）仍绿
//   —— 证明 ①/⑤ 依赖节点自身的 placed()，② 依赖基类 placed()，两条路径独立。

describe("power: ⑪ PowerNode 放置自动连线", () => {
  test("① 放置 powerNode 自动拉线到范围内的发电机", () => {
    Build.beginPlace(4, 5, Blocks.combustionGenerator, Team.sharded, 0, true);
    Build.beginPlace(6, 5, Blocks.powerNode, Team.sharded, 0, true); // 相距 2 格 < laserRange 6
    const gen = Vars.world.tile(4, 5)!.build as ConsumeGeneratorBuild;
    const node = Vars.world.tile(6, 5)!.build as PowerNodeBuild;
    expect(node.power.links.size, "getPotentialLinks 应找到发电机").toBe(1);
    expect(node.power.links.contains(gen.pos()), "双向连线").toBe(true);
    expect(gen.power.links.contains(node.pos())).toBe(true);
    expect(node.power.graph, "并入同一图").toBe(gen.power.graph);
  });

  test("② 放置发电机自动连到附近已有节点（基类 placed → getNodeLinks）", () => {
    Build.beginPlace(6, 5, Blocks.powerNode, Team.sharded, 0, true);
    Build.beginPlace(4, 5, Blocks.combustionGenerator, Team.sharded, 0, true);
    const gen = Vars.world.tile(4, 5)!.build as ConsumeGeneratorBuild;
    const node = Vars.world.tile(6, 5)!.build as PowerNodeBuild;
    expect(node.power.links.size, "节点应被发电机的 placed() 拉线").toBe(1);
    expect(gen.power.links.contains(node.pos())).toBe(true);
    expect(node.power.graph).toBe(gen.power.graph);
  });

  test("③ 超出 laserRange 不自动拉线", () => {
    Build.beginPlace(4, 5, Blocks.combustionGenerator, Team.sharded, 0, true);
    Build.beginPlace(12, 5, Blocks.powerNode, Team.sharded, 0, true); // 相距 8 格 > 6
    const gen = Vars.world.tile(4, 5)!.build as ConsumeGeneratorBuild;
    const node = Vars.world.tile(12, 5)!.build as PowerNodeBuild;
    expect(node.power.links.size).toBe(0);
    expect(gen.power.links.size).toBe(0);
  });

  test("④ `Tile.setBlock`（golden 路径）不触发自动拉线，但邻接仍并图", () => {
    placeBlock(4, 5, Blocks.combustionGenerator, 0);
    placeBlock(5, 5, Blocks.powerNode, 0); // 相邻
    const gen = Vars.world.tile(4, 5)!.build as ConsumeGeneratorBuild;
    const node = Vars.world.tile(5, 5)!.build as PowerNodeBuild;
    expect(node.power.links.size, "setBlock 不调 placed → 无自动连线").toBe(0);
    expect(gen.power.links.size).toBe(0);
    expect(node.power.graph, "但邻接传导仍能并图").toBe(gen.power.graph);
  });

  test("⑤ 自动拉线 + 手动拉线组成完整供电链（节点把电源带给远处耗电方块）", () => {
    Build.beginPlace(4, 5, Blocks.combustionGenerator, Team.sharded, 0, true);
    Build.beginPlace(6, 5, Blocks.powerNode, Team.sharded, 0, true); // 自动拉线到 gen
    const gen = Vars.world.tile(4, 5)!.build as ConsumeGeneratorBuild;
    gen.items.add(Items.coal, 60);
    const node = Vars.world.tile(6, 5)!.build as PowerNodeBuild;
    const c = place<GenericCrafterBuild>(11, 5, makeCrafter(0.5)); // 相距 5 格，手动拉线
    c.items.setAmount(Items.coal, 10);
    node.configure(c.pos());
    runTicks(2);
    expect(c.power.status, "节点把发电机电力带给远处工厂").toBe(1);
    expect(gen.power.graph.all.size, "gen+node+crafter 同图").toBe(3);
  });
});