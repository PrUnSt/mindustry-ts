// 源: core/src/mindustry/world/blocks/units/UnitFactory.java (508 行)
//
// 移植范围（**收窄** · C24）: 方块字段（`capacities` / `plans` / `initCapacities` / `outputsItems`）
//   + `UnitPlan` + `UnitFactoryBuild` 的**生产闭环**（`currentPlan` / `progress` / `time` /
//   `speedScl` / `fraction` / `unit` / `created` / `configure` / `updateTile` / `shouldConsume` /
//   `getMaximumAccepted` / `acceptItem`）。这是「工厂按方案消耗物品、到点产出一个单位」的
//   完整可测语义。
//
// ⚠️ **与 Java 的结构性差异（逐条写清，别当漏移植）**:
//   - **无 payload 系统**: Java 产完把单位包成 `UnitPayload` → `moveOutPayload()` 逐渐移出 →
//     `dumpPayload` → `Call.unitBlockSpawn` 才真正入世界（:325, 及其后的 `UnitBlockBuild`）。
//     TS 直接 `plan.unit.spawn(team, x, y)` 原地入 `Groups.unit`，去掉「载荷移出」延迟 →
//     稳态下每个 `plan.time` tick 产一台（Java 还要多一段移出时间）。渲染/网络回调不移植。
//   - **无 UnitCommand / commandPos**: :81-88 的 `command` 设置、:263-271 的 `onCommand`、
//     :331-336 的命令分支全部省略（`UnitCommand` / 单位 AI 未移植）。
//   - **无 config 分发系统**: Java 的 `config(Integer.class, ...)`（:55-67）注册到
//     `Block.configurations`；TS 直接把方法体落成 `configure(planIndex)`（同 PowerNode 的处置）。
//   - **TeamRule 未移植**: `state.rules.unitBuildSpeed(team)` / `unitCost(team)` /
//     `team.activateUnitFactories()` 分别用 `Rules.unitBuildSpeedMultiplier` /
//     `unitCostMultiplier` / `true` 替代（基类规则倍率，默认 1，语义等价于无队伍定制规则）。
//   - **`unit.isBanned()` 未移植**（:322 的 ban 检查）—— 无 ban 系统 → 跳过。
//   - **`unlockedNow()` 未移植**（:369 的 `created()` 自动选方案）→ 视为全部已解锁（取第 0 个）。
//   - **渲染 / UI / 逻辑传感器**: `setBars` / `setStats` / `icons` / `draw*` / `buildConfiguration` /
//     `sense*`（:113-112, 226-303, 351-383, 385-450）—— 计划 §9。
//
// ⚠️ 为什么需要 `ConsumeItemDynamic`（`UnitFactory.java:71-73`）:
//   `ConsumeItems` 的配方声明期固定；工厂的消耗随 `currentPlan` 变。动态消费者把
//   「取当前方案 requirements」抽象成回调，`efficiency`（有没有料）与 `trigger`（扣料）
//   都走它。漏掉 → 工厂效率恒 1、扣料 no-op → 无中生有刷单位。

import { Events, Mathf, Seq, Time } from "@mindustry-ts/arc";
import { Vars } from "../../../Vars.js";
import { Building } from "../../../gen/Building.js";
import { UnitCreateEvent } from "../../../game/EventType.js";
import { ItemStack } from "../../../type/ItemStack.js";
import { UnitType } from "../../../type/UnitType.js";
import type { Item } from "../../../type/Item.js";
import { ConsumeItemDynamic } from "../../consumers/ConsumeItemDynamic.js";
import { UnitBlock, UnitBuild } from "./UnitBlock.js";

/** 对应 Java `UnitFactory.UnitPlan`（`UnitFactory.java:216-225`）。 */
export class UnitPlan{
  /** 产出的单位类型。 */
  unit: UnitType;
  /** 配方需求（`ItemStack[]`）。 */
  requirements: ItemStack[];
  /** 建造时长（tick）。 */
  time: number;

  constructor(unit: UnitType, time: number, requirements: ItemStack[]){
    this.unit = unit;
    this.time = time;
    this.requirements = requirements;
  }
}

/** 对应 `mindustry.world.blocks.units.UnitFactory`。 */
export class UnitFactory extends UnitBlock{
  /** Java `public int[] capacities = {}`（:17）—— 每种物品的最大容量（= 方案需求的 2 倍）。 */
  capacities: number[] = [];
  /** Java `public Seq<UnitPlan> plans = new Seq<>(4)`（:18）。 */
  plans = new Seq<UnitPlan>();

