// 源: core/src/mindustry/game/MapObjectives.java
//
// 为什么是空实现（计划 §11）: 地图内目标是纯客户端的逻辑编辑器功能（计划 §9「逻辑编辑器不做」），
// 但 `Rules.objectives` 的字段与 `Logic.update()` 里的 `state.rules.objectives.update()`
// 调用必须存在，否则要么改调用点（偏离 Java），要么在 `Rules` 里塞 undefined（更糟）。
// 因此保留一个**带身份的真实对象**，`update()` 为 no-op。
//
// TODO(S5/后续): 迁移 `MapObjective` 体系（失败条件、计时目标、flag 等）。

/** 对应 `mindustry.game.MapObjectives`（S3 no-op 存根）。 */
export class MapObjectives{
  /** 对应 Java `update()`。 */
  update(): void{
    // 有意为空：见文件头。
  }

  /** 对应 Java `clear()`。 */
  clear(): void{
    // 有意为空：见文件头。
  }

  /** 对应 Java `isEmpty()`。 */
  isEmpty(): boolean{
    return true;
  }
}
