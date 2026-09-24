import { Component } from "../../annotations.js";

/**
 * 绘制组件（**S3 最小集**）。
 *
 * Java `DrawComp` 提供 `clipSize()`，供 `EntityGroup.draw()` 做视口裁剪。headless 不绘制，
 * 但 `Groups.draw` 的 `EntityGroup<Drawc>` 需要这个接口存在（计划 §6.3 的最小 17 个组件之一）。
 */
@Component()
export abstract class DrawComp implements Posc{
  /** 绘制裁剪半径（Java `clipSize()`）；S3 返回 0。 */
  clipSize(): number{
    return 0;
  }
}
