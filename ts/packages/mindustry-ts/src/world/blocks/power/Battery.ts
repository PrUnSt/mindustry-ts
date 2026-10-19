// 源: core/src/mindustry/world/blocks/power/Battery.java (79 行)
//
// 移植范围: 方块级字段与构造器 + `BatteryBuild` 的最小面。**Battery 是纯数据块**
//   （`update=false`，没有逐 tick 行为）—— 真正的充放电逻辑全在 `PowerGraph`
//   （`chargeBatteries` / `useBatteries` / `distributePower` 的 buffered 分支，C21 已移植）。
//   本文件只需满足 `PowerGraph.add()` 把它分类进 `batteries` 的三个条件:
//     `outputsPower=true, consumesPower=true, consPower.buffered=true`
//   （`PowerGraph.ts:434` 的 `else if(block.outputsPower && block.consumesPower)` 分支）。
//
// ⚠️ 电池的 `power.status` 语义与普通方块不同: 它**不是**覆盖率，而是「已存电 / 容量」的
//   百分比（`PowerModule.java:35` 注释）—— 由 `useBatteries`/`chargeBatteries` 直接增减。
//
// 未移植（渲染 / 放置 / UI 层，计划 §9）:
//   - `drawer` / `DrawPower` / `DrawMulti` / `DrawRegion` / `emptyLightColor` / `fullLightColor`
//     （:6-13, :33-46, :48-64）—— 渲染
//   - `checkDrawDefault` / `load` / `drawPlanRegion` / `icons` / `getRegionsToOutline`（:33-64）—— 渲染
//   - `BatteryBuild.draw` / `drawLight`（:55-61）—— 渲染
//   - `BatteryBuild.overwrote(Seq<Building>)`（:63-71）—— **放置覆盖旧方块时吸收其存量电**。
//     ⚠️ 这是唯一一处「存量电随方块移动」的语义（`Build.place` 触发，放置层未移植；且要读
//     旧建筑的 `block.consPower.buffered`）。待放置层落地时补。
//   - `BatteryBuild.status()`（:73-78）—— UI `BlockStatus`
//
// ⚠️ `warmup()` 保留（返回 `power.status`）: Java 里它被 UI 进度条读（`Block.setBars` 的
//   `Battery` 进度），headless 无观测；保留它是因为语义简单且是 `power.status` 的公开读法。

import { Building } from "../../../gen/Building.js";
import { Env } from "../../meta/Env.js";
import { PowerDistributor } from "./PowerDistributor.js";

/** 对应 `mindustry.world.blocks.power.Battery`。 */
export class Battery extends PowerDistributor{
  /** 对应 Java `Battery(String name)`（:20-30）。 */
  constructor(name: string){
    super(name);
    // PowerDistributor 构造器把 consumesPower 置 false；电池是「既进又出」的缓冲体（Java :22-23）。
    this.outputsPower = true;
    this.consumesPower = true;
    this.canOverdrive = false;
    // Java :26 `flags = EnumSet.of(BlockFlag.battery);` —— `BlockFlag` 未移植（同 Drill/PowerGenerator 处置）。
    this.envEnabled |= Env.space;
    this.destructible = true;
    // Java :27-28 `update = false;` —— 电池不需要逐 tick 更新（覆掉 PowerBlock 的默认 true）。
    this.update = false;

    // 陷阱 #6：显式注册建筑工厂（子类在自己的构造器里覆盖成自己的 Build 类）
    this.buildType = () => new BatteryBuild();
  }
}

/** 对应 Java `Battery.BatteryBuild`（:53-78）。 */
export class BatteryBuild extends Building{
  /** ⚠️ 必须显式声明 public 构造器（`gen/Building.ts` 的构造器是 `protected`，不声明会 TS2674）。 */
  constructor(){
    super();
  }

  /** 对应 Java `warmup()`（:62-64）—— 返回已存电百分比。渲染层读它，headless 无观测。 */
  warmup(): number{
    return this.power.status;
  }
}
