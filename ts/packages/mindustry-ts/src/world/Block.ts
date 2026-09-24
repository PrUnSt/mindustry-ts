// 源: core/src/mindustry/world/Block.java (1500+ 行)
//
// 移植范围（S3 必需 + 被移植子类的字段）: 构造器、`initBuilding()`、`init()`、`postInit()`、
// `hasBuilding/newBuilding/isMultiblock/isStatic/isAir/isFloor/asFloor/isDarkened/blockChanged/
// canReplace/supportsEnv/requirements/isVisible/isPlaceable/isBanned/synthetic`。
//
// 未移植（逐条标注，避免静默丢失语义）:
//   - 全部绘制路径（`draw*` / `icons()` / `getDisplayIcon` / `getDisplayName` / 贴图字段）
//     → 计划 §9「渲染不做」
//   - 消耗品系统（`consumeBuilder` / `consumers` / `Consume*` / `consPower` / `setBars`）
//     → 计划 §9；`init()` 里对应的段落已删除并在原位留了 TODO
//   - 逻辑/编辑器面（`configurations` / `buildEditorConfig` / `logicConfigurable` / `lastConfig`）
//     → 计划 §9
//   - `canReplace` 的 `subclass` 比较：`subclass` 仍按 Java 语义赋为「运行时类」，
//     但 Java 里有 `getDeclaredClasses()` 的反射扫描，TS 侧改为**显式 `buildType` 注册**
//     （⚠️ 陷阱 #6，见 `initBuilding()` 的说明）
//
// ⚠️ 陷阱 #5（计划 §6.2）: `timerDump = timers++` 依赖「字段按声明顺序初始化」。
// `tsconfig.base.json` 的 `useDefineForClassFields: false` 让 TS 把带初值的字段编译成
// 构造器里的顺序赋值（紧随 `super(...)` 之后），这与 Java 的实例初始化顺序一致。
// 因此 `timers` 必须**声明在** `timerDump` 之前，且 `useDefineForClassFields` 不能改成 true。
//
// ⚠️ 陷阱 #6（计划 §6.2）: Java 的 `initBuilding()` 用 `getClass().isAnonymousClass()` +
// `getDeclaredClasses()` 反射找内嵌的 `Building` 子类。TS 没有等价物，**且不写临时反射 shim**；
// 改为：每个具体方块类在自己的构造器里显式赋值 `this.buildType = () => new XxxBuild(this)`。
// 兜底值仍是 Java 的 `Building::create`。语义差异只在「忘写 buildType」时表现为用默认建筑
// （Java 是反射失败 → 同样回落到默认值），风险已由 `set-block` 测试覆盖。

import { Mathf } from "@mindustry-ts/arc";
import type { Prov } from "@mindustry-ts/arc";
import { Color } from "../arc-compat/Color.js";
import { ContentType } from "../ctype/ContentType.js";
import { UnlockableContent } from "../ctype/UnlockableContent.js";
import { Vars } from "../Vars.js";
import { Category } from "../type/Category.js";
import type { Item } from "../type/Item.js";
import type { ItemStack } from "../type/ItemStack.js";
import { CacheLayer } from "../mocks/CacheLayer.js";
import { Fx, Effect } from "../mocks/Fx.js";
import { Sounds, Sound } from "../mocks/Sounds.js";
import { TargetPriority } from "../entities/TargetPriority.js";
import { Attributes } from "./meta/Attributes.js";
import { BuildVisibility } from "./meta/BuildVisibility.js";
import { BlockGroup } from "./meta/BlockGroup.js";
import { Env } from "./meta/Env.js";
import { Building } from "../gen/Building.js";
import type { Floor } from "./blocks/environment/Floor.js";
import type { Tile } from "./Tile.js";
import type { Team } from "../game/Team.js";

