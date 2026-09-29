// 源: core/src/mindustry/world/blocks/power/ConsumeGenerator.java (174 行)
//
// 移植范围: `itemDuration` / `warmupSpeed` / `itemDurationMultipliers` / `filterItem` +
//   `init()` 的消费者回查 + `ConsumeGeneratorBuild` 的**全部非渲染 tick 行为**
//   （`updateEfficiencyMultiplier` / `updateTile` / `consumeTriggerValid` / `warmup` /
//   `totalProgress`）。
//
// ❌ 砍渲染 / 音效 / UI / 液体 / 存档（逐条标注 Java 行号，计划 §9）:
//   - `effectChance`（:22）/ `generateEffect` / `consumeEffect`（:23）/ `generateEffectRange`（:24）
//     + `updateTile` 里的 `generateEffect.at(...)`（:120-122）与 `consumeEffect.at(...)`（:132）
//     —— 特效层。⚠️ 附带影响: `Mathf.chanceDelta(effectChance)`（:120）在 Java 里**每 tick
//     消耗一次全局随机数**，本移植连同它一起省略 → 全局 RNG 流与 Java 不再逐步对齐。
//     对「两次同布景 → 同结果」的确定性无影响；与 Java 逐帧对拍时需补回这次抽取。
//   - `baseLightRadius`（:25）**保留**（它只是 `init()` 里 `lightRadius` 的乘数，
//     `Block.emitLight` / `Block.lightRadius` 在 TS 侧是已存在的字段，写入无副作用）。
//   - `outputLiquid`（:27）/ `explodeOnFull`（:29）+ `init()` 的 `:59-66` +
//     `updateTile` 的 `:136-145`（产液 / 满液爆炸 / `GeneratorPressureExplodeEvent`）
//     —— 液体整支 + `LiquidStack` / `Events` 未移植。
//   - `filterLiquid`（:32）与 `ConsumeLiquidFilter` —— 液体消费者未移植，
//     故 `updateEfficiencyMultiplier()` 的液体分支（:104-106）一并省略。
//   - `setStats()`（:82-93）/ `setBars()`（:40-47）—— UI / `Stat` 未移植。
//   - `afterPatch()`（:73-80）—— 模组热重载（TS 无 `@Patch` 机制）。
//   - `drawLight()`（:166-172）—— 渲染层。
//   - `ConsumeItemEfficiency` 的 `display(Stats)` —— UI。
//
// ⚠️ `filterItem` 的回查与 Java 的一处**被迫差异**（不静默放过）:
//   Java `init()`（:51）用 `Block.findConsumer(c -> c instanceof ConsumeItemFilter)`。
//   TS 的 `world/Block.ts` **没有** `findConsumer`（Java `Block.java:1125-1127` 未移植），
//   且 `Block.ts` 属冻结面 → 本类自带 `findConsumer()`（语义相同：先查 `consumeBuilder`，
//   那是 `Block.init()` 固化 `consumers` 之前的唯一来源，与 Java 在 `super.init()` **之前**
//   调用的时机一致）。
//
// ⚠️ `itemDurationMultipliers` 的归属与 Java 不同（**有意**）:
//   Java 把该字段放在中间类 `ConsumeItemEfficiency`（`ConsumeItemEfficiency.java:9`），
//   且 `init()` 只在 `filterItem instanceof ConsumeItemEfficiency` 时赋值（:55-57）。
//   TS 侧**不新建** `ConsumeItemEfficiency`（文件所有权限制），故字段下沉到
//   `ConsumeItemFilter`，这里无条件赋值。差异不可观测：`updateTile`（:125）判据是
//   `itemDurationMultipliers.size > 0`，空 map 与 null 同样不触发。

import { Mathf, ObjectMap, Time } from "@mindustry-ts/arc";
import type { Item } from "../../../type/Item.js";
import type { Consume } from "../../consumers/Consume.js";
import { ConsumeItemFilter } from "../../consumers/ConsumeItemFilter.js";
import { ItemModule } from "../../modules/ItemModule.js";
import { PowerGenerator, PowerGeneratorBuild } from "./PowerGenerator.js";

