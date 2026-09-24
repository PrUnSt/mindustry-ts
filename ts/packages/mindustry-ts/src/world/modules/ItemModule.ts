// 源: core/src/mindustry/world/modules/ItemModule.java (361 行)
//
// 移植范围: 物品库存的**全部数据操作** —— `length` / `each` / `sum` / 全部 `has(*)` /
//   `empty` / `total` / `any` / `first` / `take` / `get` / `set` / `add` / `remove` /
//   `clear` / `checkArrayCapacity` / `copy` / `set` / `toString`。
//   S4 的传送带（`ids/xs/ys` 平行数组 + `items`）与路由器（`items.total()`）完全建立在
//   这些方法上。
//
// 未移植（逐条标注）:
//   - 流量统计（`updateFlow` / `stopFlow` / `getFlowRate` / `hasFlowItem` / `handleFlow` /
//     `undoFlow` 与 `flowTimer` / `WindowedMean` / `displayFlow` / `cacheBits` 静态缓存）——
//     它们是**纯显示量**（消费方只有 UI 的流量条与 `Block.displayFlow`），不参与库存语义
//     （`add` 里唯一的额外副作用是 `cacheSums[item] += amount`）。S4 无 UI（计划 §9），
//     故整段省略；风险：接 UI 时需补回，并在 `add` 里重新挂上 `cacheSums`。
//   - `write(Writes)` / `read(Reads, boolean)` —— 存档 IO（计划 §9：「读 .msav 不做」）。
//     覆写点已由 `BlockModule.write/read` 保留，方法体为空并在此标注。
//   - `ItemConsumer` / `ItemCalculator` 两个函数式接口 → TS 直接用函数类型，语义等价。
//   - `add(Iterable<ItemStack>)` / `add(ItemSeq)` / `add(ItemModule)` 三个多参 add：
//     `ItemSeq` 未移植，另两个在 S4 没有调用点（Java 侧的调用者是 `ConveyorBuild.overwrote`，
//     属建造计划系统）。保留 `add(Item, int)` 这一条主干。
//
// ⚠️ 陷阱 #16 同型改名（**必须知道**）: Java 用重载区分 `total`(字段)/`total()`(方法)、
//   `get(int)`/`get(Item)`、`set(ItemModule)`/`set(Item,int)`、`remove(Item,int)`/
//   `remove(ItemStack[])`、`has` 的 4 个重载。TS 不允许同名不同元数，处置与
//   `Tile.block()` 同判据 —— **保留被全项目调用最多的那个名字**，其余加后缀：
//     字段 `total` → `totalCount`（保护 `total()` 方法名）
//     `has(int)` → `hasId`、`has(Item,int)` → `hasAmount`、
//       `has(ItemStack[])` → `hasStacks`、`has(ItemStack[], float)` → `hasStacksMultiplied`
//     `get(int)` → `getId`、`set(Item,int)` → `setAmount`、`remove(ItemStack[])` → `removeStacks`
//
// ⚠️ `empty`（Java `public static final ItemModule empty = new ItemModule();`）
//   在 Java 里靠**类的惰性初始化**保证「构造时 `content.items()` 已就绪」；ESM 是
//   「首次 import 即执行整个模块体」，若照抄成静态字段初始化，会在 `Vars.content`
//   尚未创建时就读 `content.items().size` → 崩。故改为**惰性访问器** `ItemModule.empty()`
//   （首次调用才构造）。语义相同（同一个共享空库存），调用点从字段变方法。

import { Vars } from "../../Vars.js";
import { BlockModule } from "./BlockModule.js";
import type { Item } from "../../type/Item.js";
import type { ItemStack } from "../../type/ItemStack.js";

/** 对应 Java `ItemModule.ItemConsumer`（函数式接口 → 函数类型）。 */
export type ItemConsumer = (item: Item, amount: number) => void;
/** 对应 Java `ItemModule.ItemCalculator`（函数式接口 → 函数类型）。 */
export type ItemCalculator = (item: Item, amount: number) => number;

/** 对应 `mindustry.world.modules.ItemModule`。 */
export class ItemModule extends BlockModule{
  /** Java `public static final ItemModule empty`。⚠️ 惰性构造，原因见文件头。 */
  private static emptyInstance: ItemModule | null = null;

  /** 对应 Java `empty`（见文件头的惰性说明）。 */
  static empty(): ItemModule{
    if(ItemModule.emptyInstance === null) ItemModule.emptyInstance = new ItemModule();
    return ItemModule.emptyInstance;
  }

  /**
   * 对应 Java `protected int[] items = new int[content.items().size]`。
   * ⚠️ 与 Java 一样在**构造期**定长；`checkArrayCapacity` 是显式的重定长入口
   * （Java 侧由 `DataPatcher` 在内容数量变化后调用）。
   */
  protected items: number[];
  /** 对应 Java `protected int total`。⚠️ 改名原因见文件头。 */
  protected totalCount = 0;
  /** 对应 Java `protected int takeRotation`。 */
  protected takeRotation = 0;

  constructor(){
    super();
    this.items = new Array<number>(Vars.content.items().size).fill(0);
  }

  /** 对应 Java `copy()`。 */
  copy(): ItemModule{
    const out = new ItemModule();
    out.set(this);
    return out;
  }

  /** 对应 Java `set(ItemModule other)`。 */
  set(other: ItemModule): void{
    this.totalCount = other.totalCount;
    this.takeRotation = other.takeRotation;
    for(let i = 0; i < this.items.length; i++){
      this.items[i] = other.items[i]!;
    }
  }