/** 对应 `mindustry.world.Block`（Java 里是具体类，不是抽象类 —— 见 `Block.java:43`）。 */
export class Block extends UnlockableContent{
  // ---- 尺寸 / 位置 ----
  /** 多块结构的尺寸（1 = 单块）。 */
  size = 1;
  /** 多块结构用的绘制偏移（`init()` 里算）。 */
  offset = 0;
  /** 多块结构迭代用的偏移（`init()` 里算）。 */
  sizeOffset = 0;

  // ---- 生命 / 损坏 ----
  /** 建筑血量；-1 表示用 `scaledHealth` 计算（`init()` 里算）。 */
  health = -1;
  /** 每格血量，乘以 `size * size`；< 0 时取默认 40。 */
  scaledHealth = -1;
  /** 减伤（类似护甲）。 */
  armor = 0;
  /** 基础爆炸性。 */
  baseExplosiveness = 0;
  /** 按物品/液体折算爆炸性的系数。 */
  explosivenessScale = 1;
  /** 按物品/液体折算可燃性的系数。 */
  flammabilityScale = 1;
  /** 摧毁时的屏幕震动基础值。 */
  baseShake = 3;
  /** 摧毁时是否绘制裂纹。 */
  drawCracks = true;
  /** 摧毁时是否产生碎石。 */
  createRubble = true;

  // ---- 行为开关 ----
  /** 是否有会逐 tick 更新的建筑实体。 */
  update = false;
  /** 是否有血量、可被摧毁。注意 `update = true` 时把它设成 false 无效（Java 注释）。 */
  destructible = false;
  /** 是否实体（阻挡单位/子弹）。 */
  solid = false;
  /** 是否**可以**是实体（`solid` 的候选位）。 */
  solidifes = false;
  /** 是否能被右键拆除。 */
  breakable = false;
  /** 是否会被特定单位碾压破坏。 */
  unitMoveBreakable = false;
  /** 放置时是否直接替换已有方块。 */
  alwaysReplace = false;
  /** 是否能被其它方块替换。 */
  replaceable = true;
  /** 是否只能被特权处理器使用（逻辑）。 */
  privileged = false;
  /** 是否不可被玩家挖掘。 */
  playerUnmineable = false;
  /** 是否总是允许在此方块上卸载物品（不受 onlyDepositCore 规则影响）。 */
  alwaysAllowDeposit = false;
  /** 是否可放入载荷。 */
  allowedInPayloads = true;
  /** 是否能输出载荷。 */
  outputsPayload = false;
  /** 是否能接收单位载荷。 */
  acceptsUnitPayloads = false;
  /** 是否能接收载荷。 */
  acceptsPayload = false;
  /** 是否接收物品（影响混合绘制）。 */
  acceptsItems = false;
  /** 是否整块绘制（多块结构/静态墙用）。 */
  fillsTile = true;
  /** 是否会被黑暗/迷雾覆盖（即使合成）。 */
  forceDark = false;
  /** 是否被光照遮挡。 */
  obstructsLight = true;
  /** 是否可被子弹击中的例外：为 true 时子弹不会命中它（除非显式瞄准）。 */
  underBullets = false;
  /** 卸货器是否能作用于此方块。 */
  unloadable = true;

