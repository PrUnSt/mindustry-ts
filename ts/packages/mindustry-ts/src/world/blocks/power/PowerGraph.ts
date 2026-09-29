// 源: core/src/mindustry/world/blocks/power/PowerGraph.java (389 行)
//
// 移植范围: **全部**非渲染逻辑 —— 字段、电池求解（`getBatteryStored` /
//   `getBatteryCapacity` / `getTotalBatteryCapacity` / `useBatteries` / `chargeBatteries`）、
//   `distributePower` / `update`、`add` / `addGraph` / `reflow` / `remove` / `removeList` /
//   `clear` / `checkAdd`，以及全部 UI 只读查询（`getSatisfaction` / `getPowerBalance` / …）。
//
// ⚠️ `PowerGraph` 在 **v7 位于 `world/blocks/power/`**（不是旧版的 `mindustry/power/`）；
//   `PowerComp.java` / `Consumers.java` / `BurnerGenerator.java` / `ItemLiquidGenerator.java`
//   在 v7 **都不存在**（已重构掉），别去找。
//
// ⚠️ 三个必须知道的点（照抄时别改）:
//   1. `getPowerNeeded()`（Java :105-116）**只对 `shouldConsumePower` 为 true 的消费者计入**
//      —— 「非电力消费者缺料 → `shouldConsumePower = false`」（`BuildingComp.java:1979-1981`）
//      让停产的工厂**退出电网负荷**，从而使剩余方块的覆盖率变高。
//   2. `getPowerProduced()` / `getPowerNeeded()` 都乘了 `consumer.delta()`
//      —— 量纲是「本 tick 的能量」而不是功率。
//   3. `distributePower()`（Java :187-214）才是**唯一**写 `power.status` 的地方：
//      普通耗电方块的 `status` 就是 `coverage`（**不是** `getSatisfaction()`）。
//
// 未移植（逐条标注，均为渲染 / UI / 音效层，计划 §9）:
//   - 无。`PowerGraph` 是纯模拟类，Java 原文里没有 draw/load/音效代码。
//
// ⚠️ 与 Java 的一处**结构性差异**（`delta()` 的实现位置）:
//   Java 的 `BuildingComp.delta()` = `Time.delta * timeScale` 由组件系统生成，所有建筑都有。
//   TS 的 `gen/Building.ts` **没有** `delta()`（codegen 约束：生成文件不能 import arc-ts），
//   由**具象建筑各自实现**（见 `GenericCrafterBuild.delta()` / `PowerGeneratorBuild.delta()`）。
//   `PowerGraph` 要对图内**任意** Building 取 delta，而对端可能尚未实现 `delta()` →
//   用文件末尾的 `deltaOf()` 兜底（优先调 `delta()`，否则按 Java 定义式现算）。
//   语义与 Java 等价，风险为零（`Time.delta * timeScale` 就是 Java 的方法体本身）。
//
// ⚠️ `PowerGraphUpdater` 实体如何接入 `Groups.powerGraph`（**本文件最重要的一处决策**）:
//   Java `PowerGraph()` 构造器（:30-34）:
//     `entity = PowerGraphUpdater.create(); entity.graph = this; graphID = lastGraphID++;`
//   `PowerGraphUpdater` 由 `@EntityDef(value = PowerGraphUpdaterc.class, serialize = false,
//   genio = false)`（`entities/comp/PowerGraphUpdaterComp.java:7`）生成，`update()` 只有一行
//   `graph.update()`（:11-13）。它由 `Groups.powerGraph`（`GroupDefs.java:16`）驱动 ——
//   `Logic.updateEntities()` 里 `Groups.powerGraph.update()` **先于** `Groups.build.update()`
//   （`Logic.java:487` / `:491` 的顺序；TS 侧 `core/Logic.ts:159-160` 已同序）。
//
//   TS 侧没有「`@EntityDef` 生成具象类」这一步：`gen/` 里只有**接口** `PowerGraphUpdaterc`
//   （`gen/PowerGraphUpdaterc.ts`）与 `IndexableEntity__powerGraph`，**没有**具象类。
//   而 `entities/comp/*.def.ts` 属编排方冻结面（且 S3 版把 Java 的
//   `public transient PowerGraph graph` 字段删掉了）。
//   因此**本文件自己**声明具象类 `PowerGraphUpdater`：
//     · 实现 `PowerGraphUpdaterc`（`update()` = `graph.update()`）+ `Entityc`
//       （`id` / `added` / `isAdded` / `add` / `remove`）+ `IndexableEntity__powerGraph`
//       （`setIndex__powerGraph` —— `Groups.powerGraph` 的 indexer 回调需要它）;
//     · `add()` / `remove()` 照抄 `gen/Building.ts:854-863` 的生成形态
//       （`addIndex` → 记 `index__powerGraph`；`removeIndex(type, index)`）；
//     · 与 Java 的对应关系：`new PowerGraphUpdater()` ≡ `PowerGraphUpdater.create()`
//       （Java 的 `create()` 对 `serialize=false` 实体就是 `new`，无池化）。
//   ⚠️ Java 的 `PowerGraphUpdater.create()` **不会**自动入组 —— 入组发生在
//   `PowerGraph.checkAdd()`（:303-305，即 `entity.add()`）。本移植逐字保持：
//   孤立的耗电方块（无任何电力连接）其图**永不入组** → `graph.update()` 永不跑
//   → `power.status` 保持 `PowerModule` 的初值 **0** → 工厂 `efficiency === 0`。
//   这正是「无电 → 不产出」的实现来源，别「顺手」把它入组。

