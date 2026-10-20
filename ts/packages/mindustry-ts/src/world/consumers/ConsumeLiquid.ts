// 源: core/src/mindustry/world/consumers/ConsumeLiquid.java (45 行)
//
// 移植范围: `liquid` / `amount` + `apply` / `update` / `efficiency` / `consumes`。
//   （`build(Table)` / `display(Stats)` —— UI，未移植，计划 §9。）
//
// ⚠️ 与 Java 的差异（写清）:
//   - `apply` 里的 `block.liquidFilter[liquid.id] = true`（:22-24）—— C29 起
//     `Block.liquidFilter` 已存在（init 按液体数量分配），此行已落地。
//     `acceptLiquid` 的闸门靠 `Block.consumesLiquid()`（遍历 updateConsumers）承担。
//   - `update` / `efficiency` 用到 `build.edelta()`；TS 生成基类没有 `edelta()`
//     （具象建筑各自实现）→ 用 `edeltaOf()` 兜底（现算 = `efficiency * Time.delta * timeScale`，
//     与 Java 定义式一致；同 `PowerGraph.deltaOf` 的处置）。

import { Time } from "@mindustry-ts/arc";
import type { Building } from "../../gen/Building.js";
import type { Block } from "../Block.js";
import type { Liquid } from "../../type/Liquid.js";
import { ConsumeLiquidBase } from "./ConsumeLiquidBase.js";

/** `build.edelta()` 兜底（见文件头）。 */
function edeltaOf(build: Building): number{
  const e = (build as unknown as { edelta?: () => number }).edelta;
  return typeof e === "function" ? e.call(build) : build.efficiency * Time.delta * build.timeScale;
}

/** 对应 `mindustry.world.consumers.ConsumeLiquid`。 */
export class ConsumeLiquid extends ConsumeLiquidBase{
  /** 消耗的液体（Java `public final Liquid liquid`，:9）。 */
  liquid: Liquid;

  constructor(liquid: Liquid, amount: number){
    super(amount);
    this.liquid = liquid;
  }

  /** 对应 Java `apply(Block)`（:21-25）—— 填 `liquidFilter` 让 `acceptLiquid` 收这种液体。 */
  override apply(block: Block): void{
    super.apply(block);
    if(this.liquid.id < block.liquidFilter.length) block.liquidFilter[this.liquid.id] = true;
  }

  /** 对应 Java `update(Building)`（:36-38）—— 每 tick 按用量扣液。 */
  override updateConsume(build: Building): void{
    build.liquids.remove(this.liquid, this.amount * edeltaOf(build) * this.multiplier(build));
  }

  /** 对应 Java `efficiency(Building)`（:40-43）—— 有液 = 1，缺液按比例。 */
  override efficiency(build: Building): number{
    const ed = edeltaOf(build) * build.efficiencyScale();
    if(ed <= 0.00000001) return 0;
    // 可以有比必要更多的液体，封顶 1
    return Math.min(build.liquids.get(this.liquid) / (this.amount * ed * this.multiplier(build)), 1);
  }

  /** 对应 Java `consumes(Liquid)`（:51-53）。 */
  override consumes(liquid: Liquid): boolean{
    return liquid === this.liquid;
  }
}
