// 源: core/src/mindustry/world/blocks/production/Drill.java (401 行)
//
// 移植范围（S4）: `Drill` 的**方块级数据**（`hardnessDrillMultiplier` / `tier` / `drillTime` /
//   `liquidBoostIntensity` / `warmupSpeed` / `blockedItem(s)` / `drillMultipliers`）+
//   **选矿逻辑**（`getDrop` / `countOre` / `canMine` / `getDrillTime` / `canPlaceOn`）+
//   `DrillBuild` 的**全部 tick 行为**（`updateTile` / `shouldConsume` / `onProximityUpdate` /
//   `progress` / `pickedUp`）。
//
// 未移植（逐条标注，均为渲染 / 音效 / UI / 逻辑系统，计划 §9）:
//   - `drawPlanConfig(BuildPlan, Eachable)`（`Drill.java:99-111`）—— 放置预览贴图
//   - `setBars()` 的 `drillspeed` 条（`:113-119`）—— UI；`Bar` / `Core.bundle` / `Pal`
//   - `drawPlace(int,int,int,boolean)`（`:139-168`）—— 放置提示（贴图 + 文本）
//   - `setStats()`（`:174-191`）—— `Stat` / `StatValues` 目录（S4 未移植 `Stat`）
//   - `icons()`（`:193-196`）与全部 `@Load` 贴图字段（`:71-74`）、
//     `drawMineItem` / `drillEffect` / `drillEffectRnd` / `drillEffectChance` /
//     `rotateSpeed` / `updateEffect` / `updateEffectChance` / `drawRim` / `drawSpinSprite` /
//     `heatColor`（`:50-74`）—— 渲染（`Fx` 不可观测）
//   - `DrillBuild.shouldAmbientSound()` / `ambientVolume()`（`:251-259`）—— 音效
//   - `DrillBuild.drawSelect()`（`:261-264`）—— UI
//   - `senseObject` / `sense(LAccess)`（`:280-284` / `:332-336`）—— 逻辑处理器传感器
//   - `DrillBuild.draw()` / `drawCracks()` / `drawDefaultCracks()`（`:338-377`）—— 渲染
//   - `version()` / `write(Writes)` / `read(Reads, byte)`（`:379-398`）—— 存档 IO
//   - 构造器里的 `ambientSound = Sounds.loopDrill` / `ambientSoundVolume = 0.019f`（`:83-84`）
//     —— 音效；`flags = EnumSet.of(BlockFlag.drill)`（`:87`）—— `BlockFlag` 未移植
//     （与 `Turret.ts:282` 同一处置）。
//
// ⚠️ **液体 boost：公式保留，但第三个实参必须是字面 0**（本文件最容易出错的一处，必须说清）:
//   Java 的 `mechanical-drill` 定义里有 `consumeLiquid(Liquids.water, 0.05f).boost()`
//   （`Blocks.java:2893`），于是 `DrillBuild.updateTile` 里的
//       float speed = Mathf.lerp(1f, liquidBoostIntensity, optionalEfficiency) * efficiency;
//   （`Drill.java:301`）在「接水」时把 `speed` 拉到 `liquidBoostIntensity`（1.6）。
//
//   ⛔ 任务书给出的推理「S0 里无消费者 → optionalEfficiency === 0 → lerp(…,0) === 1」
//      与源码**不符**，实测（读源码 + 本测试）结论如下 —— 这条必须让编排方知道:
//     · S4 未移植 `Consume` 体系 → `Block.hasConsumers` 恒 false（`world/Block.ts:136`）
//       → `updateConsumption()` 走「无消费者快路径」，其赋值是
//       `efficiency = optionalEfficiency = shouldConsume() ? potentialEfficiency : 0`
//       （`BuildingComp.def.ts:226`，与 Java `BuildingComp.java:1952-1958` 逐字一致）。
//     · 钻头的 `shouldConsume()` 覆写成 `items.total() < itemCapacity && enabled && dominantItem != null`
//       → 有矿时恒为 **true** → `optionalEfficiency === 1`（**不是 0**）。
//     · 于是照抄 `optionalEfficiency` 会得到 `lerp(1, 1.6, 1) === 1.6`
//       —— 比 Java「未接水的 mechanical-drill」**快 1.6 倍**。
//     · Java 未接水时的真值是 1：因为 `mechanical-drill` **有** optional 消费者
//       （`consumeLiquid(water).boost()` 注册进 `block.optionalConsumers`），
//       `BuildingComp.java:1964-1977` 的 else 分支会把 `optionalEfficiency` 取成
//       「`ConsumeLiquidBase.efficiency(self())` 的最小值」= 未接水时 **0**
//       → `lerp(1, 1.6, 0) * 1 === 1`。
//
//   处置: **`speed` 公式结构原样保留**（含 `liquidBoostIntensity` 字段），但把「boost 是否生效」
//   这一位**显式写成字面 `0`**（＝「本钻头没有任何 boost 消费者 / 未接水」），并在其上留注释：
//   将来移植 `Consume` 体系时，把 `0` 换回 `optionalEfficiency` 即可回到 Java 语义。
//   这样 S4 的数值与 Java「未接水的钻头」**逐位一致**（speed = efficiency = 1）。
//   ✅ 已用 Java 基准交叉验证: `ts/golden/java-drill.txt` 的 tick 2 =
//      `lastDrillSpeed 9.230769E-5` = `(1 * 4 * 0.015) / 650` ⇒ speed = 1
//      （若照抄 `optionalEfficiency` 会得到 1.6 → 1.4769E-4，与 golden 不符）。
//   `hasLiquids = true` 与 `LiquidModule` 的分配同样未移植（无 `Consume` 就没有液体库存语义）。
//
// ⚠️ `progress()` 没有 `override` 关键字（S4 的一处**结构性差异**，必须知道）:
//   Java 的 `BuildingComp.progress()`（`BuildingComp.java:623`，返回 0）被本类覆写
//   （`Drill.java:327-330`）。但 S4 的 `BuildingComp.def.ts` **收窄掉了** `progress()`
//   （它唯一的消费者是逻辑传感器 `LAccess.progress` 与 UI 进度条，均属计划 §9），
//   生成基类里因此没有这个方法 → TS 侧这里只能当**新方法**声明，不能写 `override`
//   （写了会报 TS4112/TS4113 之外的「基类无此成员」错误）。
//   后果：`build.progress()` 在 TS 里对 `Building` 类型不可见，只有窄化到 `DrillBuild` 才可调用。
//   这与 Java 的差异仅限「类型层面」，数值语义完全一致。
//   同理 `pickedUp()`（`BuildingComp.pickedUp()`）也未出现在生成基类里，见其定义处。

