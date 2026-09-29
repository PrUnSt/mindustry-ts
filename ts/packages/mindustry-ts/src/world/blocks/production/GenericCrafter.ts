// 源: core/src/mindustry/world/blocks/production/GenericCrafter.java (393 行)
//
// 移植范围（S5 工厂链）: `GenericCrafter` 的**方块级数据**（`outputItem` / `outputItems` /
//   `craftTime` / `warmupSpeed`）+ `init()` 的「`outputItem` → `outputItems`」回填 +
//   `outputsItems()`；`GenericCrafterBuild` 的**全部非渲染 tick 行为**：
//   `shouldConsume` / `updateTile` / `getProgressIncrease` / `warmupTarget` / `warmup` /
//   `totalProgress` / `scaleOutput` / `craft` / `dumpOutputs` / `progress` /
//   `getMaximumAccepted`。
//
// ⚠️ 本阶段**只**为「矿石 → 材料」闭环的**无电**工厂服务（`graphitePress`，
//   `Blocks.java:1041-1051`）。它**不声明** `consumePower` → `hasPower` 保持 false
//   → 完全不进电力图。耗电工厂（`siliconSmelter` / `kiln` / `melter` / `pulverizer` …）
//   留到下一阶段（电力由另一个 worker 并行做）。
//
// ⚠️ `Block.consumesPower` 默认已是 **true**（Java `Block.java:53` 就是这样）——
//   不要因为「graphitePress 不耗电」去改它；真正的闸门是 `block.consPower === null`
//   （`ConsumePower.apply` 是唯一把 `hasPower` 置 true 的地方）。
//
// 未移植（逐条标注，均为渲染 / 音效 / UI / 液体 / 逻辑传感器 / 存档 IO，计划 §9）:
//   - `drawer`（`DrawBlock`，`GenericCrafter.java:51`）+ `load()`（:112-117）+
//     `drawPlanRegion(BuildPlan, Eachable)`（:150-152）+ `icons()`（:154-157）+
//     `getRegionsToOutline(Seq)`（:164-167）—— 渲染层
//   - `GenericCrafterBuild.draw()`（:193-196）/ `drawLight()`（:198-202）—— 渲染层
//   - `craftEffect`（:42）/ `updateEffect`（:43）/ `updateEffectChance`（:44）/
//     `updateEffectSpread`（:45）+ `updateTile` 里的 `updateEffect.at(...)`（:251-253）+
//     `craft()` 里的 `craftEffect.at(x, y)`（:329-331）+ `wasVisible` 判据 —— 特效（`Fx` 不可观测）
//   - `setStats()`（:65-80）—— `Stat` / `StatValues` 目录未移植
//   - `setBars()`（:82-96）—— UI 进度条
//   - `rotatedOutput(int,int,Tile)`（:98-110）—— 液体管道朝向（`ConduitBuild` 未移植）
//   - `drawOverlay(float,float,int)`（:169-185）—— 渲染层
//   - `sense(LAccess)`（:354-360）—— 逻辑处理器传感器
//   - `shouldAmbientSound()`（:372-375）+ 构造器里的 `ambientSound = Sounds.loopMachine`
//     与 `ambientSoundVolume = 0.03f`（:58-60）—— 音效
//   - `write(Writes)` / `read(Reads, byte)`（:377-391）+ `legacyReadWarmup`（:47-49）—— 存档 IO
//   - `flags = EnumSet.of(BlockFlag.factory)`（:61）与 `drawArrow = false`（:62）
//     —— `BlockFlag` / 放置箭头未移植（与 `Drill.ts` 的 `BlockFlag.drill` 同一处置）
//   - **液体整支**: `outputLiquid` / `outputLiquids`（:30-33）/ `liquidOutputDirections`（:35）/
//     `dumpExtraLiquid`（:38）/ `ignoreLiquidFullness`（:39）/
//     `init()` 的液体回填（:125-132）/ `updateTile` 的连续产液（:244-249）/
//     `getProgressIncrease` 的液体限流（:275-283）/ `dumpOutputs` 的 `dumpLiquid`（:345-351）/
//     `shouldConsume` 的液体满槽判据（:214-231）
//   - 子类 `HeatCrafter` / `AttributeCrafter`（不在本文件，S5 未移植）
//
// ⚠️ 陷阱 #16 同型改名（**必须知道**，与 `Drill.progressRef` 同一处置）:
//   Java 允许 `GenericCrafterBuild` 里**字段** `progress` / `totalProgress` / `warmup`
//   （:188-190）与**方法** `progress()` / `totalProgress()` / `warmup()`（:362 / :298 / :293）
//   **同名共存**（字段与方法在不同命名空间）。TS 不允许（`TS2300`），且
//   `useDefineForClassFields: false` 会把带初值的字段编译成构造器赋值，**运行期实例属性
//   会直接吞掉原型上的同名方法** → `build.progress()` 变 TypeError。
//   处置沿用本仓库既有惯例（`Tile.blockRef` / `Router.unitRef` / `Drill.progressRef`）：
//   **保留公开 API 的三个方法名**（`Java BuildingComp` 也有同名的 `warmup()` /
//   `totalProgress()` / `progress()`，见 `BuildingComp.java:614/619/623`），
//   把**字段**分别改名为 `progressRef` / `totalProgressRef` / `warmupRef`。
//   语义无差别；这三个字段在 Java 里只被本类自身读写（唯一的跨类读者是未移植的
//   `sense(LAccess)` 与 `draw()`）。
//
// ⚠️ `delta()` / `edelta()` **不在** `BuildingComp` 里（生成文件不能 import `Time`,
//   见 `BuildingComp.def.ts` 的 `update()` 注释）→ 本类自己实现，照抄
//   `Conveyor.ts:106-114` 的写法。`timeScale` 是 `protected`，子类可访问。
//
// ⚠️ `outputAccumulator` 的分配时机相对 Java **推后**（唯一的一处结构性差异）:
//   Java 在**字段声明处**就按 `outputItems.length` 分配（:191），那时外层 `GenericCrafter`
//   的 `init()` 已跑完（建筑一定在 `content.init()` 之后才创建）→ 非 null。
//   TS 没有内部类，构造器里 `this.block` 尚未赋值（由 `create()` 写入），拿不到
//   `outputItems`。改为**惰性分配**——但 `craft()` 本来就有
//   `if(outputAccumulator == null || length != outputItems.length) 重新分配`（:313-315），
//   所以这只是把同一次分配从「构造期」挪到「首次 craft」，**不可观测**（初值同为全 0）。

