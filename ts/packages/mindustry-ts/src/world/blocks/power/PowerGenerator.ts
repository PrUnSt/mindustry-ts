// 源: core/src/mindustry/world/blocks/power/PowerGenerator.java (233 行)
//
// 移植范围: `powerProduction` 字段 + 构造器的 `sync` / `baseExplosiveness` +
//   `outputsItems()` + `GeneratorBuild` 的**全部非渲染 tick 行为**
//   （`generateTime` / `productionEfficiency` / `warmup()` / `getPowerProduction()`）。
//
// ❌ 砍渲染 / 音效 / UI / 存档 / 爆炸（逐条标注 Java 行号，计划 §9）:
//   - `drawer = new DrawDefault()`（:31）+ `load()`（:73-77）+ `icons()`（:68-71）+
//     `drawPlanRegion(BuildPlan, Eachable)`（:98-101）—— 渲染层
//   - `GeneratorBuild.draw()`（:113-116）/ `drawLight()`（:196-200）—— 渲染层
//   - `generationType = Stat.basePowerGeneration`（:30）+ `setStats()`（:79-83）—— `Stat` 未移植
//   - `setBars()`（:85-96）—— UI 进度条
//   - `ambientVolume()`（:202-205）+ 构造器的 `flags = EnumSet.of(BlockFlag.generator)`（:61）
//     —— 音效 / `BlockFlag` 未移植（与 `Drill.ts` 的 `BlockFlag.drill` 同一处置）
//   - **整条爆炸链**: `explosionRadius/Damage`（:33-34）/ `explodeEffect`/`explodeSound`
//     （:35-36）/ `explosionPuddles*`（:38-41）/ `explosionMinWarmup`（:42）/
//     `explosionShake*`（:44）/ `explosionBreaksProps`（:45）/ `explosionScorchSize`（:47）/
//     `explosionIgnitionChance`（:49）/ `explosionScaleIgnitionChance`（:51）/
//     `explosionSpeed`（:53）/ `explosionFireballs`（:55）+
//     `onDestroyed()`（:123-130）/ `shouldExplode()`（:132-134）/
//     `createExplosion()`（:136-140）/ `onExplosion()`（:142-194）
//     —— 伤害 / `Fx` / `Sounds` / `Fires` / `Puddles` / `Effect.shake` 全未移植
//   - `version()` / `write(Writes)` / `read(Reads, byte)`（:212-231）—— 存档 IO
//
// ⚠️ `getPowerProduction()`（Java :207-210）是电力系统**唯一**的产电入口:
//   `PowerGraph.getPowerProduced()`（PowerGraph.java:100）逐 tick 调它。
//   `enabled ? powerProduction * productionEfficiency : 0f` —— 关掉的发电机产 0。

import { Time } from "@mindustry-ts/arc";
import { Building } from "../../../gen/Building.js";
import { PowerDistributor } from "./PowerDistributor.js";

/** 对应 `mindustry.world.blocks.power.PowerGenerator.GeneratorBuild`（Java :108-232）。 */
export class PowerGeneratorBuild extends Building{
  /** Java `public float generateTime`（:109）。由 `ConsumeGeneratorBuild` 驱动。 */
  generateTime = 0;
  /** Java `public float productionEfficiency = 0.0f`（:111）。1.0 = 100%。 */
  productionEfficiency = 0;

  /**
   * ⚠️ 必须显式声明 public 构造器（`gen/Building.ts` 的构造器是 `protected`，不声明会 TS2674）。
   * 理由同 `ConveyorBuild` / `GenericCrafterBuild`。
   */
  constructor(){
    super();
  }

  /** Java 的 `GeneratorBuild` 是内部类，直接读外部 `PowerGenerator.this.xxx`；TS 显式取回。 */
  protected get generator(): PowerGenerator{
    return this.block as PowerGenerator;
  }

  /** 对应 Java `BuildingComp.delta()` = `Time.delta * timeScale`。⚠️ 生成基类没有它（详见 `PowerGraph.ts` 文件头）。 */
  delta(): number{
    return Time.delta * this.timeScale;
  }

  /**
   * 对应 Java `GeneratorBuild.warmup()`（:118-121）。
   * ⚠️ 无 `override`：生成基类 `Building` 里**没有** `warmup()`
   * （Java 的实现在 `BuildingComp.java:614`，S4 未生成）→ 只能当新方法声明。
   * 与 `GenericCrafterBuild.warmup()` 同一处置。
   */
  warmup(): number{
    return this.enabled ? this.productionEfficiency : 0;
  }

  /** 对应 Java `getPowerProduction()`（:207-210）。 */
  override getPowerProduction(): number{
    return this.enabled ? this.generator.powerProduction * this.productionEfficiency : 0;
  }
}

/** 对应 `mindustry.world.blocks.power.PowerGenerator`。 */
export class PowerGenerator extends PowerDistributor{
  /** Java `public float powerProduction`（:29）：效率 1.0 时每 tick 的产电量。 */
  powerProduction = 0;

  /** 对应 Java `PowerGenerator(String name)`（:57-62）。 */
  constructor(name: string){
    super(name);
    this.sync = true;
    this.baseExplosiveness = 5;
    // Java :61 `flags = EnumSet.of(BlockFlag.generator);` —— `BlockFlag` 未移植（见文件头）。

    // 陷阱 #6：显式注册建筑工厂（子类在自己的构造器里覆盖成自己的 Build 类）
    this.buildType = () => new PowerGeneratorBuild();
  }

  /** 对应 Java `getDisplayedPowerProduction()`（:64-66）。 */
  getDisplayedPowerProduction(): number{
    return this.powerProduction;
  }

  /** 对应 Java `outputsItems()`（:103-106）：发电机恒不输出物品。 */
  override outputsItems(): boolean{
    return false;
  }
}