  // ---- 物品 / 液体 / 电力 ----
  /** 是否有物品模块。 */
  hasItems = false;
  /**
   * 是否有消耗品（`Consume*`）。对应 Java `public boolean hasConsumers`（`Block.java:418`），
   * 由 `Block.init()` 里的 `hasConsumers = consumers.length > 0` 赋值。
   *
   * ⚠️ S4 有意收窄: `consumeBuilder` / `consumers` 体系未移植（计划 §9）→ 恒为 false。
   * 这与 Java 在「没有调用任何 `consume(...)`」时的结果一致，且是
   * `BuildingComp.updateConsumption()` 选择「无消费者快路径」的**唯一**依据。
   */
  hasConsumers = false;
  /** 是否有液体模块。 */
  hasLiquids = false;
  /** 是否有电力模块。 */
  hasPower = false;
  /** 是否消耗电力。 */
  consumesPower = false;
  /** 是否输出电力。 */
  outputsPower = false;
  /** 是否连接电力。 */
  connectedPower = false;
  /** 每种物品的最大携带量。 */
  itemCapacity = 10;
  /** 各物品容量是否互相独立（而非合并为单一总数）。 */
  separateItemCapacity = false;
  /** 最大液体总量；-1 表示按最大消耗量计算。 */
  liquidCapacity = -1;
  /** 液体输出速度倍率。 */
  liquidPressure = 1;
  /** 是否向外输出（按朝向）。 */
  outputFacing = true;
  /**
   * 是否「瞬时传递」（`Router` 的 `updateTile` 会读它来跳过等待；`OverflowGate` 置 true）。
   * 对应 Java `public boolean instantTransfer = false`（`Block.java:393`）。
   */
  instantTransfer = false;
  /** 是否不接收侧向输入（装甲传送带）。 */
  noSideBlend = false;
  /** 是否显示流量。 */
  displayFlow = true;
  /** 该方块采掘时掉落的物品。 */
  itemDrop: Item | null = null;

  /**
   * 环境属性表（水量/油量/热量…）。对应 Java `public Attributes attributes = new Attributes()`
   * （`Block.java:189`）。S4 起由环境地板（`grass` / `snow` / `sand-floor`）与矿石写入。
   */
  attributes = new Attributes();

  // ---- 放置 / 环境 ----
  /** 是否可放置在水中。 */
  placeableLiquid = false;
  /** 是否可由玩家直接放置。 */
  placeablePlayer = true;
  /** 是否可在其上放置方块。 */
  placeableOn = true;
  /** 是否只可放在水上。 */
  requiresWater = false;
  /** 是否可放置在任意液体上。 */
  placeableLiquidAnywhere = false;
  /** 是否可浮空（可放在液体边缘）。 */
  floating = false;
  /** 是否允许矩形放置。 */
  allowRectanglePlacement = false;
  /** 是否允许对角线放置。 */
  allowDiagonal = true;
  /** 是否交换对角放置模式。 */
  swapDiagonalPlacement = false;
  /** 是否使用传送带式放置模式。 */
  conveyorPlacement = false;
  /** 是否在编辑器中可见。 */
  inEditor = true;
  /** 是否被坦克碾压时立即摧毁。 */
  crushFragile = false;
  /** 坦克对该方块造成的伤害倍率。 */
  crushDamageMultiplier = 1;
  /** 当 `placeRangeCheck` 开启时检查的敌方方块范围。 */
  placeOverlapRange = 50;
  /** 是否能被超频。 */
  canOverdrive = true;
  /** 当无逻辑交互时是否自动恢复启用状态。 */
  autoResetEnabled = true;
  /** 被禁用时是否停止更新。 */
  noUpdateDisabled = false;
  /** 是否绘制禁用状态。 */
  drawDisabled = true;

  /** 环境位掩码：**全部**必须满足。 */
  envRequired = 0;
  /** 环境位掩码：满足**任意一位**即可工作（默认 `Env.terrestrial`）。 */
  envEnabled = Env.terrestrial;
  /** 环境位掩码：命中任意一位即**禁用**。 */
  envDisabled = 0;

