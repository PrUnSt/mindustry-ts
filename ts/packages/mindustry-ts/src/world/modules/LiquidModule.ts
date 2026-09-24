// 源: core/src/mindustry/world/modules/LiquidModule.java (206 行)
//
// 移植范围: 液体库存的**全部数据操作** —— `current` / `reset` / `set` / `currentAmount` /
//   `get` / `clear` / `add` / `remove` / `each` / `sum` / `checkArrayCapacity`。
//   S4 的作用是让 `Block.hasLiquids` 的方块有真实的库存载体（`Floor.liquidDrop` /
//   `Tile.getFlammability()` 将来会读它）。
//
// 未移植（逐条标注，与 `ItemModule` 同判据）:
//   - 流量统计（`updateFlow` / `stopFlow` / `getFlowRate` / `hasFlowLiquid` / `handleFlow`
//     与 `flowTimer` / `WindowedMean` / `displayFlow` / `cacheBits`）—— 纯显示量（UI 流量条），
//     S4 无 UI（计划 §9）。
//   - `write(Writes)` / `read(Reads, boolean)` —— 存档 IO（计划 §9 不做），覆写点保留在
//     `BlockModule`，方法体为空。
//   - `LiquidConsumer` / `LiquidCalculator` → TS 函数类型。
//
// ⚠️ 陷阱 #16 同型改名: Java 有**私有字段** `current` 与**公开方法** `current()`。
//   TS 不允许同名。处置与 `Tile.block()` 一致 —— 保留公开方法名 `current()`，
//   私有字段改名为 `currentRef`（字段本就 private，改名对外不可见）。

import { Vars } from "../../Vars.js";
import { BlockModule } from "./BlockModule.js";
import type { Liquid } from "../../type/Liquid.js";

/** 对应 Java `LiquidModule.LiquidConsumer`（函数式接口 → 函数类型）。 */
export type LiquidConsumer = (liquid: Liquid, amount: number) => void;
/** 对应 Java `LiquidModule.LiquidCalculator`（函数式接口 → 函数类型）。 */
export type LiquidCalculator = (liquid: Liquid, amount: number) => number;

/** 对应 `mindustry.world.modules.LiquidModule`。 */
export class LiquidModule extends BlockModule{
  /** 对应 Java `private float[] liquids = new float[content.liquids().size]`。 */
  private liquids: number[];
  /**
   * 对应 Java `private Liquid current = content.liquid(0)`。
   * ⚠️ 陷阱 #16 同型改名（见文件头）。
   * ⚠️ 与 Java 一样在**构造期**取 `content.liquid(0)`：调用方必须保证此时
   *    `Liquids.load()` 已跑过（S4 的所有建筑都在 `bootstrap()` 之后才创建）。
   */
  private currentRef: Liquid;

  constructor(){
    super();
    this.liquids = new Array<number>(Vars.content.liquids().size).fill(0);
    this.currentRef = Vars.content.liquid(0)!;
  }

  /** 对应 Java `current()`：最后接收或加载的液体（仅对单一液体的模块有效）。 */
  current(): Liquid{
    return this.currentRef;
  }

  /** 对应 Java `reset(Liquid, float)`。 */
  reset(liquid: Liquid, amount: number): void{
    this.liquids.fill(0);
    this.liquids[liquid.id] = amount;
    this.currentRef = liquid;
  }

  /** 对应 Java `set(Liquid, float)`。 */
  set(liquid: Liquid, amount: number): void{
    if(amount >= this.liquids[this.currentRef.id]!){
      this.currentRef = liquid;
    }
    this.liquids[liquid.id] = amount;
  }

  /** 对应 Java `currentAmount()`。 */
  currentAmount(): number{
    return this.liquids[this.currentRef.id]!;
  }

  /** 对应 Java `get(Liquid)`。 */
  get(liquid: Liquid): number{
    return this.liquids[liquid.id]!;
  }

  /** 对应 Java `clear()`。 */
  clear(): void{
    this.liquids.fill(0);
  }

  /** 对应 Java `add(Liquid, float)`。 */
  add(liquid: Liquid, amount: number): void{
    this.liquids[liquid.id]! += amount;
    this.currentRef = liquid;
  }

  /** 对应 Java `remove(Liquid, float)`（先截断到现有量，避免负库存）。 */
  remove(liquid: Liquid, amount: number): void{
    this.add(liquid, Math.max(-amount, -this.liquids[liquid.id]!));
  }

  /** 对应 Java `each(LiquidConsumer)`。 */
  each(cons: LiquidConsumer): void{
    for(let i = 0; i < this.liquids.length; i++){
      if(this.liquids[i]! > 0){
        cons(Vars.content.liquid(i)!, this.liquids[i]!);
      }
    }
  }

  /** 对应 Java `sum(LiquidCalculator)`。 */
  sum(calc: LiquidCalculator): number{
    let sum = 0;
    for(let i = 0; i < this.liquids.length; i++){
      if(this.liquids[i]! > 0){
        sum += calc(Vars.content.liquid(i)!, this.liquids[i]!);
      }
    }
    return sum;
  }

  /** 对应 Java `checkArrayCapacity(int size)`。 */
  checkArrayCapacity(size: number): void{
    if(this.liquids.length !== size) this.liquids = new Array<number>(size).fill(0);
  }
}
