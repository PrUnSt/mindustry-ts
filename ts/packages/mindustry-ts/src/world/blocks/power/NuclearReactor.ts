// 源: core/src/mindustry/world/blocks/power/NuclearReactor.java (214 行)
//
// 移植范围: 方块字段 + `NuclearReactorBuild` 的**热循环**（自包含，不依赖 HeatConductor）:
//   产热（fullness * heating）、烧燃料（timer 间隔 consume）、冷却液降温、过热爆掉。
//
// ⚠️ 与 Java 的差异（写清）:
//   - `draw*` / `drawLight` / `setStats` / `setBars` —— 渲染/UI。
//   - 爆炸链（`shouldExplode` / `kill()` 后的 `onDestroyed` 爆炸）—— `Damage` / `Fx` /
//     `Sounds` 未移植；`kill()` 会触发（Headless 下无爆炸，仅移除），保留调用点。
//   - `Events.fire(Trigger.thoriumReactorOverheat)` —— Trigger 未移植，跳过。
//   - `smokeThreshold` / `flashThreshold` 的烟雾/灯光 —— 渲染，跳过。
//   - `liquids.current()`（多液体模块的「当前液体」简化）—— 与 Java 一致（反应堆
//     只装冷却液）。
//
// ⚠️ 冷却液: `consumeLiquid(cryofluid, heating/coolantPower).update(false)` —— update=false
//   表示**不由 updateConsumption 自动扣液**，而是 `updateTile` 里手动 `liquids.remove`。
//   `Block.consumesLiquid()` 读 `liquidFilter`（由 ConsumeLiquid.apply 填），所以
//   `acceptLiquid` 仍能收 cryofluid。

import { Mathf, Time } from "@mindustry-ts/arc";
import { Items } from "../../../content/Items.js";
import { Env } from "../../meta/Env.js";
import { HeatBlock } from "../heat/HeatBlock.js";
import { PowerGenerator, PowerGeneratorBuild } from "./PowerGenerator.js";
import { ItemModule } from "../../modules/ItemModule.js";
import { LiquidModule } from "../../modules/LiquidModule.js";

/** 对应 `mindustry.world.blocks.power.NuclearReactor`。 */
export class NuclearReactor extends PowerGenerator{
  /** ticks 烧 1 份燃料（Java `itemDuration = 120`）。 */
  itemDuration = 120;
  /** 每帧每满度产热（Java `heating = 0.01f`）。 */
  heating = 0.01;
  /** 每侧最大热输出（Java `heatOutput = 8f`）。 */
  heatOutput = 8;
  /** 热进度上升速率（Java `heatWarmupRate = 1f`）。 */
  heatWarmupRate = 1;
  /** 燃料消耗随热量的缩放（Java `heatConsumeRate = 10f`）。 */
  heatConsumeRate = 10;
  /** 无燃料时冷却时间（Java `ambientCooldownTime = 60*20`）。 */
  ambientCooldownTime = 1200;
  /** 冒烟阈值（渲染）。 */
  smokeThreshold = 0.3;
  /** 灯光闪烁阈值（渲染）。 */
  flashThreshold = 0.46;
  /** 每单位冷却液带走的热量（Java `coolantPower = 0.5f`）。 */
  coolantPower = 0.5;
  /** 燃料物品（Java `fuelItem = Items.thorium`）。 */
  fuelItem = Items.thorium;
  /** 燃料耗耗定时器槽位（Java `timerFuel = timers++`；Block.timerDump 已用 0）。 */
  readonly timerFuel: number = this.timers++;

