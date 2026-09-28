import { Component } from "../../annotations.js";

/**
 * 伤害组件：实体携带的伤害量。
 *
 * 逐字对照 `core/src/mindustry/entities/comp/DamageComp.java`（原文仅一个 `float damage`，
 * 且**没有** `implements` —— 因此不显式列出 `Entityc`）。
 */
@Component()
export abstract class DamageComp{
  /** 伤害量（Java `damage`）。 */
  damage: number = 0;
}
