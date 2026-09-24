// 源: core/src/mindustry/type/Item.java
//
// 移植范围: 构造器 + 数据字段 + `isHidden` / `getContentType` / `toString`。
// 未移植（逐条标注）:
//   - `loadIcon()` / `createIcons()`  —— 贴图与图标合成（计划 §9「渲染不做」）
//   - `setStats()`                    —— 依赖 `Stat`/`StatUnit` 目录
//   - `sense/senseObject`             —— `Senseable`（逻辑系统，S3 不做）
//   - `isOnPlanet(Planet)`            —— `Planet` 未移植
//   - `getAllOres()`                  —— 依赖 `OreBlock`
//
// ⚠️ 陷阱 #7（计划 §6.2）: Java 的 `new Item(...){{ hardness = 1; }}` 是**双大括号匿名子类**。
// TS 侧一律改为「先构造、再逐字段赋值」（见 `content/Items.ts`），不写匿名类，也不用临时反射。

import type { Color } from "../arc-compat/Color.js";
import { ContentType } from "../ctype/ContentType.js";
import { UnlockableContent } from "../ctype/UnlockableContent.js";

/** 对应 `mindustry.type.Item`。 */
export class Item extends UnlockableContent{
  /** 该物品的颜色。 */
  color: Color;

  /** 爆炸性。 */
  explosiveness = 0;
  /** 可燃性；> 0.3 才能进物品燃烧器。 */
  flammability = 0;
  /** 放射性。 */
  radioactivity = 0;
  /** 电学活性。 */
  charge = 0;
  /** 钻头硬度。 */
  hardness = 0;
  /**
   * 基础材料成本，用于计算建造耗时：1 cost = 建造时间 +1 tick。
   * 对应 Java `cost`（Java 默认 1f）。
   */
  cost = 1;
  /**
   * 当该物品出现在建造成本里时，方块**默认**血量乘以 `1 + healthScaling`
   * （所有需求物品的 scaling 求和）。
   */
  healthScaling = 0;
  /** 若为 true，该物品在钻头优先级中最低。 */
  lowPriority = false;

  /** > 0 表示该物品有动画。 */
  frames = 0;
  /** 每两帧之间生成的过渡帧数。 */
  transitionFrames = 0;
  /** 动画帧间隔（tick）。 */
  frameTime = 5;
  /** 若为 true，该物品可被建筑使用；false 时会在部分核心中被焚化。 */
  buildable = true;
  /** 是否隐藏。 */
  hidden = false;

  constructor(name: string, color: Color){
    super(name);
    this.color = color;
  }

  override isHidden(): boolean{
    return this.hidden;
  }

  override toString(): string{
    return this.localizedName;
  }

  override getContentType(): ContentType{
    return ContentType.item;
  }
}