  // ---- 外观元数据（S3 不渲染，仅保留值以对齐 Java 与后续阶段） ----
  /** 是否绘制动态层。 */
  drawDynamic = true;
  /** 是否走缓存绘制路径。 */
  drawCached = false;
  /** 是否在绘制中使用颜色。 */
  useColor = true;
  /** 精灵是否为完整方形。 */
  squareSprite = true;
  /** 是否有阴影。 */
  hasShadow = true;
  /** 是否使用自定义阴影。 */
  customShadow = false;
  /** 变体数量。 */
  variants = 0;
  /** 是否可旋转。 */
  rotate = false;
  /** `rotate` 为 true 但此项为 false 时贴图不旋转。 */
  rotateDraw = true;
  /** 缩略图尺寸（`UnlockableContent.selectionSize` 默认 24，`Block` 构造器改成 28）。 */
  // 见构造器
  /** 缓存层；`CacheLayer.walls` 意味着「静态墙」（`isStatic()`）。 */
  cacheLayer = CacheLayer.normal;
  /** 小地图颜色。 */
  mapColor = new Color(0, 0, 0, 1);
  /** 是否有小地图颜色。 */
  hasColor = false;
  /** 描边颜色。 */
  outlineColor = Color.valueOf("404049");
  /** 描边图集索引。 */
  outlinedIcon = -1;
  /** 描边半径。 */
  outlineRadius = 4;
  /** 环境光颜色。 */
  lightColor = new Color(1, 1, 1, 1);
  /** 是否发光。 */
  emitLight = false;
  /** 发光半径。 */
  lightRadius = 60;
  /** 裁剪尺寸。 */
  clipSize = -1;
  /** 光照裁剪尺寸。 */
  lightClipSize = 0;
  /** 反照率。 */
  albedo = 0;
  /** 揭开迷雾的半径（格）；<= 0 表示禁用。 */
  fogRadius = -1;

  // ---- 音效 ----
  /** 建造时播放的音效。 */
  placeSound: Sound = Sounds.unset;
  /** 拆除时播放的音效。 */
  breakSound: Sound = Sounds.unset;
  /** 摧毁时播放的音效。 */
  destroySound: Sound = Sounds.unset;
  /** 摧毁音效音量。 */
  destroySoundVolume = 1;
  /** 摧毁音效音高范围。 */
  destroyPitchMin = 1;
  destroyPitchMax = 1;
  /** 建造音效是否变调。 */
  breakPitchChange = true;
  /** 放置音效是否变调。 */
  placePitchChange = true;
  /** 待机音效。 */
  ambientSound: Sound = Sounds.none;
  /** 待机音效基础音量。 */
  ambientSoundVolume = 0.05;
  /** 配置时的音效。 */
  configureSound: Sound = Sounds.click;

  // ---- 效果 ----
  /** 放置效果。 */
  placeEffect: Effect = Fx.placeBlock;
  /** 拆除效果。 */
  breakEffect: Effect = Fx.breakBlock;
  /** 摧毁效果。 */
  destroyEffect: Effect = Fx.dynamicExplosion;

  // ---- 建造 ----
  /**
   * 建造该方块所需物品。**只应由 `setRequirements(...)` 写入**。
   *
   * ⚠️ 陷阱 #16（**TS 相对 Java 的一处被迫改名**）: Java 里 `requirements` 同时是
   * **字段**（`public ItemStack[] requirements`）与**方法**（`requirements(Category, ItemStack...)`），
   * TS 不允许同名（`TS2300`，属性会静默吃掉方法）。处置：**保留字段名** `requirements`
   * （它是被全项目**直接读写**的数据，Java 里还有 `requirements = ItemStack.mult(...)`
   * 这种直接赋值），把三个便捷设置方法加 `set` 前缀改名。
   * 判据与 `Tile.block()/floor()/overlay()` 一致：公开的「数据本身」保名，
   * 另一侧改名 —— 见 `world/Tile.ts` 字段区的同一说明。
   */
  requirements: ItemStack[] = [];
  /** 放置菜单中的分类。 */
  category: Category = Category.distribution;
  /** 建造耗时（tick）；< 0 表示动态计算。 */
  buildTime = -1;
  /** 是否可见且当前可建造。 */
  buildVisibility: BuildVisibility = BuildVisibility.hidden;
  /** 建造速度倍率。 */
  buildCostMultiplier = 1;
  /** 拆除完成阈值。 */
  deconstructThreshold = 0;
  /** 是否立即拆除（立即拆除意味着不退还资源）。 */
  instantDeconstruct = false;
  /** 是否立即建造（意味着不消耗资源）。仅性能用途。 */
  instantBuild = false;
  /** 是否可在黑暗区域放置（只用于编辑器静态墙）。 */
  ignoreBuildDarkness = false;
  /** 科研成本倍率。 */
  researchCostMultiplier = 1;
  /** 科研成本覆盖值；为 null 时用 requirements 计算。 */
  researchCost: ItemStack[] | null = null;
  /** 若设置，所有该方块都被强制归为此队伍（`Tile.setBlock` 会读它）。 */
  forceTeam: Team | null = null;