  /** 对应 Java `length()`。 */
  length(): number{
    return this.items.length;
  }

  /** 对应 Java `each(ItemConsumer)`。 */
  each(cons: ItemConsumer): void{
    for(let i = 0; i < this.items.length; i++){
      if(this.items[i]! !== 0){
        cons(Vars.content.item(i)!, this.items[i]!);
      }
    }
  }

  /** 对应 Java `sum(ItemCalculator)`。 */
  sum(calc: ItemCalculator): number{
    let sum = 0;
    for(let i = 0; i < this.items.length; i++){
      if(this.items[i]! > 0){
        sum += calc(Vars.content.item(i)!, this.items[i]!);
      }
    }
    return sum;
  }

  /** 对应 Java `has(int id)`。⚠️ 改名原因见文件头。 */
  hasId(id: number): boolean{
    return this.items[id]! > 0;
  }

  /** 对应 Java `has(Item)`。 */
  has(item: Item): boolean{
    return this.get(item) > 0;
  }

  /** 对应 Java `has(Item, int)`。⚠️ 改名原因见文件头。 */
  hasAmount(item: Item, amount: number): boolean{
    return this.get(item) >= amount;
  }

  /** 对应 Java `has(ItemStack[])`。⚠️ 改名原因见文件头。 */
  hasStacks(stacks: readonly ItemStack[]): boolean{
    for(const stack of stacks){
      if(!this.hasAmount(stack.item, stack.amount)) return false;
    }
    return true;
  }

  /** 对应 Java `has(ItemStack[], float multiplier)`。⚠️ 改名原因见文件头。 */
  hasStacksMultiplied(stacks: readonly ItemStack[], multiplier: number): boolean{
    for(const stack of stacks){
      if(stack.item.id >= this.items.length || !this.hasAmount(stack.item, Math.round(stack.amount * multiplier)))
        return false;
    }
    return true;
  }

  /** 对应 Java `hasOne(ItemStack[])`（每个 stack 至少 1 个）。 */
  hasOne(stacks: readonly ItemStack[]): boolean{
    for(const stack of stacks){
      if(!this.hasAmount(stack.item, 1)) return false;
    }
    return true;
  }

  /** 对应 Java `empty()`。 */
  empty(): boolean{
    return this.totalCount === 0;
  }

  /** 对应 Java `total()`。 */
  total(): number{
    return this.totalCount;
  }

  /** 对应 Java `any()`。 */
  any(): boolean{
    return this.totalCount > 0;
  }

  /** 对应 Java `first()`。 */
  first(): Item | null{
    for(let i = 0; i < this.items.length; i++){
      if(this.items[i]! > 0){
        return Vars.content.item(i)!;
      }
    }
    return null;
  }

  /**
   * 对应 Java `take()`：按 `takeRotation` 轮转取走 1 个并返回。
   * ⚠️ `takeRotation` 是**跨调用**保留的游标（Java 原样），不是局部变量。
   */
  take(): Item | null{
    for(let i = 0; i < this.items.length; i++){
      let index = i + this.takeRotation;
      if(index >= this.items.length) index -= this.items.length;
      if(this.items[index]! > 0){
        this.items[index]!--;
        this.totalCount--;
        this.takeRotation = index + 1;
        return Vars.content.item(index)!;
      }
    }
    return null;
  }

  /** 对应 Java `get(int id)`。⚠️ 改名原因见文件头。 */
  getId(id: number): number{
    return this.items[id]!;
  }

  /** 对应 Java `get(Item)`。 */
  get(item: Item): number{
    return this.items[item.id]!;
  }

  /** 对应 Java `set(Item, int)`。⚠️ 改名原因见文件头。 */
  setAmount(item: Item, amount: number): void{
    this.totalCount += amount - this.items[item.id]!;
    this.items[item.id] = amount;
  }

  /** 对应 Java `add(Item, int)`（Java 的 private `add(int,int)` 已内联）。 */
  add(item: Item, amount: number): void{
    this.items[item.id]! += amount;
    this.totalCount += amount;
  }

  /** 对应 Java `remove(Item, int)`（上限截断到现有数量，与 Java 一致）。 */
  remove(item: Item, amount: number): void{
    amount = Math.min(amount, this.items[item.id]!);

    this.items[item.id]! -= amount;
    this.totalCount -= amount;
  }

  /** 对应 Java `remove(ItemStack[])`。⚠️ 改名原因见文件头。 */
  removeStacks(stacks: readonly ItemStack[]): void{
    for(const stack of stacks) this.remove(stack.item, stack.amount);
  }

  /** 对应 Java `clear()`。 */
  clear(): void{
    this.items.fill(0);
    this.totalCount = 0;
  }

  /** 对应 Java `checkArrayCapacity(int size)`：按新内容数量重定长。 */
  checkArrayCapacity(size: number): void{
    if(this.items.length !== size){
      const next = new Array<number>(size).fill(0);
      for(let i = 0; i < Math.min(size, this.items.length); i++){
        next[i] = this.items[i]!;
      }
      this.items = next;
    }
  }

  /** 对应 Java `toString()`（形如 `ItemModule{copper:2,sand:1}`）。 */
  override toString(): string{
    let res = "ItemModule{";
    let any = false;
    for(let i = 0; i < this.items.length; i++){
      if(this.items[i]! !== 0){
        res += Vars.content.items().get(i)!.name + ":" + String(this.items[i]) + ",";
        any = true;
      }
    }
    if(any){
      res = res.substring(0, res.length - 1);
    }
    res += "}";
    return res;
  }
}
