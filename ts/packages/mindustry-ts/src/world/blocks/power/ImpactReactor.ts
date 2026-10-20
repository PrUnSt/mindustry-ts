// 源: core/src/mindustry/world/blocks/power/ImpactReactor.java (145 行)
//
// 移植范围: `warmupSpeed` / `itemDuration` + `ImpactReactorBuild` 的暖机/产电/烧料循环。
//   `productionEfficiency = warmup^5`；暖机条件 = 效率近满 + 电网状态近满。
//
// ⚠️ 与 Java 的差异（写清）:
//   - `drawer` / `drawPlasma` / `setBars` / `setStats` / `statWarmup` —— 渲染/UI。
//   - `Events.fire(Trigger.impactPower)` —— Trigger 未移植，跳过。
//   - `consPower` 的自耗电（输出 == 消耗）：`PowerGraph.add()` 会把 impactReactor
//     同时归入 producers + consumers（Java 同）。见 Blocks 注册的 `consumePower(25f)`。
//
// ⚠️ 暖机门槛 `efficiency >= 0.9999f && power.status >= 0.99f`：需要原料（blastCompound）
//   且电网有电（`power.status` 高）—— impactReactor 是**自耗电**方（outputsPower &&
//   consumesPower），PowerGraph 会让它先自足再外送。

import { Mathf, Time } from "@mindustry-ts/arc";
import { PowerGenerator, PowerGeneratorBuild } from "./PowerGenerator.js";
import { ItemModule } from "../../modules/ItemModule.js";
import { LiquidModule } from "../../modules/LiquidModule.js";

/** 对应 `mindustry.world.blocks.power.ImpactReactor`。 */
export class ImpactReactor extends PowerGenerator{
  /** Java `warmupSpeed = 0.001f`（:12）。 */
  warmupSpeed = 0.001;
  /** Java `itemDuration = 60f`（:13）—— 每 60 tick 烧一件。 */
  itemDuration = 60;
  /** 烧料定时器槽位（Java `timerUse = timers++`）。 */
  readonly timerUse: number = this.timers++;

  /** 对应 Java `ImpactReactor(String name)`（:15-35）。 */
  constructor(name: string){
    super(name);
    this.hasPower = true;
    this.hasLiquids = true;
    this.liquidCapacity = 30;
    this.hasItems = true;
    this.outputsPower = true;
    this.consumesPower = true;
    this.envEnabled = 0xffffffff; // Env.any —— 避免 import Env（见 Block.ts 的 Env.any 语义）
    // 爆炸参数（explosionShake/Damage/...）—— 爆炸链未移植，跳过。

    // 陷阱 #6：显式注册建筑工厂
    this.buildType = () => new ImpactReactorBuild();
  }
}

/** 对应 Java `ImpactReactor.ImpactReactorBuild`（:79-144）。 */
export class ImpactReactorBuild extends PowerGeneratorBuild{
  /** Java `public float warmup`（:81）。⚠️ 陷阱 #16：与方法 `warmup()` 同名
   * （Java 允许字段与方法同名，TS 不允许）→ 字段改名 `warmupRef`，保留公开方法名。 */
  warmupRef = 0;
  /** Java `public float totalProgress`（:81）。 */
  totalProgress = 0;

  /** ⚠️ 必须显式声明 public 构造器。items/liquids 由具象建筑分配。 */
  constructor(){
    super();
    this.items = new ItemModule();
    this.liquids = new LiquidModule();
  }

  /** Java 的 `ImpactReactorBuild` 是内部类，直接读外部 `ImpactReactor.this.xxx`；TS 显式取回。 */
  private get reactor(): ImpactReactor{
    return this.block as ImpactReactor;
  }

  /** 对应 Java `updateTile()`（:83-104）。 */
  override updateTile(): void{
    if(this.efficiency >= 0.9999 && this.power.status >= 0.99){
      const prevOut = this.block.consPower !== null && this.getPowerProduction() <= this.block.consPower.requestedPower(this);

      this.warmupRef = Mathf.lerpDelta(this.warmupRef, 1, this.reactor.warmupSpeed * this.timeScale);
      if(Mathf.equal(this.warmupRef, 1, 0.001)){
        this.warmupRef = 1;
      }

      // Java: `if(!prevOut && consPower != null && (getPowerProduction() > consPower.requestedPower(this))) Events.fire(Trigger.impactPower);`

      if(this.timer(this.reactor.timerUse, this.reactor.itemDuration / this.timeScale)){
        this.consume();
      }
    }else{
      this.warmupRef = Mathf.lerpDelta(this.warmupRef, 0, 0.01);
    }

    this.totalProgress += this.warmupRef * Time.delta;
    this.productionEfficiency = Mathf.pow(this.warmupRef, 5);
  }

  /** 对应 Java `warmup()`（:106-108）。 */
  override warmup(): number{
    return this.warmupRef;
  }
}
