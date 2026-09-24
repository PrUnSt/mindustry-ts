// 源: core/src/mindustry/world/blocks/distribution/Conveyor.java (490 行)
//
// 移植范围（S4）: `Conveyor` 的**方块级元数据** + `ConveyorBuild` 的**全部 tick 行为** ——
//   `ids/xs/ys` 平行数组、`len`、`next/nextc/aligned`、`minitem/mid`、`clogHeat`、
//   `updateTile` / `pass` / `acceptItem` / `handleItem` / `acceptStack` / `handleStack` /
//   `removeStack` / `add` / `remove` / `onProximityUpdate`，以及 `Conveyor.blends`
//   （`Autotiler` 的唯一抽象方法，配 `Autotilers.buildBlending` 得到拼接位掩码）。
//
// 未移植（逐条标注）:
//   - 全部绘制: `draw()` / `payloadDraw()` / `drawCracks()` / `drawPlanRegion()` /
//     `icons()` / `regions` 贴图字段 —— 计划 §9「渲染不做」。
//   - `setStats()` —— 依赖 `Stat` / `StatUnit`。
//   - `getReplacement(BuildPlan, Seq<BuildPlan>)` / `handlePlacementLine(Seq<BuildPlan>)` ——
//     「建造计划」系统（放置预览时的 junction/bridge 自动替换），S4 无 BuildPlan。
//   - `init()` 的 `junctionReplacement` / `bridgeReplacement` 回填 —— Java 回填的是
//     `Blocks.junction` / `Blocks.itemBridge`，这两个方块不在 S4 的最小方块集合里（计划 §9）。
//     **没有**静默写成 `undefined`；字段保持 `null` 并在原处标注。
//   - `unitOn(Unit)` / `pushUnits` —— 单位推动（无单位类型，计划 §9）。
//   - `shouldAmbientSound()` / `overwrote(...)` / `getStackOffset(Item, Vec2)` /
//     `sense*` / `setProp` / `write/read` —— 音效 / 建造计划覆盖 / 逻辑传感器 / 存档 IO。
//   - `next()`（`ChainedBuilding` 接口的方法，Java 里与**字段** `next` 同名）——
//     `ChainedBuilding` 未移植（它服务于载荷/链式建筑统计）。⚠️ 陷阱 #16: TS 不允许字段与方法
//     同名，若将来移植该接口，字段需改名（例如 `nextBuild`）而不是让方法改名
//     （`next()` 是接口契约）。
//
// ⚠️ 陷阱 #16 的两处**强制改名**（都在本文件内，必须知道）:
//   `ConveyorBuild.add(int o)`    → `insertAt(int o)`（否则静默覆盖 `EntityComp.add()`）
//   `ConveyorBuild.remove(int o)` → `removeAt(int o)`（否则静默覆盖 `EntityComp.remove()`）
//   详见这两个方法上的说明 —— 这不只是编译问题，覆盖基类的 `add()` 会让
//   `Tile.changeBuild` 的 `build.remove()` 跑飞。
//
// ⚠️ **需要 `Time` / `Geometry` 的方法在具象子类里实现**（codegen 约束，见
//   `BuildingComp.def.ts` 文件头）: Java 的 `BuildingComp.delta()` / `edelta()` 与
//   `front()` 在本文件里覆写 —— 生成文件不能 import arc-ts。
//
// ⚠️ `items` 的分配: Java 在 `BuildingComp.create()` 里按 `block.hasItems` 建 `ItemModule`；
//   TS 的生成文件不能 import 模块类 → 改在**本文件的构造器**里分配（与 Java 时机等价：
//   构造器早于 `init()` → `create()`，且 `create()` 不触碰 `items`）。

import { Mathf, Time } from "@mindustry-ts/arc";
import { Building } from "../../../gen/Building.js";
import { Block } from "../../Block.js";
import { BlockGroup } from "../../meta/BlockGroup.js";
import { TargetPriority } from "../../../entities/TargetPriority.js";
import { Sounds } from "../../../mocks/Sounds.js";
import { Edges } from "../../Edges.js";
import { Geometry } from "../../../arc-compat/Geometry.js";
import { Autotilers } from "../../Autotiler.js";
import type { Autotiler } from "../../Autotiler.js";
import { ItemModule } from "../../modules/ItemModule.js";
import { Tile } from "../../Tile.js";
import type { Item } from "../../../type/Item.js";