import { Mathf, Time } from "@mindustry-ts/arc";
import { Building } from "../../../gen/Building.js";
import { Block } from "../../Block.js";
import { BlockGroup } from "../../meta/BlockGroup.js";
import { Env } from "../../meta/Env.js";
import { ItemModule } from "../../modules/ItemModule.js";
import type { Tile } from "../../Tile.js";
import type { Team } from "../../../game/Team.js";
import type { Item } from "../../../type/Item.js";

/** 对应 Java `Boolean.compare(a, b)`：`false < true`（返回 -1 / 0 / 1）。 */
function booleanCompare(a: boolean, b: boolean): number{
  return a === b ? 0 : a ? 1 : -1;
}

/** 对应 `mindustry.world.blocks.production.Drill.DrillBuild`。 */
export class DrillBuild extends Building{
  /**
   * 当前这一份矿的挖掘进度（0..delay）。对应 Java `public float progress`。
   *
   * ⚠️ 陷阱 #16 同型改名（**必须知道**）: Java 允许**字段** `progress` 与
   * `DrillBuild.progress()` **方法**同名共存（`Drill.java:238` 与 `:327-330`），TS 不允许
   * （`TS2300: Duplicate identifier`；且 `useDefineForClassFields: false` 会把带初值的字段
   * 编译成构造器赋值，**运行期实例属性会直接吞掉原型上的同名方法** → `build.progress()`
   * 变成 TypeError。这与 `Tile.block()` / `Block.requirements` 的处置同型）。
   * 处置沿用本仓库既有的 `Ref` 后缀惯例（`Tile.blockRef` / `Router.unitRef`）：
   * **保留公开 API `progress()`（它是 `BuildingComp.progress()` 的覆写名，且被任务书点名）**，
   * 把**字段**改名为 `progressRef`。字段在 Java 里只被 `updateTile` 与本类自身读写
   * （唯一的跨类读者是未移植的 `sense(LAccess.progress)`）→ 改名对 `Drill` 之外不可见。
   */
  progressRef = 0;
  /** 转速 / 效率平滑量（0..speed）。对应 Java `public float warmup`。 */
  warmup = 0;
  /** 累计挖掘时间（Java 只被 `draw()` 用来转铲头 —— 渲染已砍，但**保留**：它由 `updateTile`
   *  维护，是 Java 的可观测状态之一）。对应 Java `public float timeDrilled`。 */
  timeDrilled = 0;
  /** 「每秒挖出多少矿」的瞬时值（UI 用）。对应 Java `public float lastDrillSpeed`。 */
  lastDrillSpeed = 0;

