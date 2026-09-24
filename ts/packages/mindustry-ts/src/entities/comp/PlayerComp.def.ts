import { Component } from "../../annotations.js";

/**
 * 玩家基组件（**S3 最小集**）。
 *
 * Java `PlayerComp`（495 行）实现 `UnitController, Entityc, Syncc, Timerc, Drawc, ...`。
 * S3 是单机 headless：`Vars.player` 恒为 null，不创建玩家实体（计划 §9）。
 * 保留 `base: true` 只为让 `Groups.player` 的 `EntityGroup<Player>` 成立，
 * 同时 `GameState`/`Teams` 里的 `Groups.player` 遍历保持 Java 结构。
 */
@Component({ base: true })
export abstract class PlayerComp implements Entityc, Teamc{
  /** 玩家名（Java `name`）。 */
  name: string = "";
}