import { IntSet, Mathf, Queue, Seq, Time, WindowedMean } from "@mindustry-ts/arc";
import { Groups } from "../../../gen/Groups.js";
import type { IndexableEntity__powerGraph } from "../../../gen/IndexableEntity__powerGraph.js";
import type { PowerGraphUpdaterc } from "../../../gen/PowerGraphUpdaterc.js";
import type { Building } from "../../../gen/Building.js";

/**
 * 对应 Java **生成**的 `mindustry.gen.PowerGraphUpdater`
 * （`@EntityDef(value = PowerGraphUpdaterc.class, serialize = false, genio = false)`，
 * `entities/comp/PowerGraphUpdaterComp.java:7`）。
 *
 * TS 侧没有 `@EntityDef` 的具象类生成步骤，故在本文件手写；形态照抄
 * `gen/Building.ts:854-863`（`add`/`remove` + `addIndex`/`removeIndex`）。
 *
 * ⚠️ Java 的 `public transient PowerGraph graph`（`PowerGraphUpdaterComp.java:10`）在
 * TS 的 `entities/comp/PowerGraphUpdaterComp.def.ts` 里被 S3 版删掉了，
 * 所以这个字段只能由本类自己持有（`entities/comp/**` 属冻结面，不改）。
 */
export class PowerGraphUpdater implements PowerGraphUpdaterc, IndexableEntity__powerGraph{
  /** Java `EntityComp.id`。入组时由 `EntityGroup.nextId()` 分配（见 `EntityGroup.add`）。 */
  id = -1;
  /** Java `EntityComp.added`。 */
  added = false;
  /** 本实体在 `Groups.powerGraph` 里的下标（Java `index__powerGraph`）。 */
  protected index__powerGraph = -1;

  /** 反向指向所属电网（Java `PowerGraphUpdaterComp.graph`）。 */
  graph: PowerGraph | null = null;

  isAdded(): boolean{
    return this.added;
  }

  /** 对应 Java `PowerGraphUpdaterComp.update()`（:11-13）：一行 `graph.update()`。 */
  update(): void{
    if(this.graph !== null) this.graph.update();
  }

  /** 对应生成的 `add()`。⚠️ 只有 `PowerGraph.checkAdd()` 会调它（Java :303-305）。 */
  add(): void{
    if(this.added) return;
    this.index__powerGraph = Groups.powerGraph.addIndex(this);
    this.added = true;
  }

  /** 对应生成的 `remove()`。 */
  remove(): void{
    if(!this.added) return;
    Groups.powerGraph.removeIndex(this, this.index__powerGraph);
    this.index__powerGraph = -1;
    this.added = false;
  }

  setIndex__powerGraph(index: number): void{
    this.index__powerGraph = index;
  }
}