import { Mathf, Time } from "@mindustry-ts/arc";
import { Building } from "../../../gen/Building.js";
import { Block } from "../../Block.js";
import { ItemModule } from "../../modules/ItemModule.js";
import type { Item } from "../../../type/Item.js";
import type { ItemStack } from "../../../type/ItemStack.js";

/** 对应 `mindustry.world.blocks.production.GenericCrafter.GenericCrafterBuild`。 */
export class GenericCrafterBuild extends Building{
  /**
   * 当前这一次合成的进度（0..1，≥1 触发 `craft()`）。
   * 对应 Java `public float progress`（:188）；改名原因见文件头。
   */
  progressRef = 0;
  /** 累计生产时间（Java 只被 `draw()` 用 —— 渲染已砍，但**保留**：它由 `updateTile` 维护，
   *  是 Java 的可观测状态之一）。对应 Java `public float totalProgress`（:189）。 */
  totalProgressRef = 0;
  /** 转速 / 效率平滑量（0..1）。对应 Java `public float warmup`（:190）。 */
  warmupRef = 0;

  /**
   * 产物小数累加器（`craft()` 用它把「每次 1 个」的产出摊成小数）。
   * 对应 Java `public @Nullable float[] outputAccumulator`（:191）；
   * 分配时机相对 Java 推后，理由见文件头。
   */
  outputAccumulator: number[] | null = null;

  /**
   * ⚠️ 必须显式声明 public 构造器（理由同 `ConveyorBuild` / `DrillBuild`：
   * `gen/Building.ts` 的构造器是 `protected`，不声明会 TS2674）。
   * `ItemModule` 的分配时机与 Java `BuildingComp.create()` 等价（生成文件不能 import 模块类），
   * 见 `Conveyor.ts` 文件头。
   */
  constructor(){
    super();
    this.items = new ItemModule();
  }

  /** Java 的 `GenericCrafterBuild` 是内部类，直接读外部 `GenericCrafter.this.xxx`；TS 显式取回。 */
  private get crafter(): GenericCrafter{
    return this.block as GenericCrafter;
  }

