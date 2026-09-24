import { Component } from "../../annotations.js";

/**
 * 单位基组件（**S3 最小集**）。
 *
 * Java 的 `UnitComp`（1007 行）实现 `Healthc, Physicsc, Hitboxc, Statusc, Teamc, Itemsc,
 * Rotc, Unitc, Weaponsc, Drawc, Syncc, Shieldc, ...`。计划 §9 明确「0 单位类型」，
 * 所以这里只保留让 `Groups.unit` 的 `EntityGroup<Unit>` 类型成立所需的最小字段，
 * 行为（武器/移动/采矿）**不在 S3 范围**。
 *
 * 保留 `base: true` 是为了让 codegen 发射抽象基类 `Unit.ts`（对应 Java 的 `mindustry.gen.Unit`）。
 */
@Component({ base: true })
export abstract class UnitComp implements Entityc, Posc, Teamc, Healthc{
  /** 高于地面的偏移量（Java `elevation`）。 */
  elevation: number = 0;

  /** 该单位是否是无法飞行且正浸在液体中（Java `drowned`）。 */
  drowned: boolean = false;
}
