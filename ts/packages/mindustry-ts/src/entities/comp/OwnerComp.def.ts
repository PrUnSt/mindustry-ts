import { Component } from "../../annotations.js";

/**
 * 归属组件：实体属于哪个「所有者」实体。
 *
 * 逐字对照 `core/src/mindustry/entities/comp/OwnerComp.java`。
 *
 * ⚠️ 两个与其它组件不同的点（Java 原文如此）：
 *  1. `@Component` **不带 `base`** → 不发射抽象基类，直接生成同名的合并实体形态；
 *  2. Java 是 `class OwnerComp`（**不是** `abstract class`），因此 TS 侧也写成具体类。
 *
 * `Entityc` 是生成接口（`Entityc.ts`），**可以**直接用作字段类型；Java 的默认值是
 * `null`（未初始化），故 TS 用 `Entityc | null`（`strict` 下必须显式并集）。
 */
@Component()
export class OwnerComp{
  /** 所有者实体；无主时为 `null`（Java `Entityc owner`）。 */
  owner: Entityc | null = null;
}