  /** 对应 Java `BuildingComp.delta()` = `Time.delta * timeScale`。⚠️ 实现位置见文件头。 */
  delta(): number{
    return Time.delta * this.timeScale;
  }

  /** 对应 Java `BuildingComp.edelta()` = `efficiency * delta()`。⚠️ 实现位置见文件头。 */
  edelta(): number{
    return this.efficiency * this.delta();
  }

  /**
   * 对应 Java `GenericCrafterBuild.shouldConsume()`（:204-234）: **产出缓冲满了就停产**。
   *
   * ⚠️ 这不是纯 UI 判断: `BuildingComp.updateConsumption()` 的慢路径
   * （`BuildingComp.def.ts:262`）把它与消费者效率一起算进 `update`，为假时
   * `efficiency` 与 `optionalEfficiency` **双双归零** → `updateTile` 走 `else` 支 → 停产。
   * ⚠️ `itemCapacity` 默认 **10**（`world/Block.ts:185`）。
   */
  override shouldConsume(): boolean{
    const outputs = this.crafter.outputItems;
    if(outputs !== null){
      for(const output of outputs){
        if(this.items.get(output.item) + this.scaleOutput(output.amount) > this.block.itemCapacity){
          return false;
        }
      }
    }

    // Java :214-231 的液体满槽判据（`outputLiquids` / `ignoreLiquidFullness` /
    // `dumpExtraLiquid`）—— 液体整支未移植，本阶段 `outputLiquids` 恒 null，
    // 该段恒不生效，故按计划 §9 不移植。

    return this.enabled;
  }

  /**
   * 对应 Java `GenericCrafterBuild.updateTile()`（:236-266）。逐行对照；
   * 未移植的两处（连续产液、updateEffect）已在原位注明。
   */
  override updateTile(): void{
    if(this.efficiency > 0){
      this.progressRef += this.getProgressIncrease(this.crafter.craftTime);
      this.warmupRef = Mathf.approachDelta(this.warmupRef, this.warmupTarget(), this.crafter.warmupSpeed);

      // Java :244-249 —— `outputLiquids` 的**连续**产液（`handleLiquid`）。液体整支未移植。
      // Java :251-253 —— `if(wasVisible && Mathf.chanceDelta(updateEffectChance)) updateEffect.at(...)`
      //   `Fx` 特效（渲染层，计划 §9 不移植）。
      //   ⚠️ 附带影响: Java 这一行会**消耗一次全局随机数**（`Mathf.chanceDelta` → `rand.chance`），
      //     本移植连同 `craft()` 的 `craftEffect` 一起省略（后者本来就不抽随机）→
      //     全局 RNG 流与 Java 不再逐步对齐。对确定性（两次同布景 → 同结果）无影响；
      //     与 Java 逐帧对拍时需补回这次抽取。
    }else{
      this.warmupRef = Mathf.approachDelta(this.warmupRef, 0, this.crafter.warmupSpeed);
    }

    // Java :258-259: `//TODO may look bad, revert to edelta() if so` + `totalProgress += warmup * Time.delta;`
    // ⚠️ 这里用的是 **`Time.delta`**（不是 `delta()`）—— 与 Java 逐字一致，`timeScale` 不参与。
    this.totalProgressRef += this.warmupRef * Time.delta;

    if(this.progressRef >= 1){
      this.craft();
    }

    this.dumpOutputs();
  }

  /**
   * 对应 Java `GenericCrafterBuild.getProgressIncrease(float)`（:268-287）。
   *
   * ⚠️ **纯物品工厂（`outputLiquids == null`）退化为 `1f / craftTime * edelta()`** ——
   *   这正是 `BuildingComp.getProgressIncrease(baseTime)`（`BuildingComp.java:1207-1209`）
   *   的原文。下面把 Java 的液体限流段**原样保留在注释里**，并说明它为何恒等于乘 1:
   *   ```java
   *   if(ignoreLiquidFullness) return super.getProgressIncrease(baseTime);   // :270-272
   *   float scaling = 1f, max = 1f;                                          // :275
   *   if(outputLiquids != null){                                             // :276
   *       max = 0f;
   *       for(var s : outputLiquids){
   *           float value = (liquidCapacity - liquids.get(s.liquid)) / (scaleOutput(s.amount) * edelta());
   *           scaling = Math.min(scaling, value);
   *           max = Math.max(max, value);
   *       }
   *   }
   *   return super.getProgressIncrease(baseTime) * (dumpExtraLiquid ? Math.min(max, 1f) : scaling); // :286
   *   ```
   *   本阶段 `outputLiquids` 恒 null → `scaling === 1f` 且 `max === 1f` →
   *   乘子 `Math.min(max, 1f) === 1f`；`ignoreLiquidFullness` 恒 false → 不提前返回。
   *   故退化式与 Java 在「无液体工厂」上**逐位一致**。
   *   移植液体时把注释里的代码落地即可（需要同时落地 `liquidCapacity` 与 `LiquidModule`）。
   */
  getProgressIncrease(baseTime: number): number{
    return (1 / baseTime) * this.edelta();
  }