/** 对应 `mindustry.world.blocks.distribution.Conveyor.ConveyorBuild`。 */
export class ConveyorBuild extends Building{
  /** 平行数组: 第 i 格的物品（`len` 之后的位置无意义）。Java `Item[] ids = new Item[capacity]`。 */
  ids: (Item | null)[] = new Array<Item | null>(Conveyor.capacity).fill(null);
  /** 平行数组: 第 i 格物品的横向偏移（-1..1，用于绘制与对齐）。 */
  xs: number[] = new Array<number>(Conveyor.capacity).fill(0);
  /** 平行数组: 第 i 格物品在前向的进度（0 = 刚进入，1 = 到达前端）。 */
  ys: number[] = new Array<number>(Conveyor.capacity).fill(0);
  /** 物品数量，恒 < `capacity`。 */
  len = 0;
  /** 前向的下一栋建筑（Java `@Nullable Building next`）。 */
  next: Building | null = null;
  /** 前向的下一栋建筑，且它**也是**同队传送带。 */
  nextc: ConveyorBuild | null = null;
  /** 下一栋传送带的 `rotation` 是否与本方块相同。 */
  aligned = false;

  /** 最近一次插入的位置（存档/覆盖用；S4 只读）。 */
  lastInserted = 0;
  /** 侧向输入落到 `ids` 的下标。 */
  mid = 0;
  /** 本次 `updateTile` 里所有物品的最小进度（决定 `acceptItem` 能否接收）。 */
  minitem = 1;

  /** 自动拼接结果（`Autotilers.buildBlending` 的 `[0]`）。 */
  blendbits = 0;
  /** 非方形精灵的拼接方向掩码（`buildBlending` 的 `[4]`）。 */
  blending = 0;
  /** 拼接 X 缩放。 */
  blendsclx = 1;
  /** 拼接 Y 缩放。 */
  blendscly = 1;

  /** 堵塞热度（0 = 通畅，1 = 堵死）。 */
  clogHeat = 0;

  /**
   * ⚠️ 必须显式声明 public 构造器: `Building` 的构造器由 codegen 生成为 `protected`
   * （`gen/Building.ts`），TS 对「未声明构造器」的子类会继承该 protected 构造器，
   * 于是外部的 `new ConveyorBuild()` 报 `TS2674`。见 `defense/Wall.ts` 的同一说明。
   */
  constructor(){
    super();
    // 见文件头: `ItemModule` 不能在生成文件里分配，改在此处（时机与 Java 的 `create()` 等价）。
    this.items = new ItemModule();
  }

  /** Java 的 `ConveyorBuild` 是内部类，直接读外部 `Conveyor.this.speed` 等；TS 显式取回。 */
  private get conveyor(): Conveyor{
    return this.block as Conveyor;
  }

  /** 对应 Java `BuildingComp.delta()` = `Time.delta * timeScale`。⚠️ 实现位置见文件头。 */
  delta(): number{
    return Time.delta * this.timeScale;
  }

  /** 对应 Java `BuildingComp.edelta()` = `efficiency * delta()`。⚠️ 实现位置见文件头。 */
  edelta(): number{
    return this.efficiency * this.delta();
  }

  /** 对应 Java `BuildingComp.front()`（多块结构的「前」）。⚠️ 实现位置见文件头。 */
  front(): Building | null{
    const trns = Math.trunc(this.block.size / 2) + 1;
    return this.nearby(Geometry.d4xAt(this.rotation) * trns, Geometry.d4yAt(this.rotation) * trns);
  }

  /**
   * 对应 Java `ConveyorBuild.onProximityUpdate()`。
   * 顺序与 Java 完全一致: 先算拼接位掩码（`buildBlending` 会就地写 `AutotilerHolder.blendresult`，
   * 所以必须**立即**把 4 个值拷出来），再重算 `next` / `nextc` / `aligned`。
   */
  override onProximityUpdate(): void{
    super.onProximityUpdate();

    const bits = Autotilers.buildBlending(this.conveyor, this.tile as Tile, this.rotation, null, true);
    this.blendbits = bits[0]!;
    this.blendsclx = bits[1]!;
    this.blendscly = bits[2]!;
    this.blending = bits[4]!;

    this.next = this.front();
    this.nextc = this.next instanceof ConveyorBuild && this.next.team === this.team ? this.next : null;
    this.aligned = this.nextc !== null && this.rotation === this.nextc.rotation;
  }

