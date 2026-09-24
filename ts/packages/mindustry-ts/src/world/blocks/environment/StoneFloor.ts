// 源: core/src/mindustry/content/Blocks.java:348（`stone = new Floor("stone");`）
//
// ⚠️ Java 侧**没有** `StoneFloor` 这个类 —— `stone` 是一个**裸** `Floor` 实例。
//   S4 用具名子类承载它，理由: 与同目录的 `GrassFloor` / `SandFloor` / `SnowFloor` 保持
//   同一种「一个地板一个文件」的形态，便于后续按 Java 顺序继续补环境方块。
//
// ⚠️ 这带来**一处可观测偏差**（在此显式标注，不静默）: `Block.subclass` 会被记为
//   `StoneFloor` 而不是 `Floor`，而 `Block.canReplace` 的「同尺寸替换需 subclass 相同」
//   分支（`Block.java:497-508`）会读它。S4 里该分支**不可达** —— `stone` 的
//   `buildVisibility` 是 `hidden`（没有 `requirements`），玩家无法放置，因此
//   永远不会有「用另一个方块替换 stone」的调用。将来若补 `Blocks` 全量并启用地图编辑，
//   需要把它改回裸 `Floor`。

import { Floor } from "./Floor.js";

/** 对应 Java `Blocks.stone`（`new Floor("stone")`）。 */
export class StoneFloor extends Floor{
  constructor(name: string){
    super(name);
    // Java 侧没有额外字段赋值 —— 保持构造器为空体。
  }
}
