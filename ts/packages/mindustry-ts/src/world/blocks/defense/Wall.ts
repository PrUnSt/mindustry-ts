// 源: core/src/mindustry/world/blocks/defense/Wall.java
//
// 移植范围: 类字段、构造器、`init()`，以及 `WallBuild` 的**非渲染**部分。
// 未移植（逐条标注）:
//   - `setStats()`            —— 依赖 `Stat` / `StatUnit` 目录
//   - `load()` / `icons()`    —— 贴图（计划 §9）
//   - `WallBuild.drawCached()` / `draw()` / `collision(Bullet)` —— 渲染与子弹系统（计划 §9）
//   - `WallBuild.updateAutotileBits()` / `updateOtherBits()` 与 `onProximityUpdate/Added/Removed`
//     覆写 —— 它们唯一的副作用是 `recache()`，而 Java 的 `BuildingComp.recache()` 是
//     `if(!headless) renderer.blocks.recacheBuilding(...)`（`BuildingComp.java:1290`），
//     headless 下本就是 no-op；且 S3 的 `updateProximity()` 是空实现（邻接留 S4）。
//     因此移植它们只会产生永不执行的死代码。
//
// ⚠️ 陷阱 #6（计划 §6.2）: Java 用 `WallBuild` 这个**内部类**，靠反射在 `initBuilding()` 里
// 找到它。TS 侧改为在构造器里显式注册：`this.buildType = () => new WallBuild(this)`。
// `WallBuild` 通过 `block`（由 `BuildingComp.create()` 赋值）取回外部 `Wall` 实例，
// 等价于 Java 内部类的隐式外部引用。

import { Building } from "../../../gen/Building.js";
import { Block } from "../../Block.js";
import { BlockGroup } from "../../meta/BlockGroup.js";
import { Env } from "../../meta/Env.js";
import { TargetPriority } from "../../../entities/TargetPriority.js";
import { Color } from "../../../arc-compat/Color.js";
import { Pal } from "../../../arc-compat/Pal.js";
import { Sound, Sounds } from "../../../mocks/Sounds.js";

/** 对应 `mindustry.world.blocks.defense.Wall.WallBuild`。 */
export class WallBuild extends Building{
  /** 自动拼接位掩码。 */
  protected autotileBits = 0;
  /** 受击闪白强度，1 → 0。 */
  protected hit = 0;

  /**
   * ⚠️ 必须显式声明 public 构造器：`Building` 的构造器由 codegen 生成为 `protected`
   * （`gen/Building.ts`），而 TS 对「未声明构造器」的子类会继承该 protected 构造器，
   * 于是外部的 `new WallBuild()` 报 `TS2674`。显式 `constructor(){ super(); }` 把可访问性
   * 提升为 public（派生类调用 protected 基类构造器是合法的）。
   */
  constructor(){
    super();
  }

  // Java 的 `WallBuild` 是 `Wall` 的**非静态内部类**，隐式持有外部 `Wall` 实例。
  // 本移植里唯一需要外部实例的两个方法（`updateAutotileBits` / `updateOtherBits`）
  // 不在 S3 范围（它们唯一的副作用 `recache()` 在 headless 下本就是 no-op，见文件头），
  // 因此这里**不**保留 `wall` getter —— 若将来需要，用 `this.block as Wall` 取回
  // （`BuildingComp.create()` 已把 `block` 指向外部 `Wall`），语义等价于 Java 内部类。
}

/** 对应 `mindustry.world.blocks.defense.Wall`。 */
export class Wall extends Block{
  /** 闪电信道几率；-1 表示禁用。 */
  lightningChance = -1;
  /** 闪电伤害。 */
  lightningDamage = 20;
  /** 闪电长度。 */
  lightningLength = 17;
  /** 闪电颜色（Java `Pal.surge`）。 */
  lightningColor: Color = Pal.surge;
  /** 闪电音效。 */
  lightningSound: Sound = Sounds.shootArc;

  /** 弹开子弹的几率；-1 表示禁用。 */
  chanceDeflect = -1;
  /** 是否受击闪白。 */
  flashHit = false;
  /** 闪白颜色。 */
  flashColor: Color = Color.white;
  /** 弹开音效。 */
  deflectSound: Sound = Sounds.none;
  /** 是否使用自动拼接（参见 tile-gen）。 */
  autotile = false;

  constructor(name: string){
    super(name);
    this.solid = true;
    this.destructible = true;
    this.group = BlockGroup.walls;
    this.buildCostMultiplier = 6;
    this.canOverdrive = false;
    this.drawDisabled = false;
    this.crushDamageMultiplier = 5;
    this.priority = TargetPriority.wall;

    // 墙当然在任何环境下都支持
    this.envEnabled = Env.any;

    // 陷阱 #6：显式注册建筑工厂（Java 走反射找 `WallBuild` 内部类）
    this.buildType = () => new WallBuild();
  }

  /** 对应 Java `Wall.init()`。注意 `super.init()` 在**最后**调用。 */
  override init(): void{
    if(this.size === 2 && this.destroySound === Sounds.unset){
      this.destroySound = Sounds.blockExplodeWall;
    }
    if(!this.flashHit){
      this.drawDynamic = false;
    }
    this.drawCached = true;
    super.init();
  }
}