  /** 对应 Java `ConveyorBuild.updateTile()`。 */
  override updateTile(): void{
    this.minitem = 1;
    this.mid = 0;

    // 能跳过就跳过
    if(this.len === 0 && Mathf.equal(this.timeScale, 1)){
      this.clogHeat = 0;
      this.sleep();
      return;
    }

    const nextMax = this.aligned ? 1 - Math.max(Conveyor.itemSpace - this.nextc!.minitem, 0) : 1;
    const moved = this.conveyor.speed * this.edelta();

    for(let i = this.len - 1; i >= 0; i--){
      const nextpos = (i === this.len - 1 ? 100 : this.ys[i + 1]!) - Conveyor.itemSpace;
      const maxmove = Mathf.clamp(nextpos - this.ys[i]!, 0, moved);

      this.ys[i] = this.ys[i]! + maxmove;

      if(this.ys[i]! > nextMax) this.ys[i] = nextMax;
      if(this.ys[i]! > 0.5 && i > 0) this.mid = i - 1;
      this.xs[i] = Mathf.approach(this.xs[i]!, 0, moved * 2);

      if(this.ys[i]! >= 1 && this.pass(this.ids[i]!)){
        // 向前传递时对齐 X 位置
        if(this.aligned){
          this.nextc!.xs[this.nextc!.lastInserted] = this.xs[i]!;
        }
        // 移除最后一个物品
        this.items.remove(this.ids[i], this.len - i);
        this.len = Math.min(i, this.len);
      }else if(this.ys[i]! < this.minitem){
        this.minitem = this.ys[i]!;
      }
    }

    if(this.minitem < Conveyor.itemSpace + (this.blendbits === 1 ? 0.3 : 0)){
      this.clogHeat = Mathf.approachDelta(this.clogHeat, 1, 1 / 60);
    }else{
      this.clogHeat = 0;
    }

    this.noSleep();
  }

  /** 对应 Java `ConveyorBuild.pass(Item item)`：尝试把物品交给下一栋建筑。 */
  pass(item: Item | null): boolean{
    if(item !== null && this.next !== null && this.next.team === this.team && this.next.acceptItem(this, item)){
      this.next.handleItem(this, item);
      return true;
    }
    return false;
  }

  /** 对应 Java `ConveyorBuild.removeStack(Item, int)`。 */
  override removeStack(item: Item, amount: number): number{
    this.noSleep();
    let removed = 0;

    for(let j = 0; j < amount; j++){
      for(let i = 0; i < this.len; i++){
        if(this.ids[i] === item){
          this.removeAt(i);
          removed++;
          break;
        }
      }
    }

    this.items.remove(item, removed);
    return removed;
  }

  /** 对应 Java `ConveyorBuild.acceptStack(Item, int, Teamc)`。 */
  override acceptStack(item: Item, amount: number, _source: unknown): number{
    void item;
    return Math.min(Math.trunc(this.minitem / Conveyor.itemSpace), amount);
  }

  /** 对应 Java `ConveyorBuild.handleStack(Item, int, Teamc)`。 */
  override handleStack(item: Item, amount: number, _source: unknown): void{
    amount = Math.min(amount, Conveyor.capacity - this.len);

    for(let i = amount - 1; i >= 0; i--){
      this.insertAt(0);
      this.xs[0] = 0;
      this.ys[0] = i * Conveyor.itemSpace;
      this.ids[0] = item;
      this.items.add(item, 1);
    }

    this.noSleep();
  }

  /**
   * 对应 Java `ConveyorBuild.acceptItem(Building source, Item item)`。
   * `direction` 的语义（`Tile.relativeTo` 的编号，见 `Tile.java:87-93`）:
   * 0 = 来源在**正后方**（主轴输入）、1/3 = 来源在**侧面**、2 = 来源在**正前方**（输出端，拒收）。
   */
  override acceptItem(source: Building, item: Item): boolean{
    if(this.len >= Conveyor.capacity) return false;
    const facing = Edges.getFacingEdge(source.tile as Tile, this.tile as Tile);
    if(facing === null) return false;
    const direction = Math.abs(
      Tile.relativeToXY(facing.x, facing.y, this.tile.x, this.tile.y) - this.rotation
    );
    return (
      ((direction === 0 && this.minitem >= Conveyor.itemSpace) ||
        (direction % 2 === 1 && this.minitem > 0.7)) &&
      !(source.block.rotate && this.next === source)
    );
  }

  /** 对应 Java `ConveyorBuild.handleItem(Building source, Item item)`。 */
  override handleItem(source: Building, item: Item): void{
    if(this.len >= Conveyor.capacity) return;

    const r = this.rotation;
    const facing = Edges.getFacingEdge(source.tile as Tile, this.tile as Tile);
    const ang = Tile.relativeToXY(facing.x, facing.y, this.tile.x, this.tile.y) - r;
    const x = ang === -1 || ang === 3 ? 1 : ang === 1 || ang === -3 ? -1 : 0;

    this.noSleep();
    this.items.add(item, 1);

    if(
      Math.abs(Tile.relativeToXY(facing.x, facing.y, this.tile.x, this.tile.y) - r) === 0
    ){
      // idx = 0
      this.insertAt(0);
      this.xs[0] = x;
      this.ys[0] = 0;
      this.ids[0] = item;
    }else{
      // idx = mid
      this.insertAt(this.mid);
      this.xs[this.mid] = x;
      this.ys[this.mid] = 0.5;
      this.ids[this.mid] = item;
    }
  }