/** 对应 `mindustry.world.blocks.power.ConsumeGenerator.ConsumeGeneratorBuild`（Java :96-173）。 */
export class ConsumeGeneratorBuild extends PowerGeneratorBuild{
  /**
   * Java `public float warmup`（:97）。
   * ⚠️ 改名 `warmupRef`：Java 允许字段 `warmup` 与方法 `warmup()`（:157-160）同名共存，
   *    TS 不允许（TS2300），且 `useDefineForClassFields: false` 会让运行期实例属性
   *    **吞掉**原型上的同名方法 → `build.warmup()` 变 TypeError。
   *    与 `GenericCrafterBuild.warmupRef` / `Drill.progressRef` 同一处置。
   */
  warmupRef = 0;
  /** Java `public float totalTime`（:97）。 */
  totalTime = 0;
  /** Java `public float efficiencyMultiplier = 1f`（:97）—— 燃料品质。 */
  efficiencyMultiplier = 1;
  /** Java `public float itemDurationMultiplier = 1`（:97）—— 单件燃料的时长倍率。 */
  itemDurationMultiplier = 1;

  /**
   * ⚠️ 必须显式声明 public 构造器（`gen/Building.ts` 的构造器是 `protected`，不声明会 TS2674）。
   *
   * `ItemModule` 的分配对应 Java `BuildingComp.create()` 的
   * `if(block.hasItems) items = new ItemModule();`（`BuildingComp.java:151`）。
   * ⚠️ 这里是**无条件**分配：TS 生成基类不能 import `ItemModule`，且构造器里
   *   `this.block` 尚未赋值（由 `create()` 写入），拿不到 `block.hasItems`。
   *   不可观测：`ConsumeGenerator` 必带 `ConsumeItemFilter`（其 `apply` 置 `hasItems`），
   *   且 `updateTile` 的扣料判据本来就有 `block.hasItems &&` 前缀。
   *   与 `GenericCrafterBuild` / `ConveyorBuild` 的同一处置。
   */
  constructor(){
    super();
    this.items = new ItemModule();
  }

  /** Java 的 `ConsumeGeneratorBuild` 是内部类，直接读外部 `ConsumeGenerator.this.xxx`；TS 显式取回。 */
  private get consumeGenerator(): ConsumeGenerator{
    return this.block as ConsumeGenerator;
  }

  /** 对应 Java `updateEfficiencyMultiplier()`（:99-108）。⚠️ Java 不调 super。 */
  override updateEfficiencyMultiplier(): void{
    const gen = this.consumeGenerator;
    if(gen.filterItem !== null){
      const m = gen.filterItem.efficiencyMultiplier(this);
      if(m > 0) this.efficiencyMultiplier = m;
    }
    // Java :104-106 的 `filterLiquid` 分支 —— 液体未移植（见文件头）。
  }

  /**
   * 对应 Java `updateTile()`（:110-149）。
   *
   * 产电链（Java 原文）:
   * ```
   * valid = efficiency > 0
   * warmup = Mathf.lerpDelta(warmup, valid ? 1 : 0, warmupSpeed)
   * productionEfficiency = efficiency * efficiencyMultiplier     // ★
   * totalTime += warmup * Time.delta
   * if(hasItems && valid && generateTime <= 0f){ consume(); generateTime = 1f; }
   * generateTime -= delta() / (itemDuration * itemDurationMultiplier);
   * ```
   */
  override updateTile(): void{
    const gen = this.consumeGenerator;
    const valid = this.efficiency > 0;

    this.warmupRef = Mathf.lerpDelta(this.warmupRef, valid ? 1 : 0, gen.warmupSpeed);
    this.productionEfficiency = this.efficiency * this.efficiencyMultiplier;
    this.totalTime += this.warmupRef * Time.delta;

    // Java :120-122 —— `generateEffect.at(...)`（特效，渲染层；⚠️ 它每 tick 消耗一次 Mathf.rand）

    // make sure the multiplier doesn't change when there is nothing to consume while it's still running
    if(gen.filterItem !== null && valid && gen.itemDurationMultipliers.size > 0){
      const consumed = gen.filterItem.getConsumed(this);
      if(consumed !== null){
        this.itemDurationMultiplier = gen.itemDurationMultipliers.get(consumed, 1);
      }
    }

    // take in items periodically
    if(this.block.hasItems && valid && this.generateTime <= 0){
      this.consume();
      // Java :132 —— `consumeEffect.at(...)`（特效，渲染层）
      this.generateTime = 1;
    }

    // Java :136-145 —— `outputLiquid` 的产液 / 满液爆炸（液体整支未移植，见文件头）

    // generation time always goes down, but only at the end so consumeTriggerValid doesn't assume fake items
    this.generateTime -= this.delta() / (gen.itemDuration * this.itemDurationMultiplier);
  }

