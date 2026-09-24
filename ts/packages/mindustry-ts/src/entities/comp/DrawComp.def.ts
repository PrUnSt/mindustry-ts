import { Component } from "../../annotations.js";

/**
 * 绘制组件（**S3 最小集**）。
 *
 * Java `DrawComp` 提供 `clipSize()`，供 `EntityGroup.draw()` 做视口裁剪。headless 不绘制，
 * 但 `Groups.draw` 的 `EntityGroup<Drawc>` 需要这个接口存在（计划 §6.3 的最小 17 个组件之一）。
 *
 * `implements Entityc, Posc` 中 `Entityc` 这一条是**必须的**：Java 的 `DrawComp` 只写
 * `implements Posc`，`Entityc` 由 `@BaseComponent` 注解在闭包阶段自动注入
 * （`EntityProcess.java:980-982`），所以 Java 生成的 `Drawc` 隐式继承 `Entityc`。
 * TS 侧用「在 `implements` 里显式列出」替换那次注入（见 `EntityComp.def.ts` 顶部说明）——
 * 漏掉这一条，`Groups.draw` 的 `EntityGroup<Drawc>` 就不满足 `T extends Entityc`。
 */
@Component()
export abstract class DrawComp implements Entityc, Posc{
  /** 绘制裁剪半径（Java `clipSize()`）；S3 返回 0。 */
  clipSize(): number{
    return 0;
  }
}