  /**
   * 等价 `ItemTurret.ammoBinder` 的惰性装配钩子（见 `Turret.ts` 文件头）。
   * ⚠️ 为什么需要: `ContentLoader.createBaseContent()` **不**调 `UnitTypes.load()`
   *   （该文件 `:216` 原位注释），而 `Blocks.load()` 在其后执行
   *   → `Blocks.groundFactory` 注册时 `UnitTypes.dagger` 尚为 undefined。
   *   做法与 `Blocks.duo.ammoBinder` 一致: 把「填拉方案」登记为回调，首次使用时
   *   （`created`/`configure`/`updateTile`）由 `ensurePlansBound()` 触发一次。
   */
  planBinder: (() => void) | null = null;
  /** 是否已执行 `planBinder`（同时是补齐防重入标记）。 */
  plansBound = false;

  /** 对应 `ItemTurret.ensureAmmoBound()`（`Turret.ts:1039-1043`）的同名语义。 */
  ensurePlansBound(): void{
    if(!this.plansBound){
      this.plansBound = true;
      if(this.planBinder !== null) this.planBinder();
      // 惰性方案补齐后重算容量：注册的方块在 `init()` 时方案仍为空
      // （`planBinder` 延后），这里针对该场景补一次
      // （Java 在 Blocks.load() 里方案就绪后 init 时算一次；蓝本方案与之等价）。
      this.initCapacities();
    }
  }

  /** 对应 Java `UnitFactory(String name)`（:31-80）。 */
  constructor(name: string){
    super(name);
    this.update = true;
    this.hasPower = true;
    this.hasItems = true;
    this.solid = true;
    // Java :44 `clearOnDoubleTap = true;` / :47 `commandable = true;` —— 配置/命令 UI 层
    this.outputsPayload = true;
    this.rotate = true;
    // Java :52-54 `ambientSound = Sounds.loopUnitBuilding;` 音效层
    // Java :55-67 `config(Integer.class, ...)` —— 落成 `UnitFactoryBuild.configure()`
    // Java :69-78 `config(UnitType.class, ...)` / `config(UnitCommand.class, ...)` —— 命令层未移植

    // 动态配方消费者（Java :71-73）：`e.currentPlan != -1 ? plans.get(...).requirements : empty`
    this.consume(new ConsumeItemDynamic((build) => {
      const b = build as UnitFactoryBuild;
      return b.currentPlan !== -1
        ? this.plans.get(Math.min(b.currentPlan, this.plans.size - 1))!.requirements
        : ItemStack.empty;
    }));

    // 陷阱 #6：显式注册建筑工厂
    this.buildType = () => new UnitFactoryBuild();
  }

  /** 对应 Java `init()`（:75-77）—— 先算容量再走基类 init（固化消费者）。 */
  override init(): void{
    this.initCapacities();
    super.init();
  }

  /** 对应 Java `initCapacities()`（:83-96）。 */
  initCapacities(): void{
    this.capacities = new Array<number>(Vars.content.items().size).fill(0);
    this.itemCapacity = 10; // unit factories can't control their own capacity externally（Java 原文注释）
    for(const plan of this.plans){
      for(const stack of plan.requirements){
        this.capacities[stack.item.id] = Math.max(this.capacities[stack.item.id]!, stack.amount * 2);
        this.itemCapacity = Math.max(this.itemCapacity, stack.amount * 2);
      }
    }

    // Java :93-95 `consumeBuilder.each(c -> c.multiplier = b -> state.rules.unitCost(b.team));`
    //   TeamRule 未移植 → `unitCost(team) = Rules.unitCostMultiplier`（默认 1）。
    for(const c of this.consumeBuilder){
      c.multiplier = () => Vars.state.rules.unitCostMultiplier;
    }
  }

  /** 对应 Java `outputsItems()`（:113-115）—— 单位工厂不按物品输出。 */
  override outputsItems(): boolean{
    return false;
  }
}

/** 对应 Java `UnitFactory.UnitFactoryBuild`（:225-450）。 */
export class UnitFactoryBuild extends UnitBuild{
  /** Java `public int currentPlan = -1`（:229）。 */
  currentPlan = -1;

  /** Java 的 `UnitFactoryBuild` 是内部类，直接读外部 `UnitFactory.this.xxx`；TS 显式取回。 */
  protected get factory(): UnitFactory{
    return this.block as UnitFactory;
  }