  /** 当前压住的矿格数。对应 Java `public int dominantItems`。 */
  dominantItems = 0;
  /** 当前压住的主矿产。对应 Java `public @Nullable Item dominantItem`。 */
  dominantItem: Item | null = null;

  /**
   * ⚠️ 必须显式声明 public 构造器（理由同 `ConveyorBuild` / `RouterBuild`：
   * `gen/Building.ts` 的构造器是 `protected`，不声明会 TS2674）。
   * `ItemModule` 的分配时机与 Java `BuildingComp.create()` 等价（生成文件不能 import 模块类），
   * 见 `Conveyor.ts` 文件头。
   */
  constructor(){
    super();
    this.items = new ItemModule();
  }

  /** Java 的 `DrillBuild` 是内部类，直接读外部 `Drill.this.xxx`；TS 显式取回。 */
  private get drill(): Drill{
    return this.block as Drill;
  }

  /** 对应 Java `BuildingComp.delta()` = `Time.delta * timeScale`。⚠️ 实现位置见 `Conveyor.ts` 文件头。 */
  delta(): number{
    return Time.delta * this.timeScale;
  }

  /**
   * 对应 Java `DrillBuild.shouldConsume()`（`Drill.java:246-249`）:
   * `items.total() < itemCapacity && enabled && dominantItem != null`。
   *
   * ⚠️ 这不是纯 UI 判断: `BuildingComp.updateConsumption()` 用它决定 `efficiency`
   * （`BuildingComp.def.ts:226`）→ 直接决定 `updateTile` 里 `efficiency > 0` 那一支是否成立。
   */
  override shouldConsume(): boolean{
    return this.items.total() < this.block.itemCapacity && this.enabled && this.dominantItem !== null;
  }

  /**
   * 对应 Java `DrillBuild.pickedUp()`（`Drill.java:266-269`）: 被拾起时清空主矿。
   * ⚠️ 生成基类 `Building` 里**没有** `pickedUp()`（Java 的实现在 `BuildingComp`，
   * S4 未生成）→ 无法写 `override`，只能当新方法（见文件头说明）。
   */
  pickedUp(): void{
    this.dominantItem = null;
  }

  /**
   * 对应 Java `DrillBuild.onProximityUpdate()`（`Drill.java:271-278`）:
   * 每次邻接变化都重算「压住的主矿」。这是钻头放置后立刻能采矿的原因 ——
   * `Tile.changed()` → `build.updateProximity()` → 本方法。
   */
  override onProximityUpdate(): void{
    super.onProximityUpdate();

    this.drill.countOre(this.tile as Tile);
    this.dominantItem = this.drill.returnItem;
    this.dominantItems = this.drill.returnCount;
  }