  // ---- 分组 / 目标 ----
  /** 方块分组；`canReplace` 默认用它判断。 */
  group: BlockGroup = BlockGroup.none;
  /** 敌方瞄准优先级。 */
  priority = TargetPriority.base;
  /** 是否可被单位瞄准。 */
  targetable = true;
  /** 是否攻击（炮塔）。 */
  attacks = false;
  /** 是否可被特殊单位/导弹压制。 */
  suppressable = false;
  /** 是否是可修复的无主方块。 */
  allowDerelictRepair = true;
  /** 是否可旋转（放置后）。 */
  quickRotate = true;

  // ---- 网络 / 存档 ----
  /** 是否周期性同步到客户端。 */
  sync = false;
  /** 静态方块专用：是否把 tile 的 `data()` 存入世界数据。 */
  saveData = false;
  /** 是否可被重建（加入 brokenblocks）。 */
  rebuildable = true;
  /** 是否把该方块记录为单位上限修正（需 `BlockFlag.unitModifier`）。 */
  unitCapModifier = 0;

  // ---- 逻辑 / 编辑器（值保留，S3 无实现） ----
  /** 是否可在编辑器中配置。 */
  editorConfigurable = false;
  /** 是否可通过逻辑配置。 */
  logicConfigurable = false;
  /** 是否保存上次配置并应用到新放置的方块。 */
  saveConfig = false;
  /** 是否允许中键复制配置。 */
  copyConfig = true;
  /** 是否双击清空配置。 */
  clearOnDoubleTap = false;

  /** 主类（非匿名子类）。Java 在 `initBuilding()` 里用反射取；TS 取运行时构造器。 */
  subclass: unknown = null;
  /**
   * 该方块对应的建筑工厂。`init()` 之前由 `initBuilding()` / 具体方块构造器赋值。
   * **不要**手写反射 shim（陷阱 #6）。
   */
  buildType: Prov<Building> | null = null;

  /** 定时器数量上限。**必须声明在 `timerDump` 之前**（陷阱 #5）。 */
  timers = 0;
  /** dump 定时器 id（Java `protected final int timerDump = timers++`）。 */
  protected readonly timerDump: number = this.timers++;
  /** 尝试 dump 物品的间隔（tick），5 = 12 次/秒。 */
  dumpTime = 5;

  /** 对应 Java `public Block(String name)`。 */
  constructor(name: string){
    super(name);
    this.initBuilding();
    this.selectionSize = 28;
  }
  /**
   * 对应 Java `Block.initBuilding()`。
   * Java 用反射（`getClass()` / `getDeclaredClasses()`）找内嵌的 `Building` 子类；
   * TS 改为**具体方块显式设置 `buildType`**（陷阱 #6），这里只做两件事：
   *   1. 把 `subclass` 记为运行时构造器（Java `subclass = current`）；
   *   2. 兜底 `buildType = Building::create`（与 Java 的落点一致）。
   */
  protected initBuilding(): void{
    this.subclass = this.constructor;
    if(this.buildType === null){
      // 对应 Java 末尾的 `if(buildType == null) buildType = Building::create;`
      this.buildType = () => Building.create();
    }
  }

  // ---------------------------------------------------------------- 查询