/** 对应 `mindustry.world.blocks.power.PowerGraph`。 */
export class PowerGraph{
  // Java :9-12 的四个**静态**复用缓冲（避免每 tick 分配；语义上是「全局单例」）
  private static readonly queue = new Queue<any>();
  private static readonly outArray1: any[] = [];
  private static readonly outArray2: any[] = [];
  private static readonly closedSet = new IntSet();

  // Java :15-18
  readonly producers = new Seq<Building>();
  readonly consumers = new Seq<Building>();
  readonly batteries = new Seq<Building>();
  readonly all = new Seq<Building>();

  /** Java :20 `private final @Nullable PowerGraphUpdater entity`。 */
  private readonly entity: PowerGraphUpdater | null;
  /** Java :21。 */
  private readonly powerBalance = new WindowedMean(60);
  /** Java :22。 */
  private lastPowerProduced = 0;
  private lastPowerNeeded = 0;
  private lastPowerStored = 0;
  /** Java :23。 */
  private lastScaledPowerIn = 0;
  private lastScaledPowerOut = 0;
  private lastCapacity = 0;
  /** Java :25 —— diodes workaround for correct energy production info。 */
  private energyDelta = 0;

  /** Java :27-28。 */
  private readonly graphID: number;
  private static lastGraphID = 0;

  /** 对应 Java `PowerGraph()`（:30-34）。 */
  constructor();
  /**
   * 对应 Java `PowerGraph(boolean noEntity)`（:36-39）—— **单测专用**：不创建实体，
   * 因此永远不会被 `Groups.powerGraph` 驱动。
   */
  constructor(noEntity: boolean);
  constructor(noEntity?: boolean){
    this.entity = noEntity === true ? null : new PowerGraphUpdater();
    if(this.entity !== null) this.entity.graph = this;
    this.graphID = PowerGraph.lastGraphID++;
  }

  /** 对应 Java `getID()`（:41-43）。 */
  getID(): number{
    return this.graphID;
  }

  /** 对应 Java `getLastScaledPowerIn()`（:45-47）。 */
  getLastScaledPowerIn(): number{
    return this.lastScaledPowerIn;
  }

  /** 对应 Java `getLastScaledPowerOut()`（:49-51）。 */
  getLastScaledPowerOut(): number{
    return this.lastScaledPowerOut;
  }

  /** 对应 Java `getLastCapacity()`（:53-55）。 */
  getLastCapacity(): number{
    return this.lastCapacity;
  }

  /** 对应 Java `getPowerBalance()`（:57-59）。 */
  getPowerBalance(): number{
    return this.powerBalance.rawMean();
  }

  /** 对应 Java `hasPowerBalanceSamples()`（:61-63）。 */
  hasPowerBalanceSamples(): boolean{
    return this.powerBalance.hasEnoughData();
  }

  /** 对应 Java `getLastPowerNeeded()`（:65-67）。 */
  getLastPowerNeeded(): number{
    return this.lastPowerNeeded;
  }

  /** 对应 Java `getLastPowerProduced()`（:69-71）。 */
  getLastPowerProduced(): number{
    return this.lastPowerProduced;
  }

  /** 对应 Java `getLastPowerStored()`（:73-75）。 */
  getLastPowerStored(): number{
    return this.lastPowerStored;
  }

  /** 对应 Java `transferPower(float)`（:77-84）。 */
  transferPower(amount: number): void{
    if(amount > 0){
      this.chargeBatteries(amount);
    }else{
      this.useBatteries(-amount);
    }
    this.energyDelta += amount;
  }

  /** 对应 Java `getSatisfaction()`（:86-93）。 */
  getSatisfaction(): number{
    if(Mathf.zero(this.lastPowerProduced)){
      return 0;
    }else if(Mathf.zero(this.lastPowerNeeded)){
      return 1;
    }
    return Mathf.clamp(this.lastPowerProduced / this.lastPowerNeeded);
  }

  /** 对应 Java `getPowerProduced()`（:95-103）。⚠️ 乘了 `delta()` —— 是「本 tick 的能量」。 */
  getPowerProduced(): number{
    let powerProduced = 0;
    for(let i = 0; i < this.producers.size; i++){
      const producer = this.producers.items[i]!;
      powerProduced += producer.getPowerProduction() * deltaOf(producer);
    }
    return powerProduced;
  }

