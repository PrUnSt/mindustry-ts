// 源: core/src/mindustry/world/blocks/distribution/Router.java (135 行)
//
// 移植范围（S4）: `Router` 的方块级元数据 + `RouterBuild` 的**全部 tick 行为** ——
//   `cycles` / `lastItem` / `lastInput` / `time`、`updateTile` / `getTileTarget` /
//   `acceptItem` / `handleItem` / `removeStack` / `acceptStack`，以及 `ControlBlock`
//   的四个方法。
//
// 未移植（逐条标注）:
//   - `ControlBlock` 的「被玩家操控」分支（`getTileTarget` 开头那段 `unit != null && isControlled()`）:
//     Java 会用 `unit.aimX()/aimY()/isShooting()` 把物品投向玩家的准星方向。
//     ⚠️ **S4 的 `unitRef` 恒为 `null`**（没有单位类型，计划 §9「0 单位类型」），
//     所以这个分支**恒不可达**。整段未移植 —— 这不是静默省略: 移植单位系统时**必须补回**，
//     否则被玩家操控的路由器会失去「朝准星投递」的行为。守卫条件本身保留在代码里。
//   - `unit.health()/ammo()/team()/set()` 的同步 —— 同上（无代理单位）。
//
// ⚠️ 陷阱 #16 同型改名（**必须知道**）: Java 有**字段** `unit`（`BlockUnitc`）与
//   `ControlBlock` 的**方法** `unit()`。TS 不允许同名 → 字段改名为 `unitRef`
//   （判据与 `Tile.block()` 一致: 公开 API `unit()` 保名，数据字段改名）。
//
// ⚠️ `getTileTarget` 里的 `overflowGate` 守卫: Java 写的是
//   `if(other.tile == from && from.block() == Blocks.overflowGate) continue;`
//   S4 的方块集合里**没有** `overflow-gate`（计划 §9 最小方块集）。这里用
//   `Vars.content.block("overflow-gate")` 代替 `Blocks.overflowGate` —— 语义完全一致
//   （找不到时返回 null，永远不等于真实方块），而且将来补上该方块时**这一行自动生效**，
//   不需要再改代码（比写死 `false` 更安全）。

import { Time } from "@mindustry-ts/arc";
import { Building } from "../../../gen/Building.js";
import { Block } from "../../Block.js";
import { BlockGroup } from "../../meta/BlockGroup.js";
import { Vars } from "../../../Vars.js";
import { ItemModule } from "../../modules/ItemModule.js";
import type { ControlBlock } from "../ControlBlock.js";
import type { Tile } from "../../Tile.js";
import type { Item } from "../../../type/Item.js";
import type { Unit } from "../../../gen/Unit.js";

/** 对应 `mindustry.world.blocks.distribution.Router.RouterBuild`。 */
export class RouterBuild extends Building implements ControlBlock{
  /**
   * 对应 Java `protected byte[] cycles = new byte[Vars.content.items().size]`。
   * ⚠️ 用 `number[]` 而不是 `Int8Array`: Java 的 `byte` 只用于省内存，取值恒在 `[0, size)`，
   * 算术语义（`(cycles[id] + 1) % proximity.size`）在 JS 里对 `number[]` 才是直读的。
   */
  protected cycles: number[];
  /** 当前待投递的物品。 */
  lastItem: Item | null = null;
  /** 物品的来源 tile（用于避免原地回投）。 */
  lastInput: Tile | null = null;
  /** 投递累积计时（tick）。 */
  time = 0;
  /**
   * 代理单位（Java `@Nullable BlockUnitc unit`）。⚠️ 陷阱 #16 同型改名，见文件头。
   * S4 恒为 `null`（无单位类型）。
   */
  protected unitRef: Unit | null = null;

  /**
   * ⚠️ 必须显式声明 public 构造器（理由同 `ConveyorBuild`）。
   * `ItemModule` 的分配时机与 Java `BuildingComp.create()` 等价，见 `Conveyor.ts` 文件头。
   */
  constructor(){
    super();
    this.items = new ItemModule();
    this.cycles = new Array<number>(Vars.content.items().size).fill(0);
  }

  /** Java 的 `RouterBuild` 是内部类，直接读外部 `Router.this.speed`；TS 显式取回。 */
  private get router(): Router{
    return this.block as Router;
  }

  /** 对应 Java `BuildingComp.delta()` = `Time.delta * timeScale`。⚠️ 实现位置见 `Conveyor.ts` 文件头。 */
  delta(): number{
    return Time.delta * this.timeScale;
  }

  /**
   * 对应 `RouterBuild.unit()`（`ControlBlock` 契约）。
   * ⚠️ S4 恒不可达（见文件头）→ **抛错而不是静默返回 null**，这样一旦有调用点就会立刻暴露。
   */
  unit(): Unit{
    if(this.unitRef !== null){
      return this.unitRef;
    }
    throw new Error(
      "RouterBuild.unit(): `UnitTypes.block` 未移植（计划 §9「0 单位类型」）→ 无法创建代理单位。"
    );
  }