  /** @return 该方块是否有建筑实体。对应 Java `hasBuilding()`。 */
  hasBuilding(): boolean{
    return this.destructible || this.update;
  }

  /** @return 新建该方块对应的建筑。对应 Java `newBuilding()`。 */
  newBuilding(): Building{
    // buildType 在构造期已保证非 null（见 initBuilding 的兜底）
    return this.buildType!();
  }

  /** @return 是否是多块结构。对应 Java `isMultiblock()`。 */
  isMultiblock(): boolean{
    return this.size > 1;
  }

  /** @return 是否为静态墙（缓存层 = walls）。对应 Java `isStatic()`。 */
  isStatic(): boolean{
    return this.cacheLayer === CacheLayer.walls;
  }

  /**
   * @return 是否为地板。对应 Java `isFloor()`（Java 是 `this instanceof Floor`）。
   * Java 的 `instanceof` 与 TS 的 `instanceof` 会被 ESM 环依赖与「同包双实例」风险破坏，
   * 因此改用**显式标记**：`Floor` 覆写本方法返回 true（不引入运行时环）。
   */
  isFloor(): boolean{
    return false;
  }

  /** @return 是否为覆盖层地板。对应 Java `isOverlay()`。同上改用显式覆写。 */
  isOverlay(): boolean{
    return false;
  }

  /**
   * @return 是否为静态墙。对应 Java `StaticWall.canReplace` 里的 `other instanceof StaticWall`
   * （`StaticWall.java:73`）。同样改用显式标记，避免 `instanceof` 在 ESM 环依赖/双模块实例下的脆弱性。
   */
  isStaticWall(): boolean{
    return false;
  }

  /** @return 是否为空气方块（id 0）。对应 Java `isAir()`。 */
  isAir(): boolean{
    return this.id === 0;
  }

  /** @return 该方块是否输出物品。对应 Java `outputsItems()`（`Block.java:608`）：恒等于 `hasItems`。 */
  outputsItems(): boolean{
    return this.hasItems;
  }

  /**
   * @return 该方块是否按朝向决定输出方向。对应 Java `rotatedOutput(int,int)`（`Block.java:622`）：
   * 默认恒等于 `rotate`。
   * ⚠️ Java 另有一个 `rotatedOutput(int,int,Tile)` 重载（`Block.java:626`）同样返回 `rotate`；
   * TS 用可选参数合一，语义相同。
   */
  rotatedOutput(_fromX?: number, _fromY?: number, _destination?: Tile): boolean{
    return this.rotate;
  }

  /** 对应 Java `canPlaceOn(Tile, Team, int)`（`Block` 默认恒 true）。 */
  canPlaceOn(_tile: Tile, _team: Team, _rotation: number): boolean{
    return true;
  }

  /**
   * @return 该方块是否把 `item` 当作消耗品。对应 Java `consumesItem(Item)`（`Block.java:787`）。
   *
   * ⚠️ 有意收窄（S4）: Java 的实现是 `consumers.length > 0 && Structs.contains(...)`，
   * 依赖未移植的 `Consume` 体系（计划 §9：不做消耗品）。S4 的方块集合里没有任何
   * consumer（`Block.hasConsumers` 恒 false），故恒返回 false —— 与 Java 在
   * 「无消费者」时的结果一致，**不是**静默省略（`hasConsumers` 字段也一并补上并恒为 false）。
   */
  consumesItem(_item: Item): boolean{
    return false;
  }

  /** 对应 Java `asFloor()`：把本方块视作地板（Java 是 `(Floor)this` 强转）。 */
  asFloor(): Floor{
    return this as unknown as Floor;
  }

  /** @return 是否是玩家/单位放置的方块。对应 Java `synthetic()`。 */
  synthetic(): boolean{
    return this.update || this.destructible;
  }

  /** 对应 Java `checkForceDark(Tile)`。 */
  checkForceDark(_tile: Tile): boolean{
    return this.forceDark;
  }