  /**
   * 对应 Java `getPowerNeeded()`（:105-116）。
   *
   * ⚠️ `if(consumer.shouldConsumePower)` 这一行是**任务书断言 4 的观测点**:
   *   缺料停产的工厂不计入负荷，从而让其余方块的覆盖率变高。
   */
  getPowerNeeded(): number{
    let powerNeeded = 0;
    for(let i = 0; i < this.consumers.size; i++){
      const consumer = this.consumers.items[i]!;
      const consumePower = consumer.block.consPower;
      if(consumer.shouldConsumePower){
        powerNeeded += consumePower.requestedPower(consumer) * deltaOf(consumer);
      }
    }
    return powerNeeded;
  }

  /** 对应 Java `getBatteryStored()`（:118-128）。 */
  getBatteryStored(): number{
    let totalAccumulator = 0;
    for(let i = 0; i < this.batteries.size; i++){
      const battery = this.batteries.items[i]!;
      if(battery.enabled){
        totalAccumulator += battery.power.status * battery.block.consPower.capacity;
      }
    }
    return totalAccumulator;
  }

  /** 对应 Java `getBatteryCapacity()`（:130-140）—— 剩余可充容量。 */
  getBatteryCapacity(): number{
    let totalCapacity = 0;
    for(let i = 0; i < this.batteries.size; i++){
      const battery = this.batteries.items[i]!;
      if(battery.enabled){
        totalCapacity += (1 - battery.power.status) * battery.block.consPower.capacity;
      }
    }
    return totalCapacity;
  }

  /** 对应 Java `getTotalBatteryCapacity()`（:142-152）。 */
  getTotalBatteryCapacity(): number{
    let totalCapacity = 0;
    for(let i = 0; i < this.batteries.size; i++){
      const battery = this.batteries.items[i]!;
      if(battery.enabled){
        totalCapacity += battery.block.consPower.capacity;
      }
    }
    return totalCapacity;
  }

  /** 对应 Java `useBatteries(float)`（:154-168）。 */
  useBatteries(needed: number): number{
    const stored = this.getBatteryStored();
    if(Mathf.equal(stored, 0)) return 0;

    const used = Math.min(stored, needed);
    const consumedPowerPercentage = Math.min(1, needed / stored);
    for(let i = 0; i < this.batteries.size; i++){
      const battery = this.batteries.items[i]!;
      if(battery.enabled){
        battery.power.status *= 1 - consumedPowerPercentage;
      }
    }
    return used;
  }

  /** 对应 Java `chargeBatteries(float)`（:170-185）。 */
  chargeBatteries(excess: number): number{
    const capacity = this.getBatteryCapacity();
    // how much of the missing in each battery % is charged
    const chargedPercent = Math.min(excess / capacity, 1);
    if(Mathf.equal(capacity, 0)) return 0;

    for(let i = 0; i < this.batteries.size; i++){
      const battery = this.batteries.items[i]!;
      // TODO why would it be 0（Java 原文注释）
      if(battery.enabled && battery.block.consPower.capacity > 0){
        battery.power.status += (1 - battery.power.status) * chargedPercent;
      }
    }
    return Math.min(excess, capacity);
  }

  /**
   * 对应 Java `distributePower(float, float, boolean)`（:187-214）—— **唯一**写 `power.status` 的地方。
   *
   * ⚠️ 普通耗电方块的 `status` 就是 `coverage`（Java :204），**不是** `getSatisfaction()`。
   * ⚠️ `Math.min(1, produced / needed)` 是**任务书断言 3 的观测点**。
   */
  distributePower(needed: number, produced: number, charged: boolean): void{
    // distribute even if not needed. this is because some might be requiring power but not using it; it updates consumers
    const coverage =
      Mathf.zero(needed) && Mathf.zero(produced) && !charged && Mathf.zero(this.lastPowerStored)
        ? 0
        : Mathf.zero(needed)
          ? 1
          : Math.min(1, produced / needed);

    for(let i = 0; i < this.consumers.size; i++){
      const consumer = this.consumers.items[i]!;
      // TODO how would it even be null（Java 原文注释）
      const cons = consumer.block.consPower;
      if(cons.buffered){
        if(!Mathf.zero(cons.capacity)){
          // Add an equal percentage of power to all buffers, based on the global power coverage in this graph
          const maximumRate = cons.requestedPower(consumer) * coverage * deltaOf(consumer);
          consumer.power.status = Mathf.clamp(consumer.power.status + maximumRate / cons.capacity);
        }
      }else{
        // valid consumers get power as usual
        if(consumer.shouldConsumePower){
          consumer.power.status = coverage;
        }else{
          // invalid consumers get an estimate, if they were to activate
          consumer.power.status = Math.min(1, produced / (needed + cons.usage * deltaOf(consumer)));
          // just in case
          if(Number.isNaN(consumer.power.status)){
            consumer.power.status = 0;
          }
        }
      }
    }
  }

