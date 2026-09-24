// 源: core/src/mindustry/entities/EntityGroup.java (361 行)
//
// 为什么是**手写**文件而不是 codegen 产物: 见 `src/gen/Groups.ts` 顶部注释 ——
// codegen 只生成「有哪些组」，组本身的容器语义（`add/remove/removeIndex`、
// `fixedUpdate` 的时间保存/恢复）由手写类承载，与 Java 的分工一致。
//
// ⚠️ 陷阱 #12（计划 §6.2）: `fixedUpdate(targetUps, maxUpdatesPerFrame)` 是一个**时间沙箱**：
//   prevDelta / prevInternalTime / prevRuns 先保存 → 把 `Time.delta` 设成固定步长、
//   `Time.setInternalTime(timeCounter)`、`Time.setRuns(本组私有的 timeRuns)` →
//   循环里 `Time.update()` + `update()` → 最后**无条件**恢复三者。
//   漏掉任何一处保存/恢复，都会让不同 group 的虚拟时钟互相污染（确定性立刻被破坏）。
//
// ⚠️ 关于 `Groups.build.update()`: 它走 `EntityGroup.update()`（**不是** `fixedUpdate`）。
//   固定步长只用于 unit/bullet 的物理。两条路径都移植，语义各自保持。
//
// 移植范围: 构造器、静态 id 计数器、add/addIndex/remove/removeIndex/clear、update/fixedUpdate、
// 查询面（size/isEmpty/index/contains/count/first/find/each/rawSeq/copy）与
// `resize` / `useTree` / `mappingEnabled` / `getByID` / `removeByID` / `checkIDCollisions`。
//
// 未移植（逐条标注）:
//   - `draw(Cons<T>)`         —— 渲染路径（读 `Core.camera` / `Drawc.clipSize()`），计划 §9
//   - `intersect(...)` 三个重载 —— arc-ts 的 `QuadTree` 内部用的是它**自己的**本地 `Seq` 类型
//     （见 `arc-ts/src/math/geom/QuadTree.ts:6`），与 `@mindustry-ts/arc` 导出的 `Seq` 不是同一个
//     类，无法安全桥接；而 S3 的 tick 路径没有任何空间查询调用点（无子弹/单位碰撞）。
//     TODO(S4): 子弹/单位阶段补齐（届时 `QuadTree` 的 `Seq` 需先统一）。
//   - `sort(Comparator)`      —— S3 无调用点；`Seq.sort` 已可用，留待 S4。
//
// ⚠️ `collide()` / `updatePhysics()` **不是**未移植项: codegen 生成的 `Groups.update()`
//   会调用它们（`Groups.bullet.collide()` 等），所以必须有实现 —— 它们委托给
//   `Vars.collisions`（S3 的空实现），调用链完整。

import { Core, QuadTree, Rect, Seq, Time } from "@mindustry-ts/arc";
import type { Cons, Boolf, DelayRun } from "@mindustry-ts/arc";
import { Vars } from "../Vars.js";
import type { Entityc } from "../gen/Entityc.js";

/**
 * `QuadTree<T>` 要求 `T extends QuadTree.QuadTreeObject`（含 `hitbox(Rect)`）。
 * Java 侧建筑/子弹/单位实现 `Hitboxc`（含 `hitbox`），TS 侧生成接口在 S3 尚未含该方法，
 * 因此用一个结构化类型桥接。S3 只构造/替换 quadtree（`resize`），从不插入元素，
 * 所以这个桥接不会掩盖任何真实缺失（TODO(S4): `Hitboxc` 移植后替换为真实类型）。
 */
type TreeObject = { hitbox(out: Rect): void };

/** 对应 `mindustry.entities.EntityGroup`。 */
export class EntityGroup<T extends Entityc>{
  /** 全局实体 id 计数器。对应 Java `EntityGroup.lastId`。 */
  private static lastId = 0;

  /** 组内实体数组。对应 Java `array`（`Seq<T>`，`ordered = false`）。 */
  private readonly array = new Seq<T>();

  private readonly indexer: ((e: T, index: number) => void) | null;
  private map: Map<number, T> | null = null;
  private tree: QuadTree<TreeObject> | null = null;
  private clearing = false;