  /**
   * @return 地图边缘黑暗是否作用于该方块。对应 Java `isDarkened(Tile)`。
   * ⚠️ 注意 Java 用的是 `synthetic()`（`Block.synthetic`），不是 `Tile.synthetic()`。
   */
  isDarkened(_tile: Tile): boolean{
    return this.solid && ((!this.synthetic() && this.fillsTile) || this.checkForceDark(_tile));
  }

  /** 对应 Java `supportsEnv(int)`。 */
  supportsEnv(env: number): boolean{
    return (
      (this.envEnabled & env) !== 0 &&
      (this.envDisabled & env) === 0 &&
      (this.envRequired === 0 || (this.envRequired & env) === this.envRequired)
    );
  }

  /** 对应 Java `isVisible()`。 */
  isVisible(): boolean{
    return (
      !this.isHidden() &&
      (Vars.state.rules.editor || !Vars.state.rules.hideBannedBlocks || !this.isBanned())
    );
  }

  /** 对应 Java `isPlaceable()`。 */
  isPlaceable(): boolean{
    return this.isVisible() && (!this.isBanned() || Vars.state.rules.editor) && this.supportsEnv(Vars.state.rules.env);
  }

  /** 对应 Java `isBanned()`。 */
  isBanned(): boolean{
    return Vars.state.rules.isBanned(this);
  }

  /** 对应 Java `canBeBuilt()`。 */
  canBeBuilt(): boolean{
    return this.buildVisibility !== BuildVisibility.hidden && this.buildVisibility !== BuildVisibility.debugOnly;
  }

  /**
   * 对应 Java `canReplace(Block)`。Java 的 `subclass` 是 `Class<?>`，TS 里存运行时构造器，
   * 因此 `subclass == other.subclass` 变成 `===` 比较，语义一致。
   */
  canReplace(other: Block): boolean{
    if(other.alwaysReplace) return true;
    if(other.privileged) return false;
    return (
      other.replaceable &&
      (other !== this || (this.rotate && this.quickRotate)) &&
      ((this.group !== BlockGroup.none && other.group === this.group) || other === this) &&
      (this.size === other.size ||
        (this.size >= other.size &&
          ((this.subclass !== null && this.subclass === other.subclass) || this.group.anyReplace)))
    );
  }

  // ---------------------------------------------------------------- 配置

  /** 对应 Java `requirements(Category, ItemStack[], boolean)`。⚠️ 改名原因见 `requirements` 字段。 */
  setRequirementsUnlocked(cat: Category, stacks: ItemStack[], unlocked: boolean): void{
    this.setRequirements(cat, stacks);
    this.alwaysUnlocked = unlocked;
  }

  /** 对应 Java `requirements(Category, ItemStack[])`。⚠️ 改名原因见 `requirements` 字段。 */
  setRequirements(cat: Category, stacks: ItemStack[]): void{
    this.setRequirementsWithVisibility(cat, BuildVisibility.shown, stacks);
  }

  /** 对应 Java `requirements(Category, BuildVisibility, ItemStack[])`。⚠️ 同上。 */
  setRequirementsWithVisibility(cat: Category, visible: BuildVisibility, stacks: ItemStack[]): void{
    this.category = cat;
    this.requirements = stacks;
    this.buildVisibility = visible;
    // Java: Arrays.sort(requirements, comparingInt(i -> i.item.id))
    this.requirements.sort((a, b) => a.item.id - b.item.id);
  }

  // ---------------------------------------------------------------- 生命周期

  /** 由 `Tile.setBlock` 调用。对应 Java `blockChanged(Tile)`。 */
  blockChanged(_tile: Tile): void{ }

  /** 由子类覆写（S3 无 bars）。对应 Java `setBars()`。 */
  protected setBars(): void{ }