  /** 对应 Java `update()`（:216-257）。 */
  update(): void{
    if(!this.consumers.isEmpty() && this.consumers.first()!.cheating()){
      // when cheating, just set status to 1
      for(let i = 0; i < this.consumers.size; i++){
        this.consumers.items[i]!.power.status = 1;
      }

      this.lastPowerNeeded = this.lastPowerProduced = 1;
      return;
    }

    const powerNeeded = this.getPowerNeeded();
    let powerProduced = this.getPowerProduced();

    this.lastPowerNeeded = powerNeeded;
    this.lastPowerProduced = powerProduced;

    this.lastScaledPowerIn = (powerProduced + this.energyDelta) / Time.delta;
    this.lastScaledPowerOut = powerNeeded / Time.delta;
    this.lastCapacity = this.getTotalBatteryCapacity();
    this.lastPowerStored = this.getBatteryStored();

    this.powerBalance.add((this.lastPowerProduced - this.lastPowerNeeded + this.energyDelta) / Time.delta);
    this.energyDelta = 0;

    if(!(this.consumers.size === 0 && this.producers.size === 0 && this.batteries.size === 0)){
      let charged = false;

      if(!Mathf.equal(powerNeeded, powerProduced)){
        if(powerNeeded > powerProduced){
          const powerBatteryUsed = this.useBatteries(powerNeeded - powerProduced);
          powerProduced += powerBatteryUsed;
          this.lastPowerProduced += powerBatteryUsed;
        }else if(powerProduced > powerNeeded){
          charged = true;
          powerProduced -= this.chargeBatteries(powerProduced - powerNeeded);
        }
      }

      this.distributePower(powerNeeded, powerProduced, charged);
    }
  }

  /** 对应 Java `addGraph(PowerGraph)`（:259-275）。小图并入大图（单向，避免 O(n²)）。 */
  addGraph(graph: PowerGraph): void{
    if(graph === this) return;

    // merge into other graph instead.
    if(graph.all.size > this.all.size){
      graph.addGraph(this);
      return;
    }

    // other entity should be removed as the graph was merged
    if(graph.entity !== null) graph.entity.remove();

    for(let i = 0; i < graph.all.size; i++){
      this.add(graph.all.items[i]!);
    }
    this.checkAdd();
  }

  /**
   * 对应 Java `add(Building)`（:277-301）。
   *
   * ⚠️ 分类判据**顺序敏感**（Java 原文照搬）：
   *   `outputsPower && consumesPower && !buffered` → producers + consumers（既是电源又是负载）
   *   `outputsPower && consumesPower`             → batteries
   *   `outputsPower`                              → producers
   *   `consumesPower && consPower != null`        → consumers
   * ⚠️ `build.power == null` 直接 return（Java :278）。
   */
  add(build: Building | null): void{
    if(build === null || build === undefined || build.power === null) return;

    if(build.power.graph !== this || !build.power.init){
      // any old graph that is added here MUST be invalid, remove it
      if(build.power.graph !== null && build.power.graph !== this){
        const old: PowerGraph = build.power.graph;
        if(old.entity !== null) old.entity.remove();
      }

      build.power.graph = this;
      build.power.init = true;
      this.all.add(build);

      const block = build.block;
      if(block.outputsPower && block.consumesPower && !block.consPower.buffered){
        this.producers.add(build);
        this.consumers.add(build);
      }else if(block.outputsPower && block.consumesPower){
        this.batteries.add(build);
      }else if(block.outputsPower){
        this.producers.add(build);
      }else if(block.consumesPower && block.consPower !== null){
        this.consumers.add(build);
      }
    }
  }