  /**
   * 对应 Java `DrillBuild.updateTile()`（`Drill.java:287-325`）。逐行对照，未移植的只有两处
   * 渲染/特效（已在原位注明）。
   */
  override updateTile(): void{
    // Java: `if(timer(timerDump, dumpTime / timeScale)) dump(dominantItem != null && items.has(dominantItem) ? dominantItem : null);`
    // ⚠️ `timerDump` 是 `Block` 的 `protected` 字段（id 0）—— 从 `DrillBuild` 访问 `Block` 的
    //    protected 成员需经 `this.block`（生成文件里是 `any`），不能经 `this.drill.timerDump`
    //    （TS 只允许在子类里访问「同为该子类实例」的 protected 成员）。
    if(this.timer(this.block.timerDump, this.block.dumpTime / this.timeScale)){
      this.dump(
        this.dominantItem !== null && this.items.has(this.dominantItem) ? this.dominantItem : null
      );
    }

    if(this.dominantItem === null){
      return;
    }

    this.timeDrilled += this.warmup * this.delta();

    const delay = this.drill.getDrillTime(this.dominantItem);

    if(this.items.total() < this.block.itemCapacity && this.dominantItems > 0 && this.efficiency > 0){
      // Java: `float speed = Mathf.lerp(1f, liquidBoostIntensity, optionalEfficiency) * efficiency;`
      // ⚠️ 第三个实参**显式写 0**（不是 `this.optionalEfficiency`）—— 完整推理见文件头
      //    「液体 boost」一节。一句话: S4 无消费者时 `optionalEfficiency === 1`，
      //    照抄会得到 1.6（比 Java 未接水的钻头快 1.6 倍）；字面 0 才是 Java 未接水的真值。
      //    移植 `Consume` 体系后把 `0` 换回 `this.optionalEfficiency` 即可。
      const speed = Mathf.lerp(1, this.drill.liquidBoostIntensity, 0) * this.efficiency;

      this.lastDrillSpeed = (speed * this.dominantItems * this.warmup) / delay;
      this.warmup = Mathf.approachDelta(this.warmup, speed, this.drill.warmupSpeed);
      this.progressRef += this.delta() * this.dominantItems * speed * this.warmup;

      // Java `Drill.java:307-308`: `if(Mathf.chanceDelta(updateEffectChance * warmup)) updateEffect.at(...)`
      // —— `Fx.pulverizeSmall` 特效（渲染层，计划 §9 不移植）。
      // ⚠️ 附带影响: Java 这一行会**消耗一次全局随机数**（`Mathf.chanceDelta` → `rand.chance`），
      //    本移植连同 `drillEffect`（`:323`）那次一起省略 → 全局 RNG 流与 Java 不再逐步对齐。
      //    对 S4 的确定性（两次同布景 → 同结果）无影响；与 Java 逐帧对拍时需补回这两次抽取。
    }else{
      this.lastDrillSpeed = 0;
      this.warmup = Mathf.approachDelta(this.warmup, 0, this.drill.warmupSpeed);
      return;
    }

    if(this.dominantItems > 0 && this.progressRef >= delay && this.items.total() < this.block.itemCapacity){
      // Java: `int amount = (int)(progress / delay);` —— Java 的 float→int 是**向零截断**
      const amount = Math.trunc(this.progressRef / delay);
      for(let i = 0; i < amount; i++){
        this.offload(this.dominantItem);
      }

      this.progressRef %= delay;

      // Java `Drill.java:323`: `if(wasVisible && Mathf.chanceDelta(drillEffectChance * warmup)) drillEffect.at(...)`
      // —— `Fx.mine` 特效（渲染层，计划 §9 不移植）。
    }
  }

  /**
   * 对应 Java `DrillBuild.progress()`（`Drill.java:327-330`）。
   * ⚠️ 无 `override`（生成基类未声明 `progress()`），原因见文件头。
   */
  progress(): number{
    return this.dominantItem === null ? 0 : Mathf.clamp(this.progressRef / this.drill.getDrillTime(this.dominantItem));
  }
}

/** 对应 `mindustry.world.blocks.production.Drill`。 */
export class Drill extends Block{
  /** 每点物品硬度增加的挖掘时间。Java 默认 50f（`Drill.java:28`）。 */
  hardnessDrillMultiplier = 50;
  /** 本钻头能挖的最高硬度。Java `public int tier`（`Drill.java:34`）。 */
  tier = 0;
  /** 挖一份矿的基础时间（帧）。Java 默认 300（`Drill.java:36`）。 */
  drillTime = 300;
  /** 被液体 boost 时的速度倍率。Java 默认 1.6f（`Drill.java:38`）。 */
  liquidBoostIntensity = 1.6;
  /** 转速趋近目标的速度。Java 默认 0.015f（`Drill.java:40`）。 */
  warmupSpeed = 0.015;
  /** 单个不可挖物品。Java `public @Nullable Item blockedItem`（`Drill.java:42`）。 */
  blockedItem: Item | null = null;
  /** 不可挖物品表。Java `public @Nullable Seq<Item> blockedItems`（`Drill.java:44`）。 */
  blockedItems: Item[] | null = null;