  /** 对应 Java `NuclearReactor(String name)`（:71-88）。 */
  constructor(name: string){
    super(name);
    this.itemCapacity = 30;
    this.liquidCapacity = 30;
    this.hasItems = true;
    this.hasLiquids = true;
    this.rebuildable = false;
    this.envEnabled = Env.any;
    // 爆炸参数（explosionShake/Radius/Damage/...）—— 爆炸链未移植，跳过。

    // ⚠️ 燃料/冷却液消费者在 `Blocks.ts` 注册时填（Java 同）——
    //   因为冷却液的 amount 依赖注册时的 heating/coolantPower。

    // 陷阱 #6：显式注册建筑工厂
    this.buildType = () => new NuclearReactorBuild();
  }
}

/** 对应 Java `NuclearReactor.NuclearReactorBuild`（:113-214）。 */
export class NuclearReactorBuild extends PowerGeneratorBuild implements HeatBlock{
  /** Java `public float heat`。⚠️ 陷阱 #16：与 `HeatBlock.heat()` 方法同名
   * → 字段改名 `heatRef`；`heat()` 方法返回 `heatProgress`（Java 同）。 */
  heatRef = 0;
  /** Java `public float heatLastFrame`。 */
  heatLastFrame = 0;
  /** Java `public float heatProgress`。 */
  heatProgress = 0;
  /** Java `public float flash`。 */
  flash = 0;
  /** Java `public float smoothLight`。 */
  smoothLight = 0;

  /** ⚠️ 必须显式声明 public 构造器。items/liquids 由具象建筑分配。 */
  constructor(){
    super();
    this.items = new ItemModule();
    this.liquids = new LiquidModule();
  }

  /** Java 的 `NuclearReactorBuild` 是内部类，直接读外部 `NuclearReactor.this.xxx`；TS 显式取回。 */
  private get reactor(): NuclearReactor{
    return this.block as NuclearReactor;
  }

  /** 对应 Java `updateTile()`（:127-167）。 */
  override updateTile(): void{
    const fuel = this.items.get(this.reactor.fuelItem);
    const fullness = fuel / this.reactor.itemCapacity;
    this.productionEfficiency = fullness;

    if(fuel > 0 && this.enabled){
      this.heatRef += this.heatLastFrame = fullness * this.reactor.heating * Math.min(this.delta(), 4);

      // 烧燃料：间隔 = itemDuration / (timeScale + heat*heatConsumeRate)
      if(this.timer(this.reactor.timerFuel, this.reactor.itemDuration / (this.timeScale + (this.heatRef > this.heatLastFrame ? 1 * this.heatRef * this.reactor.heatConsumeRate : 0)))){
        this.consume();
      }
    }else{
      this.productionEfficiency = 0;
      this.heatRef = Math.max(0, this.heatRef - Time.delta / this.reactor.ambientCooldownTime);
    }

    // 冷却液带走热量
    if(this.heatRef > 0){
      const maxUsed = Math.min(this.liquids.currentAmount(), this.heatRef / this.reactor.coolantPower);
      this.heatRef -= maxUsed * this.reactor.coolantPower;
      this.liquids.remove(this.liquids.current(), maxUsed);
    }

    // Java :150-157 —— 冒烟（渲染）

    this.heatRef = Mathf.clamp(this.heatRef);
    this.heatProgress = this.reactor.heatOutput > 0
      ? Mathf.approachDelta(this.heatProgress, this.heatRef * this.reactor.heatOutput * ((this.enabled && this.productionEfficiency > 0) ? 1 : 0), this.reactor.heatWarmupRate * this.delta())
      : 0;

    if(this.heatRef >= 0.999){
      // Java: Events.fire(Trigger.thoriumReactorOverheat); kill();
      this.kill();
    }
  }

  /** 对应 Java `heatFrac()`（:169-171）。 */
  heatFrac(): number{
    return this.heatProgress / this.reactor.heatOutput;
  }

  /** 对应 Java `heat()`（:173-175）。 */
  heat(): number{
    return this.heatProgress;
  }

  /** 对应 Java `shouldExplode()`（:177-179）—— 爆炸链未移植，保留判据。 */
  shouldExplode(): boolean{
    return true;
  }
}
