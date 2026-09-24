// 源: core/src/mindustry/content/StatusEffects.java
//
// 为什么是「带身份的真实对象」（计划 §11）: `Floor.status` 默认 `StatusEffects.none`
// （`Floor.java:44`），且 `Floor.damages()` 读 `status.damage`（`Floor.java:432`）。
// headless 不应用状态效果（计划 §9），只保留身份与 `damage` 字段。

import type { ContentType } from "../ctype/ContentType.js";

/** 对应 `mindustry.type.StatusEffect`（S3 只保留身份 + `damage`）。 */
export class StatusEffect{
  readonly name: string;
  /** 每秒伤害（Java `damage`）。 */
  damage = 0;
  /** 是否为「无状态」哨兵。 */
  readonly isNone: boolean;

  constructor(name: string, isNone = false){
    this.name = name;
    this.isNone = isNone;
  }

  getContentType(): ContentType | null{
    return null;
  }

  toString(): string{
    return this.name;
  }
}

/** 对应 `mindustry.content.StatusEffects`（S3/S4 子集）。 */
export const StatusEffects = {
  /** Java `StatusEffects.none`: 「无状态」哨兵（不是 `Content`，Java 里也是普通静态字段）。 */
  none: new StatusEffect("none", true),
  /**
   * Java `StatusEffects.freezing`。S4 起由 `Liquids.cryofluid.effect` 引用。
   * ⚠️ 本数组是 Java 的**子集且保持 Java 的相对顺序**（Java 顺序: none, burning, freezing,
   * unmoving, slow, fast, wet, muddy, melting, sapped, tarred, ...）。因为
   * `StatusEffect` 在 TS 侧还不是 `Content`（`getContentType()` 返回 null），
   * 子集化不会让任何 id 错位；将来把 `StatusEffects` 接进 `content` 时必须补齐全部成员。
   */
  freezing: new StatusEffect("freezing"),
  /** Java `StatusEffects.wet`。由 `Liquids.water.effect` 引用。 */
  wet: new StatusEffect("wet"),
  /** Java `StatusEffects.melting`。由 `Liquids.slag.effect` 引用。 */
  melting: new StatusEffect("melting"),
  /** Java `StatusEffects.tarred`。由 `Liquids.oil.effect` 引用。 */
  tarred: new StatusEffect("tarred")
} as const;