  /** 每种物品的挖掘速度倍率，缺省 1。Java `ObjectFloatMap<Item> drillMultipliers`（`Drill.java:66`）。 */
  drillMultipliers = new Map<Item, number>();

  /**
   * `countOre` 的返回变量。Java 是 `Drill` 上的 `protected @Nullable Item returnItem` /
   * `protected int returnCount`（`Drill.java:47-48`），`DrillBuild.onProximityUpdate` 读它们。
   *
   * ⚠️ 可见性相对 Java **放宽为 `public`**（`returnItem` / `returnCount` / `countOre` 三处）:
   *   Java 的 `DrillBuild` 是 `Drill` 的**内部类**，因此能直接读外部类的 `private/protected` 成员；
   *   TS 没有内部类，`DrillBuild` 是独立类 → 访问 `Drill` 的 `protected` 成员会报 `TS2445`
   *   （`Property 'countOre' is protected and only accessible within class 'Drill' and its subclasses`）。
   *   本仓库既有的同类处置（`Conveyor` / `Router`）都不涉及「跨类读 protected」，
   *   故这里选择**放宽可见性并在原位标注**，而不是加一层与 Java 不同形的访问器方法。
   *   语义无差别（只影响 TS 的可见性检查），外部也不会有别的调用点。
   */
  returnItem: Item | null = null;
  returnCount = 0;

  /**
   * ⚠️ 位置差异（必须知道）: Java 把 `oreCount` / `itemArray` / **共享的 `tempTiles`**
   * 声明在 `Block` 上（`Drill.java:30-31` 与 `Block.java` 的 `protected Seq<Tile> tempTiles`），
   * 因为多个 `Drill` 实例互不重入。S4 的 TS `Block` **没有** `tempTiles`
   * （`grep tempTiles src/world/Block.ts` 零命中）→ 本类自备一份实例级复用容器。
   * 语义等价：`countOre` 是同步调用，同一实例不会被重入；换成实例级反而更安全。
   */
  protected readonly oreCount = new Map<Item, number>();
  protected readonly itemArray: Item[] = [];
  /** 复用的 tile 数组（对应 Java `Block.tempTiles`，见上面的说明）。 */
  protected readonly tempTiles: Tile[] = [];

  constructor(name: string){
    super(name);
    this.update = true;
    this.solid = true;
    this.group = BlockGroup.drills;
    this.hasItems = true;
    // Java: `hasLiquids = true;`（`Drill.java:81`）—— 它的**唯一**目的是让
    // `consumeLiquid(Liquids.water, …).boost()` 有液体载体。S4 未移植 `Consume` 体系
    // → 不分配 `LiquidModule`（分配点本应在具象建筑构造器，见 `Conveyor.ts` 文件头），
    // 因此这里**有意保持 `false`**（放 true 会产生「hasLiquids 但 liquids === null」的
    // 不一致状态）。这是一处**与 Java 的字段级差异**，只影响液体库存载体；
    // S4 没有任何代码读 `DrillBuild.liquids`（`acceptLiquid` 恒 false），故不可观测。
    this.hasLiquids = false;
    // Java: `envEnabled |= Env.space;`（`Drill.java:86`，注释 "drills work in space I guess"）。
    // ⚠️ TS 的 `Env.space` 是 `1 << 1`（`world/meta/Env.ts:11`），与 Java 同值；
    //    机械钻随后在 `Blocks.java:2890` 用 `envEnabled ^= Env.space;` 把这一位**异或掉**。
    this.envEnabled |= Env.space;
    // Java: `flags = EnumSet.of(BlockFlag.drill);`（`Drill.java:87`）—— `BlockFlag` 未移植。
    // Java: `ambientSound = Sounds.loopDrill; ambientSoundVolume = 0.019f;`（`:83-84`）—— 音效。

    // 陷阱 #6：显式注册建筑工厂
    this.buildType = () => new DrillBuild();
  }

