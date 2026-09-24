// 源: core/src/mindustry/world/modules/PowerModule.java (37 行)
//
// 移植范围: 字段与最小语义 —— `status` / `init` / `links`（`IntSeq`），以及 `write/read`
//   的覆写点（方法体为空，理由同 `ItemModule` 文件头：S4 无存档 IO）。
//
// ⚠️ **有意缺失**: Java 的 `public PowerGraph graph = new PowerGraph()` 未移植。
//   原因（计划 §9「明确不做的事」）: `PowerGraph`（`world/blocks/power/PowerGraph.java`）
//   是一整套电力求解器（图合并/拆分、`PowerGraphUpdaterc` 组、电量统计），
//   而 S4 的方块集合里**没有任何 `hasPower` 方块**（`Block.hasPower` 恒为 false）。
//   移植它既无调用点，也会把 `Groups.powerGraph` / `Tile.changeBuild` 的
//   `powerGraph.update()` 路径一起拖进来 —— 超出 §7 的范围。
//   ⚠️ 这**不是**静默省略：`BuildingComp.create()` 里对应的 `power = new PowerModule()`
//   与 `power.graph.add(self())` 两行都在原位标注为 TODO(S5)。
//
// `status` / `init` 的语义（Java 注释）:
//   非缓冲消费者：这是「可供给的电力需求百分比」，< 1 时方块以降低的效率工作。
//   缓冲消费者：这是「已存电量 / 最大容量」的百分比。

import { IntSeq } from "@mindustry-ts/arc";
import { BlockModule } from "./BlockModule.js";

/** 对应 `mindustry.world.modules.PowerModule`。 */
export class PowerModule extends BlockModule{
  /** 对应 Java `public float status = 0.0f`。 */
  status = 0;
  /** 对应 Java `public boolean init`。 */
  init = false;
  /** 对应 Java `public IntSeq links = new IntSeq()`（相邻电力节点的打包坐标）。 */
  links = new IntSeq();

  // Java: `public PowerGraph graph = new PowerGraph();` —— 见文件头「有意缺失」。
}
