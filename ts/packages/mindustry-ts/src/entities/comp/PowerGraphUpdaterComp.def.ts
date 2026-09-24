import { Component } from "../../annotations.js";

/**
 * 电力图更新器组件（**S3 最小集**）。
 *
 * Java `PowerGraphUpdaterComp` 是 `@EntityDef` 直挂的实体（`serialize=false, genio=false`），
 * 由 `PowerGraph` 在每帧排队更新。S3 无电力系统（计划 §9），保留空实现只为
 * `Groups.powerGraph` 的 `EntityGroup<PowerGraphUpdaterc>` 成立。
 */
@Component()
export abstract class PowerGraphUpdaterComp implements Entityc{
  /** Java `graph`（`PowerGraph`）。S3 无电力图。 */
  update(): void{ }
}
