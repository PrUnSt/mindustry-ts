// 源: core/src/mindustry/world/blocks/power/ThermalGenerator.java (130 行)
//
// 移植范围: 方块字段（`attribute` / `minEfficiency` / `displayEfficiencyScale` / ...）+
//   `getDisplayedPowerProduction` + `sumAttribute` + `canPlaceOn` + `ThermalGeneratorBuild`
//   的 `sum` / `updateTile` / `onProximityAdded`。
//
// ⚠️ 产电公式（Java :76-90）:
//   `productionEfficiency = sum + attribute.env()`
//   `sum = sumAttribute(attribute, tile.x, tile.y)` = **覆盖地板的热属性总和**
//   （`onProximityAdded` 时算一次；邻居变化会重新触发 `onProximityAdded`）。
//   `getPowerProduction()` 继承 `PowerGeneratorBuild` = `powerProduction * productionEfficiency`。
//   `Attribute.env()` → TS 恒 0（无行星环境附加值，见 `Attribute.ts`）。
//
// ⚠️ 与 Java 的差异（写清）:
//   - `outputLiquid`（:14，`LiquidStack`）—— 液体系统未移植 → 恒 null；
//     故 `init()` 的 `outputsLiquid`/`hasLiquids` 分支与 `updateTile` 的产液分支都不触发。
//   - `generateEffect`（Fx）/ `drawLight` / `drawPlace` / `setStats` / `afterPatch` / `totalProgress`
//     （:9-10, 40-67, 91-117）—— 渲染 / UI / 音效（计划 §9）。
//
// ⚠️ 测试注意: 热属性来自 `Floor.attributes`（`Block.attributes`），普通空气/石地无热 →
//   产电 0。要测它需放一张带 `Attribute.heat` 的自定义地板（见 `power.test.ts` ⑫）。

import { Vars } from "../../../Vars.js";
import { Attribute } from "../../meta/Attribute.js";
import { PowerGenerator, PowerGeneratorBuild } from "./PowerGenerator.js";
import type { Tile } from "../../Tile.js";
import type { Team } from "../../../game/Team.js";

/** 对应 `mindustry.world.blocks.power.ThermalGenerator`。 */
export class ThermalGenerator extends PowerGenerator{
  /** Java `public float effectChance = 0.05f`（:10）—— 渲染层，仅留值。 */
  effectChance = 0.05;
  /** Java `public float minEfficiency = 0f`（:11）—— `canPlaceOn` 的热量下限。 */
  minEfficiency = 0;
  /** Java `public float displayEfficiencyScale = 1f`（:12）—— UI 显示缩放。 */
  displayEfficiencyScale = 1;
  /** Java `public boolean displayEfficiency = true`（:13）—— UI。 */
  displayEfficiency = true;
  /** Java `public @Nullable LiquidStack outputLiquid`（:14）—— 液体系统未移植 → 恒 null。 */
  outputLiquid: null = null;
  /** Java `public Attribute attribute = Attribute.heat`（:16）。 */
  attribute: Attribute = Attribute.heat;

  /** 对应 Java `ThermalGenerator(String name)`（:18-21）。 */
  constructor(name: string){
    super(name);
    this.noUpdateDisabled = true;
    // 陷阱 #6：显式注册建筑工厂
    this.buildType = () => new ThermalGeneratorBuild();
  }

  /** 对应 Java `getDisplayedPowerProduction()`（:23-25）。 */
  override getDisplayedPowerProduction(): number{
    return this.powerProduction / this.displayEfficiencyScale;
  }

  /** 对应 Java `init()`（:27-38）。`outputLiquid` 恒 null → 两条 outputsLiquid/hasLiquids 分支不触发。 */
  override init(): void{
    super.init();
  }

  /** 对应 Java `sumAttribute(Attribute, int, int)`（`Block.java:582-588`）。 */
  sumAttribute(attr: Attribute, x: number, y: number): number{
    const tile = Vars.world.tile(x, y);
    if(tile === null) return 0;
    let sum = 0;
    tile.getLinkedTilesAs(this, (other) => {
      // Java: `!floating && !placeableLiquid && other.floor().isDeep() ? 0 : other.floor().attributes.get(attr)`
      if(this.floating || this.placeableLiquid || !other.floor().isDeep()){
        sum += other.floor().attributes.get(attr);
      }
    });
    return sum;
  }

  /** 对应 Java `canPlaceOn(Tile, Team, int)`（:68-71）—— 脚下必须有热量。 */
  override canPlaceOn(tile: Tile, _team: Team, _rotation: number): boolean{
    return this.sumAttribute(this.attribute, tile.x, tile.y) > this.minEfficiency;
  }
}

/** 对应 Java `ThermalGenerator.ThermalGeneratorBuild`（:73-129）。 */
export class ThermalGeneratorBuild extends PowerGeneratorBuild{
  /** Java `public float sum`（:74）—— 上次 `onProximityAdded` 时算的热量总和。 */
  sum = 0;

  /** Java 的 `ThermalGeneratorBuild` 是内部类，直接读外部 `ThermalGenerator.this.xxx`；TS 显式取回。 */
  private get thermal(): ThermalGenerator{
    return this.block as ThermalGenerator;
  }

  /** 对应 Java `updateTile()`（:76-90）。 */
  override updateTile(): void{
    this.productionEfficiency = this.sum + this.thermal.attribute.env();
    // Java :81-84 —— `generateEffect.at(...)` 特效（渲染层，会抽一次全局随机数；
    //   与 GenericCrafter 的 `updateEffect` 同一处置：省略，RNG 流与 Java 不再逐步对齐）。
    // Java :86-90 —— `outputLiquid` 产液（液体系统未移植，outputLiquid 恒 null → 不触发）。
  }

  /** 对应 Java `onProximityAdded()`（:119-123）—— 邻居/自身变化时重算热量总和。 */
  override onProximityAdded(): void{
    super.onProximityAdded();
    this.sum = this.thermal.sumAttribute(this.thermal.attribute, this.tile.x, this.tile.y);
  }
}
