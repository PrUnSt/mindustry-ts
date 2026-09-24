// 源: core/src/mindustry/type/Liquid.java
//
// 移植范围: 类 + 数据字段。**未移植**: `loadIcon` / `setStats` / `sense` / 动画帧
// （`animationFrames` / `animationScaleGas` / `animationScaleLiquid`，全部渲染路径，
// 计划 §9）。
//
// 为什么 S3 还需要这个类: `Floor.liquidDrop` 的类型是 `Liquid`（`Floor.java:48`），
// 而 `Tile.getFlammability()`（`Tile.java:144`）与 `Tile.drop()`（`Tile.java:581`）
// 会读 `liquidDrop.flammability`。把 `liquidDrop` 降级成 `unknown` 会让这两处失去类型检查，
// 所以保留一个**真实但未被实例化**的 `Liquid` 类。
//
// ⚠️ S3 的 `Liquids.load()` 是空的（见 `content/Liquids.ts`），因此实际运行中
// `Floor.liquidDrop` 恒为 `null`。这不影响 6 条硬断言（它们不涉及液体）。

import { Color } from "../arc-compat/Color.js";
import { ContentType } from "../ctype/ContentType.js";
import { UnlockableContent } from "../ctype/UnlockableContent.js";

/** 对应 `mindustry.type.Liquid`。 */
export class Liquid extends UnlockableContent{
  /** 若为 true，该流体视为气体（不产生水洼）。 */
  gas = false;
  /** 管道与地面上使用的颜色。 */
  color: Color;
  /** 气态颜色。 */
  gasColor: Color = Color.lightGray.cpy();
  /** 光照颜色；alpha 通道表示亮度。 */
  lightColor: Color = Color.clear.cpy();
  /** 0-1；> 0 可能在受热时燃烧，0.5+ 极易燃。 */
  flammability = 0;
  /** 温度：0.5 为室温，0 极冷，1 熔融。 */
  temperature = 0.5;
  /** 储热能力；0.4 = 水。 */
  heatCapacity = 0.5;
  /** 粘稠度；0.5 = 水，1 类似焦油。 */
  viscosity = 0.5;
  /** 受热时的爆炸性；0 = 无，1 = 核弹级。 */
  explosiveness = 0;
  /** 该流体是否会在方块中发生反应（如 slag 遇水）。 */
  blockReactive = true;
  /** 若为 false，该液体不能作为冷却剂。 */
  coolant = true;
  /** 若为 true，该液体可以作为水洼穿过方块。 */
  moveThroughBlocks = false;
  /** 若为 true，该液体可在焚化炉中焚化。 */
  incinerable = true;

  constructor(name: string, color: Color){
    super(name);
    this.color = color;
  }

  override getContentType(): ContentType{
    return ContentType.liquid;
  }
}