  /**
   * 迭代下标（`remove`/`removeIndex` 会修正它；Java 里是字段而非局部变量）。
   *
   * ⚠️ 陷阱 #16（**TS 相对 Java 的一处被迫改名**）: Java 里 `EntityGroup` 同时有
   * 字段 `private int index;` 与公开方法 `public T index(int i)`，TS 不允许同名。
   * 处置（与 `Tile.block()/floor()` 同一判据）：**保留公开方法名** `index(i)`，
   * 私有的迭代下标字段改名为 `iterIndex`。字段本就是 `private`，改名对外不可见。
   */
  private iterIndex = 0;

  /** 固定步长累加器与组内私有虚拟时钟。 */
  private fixedCounter = 0;
  private timeCounter = 0;
  private lastTimeAccess = -1;
  /** 组内私有的延时任务队列（Java `Seq<DelayRun> timeRuns`）。 */
  private readonly timeRuns: DelayRun[] = [];

  /**
   * 对应 Java `EntityGroup.nextId()`：分配全局唯一实体 id。
   * 注意：Java 的 `EntityComp.id` 默认值直接调它；TS 侧由 `add()` 调用（见
   * `src/entities/comp/EntityComp.def.ts` 的说明），计数器仍是同一个。
   */
  static nextId(): number{
    if(EntityGroup.lastId >= 2147483645) EntityGroup.lastId = 0;
    return EntityGroup.lastId++;
  }

  /** 对应 Java `EntityGroup.checkNextId(int)`：保证后续 id 不会低于该值。 */
  static checkNextId(id: number): void{
    EntityGroup.lastId = Math.max(EntityGroup.lastId, id + 1);
  }

  /**
   * 对应 Java `EntityGroup(Class<T>, boolean spatial, boolean mapping, EntityIndexer)`。
   * codegen 生成的 `Groups.ts` 调用的是 `(spatial, mapping, indexer)` 三参形式。
   */
  constructor(spatial: boolean, mapping: boolean, indexer: ((e: T, index: number) => void) | null = null){
    if(spatial){
      this.tree = new QuadTree<TreeObject>(new Rect(0, 0, 0, 0));
    }
    if(mapping){
      this.map = new Map<number, T>();
    }
    this.indexer = indexer;
  }

  // ---------------------------------------------------------------- 遍历

  /** 对应 Java `update()`：逐元素调 `update()`。 */
  update(): void{
    for(this.iterIndex = 0; this.iterIndex < this.array.size; this.iterIndex++){
      this.array.items[this.iterIndex]!.update();
    }
  }

  /** 对应 Java `update(Boolf<T>)`：只更新满足谓词的元素。 */
  updateFiltered(filter: Boolf<T>): void{
    for(this.iterIndex = 0; this.iterIndex < this.array.size; this.iterIndex++){
      const item = this.array.items[this.iterIndex]!;
      if(filter(item)) item.update();
    }
  }

  /**
   * 对应 Java `collide()`：把本组交给 `Vars.collisions` 做子弹/单位碰撞。
   * ⚠️ 必须存在：`Groups.update()`（codegen 产物）会调用 `Groups.bullet.collide()`。
   * S3 的 `EntityCollisions.collide` 是空实现（无子弹/单位），所以这里是 no-op，
   * 但**调用链完整**（`Groups.update()` → 本方法 → `Vars.collisions`）。
   */
  collide(): void{
    Vars.collisions.collide(this);
  }

  /** 对应 Java `updatePhysics()`：把本组交给 `Vars.collisions` 做物理步进。同上，S3 为 no-op。 */
  updatePhysics(): void{
    Vars.collisions.updatePhysics(this);
  }

  /** 对应 Java `fixedUpdate(int targetFps)`：最多 10 次/帧。 */
  fixedUpdate(targetFps: number): void{
    this.fixedUpdateWithMax(targetFps, 10);
  }

