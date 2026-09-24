import { Component, Import } from "../../annotations.js";

/**
 * 阵营组件：实体属于哪一方。
 *
 * 逐字对照 `core/src/mindustry/entities/comp/TeamComp.java`。Java 的 `team` 类型是 `Team`
 * 对象；TS 侧存 **阵营 id**（`number`），因为生成文件无法 import `game/Team`（codegen 约束，
 * 见 `EntityComp.def.ts` 顶部说明）。`Team.get(id)` 做反向解析。
 *
 * Java `TeamComp.team = Team.derelict` 的默认值 —— `Team.derelict` 的 id 是 **0**
 * （`Team.java:33` `new Team(0, "derelict", ...)`），不是 -1。
 */
@Component()
export abstract class TeamComp implements Posc{
  /** 由 {@link PosComp} 提供的 x（仅在方法体内使用，不发射字段）。 */
  @Import() x: number = 0;

  /** 由 {@link PosComp} 提供的 y。 */
  @Import() y: number = 0;

  /** 阵营 id；`Team.derelict` 的 id 是 0。 */
  team: number = 0;

  /** @return 该实体是否处于「无主」状态（derelict，即 id 0）。 */
  cheating(): boolean{
    return this.team === 0;
  }

  /** @return 该实体中心是否对观察方可见。 */
  inFogTo(viewer: number): boolean{
    return this.team !== viewer && this.x > 0;
  }
}