  /**
   * 全部方块创建完成后调用。对应 Java `Block.init()`。
   *
   * 未移植段落（原位标注）: 消耗品（`consumeBuilder` / `ConsumeLiquidBase` / `ConsumeLiquids`
   * → `liquidCapacity` 推导、`Consume.apply`）、`configurations` 逻辑、`consPower.buffered` 警告。
   */
  override init(): void{
    super.init();

    if(this.destroySound === Sounds.unset){
      this.destroySound =
        this.size >= 3
          ? Sounds.blockExplode3
          : this.size >= 2
            ? Sounds.blockExplode2
            : Sounds.blockExplode1;
    }

    if(this.placeSound === Sounds.unset){
      this.placeSound =
        this.size >= 3 ? Sounds.blockPlace3 : this.size >= 2 ? Sounds.blockPlace2 : Sounds.blockPlace1;
    }

    if(this.breakSound === Sounds.unset){
      this.breakSound =
        this.size >= 3 ? Sounds.blockBreak3 : this.size >= 2 ? Sounds.blockBreak2 : Sounds.blockBreak1;
    }

    // 禁用标准阴影
    if(this.customShadow){
      this.hasShadow = false;
    }

    if(this.underBullets){
      this.priority = TargetPriority.under;
    }

    // TODO(S4): fogRadius → flags.with(BlockFlag.hasFogRadius)
    // TODO(S4): sync → flags.with(BlockFlag.synced)

    // 按尺寸推导默认血量
    if(this.health === -1){
      let round = false;
      if(this.scaledHealth < 0){
        this.scaledHealth = 40;

        let scaling = 1;
        for(const stack of this.requirements){
          scaling += stack.item.healthScaling;
        }

        this.scaledHealth *= scaling;
        round = true;
      }

      this.health = round
        ? Mathf.round(this.size * this.size * this.scaledHealth, 5)
        : ((this.size * this.size * this.scaledHealth) | 0);
    }

    this.clipSize = Math.max(this.clipSize, this.size * Vars.tilesize);
    this.lightClipSize = Math.max(this.lightClipSize, this.clipSize);

    // TODO(S4): hasLiquids && drawLiquidLight → emitLight = true
    // TODO(S4): liquidCapacity < 0 时按液体消耗量推导
    // TODO(S4): emitLight → lightClipSize = max(lightClipSize, lightRadius * 2)

    if(this.group === BlockGroup.transportation || this.category === Category.distribution){
      this.acceptsItems = true;
    }

    this.offset = (((this.size + 1) % 2) * Vars.tilesize) / 2;
    this.sizeOffset = -((this.size - 1) / 2);

    if(this.requirements.length > 0 && this.buildTime < 0){
      this.buildTime = 0;
      for(const stack of this.requirements){
        this.buildTime += stack.amount * stack.item.cost;
      }
    }

    if(this.buildTime < 0){
      this.buildTime = 20;
    }

    this.buildTime *= this.buildCostMultiplier;

    // TODO(S4): consumers / optionalConsumers / nonOptionalConsumers / updateConsumers 数组
    //           （依赖 Consume* 体系）以及 `content.liquids().size`。

    this.setBars();

    // TODO(S4): logicConfigurable 的 configurations 扫描
    // TODO(S4): outputsPower && consPower.buffered 的 Log.warn

    if(this.buildVisibility === BuildVisibility.sandboxOnly){
      this.hideDetails = false;
    }
  }

  /** 对应 Java `Block.postInit()`。 */
  override postInit(): void{
    // TODO(S5): requirements.length > 0 时按 shownPlanets 自动分配可显示行星（依赖 Planet）

    if(this.databaseTag === null || this.databaseTag.length === 0){
      this.databaseTag = Category[this.category]!;
    }

    super.postInit();
  }

  override getContentType(): ContentType{
    return ContentType.block;
  }

  /** 对应 Java `Block.toString()`（`UnlockableContent` 未覆写，`Content.toString` 是 `类型#id`）。 */
  override toString(): string{
    return super.toString();
  }
}
