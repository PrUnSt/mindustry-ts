// 源: core/src/mindustry/type/Liquid.java (192 行)
//
// 移植范围（S4 起为「数据面完整」）: 构造器、全部**数据字段**、`isHidden()`。
//   液体系统本身（`Puddle` / `Puddles` / `LiquidModule` 的使用 / `ConsumeLiquid`）仍不在范围。
//
// 为什么 S3/S4 都需要这个类:
//   - `Floor.liquidDrop` 的类型是 `Liquid`（`Floor.java:48`），`Tile.getFlammability()`
//     与 `Tile.drop()` 会读 `liquidDrop.flammability`；
//   - S4 的 `content/Liquids.ts` 会创建 11 种液体，`content.liquids().size` 因此从 0 变 11
//     （这会影响 `LiquidModule` 的定长数组与 `bootstrap.test.ts` 的计数断言）。
//
// 未移植（逐条标注）:
//   - `drawPuddle(Puddle)` / `getAnimationFrame()` / `update(Puddle)` / `particleEffect` /
//     `vaporEffect` / `particleSpacing` / `animationFrames` 系列 —— 水洼渲染与动画（计划 §9）。
//   - `init()` —— Java 里它做 `canStayOn` 的**自反/传递闭包**与 `Hidden` 校验；
//     S4 的液体表里没有任何 `canStayOn` 依赖需要该闭包（`oil.canStayOn.add(water)` 是显式的），
//     故留空并在此标注（不是静默省略 —— 构造器字段已全部就位，补 `init()` 即可）。
//   - `react(...)` / `willBoil()` / `canExtinguish()` / `sense*` —— 反应/逻辑系统。
//   - `setStats()` —— 依赖 `Stat` 目录。
//   - `barColor()` 方法（Java 的 getter，返回 `barColor == null ? color : barColor`）——
//     ⚠️ 陷阱 #16 同型改名: Java 同时有**字段** `barColor` 与**方法** `barColor()`，TS 不允许。
//     处置: 保留字段名 `barColor`（它是被直接读写的数据），**不移植** getter（唯一消费方是 UI，
//     属计划 §9）。UI 移植时把 getter 命名为 `resolvedBarColor()` 并把调用点一并改掉。
//   - `CellLiquid`（`neoplasm` 在 Java 里是它）—— `spreadTarget` / `capPuddles` 的传播求解属
//     水洼系统（计划 §9）。S4 用普通 `Liquid` 创建 `neoplasm`，并在 `content/Liquids.ts` 标注。

import { ObjectSet } from "@mindustry-ts/arc";
import { Color } from "../arc-compat/Color.js";
import { ContentType } from "../ctype/ContentType.js";
import { UnlockableContent } from "../ctype/UnlockableContent.js";
import { StatusEffect, StatusEffects } from "../mocks/StatusEffects.js";

/** 对应 `mindustry.type.Liquid`。 */
export class Liquid extends UnlockableContent{
  /** 若为 true，该流体视为气体（不产生水洼）。 */
  gas = false;
  /** 管道与地面上使用的颜色。 */
  color: Color;
  /** 气态颜色。 */
  gasColor: Color = Color.lightGray.cpy();
  /** 管道 UI 的条形颜色；null 时回退 `color`。 */
  barColor: Color | null = null;
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
  /** 站在其上时施加的状态效果。 */
  effect: StatusEffect = StatusEffects.none;
  /** 沸点（归一化温度）。 */
  boilPoint = 2;
  /** 若为 false，该液体不生成水洼。 */
  capPuddles = true;
  /** 是否在绝大多数 UI 里隐藏。 */
  hidden = false;
  /** 该液体可以和哪些其它液体接触而不被替换。 */
  canStayOn = new ObjectSet<Liquid>();

  constructor(name: string, color: Color){
    super(name);
    this.color = color;
  }

  override isHidden(): boolean{
    return this.hidden;
  }

  override getContentType(): ContentType{
    return ContentType.liquid;
  }
}
