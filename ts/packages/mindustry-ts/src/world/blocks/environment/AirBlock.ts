// 源: core/src/mindustry/world/blocks/environment/AirBlock.java
//
// ⚠️ 陷阱 #2（计划 §6.2）: 本类是**整个内容自举的起点**。`Blocks.load()` 的第一条语句
// 必须创建它，因为：
//   1. `Content` 构造器要求 `Vars.content` 已存在（`Vars.init()` 里 `content` 先建）；
//   2. `Tile` 构造器读 `Blocks.air`（`Tile.java:53`），而 `Tiles.fill()` 会 `new Tile(...)`；
//   3. `Floor.wall` / `Floor.decoration` 的字段初值也读 `Blocks.air`（`Floor.java:68,70`）。
//
// 本构造器把 `wall = this`，这正是 Java 的做法（`AirBlock.java:14`）：由于 `air` 创建时
// `Blocks.air` 尚未赋值（自引用），`Floor.wall` 的初值会是 undefined，这里显式纠正为自身。
//
// 未移植: `drawBase` / `variantRegions` / `load`（渲染路径，计划 §9）。

import { Floor } from "./Floor.js";

/** 对应 `mindustry.world.blocks.environment.AirBlock`。 */
export class AirBlock extends Floor{
  constructor(name: string){
    super(name);
    this.alwaysReplace = true;
    this.hasShadow = false;
    this.useColor = false;
    // Java: `wall = this;` —— 自举纠正，见文件头说明。
    this.wall = this;
    this.generateIcons = false;
    this.needsSurface = false;
    this.canShadow = false;
    this.drawCached = false;
    this.drawDynamic = false;
  }

  /** 对应 Java `AirBlock.init()`：`decoration = this;`（注意 `@OverrideCallSuper`）。 */
  override init(): void{
    super.init();
    this.decoration = this;
  }

  /** 对应 Java `AirBlock.load()`：Java 里**不调用** `super.load()`（`@OverrideCallSuper` 反向）。 */
  override load(): void{
    // 有意为空 —— Java 的 `AirBlock.load()` 也是空体，且不调用 super（避免查 air 贴图）。
  }

  override isHidden(): boolean{
    return true;
  }
}
