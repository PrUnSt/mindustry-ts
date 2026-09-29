// 源: core/src/mindustry/world/blocks/power/SolarGenerator.java (36 行)
//
// 移植范围: 构造器 + `SolarGeneratorBuild.updateTile()`。
//
// ❌ 未移植（逐条标注 Java 行号，计划 §9）:
//   - `setStats()`（:18-23）—— `Stat` / `StatUnit` 未移植（它只是把
//     `generationType` 这一行删掉再按 `powerProduction * 60` 重加，纯 UI）。
//   - `flags = EnumSet.of()`（:14）—— `BlockFlag` 未移植。
//     ⚠️ 语义: 太阳能板**不**带 `BlockFlag.generator`，因此敌方单位把它当低优先级目标。
//   - `Attribute.light.env()`（:30-31）—— `Attribute.env()`（`Attribute.java` 读
//     `state.envAttributes`）在 TS 侧未移植 → 本实现按 **0** 处理并保留 TODO。
//     ⚠️ 影响: 在「无环境属性」的地图上（本阶段全部测试地图）Java 也得到 0
//     （`Attributes` 全 0），故与 Java 同值；一旦移植 `envAttributes` 必须补回这一项。
//
// ⚠️ 在默认规则下（`rules.lighting === false`、`rules.solarMultiplier === 1`、
//   `Attribute.light.env() === 0`）本实现退化为:
//     `productionEfficiency = enabled ? 1 * maxZero(0 + 1) = 1 : 0`
//   → `getPowerProduction() === powerProduction`（`solar-panel` 是 0.12）。

import { Mathf } from "@mindustry-ts/arc";
import { Vars } from "../../../Vars.js";
import { Env } from "../../meta/Env.js";
import { PowerGenerator, PowerGeneratorBuild } from "./PowerGenerator.js";

/** 对应 `mindustry.world.blocks.power.SolarGenerator.SolarGeneratorBuild`（Java :25-35）。 */
export class SolarGeneratorBuild extends PowerGeneratorBuild{
  constructor(){
    super();
  }

  /** 对应 Java `updateTile()`（:26-34）。 */
  override updateTile(): void{
    const rules = Vars.state.rules;
    // TODO(S6): `Attribute.light.env()` —— `state.envAttributes` 未移植，恒 0（见文件头）。
    const lightEnv = 0;
    this.productionEfficiency = this.enabled
      ? rules.solarMultiplier * Mathf.maxZero(lightEnv + (rules.lighting ? 1 - rules.ambientLight.a : 1))
      : 0;
  }
}

/** 对应 `mindustry.world.blocks.power.SolarGenerator`。 */
export class SolarGenerator extends PowerGenerator{
  /** 对应 Java `SolarGenerator(String name)`（:11-16）。 */
  constructor(name: string){
    super(name);
    // remove the BlockFlag.generator flag to make this a lower priority target than other generators.
    // （`BlockFlag` 未移植，见文件头）
    this.envEnabled = Env.any;

    // 陷阱 #6：覆盖父类注册的 `PowerGeneratorBuild`
    this.buildType = () => new SolarGeneratorBuild();
  }
}