  /** 对应 Java `ControlBlock.isControlled()` 的默认实现: `unit().isPlayer()`。 */
  isControlled(): boolean{
    // S4: `unitRef` 恒为 null → 恒 false，且**不**去构造代理单位（见文件头）。
    if(this.unitRef === null) return false;
    return (this.unitRef as unknown as { isPlayer(): boolean }).isPlayer();
  }

  /** 对应 Java `RouterBuild.canControl()`: `size == 1`。 */
  canControl(): boolean{
    return this.block.size === 1;
  }

  /** 对应 Java `RouterBuild.shouldAutoTarget()`。 */
  shouldAutoTarget(): boolean{
    return false;
  }

  /** 对应 Java `RouterBuild.updateTile()`。 */
  override updateTile(): void{
    if(this.lastItem === null && this.items.any()){
      this.lastItem = this.items.first();
    }

    if(this.lastItem !== null){
      this.time += (1 / this.router.speed) * this.delta();
      const target = this.getTileTarget(this.lastItem, this.lastInput, false);

      if(target !== null && (this.time >= 1 || !(target.block instanceof Router || target.block.instantTransfer))){
        this.getTileTarget(this.lastItem, this.lastInput, true);
        target.handleItem(this, this.lastItem);
        this.items.remove(this.lastItem, 1);
        this.lastItem = null;
      }
    }
  }

  /** 对应 Java `RouterBuild.acceptStack(Item, int, Teamc)`（路由器不接受堆叠输入）。 */
  override acceptStack(_item: Item, _amount: number, _source: unknown): number{
    return 0;
  }

  /** 对应 Java `RouterBuild.acceptItem(Building source, Item item)`。 */
  override acceptItem(source: Building, _item: Item): boolean{
    return this.team === source.team && this.lastItem === null && this.items.total() === 0;
  }

  /** 对应 Java `RouterBuild.handleItem(Building source, Item item)`。 */
  override handleItem(source: Building, item: Item): void{
    this.items.add(item, 1);
    this.lastItem = item;
    this.time = 0;
    this.lastInput = source.tile as Tile;
  }

  /** 对应 Java `RouterBuild.removeStack(Item, int)`。 */
  override removeStack(item: Item, amount: number): number{
    const result = super.removeStack(item, amount);
    if(result !== 0 && item === this.lastItem){
      this.lastItem = null;
    }
    return result;
  }

  /**
   * 对应 Java `RouterBuild.getTileTarget(Item item, Tile from, boolean set)`。
   * 语义: 从 `proximity` 里**轮转**挑一个能接收 `item` 的邻居，并（当 `set` 为 true 时）
   * 推进 `cycles[item.id]` —— 这是「多个输出端时轮流投递」的唯一机制。
   *
   * ⚠️ Java 开头的「被玩家操控」分支未移植（S4 的 `unitRef` 恒为 null，见文件头）。
   */
  getTileTarget(item: Item, from: Tile | null, set: boolean): Building | null{
    // Java:
    //   if(unit != null && isControlled()){ … 用代理单位的准星方向选目标 … return null; }
    // ⚠️ S4 不可达（`unitRef` 恒为 null）→ 整段未移植，见文件头。

    const id = item.id;
    const counter = this.cycles[id]!;
    // Java: `from.block() == Blocks.overflowGate` —— 见文件头关于名字查表的说明。
    const overflowGate = Vars.content.block("overflow-gate");

    for(let i = 0; i < this.proximity.length; i++){
      const other = this.proximity[(i + counter) % this.proximity.length] as Building;
      if(set) this.cycles[id] = (this.cycles[id]! + 1) % this.proximity.length;
      // ⚠️ 求值顺序与 Java 一致: 先比 `other.tile == from`（`from` 为 null 时天然为假），
      //    再读 `from.block()`。TS 的类型收窄需要在同一表达式里显式排除 null。
      if(from !== null && other.tile === from && from.block() === overflowGate) continue;
      if(other.acceptItem(this, item)){
        return other;
      }
    }
    return null;
  }
}

/** 对应 `mindustry.world.blocks.distribution.Router`。 */
export class Router extends Block{
  /** 投递速度（Java 默认 8f）。 */
  speed = 8;

  constructor(name: string){
    super(name);
    this.solid = false;
    this.underBullets = true;
    this.update = true;
    this.hasItems = true;
    this.itemCapacity = 1;
    this.group = BlockGroup.transportation;
    this.unloadable = false;
    this.noUpdateDisabled = true;
    this.drawCached = true;
    this.drawDynamic = false;

    // 陷阱 #6：显式注册建筑工厂
    this.buildType = () => new RouterBuild();
  }
}
