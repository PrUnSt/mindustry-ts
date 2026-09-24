// 源: core/src/mindustry/world/modules/BlockModule.java (16 行)
//
// 移植范围: 类本身与 `read` 的两层重载转发（`read(read)` → `read(read, false)`）。
//
// ⚠️ 有意收窄（S4）: `write(Writes)` / `read(Reads, boolean)` 的**具体编解码**未移植 ——
//   它们依赖 `arc.util.io.{Writes,Reads}`，而 S4 没有存档系统（计划 §9：
//   「读真实 .msav 存档」明确不做）。因此这里保留**同名方法**（保证子类覆写点与 Java 一致）
//   但方法体为空，并在每个子类里逐条标注「IO 留待存档里程碑」。
//   这样做的收益：将来补 IO 时，覆写点已经全部就位，不需要重新设计类关系。
//
// ⚠️ 为什么 `read(read)` 不写成两个重载: TS 无法用同名不同元数表达 Java 重载，
//   用默认参数 `legacy = false` 表达，语义完全相同（`BlockModule.java:13-15`）。

/** 对应 `mindustry.world.modules.BlockModule`。 */
export abstract class BlockModule{
  /**
   * 对应 Java `abstract void write(Writes write)`。
   * ⚠️ S4 无存档 IO（见文件头）→ 基类空实现，子类按需覆写。
   */
  write(_write: unknown): void{ }

  /**
   * 对应 Java `read(Reads read, boolean legacy)`。
   * ⚠️ S4 无存档 IO（见文件头）→ 基类空实现。
   */
  read(_read: unknown, _legacy = false): void{ }
}
