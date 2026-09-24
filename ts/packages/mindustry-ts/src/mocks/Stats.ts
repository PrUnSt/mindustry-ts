// 源: core/src/mindustry/world/meta/Stats.java + Stat.java + StatValues.java(999 行)
//
// 为什么是空实现: 计划 §11 明确「`setStats()` / `Stats` / `StatValues` → 空实现」。
// 依据是 `setStats()` 只在 `Block.java:645` 自引用，`init()` 不调它；headless 下也不会有人
// 读 stats。但 `UnlockableContent`（`UnlockableContent.java:28`）在构造期就 `new Stats()`，
// 而且 `Block.setBars()` → `stats.add(Stat.maxUnits, …)`（`Block.java:732-734`）会写它，
// 所以这个对象必须**真实存在且带身份**（§11 类别 A 的精神）。
//
// TODO: 迁移 UI/数据库时补齐 `Stat` / `StatCat` / `StatValues`。

/** 对应 `mindustry.world.meta.Stats`（空实现，只保证调用不崩）。 */
export class Stats{
  /** 对应 `Stats.add(Stat, Object)` 系列重载；TS 合并为一个可变参实现。 */
  add(...args: unknown[]): void{
    void args;
  }

  /** 对应 `Stats.addPercent(...)`。 */
  addPercent(...args: unknown[]): void{
    void args;
  }

  /** 对应 `Stats.remove(Stat)`。 */
  remove(stat: unknown): void{
    void stat;
  }

  /** 对应 `Stats.addList(...)`。 */
  addList(...args: unknown[]): void{
    void args;
  }

  /** 对应 `Stats.toArray()`。S3 恒为空。 */
  toArray(): unknown[]{
    return [];
  }
}