  /** 对应 Java `checkAdd()`（:303-305）—— **入组的唯一入口**。 */
  checkAdd(): void{
    if(this.entity !== null) this.entity.add();
  }

  /** 对应 Java `clear()`（:307-314）。 */
  clear(): void{
    this.all.clear();
    this.producers.clear();
    this.consumers.clear();
    this.batteries.clear();
    // nothing left
    if(this.entity !== null) this.entity.remove();
  }

  /** 对应 Java `reflow(Building)`（:316-330）—— BFS 泛洪重建。 */
  reflow(tile: Building): void{
    const queue = PowerGraph.queue;
    queue.clear();
    queue.addLast(tile);
    PowerGraph.closedSet.clear();
    while(queue.size > 0){
      const child: Building = queue.removeFirst();
      this.add(child);
      this.checkAdd();
      const nexts = child.getPowerConnections(PowerGraph.outArray2);
      for(let i = 0; i < nexts.length; i++){
        const next: Building = nexts[i]!;
        if(PowerGraph.closedSet.add(next.pos())){
          queue.addLast(next);
        }
      }
    }
  }

  /** 对应 Java `removeList(Building)`（:333-338）—— 仅单测用。 */
  removeList(build: Building): void{
    this.all.remove(build, true);
    this.producers.remove(build, true);
    this.consumers.remove(build, true);
    this.batteries.remove(build, true);
  }

  /**
   * 对应 Java `remove(Building)`（:342-377）。
   *
   * ⚠️ **不原地删**：对每条邻接分支 `new PowerGraph()` 重建，原图作废，最后 `entity.remove()`。
   *   语义是「摘掉一个节点后原图可能裂成多张」，别优化成原地删除。
   */
  remove(tile: Building): void{
    const queue = PowerGraph.queue;

    // go through all the connections of this tile
    const conns = tile.getPowerConnections(PowerGraph.outArray1);
    for(let i = 0; i < conns.length; i++){
      const other: Building = conns[i]!;

      // a graph has already been assigned to this tile from a previous call, skip it
      if(other.power.graph !== this) continue;

      // create graph for this branch
      const graph = new PowerGraph();
      graph.checkAdd();
      graph.add(other);
      // add to queue for BFS
      queue.clear();
      queue.addLast(other);
      while(queue.size > 0){
        // get child from queue
        const child: Building = queue.removeFirst();
        // add it to the new branch graph
        graph.add(child);
        // go through connections
        const nexts = child.getPowerConnections(PowerGraph.outArray2);
        for(let j = 0; j < nexts.length; j++){
          const next: Building = nexts[j]!;
          // make sure it hasn't looped back, and that the new graph being assigned hasn't already been assigned
          // also skip closed tiles
          if(next !== tile && next.power.graph !== graph){
            graph.add(next);
            queue.addLast(next);
          }
        }
      }
      // update the graph once so direct consumers without any connected producer lose their power
      graph.update();
    }

    // implied empty graph here
    if(this.entity !== null) this.entity.remove();
  }

  /** 对应 Java `toString()`（:379-388）。 */
  toString(): string{
    return (
      "PowerGraph{" +
      "producers=" + this.producers +
      ", consumers=" + this.consumers +
      ", batteries=" + this.batteries +
      ", all=" + this.all +
      ", graphID=" + String(this.graphID) +
      "}"
    );
  }
}

/**
 * Java `BuildingComp.delta()`（= `Time.delta * timeScale`）。
 *
 * ⚠️ 为什么是个自由函数而不是 `build.delta()`: TS 的 `gen/Building.ts` **没有** `delta()`
 *   （codegen 约束：生成文件不能 import arc-ts），由具象建筑各自实现
 *   （`GenericCrafterBuild.delta()` / `PowerGeneratorBuild.delta()`）。
 *   `PowerGraph` 要对图内**任意** Building 取 delta，对端可能尚未实现 → 兜底现算。
 *   兜底式就是 Java 方法体本身，故语义等价。
 */
function deltaOf(build: Building): number{
  const d = (build as unknown as { delta?: () => number }).delta;
  return typeof d === "function" ? d.call(build) : Time.delta * build.timeScale;
}