  /** 对应 Java `warmupTarget()`（:289-291）: 恒 1。 */
  warmupTarget(): number{
    return 1;
  }

  /**
   * 对应 Java `GenericCrafterBuild.warmup()`（:293-296）。
   * ⚠️ 无 `override`：生成基类 `Building` 里**没有** `warmup()`
   * （Java 的实现在 `BuildingComp.java:614`，S4 未生成）→ 只能当新方法声明。
   * 与 Java 的差异仅限「类型层面」，数值语义完全一致。
   */
  warmup(): number{
    return this.warmupRef;
  }

  /** 对应 Java `totalProgress()`（:298-301）。⚠️ 无 `override`，理由同 `warmup()`。 */
  totalProgress(): number{
    return this.totalProgressRef;
  }

  /** 对应 Java `scaleOutput(float)`（:303-306）: 默认原样，子类（超频 / 属性加成）可覆写。 */
  scaleOutput(amount: number): number{
    return amount;
  }

  /**
   * 对应 Java `GenericCrafterBuild.craft()`（:308-333）。
   *
   * ⚠️⚠️ 第一行 `consume()` **绝不能省**（Java :309）: 它遍历 `block.consumers` 逐个
   * `Consume.trigger(build)`，`ConsumeItems.trigger` 才是**真正扣原料**的地方。
   * 省掉它 → 原料不扣、产物照出 = 无中生有刷资源（见 `world/consumers/Consume.ts` 文件头）。
   * 测试 `crafter.test.ts` 用「`craft()` 一次后 `items.get(coal)` 精确减少 2」钉住它。
   */
  craft(): void{
    this.consume();

    const outputs = this.crafter.outputItems;
    if(outputs !== null){
      // Java :312-315: 「instantiated here instead of created() because of outputItems runtime changes」
      if(this.outputAccumulator === null || this.outputAccumulator.length !== outputs.length){
        this.outputAccumulator = new Array<number>(outputs.length).fill(0);
      }

      for(let i = 0; i < outputs.length; i++){
        const output = outputs[i]!;

        this.outputAccumulator[i] += this.scaleOutput(output.amount);
        // Java `Mathf.floor(float)` → int（arc 的实现是 `(int)(x + BIG_ENOUGH_FLOOR) - BIG_ENOUGH_INT`，
        // 与 `Math.floor` 同值，见 `arc-ts/src/math/Mathf.ts:408`）
        const floored = Mathf.floor(this.outputAccumulator[i]!);
        this.outputAccumulator[i]! -= floored;

        for(let j = 0; j < floored; j++){
          this.offload(output.item);
        }
      }
    }

    // Java :329-331: `if(wasVisible) craftEffect.at(x, y);` —— 特效（渲染层，计划 §9 不移植）。

    this.progressRef %= 1;
  }

  /**
   * 对应 Java `GenericCrafterBuild.dumpOutputs()`（:335-352）。
   * ⚠️ `timer(timerDump, dumpTime / timeScale)`：`timerDump` 是 `Block` 的 `protected` 字段，
   *   从 `GenericCrafterBuild` 访问需经 `this.block`（生成文件里是 `any`），
   *   见 `Drill.ts:171-175` 的同一说明。`Block.dumpTime` 默认 5。
   */
  dumpOutputs(): void{
    const outputs = this.crafter.outputItems;
    if(outputs !== null && this.timer(this.block.timerDump, this.block.dumpTime / this.timeScale)){
      for(const output of outputs){
        const amount = Math.max(1, Mathf.round(this.scaleOutput(output.amount)));
        for(let i = 0; i < amount; i++){
          if(!this.dump(output.item)) break;
        }
      }
    }

    // Java :345-351 —— `dumpLiquid(outputLiquids[i].liquid, 2f, dir)`（液体整支未移植）。
  }