  /** 对应 Java `Drill.init()`（`Drill.java:90-97`，渲染半段 `drillEffectRnd` 已省略）。 */
  override init(): void{
    super.init();
    if(this.blockedItems === null && this.blockedItem !== null){
      this.blockedItems = [this.blockedItem];
    }
  }

  /** 对应 Java `Drill.getDrop(Tile)`（`Drill.java:121-123`）。 */
  getDrop(tile: Tile): Item | null{
    return tile.drop();
  }

  /**
   * 对应 Java `Drill.canMine(Tile)`（`Drill.java:231-235`）—— 挖掘判据的**唯一**入口。
   * ⚠️ 注意它**不**看 `attributes`：矿只由 `OreBlock.itemDrop` →
   * `Tile.drop()`（`Tile.java:580-581`）决定（见任务说明「已核实的关键事实 1」）。
   */
  canMine(tile: Tile | null): boolean{
    if(tile === null || tile.block().isStatic()) return false;
    const drops = tile.drop();
    return (
      drops !== null &&
      drops.hardness <= this.tier &&
      (this.blockedItems === null || !this.blockedItems.includes(drops))
    );
  }

  /** 对应 Java `Drill.getDrillTime(Item)`（`Drill.java:170-172`）。 */
  getDrillTime(item: Item): number{
    return (this.drillTime + this.hardnessDrillMultiplier * item.hardness) / (this.drillMultipliers.get(item) ?? 1);
  }

  /** 对应 Java `Drill.canPlaceOn(Tile, Team, int)`（`Drill.java:125-137`）。 */
  override canPlaceOn(tile: Tile, _team: Team, _rotation: number): boolean{
    if(this.isMultiblock()){
      for(const other of tile.getLinkedTilesAsInto(this, this.tempTiles)){
        if(this.canMine(other)){
          return true;
        }
      }
      return false;
    }else{
      return this.canMine(tile);
    }
  }

  /**
   * 对应 Java `Drill.countOre(Tile)`（`Drill.java:198-229`）: 统计压住的所有可挖格，
   * 按 Java 的排序规则挑出「主矿」写入 `returnItem` / `returnCount`。
   *
   * 排序规则逐字对应 Java（`Seq.sort` 升序 + `peek()` = **最后一个** = 最大者）:
   *   ① `Boolean.compare(!a.lowPriority, !b.lowPriority)` —— `!lowPriority` 为 true 的更大
   *      → 非 lowPriority 的矿排在后面 → 被 `peek()` 选中（`lowPriority` 只是「最后才选」）；
   *   ② 数量多的更大；③ `item.id` 大的更大。
   * 该比较器是全序（id 唯一），故与 `Map` 的键遍历顺序无关 → 确定性。
   *
   * ⚠️ 可见性: Java 是 `protected`，此处放宽为 `public` —— 原因见 `returnItem` 处的说明
   *   （TS 无内部类，`DrillBuild.onProximityUpdate` 必须能调到它）。
   */
  countOre(tile: Tile): void{
    this.returnItem = null;
    this.returnCount = 0;

    this.oreCount.clear();
    this.itemArray.length = 0;

    for(const other of tile.getLinkedTilesAsInto(this, this.tempTiles)){
      if(this.canMine(other)){
        const drop = this.getDrop(other)!;
        this.oreCount.set(drop, (this.oreCount.get(drop) ?? 0) + 1);
      }
    }

    for(const item of this.oreCount.keys()){
      this.itemArray.push(item);
    }

    this.itemArray.sort((item1, item2) => {
      const type = booleanCompare(!item1.lowPriority, !item2.lowPriority);
      if(type !== 0) return type;
      const amounts = (this.oreCount.get(item1) ?? 0) - (this.oreCount.get(item2) ?? 0);
      if(amounts !== 0) return amounts;
      return item1.id - item2.id;
    });

    if(this.itemArray.length === 0){
      return;
    }

    this.returnItem = this.itemArray[this.itemArray.length - 1]!;
    this.returnCount = this.oreCount.get(this.returnItem) ?? 0;
  }
}
