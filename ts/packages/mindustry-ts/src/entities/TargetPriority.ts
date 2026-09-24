// 源: core/src/mindustry/entities/TargetPriority.java
//
// ⚠️ 修正记录: 本文件此前被错误放在 `src/world/meta/` 且数值与 Java **完全不符**
// （旧值 `turret=1, base=-1, wall=-2, under=-3`；Java 实际是 `wall=-3, under=-2,
// transport=-1, base=0, turret=1, core=2`）。现按 Java 源码逐字修正数值，并移动到
// Java 对应的包路径 `mindustry.entities`（`Block.java` 通过 `import mindustry.entities.*` 引用它）。
// 这里没有任何既有引用点需要迁移（此前未被任何文件 import）。

/**
 * 方块被敌人瞄准的优先级权重。对应 `mindustry.entities.TargetPriority`。
 * 数值为 float 语义（本项目 float64）；比较只用于排序，不参与 hash。
 */
export class TargetPriority{
  /** 墙：没人关心。 */
  static readonly wall = -3;
  /** 带 `underBullets` 的方块（比墙稍微重要一点）。 */
  static readonly under = -2;
  /** 运输基础设施：不如工厂重要。 */
  static readonly transport = -1;
  /** 大多数方块。 */
  static readonly base = 0;
  /** 炮塔会造成伤害，因此更重要。 */
  static readonly turret = 1;
  /** 核心永远是最值得摧毁的目标。 */
  static readonly core = 2;
}
