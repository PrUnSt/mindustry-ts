// 源: core/src/mindustry/world/consumers/ConsumePower.java (63 行)
//
// 移植范围: 全部。`Block.consume()` 对它有**特判**（Java `Block.java:1210-1212`：
// 电力消费者只允许有一个，后声明的会顶掉先声明的），所以本类必须与 `Block` 同批落地。
//
// ⚠️ 与 `PowerGraph` 的耦合：`efficiency()` 直接返回 `build.power.status`，而 `status`
//   是由 `PowerGraph.distributePower()` 每 tick 写入的覆盖率（`PowerGraph.java:204`）。
//   若只移植本类而**不**移植 `PowerGraph`，`status` 会保持 `PowerModule.java:13` 的初值
//   `0.0f` → `efficiency === 0` → 工厂**永远不产出**。
//   所以「先做 ConsumePower 后做 PowerGraph」是不可行的中间态；本阶段两者同批落地。
//
// 未移植: 无。

import type { Building } from "../../gen/Building.js";
import type { Block } from "../Block.js";
import { Consume } from "./Consume.js";

/** 对应 Java `mindustry.world.consumers.ConsumePower`。 */
export class ConsumePower extends Consume{
  /** 每 tick 需求的最大功率（Java `usage`，:10）。 */
  usage = 0;
  /** 最大储电量（Java `capacity`，:12）。 */
  capacity = 0;
  /** 是否为蓄电池型（Java `buffered`，:14）。 */
  buffered = false;

  constructor(usage = 0, capacity = 0, buffered = false){
    super();
    this.usage = usage;
    this.capacity = capacity;
    this.buffered = buffered;
  }

  /**
   * 对应 Java `apply(Block)`（:27-30）。
   * ⚠️ 这是**唯一**把 `block.hasPower` 置 true 的地方（另一处是 `PowerBlock` 构造器）。
   */
  override apply(block: Block): void{
    block.hasPower = true;
    block.consPower = this;
  }

  /** 对应 Java `ignore()`（:33）：缓冲型不进 `nonOptionalConsumers` / `optionalConsumers`。 */
  override ignore(): boolean{
    return this.buffered;
  }

  /**
   * 对应 Java `efficiency(Building)`（:38-40）：就是电网覆盖率本身。
   * ⚠️ `power` 为 null 时（方块声明了耗电但还没分配模块）按 0 处理 —— Java 会 NPE，
   *    这里收窄为 0 并保留注释，避免把「未接线」伪装成「满供」。
   */
  override efficiency(build: Building): number{
    return build.power === null ? 0 : build.power.status;
  }

  /**
   * 每 tick 请求的电量（Java `requestedPower(Building)`，:56-60）。
   *   · 缓冲型：按「缺口」充（`(1 - status) * capacity`）
   *   · 普通型：满额 or 0 —— 0 的条件是 `shouldConsume()` 为假，
   *     这正是「缺料停产的工厂不计入电网负荷」的来源（`PowerGraph.java:111`）。
   */
  requestedPower(build: Building): number{
    if(this.buffered){
      return (1 - (build.power === null ? 0 : build.power.status)) * this.capacity;
    }
    return this.usage * (build.shouldConsume() ? 1 : 0);
  }
}