  /**
   * 对应 Java `GenericCrafterBuild.progress()`（:362-365）= `Mathf.clamp(progress)`。
   * ⚠️ 无 `override`，理由同 `warmup()`（`BuildingComp.java:623` 的基类实现未生成）。
   */
  progress(): number{
    return Mathf.clamp(this.progressRef);
  }

  /** 对应 Java `getMaximumAccepted(Item)`（:367-370）= `itemCapacity`。 */
  override getMaximumAccepted(_item: Item): number{
    return this.block.itemCapacity;
  }
}

/** 对应 `mindustry.world.blocks.production.GenericCrafter`。 */
export class GenericCrafter extends Block{
  /** 单产物（Java `public @Nullable ItemStack outputItem`，:26）。`init()` 会把它写进 `outputItems`。 */
  outputItem: ItemStack | null = null;
  /** 产物表（Java `public @Nullable ItemStack[] outputItems`，:28）。**覆盖** `outputItem`。 */
  outputItems: ItemStack[] | null = null;

  /** 一次合成需要的帧数。Java 默认 80（:41）；`graphitePress` 是 90（`Blocks.java:1046`）。 */
  craftTime = 80;
  /** 转速趋近目标的速度。Java 默认 0.019f（:46）。 */
  warmupSpeed = 0.019;

  constructor(name: string){
    super(name);
    // Java :54-62: `update = true; solid = true; hasItems = true; sync = true;`
    this.update = true;
    this.solid = true;
    this.hasItems = true;
    this.sync = true;
    // Java :58-60: `ambientSound = Sounds.loopMachine; ambientSoundVolume = 0.03f;` —— 音效（计划 §9）。
    // Java :61: `flags = EnumSet.of(BlockFlag.factory);` —— `BlockFlag` 未移植。
    // Java :62: `drawArrow = false;` —— 放置箭头（渲染 / 建造计划层，计划 §9）。

    // 陷阱 #6：显式注册建筑工厂
    this.buildType = () => new GenericCrafterBuild();
  }

  /**
   * 对应 Java `GenericCrafter.init()`（:119-138）。
   *
   * ⚠️ 顺序与 Java 一致: **先**回填 `outputItems`（并据此置 `hasItems`），**再**调
   * `super.init()` —— 因为 `super.init()` 会固化 `consumers` 数组并跑 `Consume.apply(this)`。
   *
   * ⚠️ 测试注意事项: `Block.init()` 是 `hasConsumers` 的唯一赋值点
   * （`world/Block.ts:791-795`）。不调 `init()` → `hasConsumers === false` →
   * `updateConsumption()` 走**快路径**，原料不足**不会**拉低 `efficiency`
   * → 工厂会「无中生有」。所以自建实例在放置**之前**必须 `init()`。
   */
  override init(): void{
    if(this.outputItems === null && this.outputItem !== null){
      this.outputItems = [this.outputItem];
    }

    // Java :125-132 —— `outputLiquids` 的回填与 `outputsLiquid = outputLiquids != null`；
    // 液体整支未移植（TS `Block` 也没有 `outputsLiquid` 字段）。

    if(this.outputItems !== null) this.hasItems = true;
    // Java :135: `if(outputLiquids != null) hasLiquids = true;` —— 液体未移植。

    super.init();
  }

  /**
   * 对应 Java `afterPatch()`（:140-147）—— 模组热重载后的二次回填。
   * 未移植（TS 无 `@Patch` / 热重载机制）。
   */

  /** 对应 Java `outputsItems()`（:159-162）= `outputItems != null`。 */
  override outputsItems(): boolean{
    return this.outputItems !== null;
  }

  // Java :65-80 `setStats()` —— `Stat` / `StatValues` 未移植（计划 §9）。
  // Java :82-96 `setBars()` —— UI（计划 §9）。
  // Java :98-110 `rotatedOutput(int,int,Tile)` —— 液体管道朝向（计划 §9）。
  // Java :112-117 `load()` / :150-152 `drawPlanRegion` / :154-157 `icons()` /
  //      :164-167 `getRegionsToOutline` / :169-185 `drawOverlay` —— 渲染层（计划 §9）。
}