  /** 对应 Java `fraction()`（:231-233）。 */
  fraction(): number{
    return this.currentPlan === -1 ? 0 : this.progress / this.factory.plans.get(this.currentPlan)!.time;
  }

  /** 对应 Java `unit()`（:411-413）—— 当前方案的产出单位类型。 */
  unit(): UnitType | null{
    return this.currentPlan === -1 ? null : this.factory.plans.get(this.currentPlan)!.unit;
  }

  /** 对应 Java `created()`（:367-370）—— 自动选中第一个已解锁方案。 */
  override created(): void{
    // 惰性装配方案（见 `UnitFactory.planBinder`）。
    this.factory.ensurePlansBound();
    // Java: `currentPlan = plans.indexOf(u -> u.unit.unlockedNow());` —— `unlockedNow` 未移植
    // → 全部视为已解锁 → 取第 0 个（有方案时）。
    if(this.currentPlan === -1 && this.factory.plans.size > 0){
      this.currentPlan = 0;
    }
    super.created();
  }

  /**
   * 对应 Java 的 `config(Integer.class, ...)` 处理体（:56-67）—— 切换方案。
   * ⚠️ TS 无配置分发系统 → 方法体直接落地（同 PowerNode.configure）。
   */
  configure(planIndex: number): void{
    this.factory.ensurePlansBound();
    if(planIndex === this.currentPlan) return;
    this.currentPlan = planIndex < 0 || planIndex >= this.factory.plans.size ? -1 : planIndex;
    this.progress = 0;
  }

  /** 对应 Java `BuildingComp.delta()`。⚠️ 实现位置见 `GenericCrafter.ts` 文件头。 */
  delta(): number{
    return Time.delta * this.timeScale;
  }

  /** 对应 Java `BuildingComp.edelta()` = `efficiency * delta()`。 */
  edelta(): number{
    return this.efficiency * this.delta();
  }

  /** 对应 Java `updateTile()`（:305-338）—— **生产闭环**。 */
  override updateTile(): void{
    this.factory.ensurePlansBound();
    if(this.currentPlan < 0 || this.currentPlan >= this.factory.plans.size){
      this.currentPlan = -1;
    }

    if(this.efficiency > 0 && this.currentPlan !== -1){
      this.time += this.edelta() * this.speedScl * Vars.state.rules.unitBuildSpeedMultiplier;
      this.progress += this.edelta() * Vars.state.rules.unitBuildSpeedMultiplier;
      this.speedScl = Mathf.lerpDelta(this.speedScl, 1, 0.05);
    }else{
      this.speedScl = Mathf.lerpDelta(this.speedScl, 0, 0.05);
    }

    // Java :327 `moveOutPayload()` —— payload 系统未移植（见文件头）。

    if(this.currentPlan !== -1){
      const plan = this.factory.plans.get(this.currentPlan)!;

      // Java :333-337 `plan.unit.isBanned()` —— ban 未移植 → 跳过。

      if(this.progress >= plan.time){
        this.progress %= 1;
        // Java :339-350 —— `UnitPayload` + 命令设置 + `createSound` + `consume()` + `UnitCreateEvent`
        //   payload/命令/音效不移植 → 单位**直接原地生成**（见文件头）。
        const unit = plan.unit.spawn(this.team, this.x, this.y);
        this.consume();
        Events.fire(new UnitCreateEvent(unit, this));
      }

      this.progress = Mathf.clamp(this.progress, 0, plan.time);
    }else{
      this.progress = 0;
    }
  }

  /** 对应 Java `shouldConsume()`（:351-354）。 */
  override shouldConsume(): boolean{
    if(this.currentPlan === -1) return false;
    // Java: `enabled && payload == null && team.activateUnitFactories();`
    //   payload 恒 null（无 payload 系统）；activateUnitFactories（TeamRule）未移植 → true。
    return this.enabled;
  }

  /** 对应 Java `getMaximumAccepted(Item)`（:358-359）。 */
  override getMaximumAccepted(item: Item): number{
    return Mathf.round(this.factory.capacities[item.id]! * Vars.state.rules.unitCostMultiplier);
  }

  /** 对应 Java `acceptItem(Building, Item)`（:361-364）。 */
  override acceptItem(source: Building, item: Item): boolean{
    return this.currentPlan !== -1
      && this.items.get(item) < this.getMaximumAccepted(item)
      && this.factory.plans.get(this.currentPlan)!.requirements.some(stack => stack.item === item);
  }
}