  /**
   * 对应 Java `ConveyorBuild.add(int o)`：把 `o` 及其后元素整体后移一格。
   *
   * ⚠️ 陷阱 #16 同型改名（**必须知道，不只是风格问题**）: Java 允许 `ConveyorBuild.add(int)`
   * 与 `EntityComp.add()`（无参，入组）**重载共存**；TS 不允许同名 → 若照抄成 `add(o)`，
   * 它会**静默覆盖**基类的 `Building.add()`，后果是
   *   ① `Tile.changeBuild` 里的 `build.remove()` 会带着 `o === undefined` 调用本方法，
   *      `for(let i = o; ...)` 直接跑飞（`ConveyorBuild.remove(int)` 的同类问题）；
   *   ② `ConveyorBuild` 不再是 `Building` 的合法子类型（TS 在 `buildType` 处即报 TS2322）。
   * 故改名为 `insertAt` / `removeAt`。
   */
  insertAt(o: number): void{
    for(let i = Math.max(o + 1, this.len); i > o; i--){
      this.ids[i] = this.ids[i - 1]!;
      this.xs[i] = this.xs[i - 1]!;
      this.ys[i] = this.ys[i - 1]!;
    }

    this.len++;
  }

  /** 对应 Java `ConveyorBuild.remove(int o)`：把 `o` 之后的元素整体前移一格。⚠️ 改名原因见 `insertAt`。 */
  removeAt(o: number): void{
    for(let i = o; i < this.len - 1; i++){
      this.ids[i] = this.ids[i + 1]!;
      this.xs[i] = this.xs[i + 1]!;
      this.ys[i] = this.ys[i + 1]!;
    }

    this.len--;
  }
}

/** 对应 `mindustry.world.blocks.distribution.Conveyor`。 */
export class Conveyor extends Block implements Autotiler{
  /** Java `Conveyor.capacity`（private static final int）。 */
  static readonly capacity = 3;
  /** Java `Conveyor.itemSpace`（private static final float）。 */
  static readonly itemSpace = 0.4;

  /** 传送速度（每 tick 推进的比例）。 */
  speed = 0;
  /** 展示用的速度（每秒物品数）。 */
  displayedSpeed = 0;
  /** 是否推动站在其上的单位。 */
  pushUnits = true;
  /** 交叉器替换方块（Java 在 `init()` 里回填 `Blocks.junction`；S4 不移植，见文件头）。 */
  junctionReplacement: Block | null = null;
  /** 桥替换方块（同上）。 */
  bridgeReplacement: Block | null = null;

  constructor(name: string){
    super(name);
    this.rotate = true;
    this.update = true;
    this.group = BlockGroup.transportation;
    this.hasItems = true;
    this.itemCapacity = Conveyor.capacity;
    this.priority = TargetPriority.transport;
    this.conveyorPlacement = true;
    this.underBullets = true;

    this.ambientSound = Sounds.loopConveyor;
    this.ambientSoundVolume = 0.0022;
    this.unloadable = false;
    this.noUpdateDisabled = false;

    // 陷阱 #6：显式注册建筑工厂
    this.buildType = () => new ConveyorBuild();
  }

  /**
   * 对应 Java `Conveyor.blends(Tile, int, int, int, int, Block)`（`Autotiler` 的唯一抽象方法）。
   * 语义: 与「会输出物品的方块」或「朝向本方块且有物品的方块」拼接，且双方朝向要能对上。
   */
  blends(tile: Tile, rotation: number, otherx: number, othery: number, otherrot: number, otherblock: Block): boolean{
    return (
      (otherblock.outputsItems() ||
        (Autotilers.lookingAt(tile, rotation, otherx, othery, otherblock) && otherblock.hasItems)) &&
      Autotilers.lookingAtEither(tile, rotation, otherx, othery, otherrot, otherblock)
    );
  }

  // Java `init()` 的 junctionReplacement / bridgeReplacement 回填 —— 见文件头「未移植」。
  // Java `setStats()` / `drawPlanRegion()` / `handlePlacementLine()` / `getReplacement()` /
  // `icons()` / `isAccessible()` —— 见文件头「未移植」。
}
