// 源: core/src/mindustry/world/blocks/environment/Floor.java (470 行)
//
// 移植范围: 构造器、`init()`、`damages()`、`isDeep()`、`floorChanged()`、`hasSurface()`、
// 以及与 tick/数据相关的字段。**未移植**（原位标注）:
//   - `load()` / `getDisplayIcon` / `getDisplayName` / `edges()` / `blend()` / `drawBase`
//     / `renderUpdate` / `UpdateRenderState` —— 全部渲染路径（计划 §9）
//   - `realBlendId` / `blenders` / `blended` / `dirs` 等混合绘制缓存（同上）
//
// ⚠️ 自举关键点（陷阱 #2）: `wall` / `decoration` 的**字段初值**读 `Blocks.air`
// （`Floor.java:68,70`）。创建 `air` 自身时 `Blocks.air` 还是 undefined，所以：
//   - `AirBlock` 构造器会把它改成 `this`（`AirBlock.java:14`），语义与 Java 完全一致；
//   - 其它 Floor 创建时 `Blocks.air` 已就绪（`Blocks.load()` 第一条就是 `air`）。

import { Vars } from "../../../Vars.js";
import { Block } from "../../Block.js";
import { Sound, Sounds } from "../../../mocks/Sounds.js";
import { Effect, Fx } from "../../../mocks/Fx.js";
import { StatusEffect, StatusEffects } from "../../../mocks/StatusEffects.js";
import { Blocks } from "../../../content/Blocks.js";
import type { Liquid } from "../../../type/Liquid.js";
import type { Tile } from "../../Tile.js";

/** 对应 `mindustry.world.blocks.environment.Floor`。 */
export class Floor extends Block{
  /** 边缘回退用的地板名（主要用于矿石）。 */
  edge = "stone";
  /** 单位走在其上的速度倍率。 */
  speedMultiplier = 1;
  /** 单位走在其上的阻力倍率。 */
  dragMultiplier = 1;
  /** 每 tick 受到的地板伤害。 */
  damageTaken = 0;
  /** 溺水所需的 tick 数，0 表示禁用。 */
  drownTime = 0;
  /** 走在其上的效果。 */
  walkEffect: Effect = Fx.none;
  /** 走在其上的音效。 */
  walkSound: Sound = Sounds.none;
  /** 走得音效音量。 */
  walkSoundVolume = 0.1;
  walkSoundPitchMin = 0.8;
  walkSoundPitchMax = 1.2;
  /** 溺水时显示的持续效果。 */
  drownUpdateEffect: Effect = Fx.bubble;
  /** 走在其上时施加的状态。 */
  status: StatusEffect = StatusEffects.none;
  /** 施加状态的强度。 */
  statusDuration = 60;
  /** 该地板掉落的液体（用于抽水机）。 */
  liquidDrop: Liquid | null = null;
  /** 泵出液体的倍率（深水用）。 */
  liquidMultiplier = 1;
  /** 该方块是否为液体。 */
  isLiquid = false;
  /** 液体地板覆盖层的不透明度。 */
  overlayAlpha = 0.65;
  /** 该地板是否支持作为覆盖层的基底。 */
  supportsOverlay = false;
  /** 若为 false，该地板不能作为覆盖层（液体底层）叠在支持它的地板上。 */
  supportsBeingOverlaid = true;
  /** 浅水标记，供地图生成使用。 */
  shallow = false;
  /** 该方块不对其绘制边缘的方块分组。 */
  blendGroup: Block = this;
  /** 该矿石是否默认在地图中生成。 */
  oreDefault = false;
  /** 矿石生成参数。 */
  oreScale = 24;
  oreThreshold = 0.828;
  /**
   * 该地板的墙变体。可能是 `Blocks.air`（未找到时）。
   * ⚠️ 字段初值读 `Blocks.air` —— 见文件头的自举说明。
   */
  wall: Block = Blocks.air as unknown as Block;
  /** 装饰方块，通常是石头。可能是 `air`。 */
  decoration: Block = Blocks.air as unknown as Block;
  /** 单位是否可以在其上绘制阴影。 */
  canShadow = true;
  /** 若为 true，该地板忽略覆盖层的 obstructsLight 标记。 */
  forceDrawLight = false;
  /** 该覆盖层是否需要基底。漂浮方块（如 spawn）为 false。 */
  needsSurface = true;
  /** 若为 true，核心可放在该地板上。 */
  allowCorePlacement = false;
  /** 该矿石是否允许出现在墙上。 */
  wallOre = false;
  /** 用于混合分组的实际 id（内部使用）。 */
  blendId = -1;
  /** > 0 时该地板作为大图的一部分绘制。 */
  tilingVariants = 0;
  /** 是否使用自动拼接（参见 tile-gen）。 */
  autotile = false;
  /** 自动拼接中间区域的随机变体数。 */
  autotileMidVariants = 1;
  /** 自动拼接的变体数。 */
  autotileVariants = 1;
  /** 若为 true（默认），该地板会绘制其它地板的边缘。 */
  drawEdgeIn = true;
  /** 若为 true（默认），该地板会把自身边缘绘制到其它地板上。 */
  drawEdgeOut = true;

  constructor(name: string, variants = 3){
    super(name);
    this.variants = variants;
    this.placeableLiquid = true;
    this.allowRectanglePlacement = true;
    this.instantBuild = true;
    this.ignoreBuildDarkness = true;
    this.obstructsLight = false;
    this.placeEffect = Fx.rotateBlock;
  }

  /** 对应 Java `isFloor()`：`this instanceof Floor`。 */
  override isFloor(): boolean{
    return true;
  }

  /**
   * 对应 Java `Floor.init()`。注意顺序：先 `super.init()`，再解析 `wall` 变体。
   * ⚠️ `wall == Blocks.air` 是**身份比较**，不是「未设置」。语义与 Java 一致。
   */
  override init(): void{
    super.init();

    this.blendId = this.blendGroup.id;

    if(this.wall === (Blocks.air as unknown as Block)){
      this.wall = Vars.content.block(this.name + "-wall") as Block;
      if(this.wall === null){
        this.wall = Vars.content.block(this.name.replace("darksand", "dune") + "-wall") as Block;
      }
    }

    // 找不到就保留默认值
    if(this.wall === null){
      this.wall = Blocks.air as unknown as Block;
    }

    // 尝试加载默认的巨石装饰
    if(this.decoration === null){
      this.decoration = Vars.content.block(this.name + "-boulder") as Block;
    }

    if(this.isLiquid && this.walkEffect === Fx.none){
      this.walkEffect = Fx.ripple;
    }

    if(this.isLiquid && this.walkSound === Sounds.none){
      this.walkSound = Sounds.stepWater;
    }
  }

  /** 对应 Java `Floor.floorChanged(Tile)`。 */
  floorChanged(_tile: Tile): void{ }

  /** @return 该地板是否有可供放置（如焦痕）的有效表面。对应 Java `hasSurface()`。 */
  hasSurface(): boolean{
    return !this.isLiquid && !this.solid;
  }

  /** 对应 Java `Floor.isDeep()`。 */
  isDeep(): boolean{
    return this.drownTime > 0;
  }

  /** @return 站在该地板上是否会伤害单位。对应 Java `Floor.damages()`。 */
  damages(): boolean{
    return this.damageTaken > 0 || (this.status !== null && this.status.damage > 0);
  }

  /** 对应 Java `Floor.shouldIndex(Tile)`。 */
  shouldIndex(_tile: Tile): boolean{
    return true;
  }
}