  /**
   * 对应 Java `fixedUpdate(int targetUps, int maxUpdatesPerFrame)`。
   * ⚠️ 陷阱 #12：`Time.delta` / 内部时间 / runs 的保存与恢复缺一不可。
   */
  fixedUpdateWithMax(targetUps: number, maxUpdatesPerFrame: number): void{
    // 若本帧没被调用（暂停 / 重载地图），时间计数器需要与实际时间「对齐」
    if(this.lastTimeAccess !== Core.graphics.getFrameId()){
      this.timeCounter = Time.getInternalTime();
    }

    const targetDelta = 1 / targetUps;
    const timeDelta = targetDelta * 60;
    const prevDelta = Time.delta;
    const prevTime = Time.getInternalTime();
    const oldRuns = Time.getRuns();

    // 有些逻辑（不正确地）依赖 Time.time，所以必须这样跨变量传递
    Time.delta = timeDelta;
    Time.setInternalTime(this.timeCounter);
    Time.setRuns(this.timeRuns);
    let updates = 0;

    this.fixedCounter += Core.graphics.getDeltaTime();

    while(this.fixedCounter >= targetDelta && updates++ < maxUpdatesPerFrame){
      // 执行挂起的任务（会被手动重设），并推进本组私有的内部时间
      Time.update();
      this.update();
      this.fixedCounter -= targetDelta;
    }

    this.timeCounter = Time.getInternalTime();

    Time.delta = prevDelta;
    Time.setInternalTime(prevTime);
    Time.setRuns(oldRuns);

    this.lastTimeAccess = Core.graphics.getFrameId();
  }

  /** 对应 Java `each(Cons<T>)`。 */
  each(cons: Cons<T>): void{
    for(this.iterIndex = 0; this.iterIndex < this.array.size; this.iterIndex++){
      cons(this.array.items[this.iterIndex]!);
    }
  }

  /** 对应 Java `each(Boolf<T>, Cons<T>)`。 */
  eachFiltered(filter: Boolf<T>, cons: Cons<T>): void{
    for(this.iterIndex = 0; this.iterIndex < this.array.size; this.iterIndex++){
      const item = this.array.items[this.iterIndex]!;
      if(filter(item)) cons(item);
    }
  }

  /** 对应 Java `iterator()`。 */
  [Symbol.iterator](): Iterator<T>{
    let i = 0;
    const items = this.array.items;
    const size = this.array.size;
    return {
      next(): IteratorResult<T>{
        return i < size
          ? { value: items[i++]!, done: false }
          : { value: undefined as unknown as T, done: true };
      }
    };
  }

  // ---------------------------------------------------------------- 查询

  /** 对应 Java `isEmpty()`。 */
  isEmpty(): boolean{
    return this.array.size === 0;
  }

  /** 对应 Java `index(int)`。 */
  index(i: number): T{
    return this.array.get(i);
  }

  /** 对应 Java `size()`。 */
  size(): number{
    return this.array.size;
  }

  /** 对应 Java `contains(Boolf<T>)`。 */
  contains(pred: Boolf<T>): boolean{
    for(let i = 0; i < this.array.size; i++){
      if(pred(this.array.items[i]!)) return true;
    }
    return false;
  }

  /** 对应 Java `count(Boolf<T>)`。 */
  count(pred: Boolf<T>): number{
    let n = 0;
    for(let i = 0; i < this.array.size; i++){
      if(pred(this.array.items[i]!)) n++;
    }
    return n;
  }

  /** 对应 Java `first()`。 */
  first(): T | null{
    return this.array.size === 0 ? null : this.array.first();
  }

  /** 对应 Java `find(Boolf<T>)`。 */
  find(pred: Boolf<T>): T | null{
    return this.array.find(pred);
  }

  /** 对应 Java `rawSeq()`。 */
  rawSeq(): Seq<T>{
    return this.array;
  }

  /** 对应 Java `copy()`。 */
  copy(): Seq<T>{
    return this.copyInto(new Seq<T>());
  }

  /** 对应 Java `copy(Seq<T>)`。 */
  copyInto(arr: Seq<T>): Seq<T>{
    for(let i = 0; i < this.array.size; i++){
      arr.add(this.array.items[i]!);
    }
    return arr;
  }

  /** 对应 Java `useTree()`。 */
  useTree(): boolean{
    return this.tree !== null;
  }

  /** 对应 Java `mappingEnabled()`。 */
  mappingEnabled(): boolean{
    return this.map !== null;
  }

  /** 对应 Java `getByID(int)`。 */
  getByID(id: number): T | null{
    if(this.map === null) throw new Error("Mapping is not enabled for group " + id + "!");
    return this.map.get(id) ?? null;
  }

