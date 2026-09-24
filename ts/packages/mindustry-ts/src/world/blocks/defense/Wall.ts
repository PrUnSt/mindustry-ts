// 源: core/src/mindustry/world/blocks/defense/Wall.java (210 行)
//
// 移植范围（S4）: 类字段、构造器、`init()`，以及 `WallBuild` 的**非渲染部分**。
//   ⚠️ 相对 S3 的关键变化: S3 把 `onProximityUpdate/Added/Removed` 与
//   `updateAutotileBits` / `updateOtherBits` 标为「只产生永不执行的死代码」而略过 ——
//   理由是当时 `BuildingComp.updateProximity()` 是空实现。**S4 已实现邻接**，
//   所以这五个方法现在是**真正会执行**的行为（`Wall.autotile` 为 true 时），故补齐。
//
// 未移植（逐条标注）:
//   - `setStats()`        —— 依赖 `Stat` / `StatUnit` 目录。
//   - `load()`            —— `TileBitmask.load(name)` 需要 `Core.atlas`（headless 为 null，计划 §9）。
//     `autotileRegions` 字段随之省略（唯一消费者是 `drawCached()`）。
//   - `icons()`           —— 贴图。
//   - `drawCached()` / `draw()` / `collision(Bullet)` —— 渲染与子弹系统（计划 §9）。
//     ⚠️ `collision` 里会给 `hit = 1` 并可能触发闪电/弹开；无子弹系统 → 整段不做，
//     `hit` 字段保留（渲染用）并在此标注它在本阶段恒为 0。
//
// ⚠️ 陷阱 #6（计划 §6.2）: Java 用 `WallBuild` 这个**内部类**，靠反射在 `initBuilding()` 里
// 找到它。TS 侧改为在构造器里显式注册：`this.buildType = () => new WallBuild()`。
// `WallBuild` 通过 `block`（由 `BuildingComp.create()` 赋值）取回外部 `Wall` 实例，
// 等价于 Java 内部类的隐式外部引用。
//
// ⚠️ 可访问性调整（**相对 Java 的显式偏差**）: Java 的 `WallBuild.autotileBits` 是 `protected`。
//   TS 侧提升为 `public` —— 理由: 渲染路径未移植，`autotileBits` 在 headless 下**没有**其它
//   观察者，而它是本阶段 `Wall` 唯一可验证的行为（`wall-autotile` 测试要在不 `as any` 强转的
//   前提下断言它）。若将来补渲染，可改回 `protected`。

import { Building } from "../../../gen/Building.js";
import { Block } from "../../Block.js";
import { BlockGroup } from "../../meta/BlockGroup.js";
import { Env } from "../../meta/Env.js";
import { TargetPriority } from "../../../entities/TargetPriority.js";
import { Color } from "../../../arc-compat/Color.js";
import { Pal } from "../../../arc-compat/Pal.js";
import { Geometry } from "../../../arc-compat/Geometry.js";
import { Vars } from "../../../Vars.js";
import { Sound, Sounds } from "../../../mocks/Sounds.js";
import type { Tile } from "../../Tile.js";

/** 对应 `mindustry.world.blocks.defense.Wall.WallBuild`。 */
export class WallBuild extends Building{
  /**
   * 自动拼接位掩码（8 邻域，bit i 对应 `Geometry.d8[i]`）。
   * Java `protected int autotileBits`。⚠️ TS 提升为 public，原因见文件头。
   */
  autotileBits = 0;
  /** 受击闪白强度，1 → 0。⚠️ S4 无子弹系统 → 恒为 0（见文件头）。 */
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

  /** Java 的 `WallBuild` 是内部类，直接读外部 `Wall.this.block`；TS 显式取回。 */
  private get wall(): Wall{
    return this.block as Wall;
  }

  /**
   * 对应 Java `updateAutotileBits()`：扫描 8 邻域，把「同方块、同队伍」的邻居记为已连接。
   * @return 位掩码是否变化（Java 用 `prev != autotileBits` 决定是否 `recache()`）。
   */
  updateAutotileBits(): boolean{
    const prev = this.autotileBits;
    this.autotileBits = 0;

    const tile = this.tile as Tile;
    const size = this.block.size;

    for(let i = 0; i < 8; i++){
      const dx = Geometry.d8[i]!.x;
      const dy = Geometry.d8[i]!.y;
      const other = tile.nearby(dx * size, dy * size);
      if(other !== null && other.build !== null && other.build.block === this.block && other.build.team === this.team){
        this.autotileBits |= 1 << i;
      }
    }

    // Java: `if(prev != autotileBits) recache();` —— `recache()` 是渲染缓存失效
    // （`BuildingComp.recache()` 里 `if(!headless)` 守卫），headless 下无副作用。
    return prev !== this.autotileBits;
  }

  /**
   * 对应 Java `updateOtherBits()`：让 8 邻域里**已是中心**的同方块同队伍墙重算自己的位掩码
   * （自己变了，邻居的边缘也随之变化）。
   */
  updateOtherBits(): void{
    const tile = this.tile as Tile;
    const size = this.block.size;

    for(let i = 0; i < 8; i++){
      const dx = Geometry.d8[i]!.x;
      const dy = Geometry.d8[i]!.y;
      const other = tile.nearby(dx * size, dy * size);
      if(
        other !== null &&
        other.build !== null &&
        other.isCenter() &&
        other.build.block === this.block &&
        other.build.team === this.team &&
        other.build instanceof WallBuild
      ){
        other.build.updateAutotileBits();
      }
    }
  }

  /** 对应 Java `onProximityUpdate()`。 */
  override onProximityUpdate(): void{
    super.onProximityUpdate();

    if(this.wall.autotile) this.updateAutotileBits();
  }

  /** 对应 Java `onProximityRemoved()`。 */
  override onProximityRemoved(): void{
    super.onProximityRemoved();

    if(this.wall.autotile) this.updateOtherBits();
  }

  /** 对应 Java `onProximityAdded()`。 */
  override onProximityAdded(): void{
    super.onProximityAdded();

    if(this.wall.autotile && !Vars.world.isGenerating()) this.updateOtherBits();
  }

  // Java `drawCached()` / `draw()` —— 渲染路径，见文件头。
  // Java `collision(Bullet)` —— 子弹系统，见文件头。
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

  /** Java `protected TextureRegion[] autotileRegions` —— 见文件头（`load()` 未移植）。 */

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