  /** 对应 Java `consumeTriggerValid()`（:151-154）。 */
  override consumeTriggerValid(): boolean{
    return this.generateTime > 0;
  }

  /** 对应 Java `warmup()`（:156-160）。 */
  override warmup(): number{
    return this.warmupRef;
  }

  /** 对应 Java `totalProgress()`（:161-164）。⚠️ 生成基类没有它 → 新方法声明。 */
  totalProgress(): number{
    return this.totalTime;
  }
}

/** 对应 `mindustry.world.blocks.power.ConsumeGenerator`。 */
export class ConsumeGenerator extends PowerGenerator{
  /** Java `public float itemDuration = 120f`（:19）：一件燃料能发多少 tick 的电。 */
  itemDuration = 120;
  /** Java `public float warmupSpeed = 0.05f`（:21）。 */
  warmupSpeed = 0.05;
  /** Java `public float baseLightRadius = 65f`（:25）—— `init()` 里乘 `size` 写进 `lightRadius`。 */
  baseLightRadius = 65;

  /** Java `public @Nullable ConsumeItemFilter filterItem`（:31）：由 `init()` 从消费者里回查。 */
  filterItem: ConsumeItemFilter | null = null;

  /**
   * Java `public ObjectFloatMap<Item> itemDurationMultipliers = new ObjectFloatMap<>()`（:34）。
   * ⚠️ arc-ts 无 `ObjectFloatMap`，用 `ObjectMap<Item, number>`（键语义相同）。
   */
  itemDurationMultipliers = new ObjectMap<Item, number>();

  constructor(name: string){
    super(name);
    // 陷阱 #6：覆盖父类注册的 `PowerGeneratorBuild`
    this.buildType = () => new ConsumeGeneratorBuild();
  }

  /**
   * `Block.findConsumer(Boolf<Consume>)`（Java `Block.java:1125-1127`）的本地等价物。
   * ⚠️ TS `Block` 无此方法且 `Block.ts` 属冻结面 → 在本类自带（理由见文件头）。
   * 与 Java 一样在 `super.init()` **之前**调用，故查的是 `consumeBuilder`。
   */
  private findConsumer<T extends Consume>(pred: (c: Consume) => boolean): T | null{
    for(const c of this.consumeBuilder){
      if(pred(c)) return c as T;
    }
    return null;
  }

  /** 对应 Java `init()`（:49-71）。 */
  override init(): void{
    this.filterItem = this.findConsumer<ConsumeItemFilter>(c => c instanceof ConsumeItemFilter);
    // Java :52 `filterLiquid = findConsumer(...)` —— 液体未移植（见文件头）。

    // pass along the duration multipliers to the consumer, so it can display them properly
    if(this.filterItem !== null) this.filterItem.itemDurationMultipliers = this.itemDurationMultipliers;

    // Java :59-62 —— `outputLiquid != null` 时置 `outputsLiquid` / `hasLiquids`（液体未移植）
    // Java :64-66 —— `explodeOnFull` 时回填 `explosionPuddleLiquid`（液体未移植）

    this.emitLight = true;
    this.lightRadius = this.baseLightRadius * this.size;

    super.init();
  }
}
