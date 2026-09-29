// 源: core/src/mindustry/world/modules/PowerModule.java (37 行)
//
// 移植范围: 字段与最小语义 —— `status` / `init` / `links`（`IntSeq`），以及 `write/read`
//   的覆写点（方法体为空，理由同 `ItemModule` 文件头：S4 无存档 IO）。
//
// ⚠️ `graph` **已落地**（2026-09-29 电力系统阶段）:
//   对齐 Java 的字段初值 `public PowerGraph graph = new PowerGraph();`（`PowerModule.java:15`），
//   构造期即分配一张**独立**电网。
//
//   ⚠️ 这一步是「无电 → 工厂 efficiency 恒 0」的**根源**，必须理解:
//     · `ConsumePower.efficiency()` 直接返回 `power.status`；
//     · `status` 的初值是 **0**（Java :13）；
//     · `status` 只由 `PowerGraph.distributePower()`（PowerGraph.java:187-214）每 tick 写入；
//     · `distributePower()` 只在 `PowerGraph.update()` 里被调用，而 `update()` 由
//       `Groups.powerGraph` 驱动 —— 只有 `PowerGraph.checkAdd()`（:303-305）把实体入组后
//       才会被驱动，而 `checkAdd()` 只在图**合并**（`addGraph`/`reflow`）时发生。
//     ⇒ 孤立方块（无任何电力连接）的图永不入组 → `status` 恒 0 → `efficiency` 恒 0
//        → 工厂不产出。这是 Java 的真实行为，不是漏移植；别把 `status` 初值改成 1，
//        也别让 `PowerGraph` 构造器自动入组。
//
//   代价（与 Java 相同）: 每个 `hasPower` 的建筑在构造期都会多出一张 `PowerGraph` +
//   一个 `PowerGraphUpdater` 实体；合并时被吞并的那张图的实体会被 `remove()`。
//
// `status` / `init` 的语义（Java 注释）:
//   非缓冲消费者：这是「可供给的电力需求百分比」，< 1 时方块以降低的效率工作。
//   缓冲消费者：这是「已存电量 / 最大容量」的百分比。

import { IntSeq } from "@mindustry-ts/arc";
import { PowerGraph } from "../blocks/power/PowerGraph.js";
import { BlockModule } from "./BlockModule.js";

/** 对应 `mindustry.world.modules.PowerModule`。 */
export class PowerModule extends BlockModule{
  /** 对应 Java `public float status = 0.0f`。⚠️ 初值 **0** —— 「没电」的根源，别改成 1。 */
  status = 0;
  /** 对应 Java `public boolean init`。 */
  init = false;
  /** 对应 Java `public IntSeq links = new IntSeq()`（相邻电力节点的打包坐标）。 */
  links = new IntSeq();

  /**
   * 所属电网（Java `public PowerGraph graph = new PowerGraph();`）。
   * 构造期分配，与 Java 的字段初值一致；`BuildingComp.create()` 紧接调
   * `power.graph.add(self())`（`gen/Building.ts:204-209`）。
   */
  graph: PowerGraph = new PowerGraph();
}