  /** 对应 Java `removeByID(int)`。 */
  removeByID(id: number): void{
    if(this.map === null) throw new Error("Mapping is not enabled for group " + id + "!");
    const t = this.map.get(id);
    if(t !== undefined){
      t.remove();
    }
  }

  // ---------------------------------------------------------------- 增删

  /** 对应 Java `add(T)`。 */
  add(type: T): void{
    if(type === null || type === undefined) throw new Error("Cannot add a null entity!");
    // Java 在 `EntityComp` 构造期就分配 id；TS 侧改在这里分配（见 EntityComp.def.ts 说明）。
    if(type.id < 0) type.id = EntityGroup.nextId();
    this.array.add(type);

    if(this.map !== null){
      this.map.set(type.id, type);
    }
  }

  /**
   * 对应 Java `addIndex(T)`。
   * ⚠️ `BuildingComp.add()` 会把返回值存进 `index__build`，`removeIndex` 依赖它。
   */
  addIndex(type: T): number{
    const index = this.array.size;
    this.add(type);
    return index;
  }

  /** 对应 Java `remove(T)`（按引用查找，交换尾元素补位）。 */
  remove(type: T): void{
    if(this.clearing) return;
    if(type === null || type === undefined) throw new Error("Cannot remove a null entity!");
    const idx = this.array.indexOf(type, true);
    if(idx !== -1){
      this.array.remove(idx);

      // 修正被交换到该位置的元素下标
      if(this.array.size > 0 && idx !== this.array.size){
        const swapped = this.array.items[idx]!;
        if(this.indexer !== null) this.indexer(swapped, idx);
      }

      if(this.map !== null){
        this.map.delete(type.id);
      }

      // 修正迭代下标
      if(this.iterIndex >= idx){
        this.iterIndex--;
      }
    }
  }

  /**
   * 对应 Java `removeIndex(T, int)`。
   * 「位置不准时回退到慢速实现」是 Java 的原文行为，必须保留
   * （`removeIndex` 的调用方传的是入组时记下的下标，中间可能已被 `remove` 改动）。
   */
  removeIndex(type: T, position: number): void{
    if(this.clearing) return;
    if(type === null || type === undefined) throw new Error("Cannot remove a null entity!");
    if(position !== -1 && position < this.array.size){
      // 偶尔实体下标是错的；回退到慢速实现
      if(this.array.items[position] !== type){
        this.remove(type);
        return;
      }

      // 把尾元素换到当前位置
      if(this.array.size > 1){
        const head = this.array.items[this.array.size - 1]!;
        if(this.indexer !== null) this.indexer(head, position);
        this.array.items[position] = head;
      }

      this.array.size--;
      this.array.items[this.array.size] = null as unknown as T;

      if(this.map !== null){
        this.map.delete(type.id);
      }

      // 修正迭代下标
      if(this.iterIndex >= position){
        this.iterIndex--;
      }
    }
  }

  /** 对应 Java `clear()`。 */
  clear(): void{
    this.clearing = true;

    for(let i = 0; i < this.array.size; i++){
      this.array.items[i]!.remove();
    }
    this.array.clear();
    if(this.map !== null) this.map.clear();
    // Java: Pools.freeAll(timeRuns, true); timeRuns.clear();
    this.timeRuns.length = 0;

    this.clearing = false;
  }

  // ---------------------------------------------------------------- 空间

  /** 对应 Java `resize(float, float, float, float)`。 */
  resize(x: number, y: number, w: number, h: number): void{
    if(this.tree !== null){
      this.tree = new QuadTree<TreeObject>(new Rect(x, y, w, h));
    }
  }

  /** 对应 Java `tree()`。 */
  treeRef(): QuadTree<TreeObject>{
    if(this.tree === null){
      throw new Error("This group does not support quadtrees! Enable quadtrees when creating it.");
    }
    return this.tree;
  }

  /** 对应 Java `checkIDCollisions()`。 */
  checkIDCollisions(): Seq<T>{
    const out = new Seq<T>();
    const seen = new Set<number>();
    this.each((u) => {
      if(seen.has(u.id)){
        out.add(u);
      }else{
        seen.add(u.id);
      }
    });
    return out;
  }

  toString(): string{
    return this.array.toString();
  }
}
