import { Component, EntityDef, Import } from "../../annotations.js";

/**
 * 建筑基组件，对照 `core/src/mindustry/entities/comp/BuildingComp.java`（2317 行）。
 *
 * Java 的三个特征在这里原样保留：
 *  - `@EntityDef` 挂在基组件本身上 → 生成的类**就是**基类，没有额外的抽象类
 *    （`typeIsBase`，`EntityProcess.java:292`）。所以 `Building.ts` 可以被 `WallBuild` 继承。
 *  - `genInterface: false` → 不发射角色接口（计划 §5.6）。
 *  - `excludeGroups: ["all"]`（`BuildingComp.java:52`）→ 建筑闭包里有 `Entityc`，但仍不进 `Groups.all`。
 *
 * **相对 Java 的有意收窄（S3 Tier C 范围，见计划 §9）**：S3 只保留 tick 闭环与 `Groups.build`
 * 记账所必需的部分；**S4 把物品投递协议补上**（`items` / `efficiency` / `acceptItem` /
 * `handleItem` / `removeStack` / `acceptStack` / `handleStack` / 邻接 `updateProximity`），
 * 因为 `Conveyor` / `Router` 的逐 tick 行为完全建立在这套协议上。
 * 仍明确不做：`configure`/`config`（逻辑编辑器）、`dump`/`moveLiquid`（卸载器/液体搬运）、
 * `write/read`（无存档）、`draw*`（headless）、`Consume*` 消费者体系（计划 §9：不做电力/消耗品）。
 *
 * **codegen 约束**（见 `EntityComp.def.ts`）：生成文件无法 import arc-ts / mindustry 的类型，
 * 因此 `tile` / `block` / `proximity` / `items` / `liquids` / `power` 只能声明为 `any`
 * （边界处由手写代码做类型收窄），且**依赖外部类型的方法体不能写在生成文件里**：
 *   - `delta()` / `edelta()` 需要 `Time` → 由具象建筑覆写（见 `Conveyor.ts` / `Router.ts`）；
 *   - `front()` 需要 `Geometry.d4` → 由具象建筑覆写（见 `Conveyor.ts`）；
 *   - `updateProximity()` / `removeFromProximity()` 需要 `Edges` → **委托给 `tile`**
 *     （`Tile` 是手写文件，已经 import `Edges`；见这两个方法内的说明）。
 *   - `create()` 里的 `new ItemModule()` 需要模块类 → 由具象建筑在**构造器**里分配。
 */
@EntityDef({
  name: "Building",
  components: [Buildingc],
  isFinal: false,
  genio: false,
  serialize: false,
  excludeGroups: ["all"],
})
@Component({ base: true, genInterface: false })
export abstract class BuildingComp implements Healthc, Teamc{
  /** 睡着的建筑间隔（Java `timeToSleep`）。 */
  static readonly timeToSleep: number = 60 * 1;
  /** 最近受击判定窗口（Java `recentDamageTime`）。 */
  static readonly recentDamageTime: number = 60 * 5;

  /** 由 {@link PosComp} / {@link HealthComp} / {@link TeamComp} 提供。 */
  @Import() x: number = 0;
  @Import() y: number = 0;
  @Import() health: number = 0;
  @Import() maxHealth: number = 1;
  @Import() team: number = 0;
  @Import() dead: boolean = false;

  /** 所属 tile（Java `Tile`；codegen 无法 import，故为 `any`）。 */
  tile: any = null;
  /** 所属方块（Java `Block`；同上）。 */
  block: any = null;
  /** 放置朝向 0-3。 */
  rotation: number = 0;
  /** 是否启用更新。 */
  enabled: boolean = true;
  /** 相邻建筑（Java `Seq<Building>`；同上，这里用数组）。 */
  proximity: any[] = [];

  /**
   * 物品库存（Java `ItemModule items`）。⚠️ codegen 无法 import 模块类，因此**不在这里**
   * 分配 —— 由具象建筑在构造器里 `this.items = new ItemModule()`（见 `Conveyor.ts` /
   * `Router.ts` 的构造器）。与 Java 一样，`block.hasItems` 为 false 的建筑保持 `null`。
   */
  items: any = null;
  /** 液体库存（Java `LiquidModule liquids`）。分配方式同上。 */
  liquids: any = null;
  /** 电力模块（Java `PowerModule power`）。分配方式同上（S4 无 `hasPower` 方块）。 */
  power: any = null;

  /**
   * 效率（Java `transient float efficiency`）：取所有消费者里的最小值。
   * S4 没有消费者体系（`block.hasConsumers` 恒 false），因此它只会在
   * `updateConsumption()` 里被写成「`enabled && productionValid() && shouldConsume()` 的 0/1 值」。
   */
  efficiency = 0;
  /** 同 `efficiency`，但只统计可选消费者（Java `optionalEfficiency`）。 */
  optionalEfficiency = 0;
  /** `shouldConsume()` 为真时**本应**具有的效率（Java `potentialEfficiency`）。 */
  potentialEfficiency = 0;
  /** 是否存在（电力以外的）效率 > 0 的消费者（Java `shouldConsumePower`）。 */
  shouldConsumePower = true;

  /** 是否处于睡眠（Java `sleeping`）。睡眠只影响渲染与 `noSleep()` 记账，不影响 tick 结果。 */
  protected sleeping = false;
  /** 累计睡眠时长（Java `sleepTime`）。 */
  protected sleepTime = 0;

  /** Java `initialized`（Java 里是 private transient）。 */
  protected initialized: boolean = false;

  /** 时间倍率及其剩余时长（Java `timeScale` / `timeScaleDuration`）。 */
  protected timeScale: number = 1;
  protected timeScaleDuration: number = 0;
  /** 上次受击时间（Java `lastDamageTime`，初值 `-recentDamageTime`）。 */
  protected lastDamageTime: number = -300;
  /** 已完成 dump 累积量（Java `dumpAccum`）。 */
  protected dumpAccum: number = 0;

  /** 把 tile 实体数据设为本对象，必要时加入 group。对照 `BuildingComp.init`。 */
  init(tile: any, team: number, shouldAdd: boolean, rotation: number): Building{
    if(!this.initialized){
      // ⚠️ 陷阱 #16 的后果修复：Java `tile.block` 是**字段**，TS 的 `Tile.block` 是**方法**
      //    （见 `world/Tile.ts` 顶部的字段改名说明）。若照抄 Java 写成 `tile.block`，
      //    这里会拿到 `Tile.prototype.block` 这个**函数**，导致 `create()` 里
      //    `block.health === undefined` → `Building.health/maxHealth` 全变 NaN/undefined，
      //    且 `Building.block` 指向函数而非方块。必须调用访问器 `tile.block()`。
      this.create(tile.block(), team);
    }

    this.proximity.length = 0;
    this.rotation = rotation;
    this.tile = tile;
    this.set(tile.drawx(), tile.drawy());

    if(shouldAdd){
      this.add();
    }

    this.checkAllowUpdate();
    this.created();

    return this;
  }

  /** 只做变量初始化，不把实体加入任何 group。对照 `BuildingComp.create`。 */
  create(block: any, team: number): Building{
    this.block = block;
    this.team = team;
    this.health = block.health;
    this.maxHealth = block.health;
    // TODO(S4): Java 在这里还有
    //   `timer(new Interval(block.timers));`
    //   `if(block.hasItems) items = new ItemModule();`
    //   `if(block.hasLiquids) liquids = new LiquidModule();`
    //   `if(block.hasPower){ power = new PowerModule(); power.graph.add(self()); }`
    // ⚠️ 生成文件不能 import 模块类 → 前两项改由**具象建筑的构造器**分配
    //    （`Conveyor.ts` / `Router.ts` 里的 `this.items = new ItemModule()`）；
    //    `power` 依赖未移植的 `PowerGraph`（计划 §9），整个分支留待 S5。
    // ⚠️ `block.timers` 的 `Interval` 属于「定时倾倒/dump」路径（S4 不移植 dump），故省略。
    this.initialized = true;
    return this;
  }

  /** @return 本建筑所在 tile 的 x（Java `BuildingComp.tileX`）。 */
  tileX(): number{
    return this.tile.x;
  }

  /** @return 本建筑所在 tile 的 y（Java `BuildingComp.tileY`）。 */
  tileY(): number{
    return this.tile.y;
  }

  /**
   * @return 打包后的坐标；等价 `Point2.pack(tile.x, tile.y)`（x 在高 16 位、y 在低 16 位，
   * 见 `arc-ts/src/math/geom/Point2.ts:39`）。因无 import 依赖故内联。
   */
  pos(): number{
    return (((this.tile.x & 0xffff) << 16) | (this.tile.y & 0xffff)) | 0;
  }

  /**
   * Java `BuildingComp.update()`（`BuildingComp.java:2267-2282`，原文带 `@Final @Replace`）：
   * ```java
   * if((timeScaleDuration -= Time.delta) <= 0f) timeScale = 1f;
   * updateConsumption();
   * if(enabled || !block.noUpdateDisabled) updateTile();
   * ```
   *
   * ⚠️ 两点必须说清：
   *  1. `@Replace` 表示**本实现取代**同名方法（`EntityProcess.java:439-462`：合并时
   *     `@Replace` 视为最高优先级，其余候选被丢弃）。因此对建筑而言
   *     `HealthComp.update()`（`hitTime -= Time.delta / hitDuration`）**永不执行** ——
   *     这是 Java 的真实行为，不是漏移植。`hitTime` 只在 `damage(...)` 里被置 1。
   *  2. `timeScaleDuration -= Time.delta` 这一行需要 `Time`，而生成文件不能 import arc-ts
   *     （codegen 约束）。`timeScale` / `timeScaleDuration` 的唯一消费者是超频与电力系统
   *     （`EmpBulletType.java:24`、`ContinuousBulletType.java:86`，均属 S4+），
   *     且默认值 `timeScale = 1` 已使「不衰减」在无超频时不可观测。
   *     因此这里保留「`updateConsumption()` + `updateTile()` 门控」这两步，
   *     把 timeScale 衰减标为 TODO(S4)。对 S3 的可观测量无影响。
   */
  update(): void{
    // TODO(S4): if((this.timeScaleDuration -= Time.delta) <= 0) this.timeScale = 1;
    this.updateConsumption();
    if(this.enabled || !this.block.noUpdateDisabled){
      this.updateTile();
    }
  }

  /** 由具体方块覆写的逐 tick 行为（Java `updateTile`）。 */
  updateTile(): void{ }

  /**
   * Java `BuildingComp.checkSolid()`（`BuildingComp.java:1739-1741`）基类实现恒为 false，
   * 由子类覆写。`Tile.solid()` 会读它，所以必须有这个方法。
   */
  checkSolid(): boolean{
    return false;
  }

  /** Java `updateConsumption`。S4 无消耗品系统。 */
  updateConsumption(): void{
    // Java 原文（`BuildingComp.java:1950-2011`）的第一条分支:
    //   if(!block.hasConsumers || cheating()){ … return; }
    // S4 有意收窄: `Consume` 体系未移植 → `Block.hasConsumers` **恒为 false**
    // （见 `world/Block.ts` 的字段说明）→ 恒走这条「无消费者快路径」。
    // 这与 Java 在「方块没有调用任何 consume(...)」时的结果**完全一致**，
    // 也正是 `Conveyor` / `Router` 能得到 `efficiency === 1` 的原因。
    // 未移植: 消费者分支（`nonOptionalConsumers` / `optionalConsumers` /
    // `updateConsumers` 的两趟遍历与 `consPower` 特判）—— 属 S5+（计划 §9：不做电力）。
    this.potentialEfficiency = this.enabled && this.productionValid() ? 1 : 0;
    this.efficiency = this.optionalEfficiency = this.shouldConsume() ? this.potentialEfficiency : 0;
    this.shouldConsumePower = true;
    this.updateEfficiencyMultiplier();
  }

  /** 对应 Java `updateEfficiencyMultiplier()`。 */
  updateEfficiencyMultiplier(): void{
    const scale = this.efficiencyScale();
    this.efficiency *= scale;
    this.optionalEfficiency *= scale;
  }

  /** 对应 Java `efficiencyScale()`（基类恒 1）。 */
  efficiencyScale(): number{
    return 1;
  }

  /** @return 该方块当前是否「活跃」并应消耗资源。对应 Java `shouldConsume()`。 */
  shouldConsume(): boolean{
    return this.enabled;
  }

  /** 对应 Java `productionValid()`（基类恒 true）。 */
  productionValid(): boolean{
    return true;
  }

  /** 对应 Java `canConsume()`。 */
  canConsume(): boolean{
    return this.potentialEfficiency > 0;
  }

  /** 建筑初始化完成后调用（Java `created`）。 */
  created(): void{ }

  /** 被移除时调用（Java `onRemoved`）。 */
  onRemoved(): void{ }

  /** 销毁时调用（Java `onDestroyed`）。 */
  onDestroyed(): void{ }

  /** 销毁收尾（Java `afterDestroyed`）。 */
  afterDestroyed(): void{ }

  /** 邻近方块变化（Java `onProximityUpdate`）。S3 无邻接行为。 */
  onProximityUpdate(): void{ }

  /** 加入邻近集合（Java `onProximityAdded`）。 */
  onProximityAdded(): void{ }

  /** 离开邻近集合（Java `onProximityRemoved`）。 */
  onProximityRemoved(): void{ }

  /**
   * 重建邻近缓存（Java `BuildingComp.updateProximity`，逐边扫描 `Edges`）。
   *
   * ⚠️ **委托给 `tile`**（S4 新增，理由必须知道）: Java 的实现在本类里，需要
   * `Edges.getEdges(block.size)`；而 `Edges` 是 mindustry 类型，**生成文件不能 import**。
   * `Tile` 是手写文件、已经 import `Edges`（`Tile.changeBuild` 本来就用它），因此把真实实现
   * 放在 `Tile.rebuildProximity()`，这里只做转发。`tile` 在生成文件里是 `any`，转发无需 import。
   * 语义等价（Java 用的是 `block.size` 与 `tile.x/tile.y`，`Tile.rebuildProximity` 完全相同）。
   */
  updateProximity(): void{
    if(this.tile !== null) this.tile.rebuildProximity();
  }

  /** 从邻近关系中摘除自己（Java `removeFromProximity`）。委托理由同 `updateProximity`。 */
  removeFromProximity(): void{
    if(this.tile !== null) this.tile.removeBuildProximity();
  }

  /**
   * 长睡：标记本建筑「本 tick 无需渲染/环境音」。
   * 对应 Java `sleep()`。⚠️ 睡眠只影响渲染与统计（`sleeping` / `sleepTime`），
   * **不影响** `updateTile()` 的调用（那由 `Groups.build.update()` 决定）—— 所以
   * headless 下它是纯记账。
   */
  sleep(): void{
    if(this.sleeping) return;
    this.sleeping = true;
    this.sleepTime = 0;
  }

  /** 对应 Java `noSleep()`。 */
  noSleep(): void{
    this.sleeping = false;
    this.sleepTime = 0;
  }

  /** @return 本建筑是否在睡眠。对应 Java `isSleeping()`。 */
  isSleeping(): boolean{
    return this.sleeping;
  }

  /** @return 累计睡眠时长（tick）。对应 Java `sleepTime()`。 */
  sleepTimeSeconds(): number{
    return this.sleepTime;
  }

  /** Java `checkAllowUpdate`。 */
  checkAllowUpdate(): void{
    if(!this.allowUpdate()){
      this.enabled = false;
    }
  }

  /** Java `allowUpdate`。 */
  allowUpdate(): boolean{
    return true;
  }

  // ---------------------------------------------------------------- 邻域查询
  // ⚠️ `front()` / `back()` / `left()` / `right()` 需要 `Geometry.d4`，生成文件不能 import
  //    → 只有实际用到它们的具象建筑才实现（S4 是 `ConveyorBuild`，见 `Conveyor.ts`）。
  //    下面的 `nearby(...)` 与 `rotdeg()` 不需要任何外部类型，故留在基类。

  /**
   * 对应 Java `nearby(int dx, int dy)`：`world.build(tile.x + dx, tile.y + dy)`。
   * ⚠️ 通过 `tile.nearby(dx,dy).build` 取（`Tile.nearby(dx,dy)` 就是 `world.tile(x+dx,y+dy)`），
   * 这样无需 import `Vars` / `World`。
   */
  nearby(dx: number, dy: number): Building | null{
    if(this.tile === null) return null;
    const t = this.tile.nearby(dx, dy);
    return t === null ? null : t.build;
  }

  /** 对应 Java `nearby(int rotation)`（与 `Geometry.d4` 同序）。 */
  nearbyRotation(rotation: number): Building | null{
    switch(rotation){
      case 0:
        return this.nearby(1, 0);
      case 1:
        return this.nearby(0, 1);
      case 2:
        return this.nearby(-1, 0);
      case 3:
        return this.nearby(0, -1);
      default:
        return null;
    }
  }

  /** 对应 Java `rotdeg()`（`rotation * 90`）。 */
  rotdeg(): number{
    return this.rotation * 90;
  }

  // ---------------------------------------------------------------- 物品投递协议
  // 这组方法构成 S4 传送带/路由器之间的「投递协议」。Java 签名里的 `Item` / `Teamc`
  // 是 mindustry 类型，生成文件无法 import，故参数用 `any`（与 `tile` / `block` 同处置）。

  /** 对应 Java `getMaximumAccepted(Item)`。 */
  getMaximumAccepted(_item: any): number{
    return this.block.itemCapacity;
  }

  /**
   * 对应 Java `acceptItem(Building source, Item item)`。
   *
   * ⚠️ 有意收窄（S4）: Java 的实现是
   * `block.consumesItem(item) && items.get(item) < getMaximumAccepted(item)`；
   * S4 没有消费者体系（`Block.consumesItem` 恒 false，见 `world/Block.ts`）→ **恒 false**。
   * 这与 Java 在「方块不消耗任何物品」时的结果一致。`Conveyor` / `Router` 都覆写了本方法，
   * 因此这条基类实现只对「有库存但不接收物品」的方块生效（S4 的方块集合里没有这种）。
   */
  acceptItem(_source: Building, _item: any): boolean{
    return false;
  }

  /** 对应 Java `handleItem(Building source, Item item)`。 */
  handleItem(_source: Building, item: any): void{
    this.items.add(item, 1);
  }

  /** 对应 Java `acceptStack(Item, int, Teamc)`。 */
  acceptStack(item: any, amount: number, source: any): number{
    // Java: `source == null || source.team() == team`；TS 的 `Building.team` 是**阵营 id**，
    // 故与 `this.team` 直接比较（等价，见 `Tile.team()` 的说明）。
    if(this.acceptItem(this, item) && this.block.hasItems && (source === null || source.team === this.team)){
      return Math.min(this.getMaximumAccepted(item) - this.items.get(item), amount);
    }
    return 0;
  }

  /** 对应 Java `removeStack(Item, int)`。 */
  removeStack(item: any, amount: number): number{
    if(this.items === null) return 0;
    amount = Math.min(amount, this.items.get(item));
    this.noSleep();
    this.items.remove(item, amount);
    return amount;
  }

  /** 对应 Java `handleStack(Item, int, Teamc)`（只接受 source 为 null 的场景，S4 无参数使用）。 */
  handleStack(item: any, amount: number, _source: any): void{
    this.noSleep();
    this.items.add(item, amount);
  }

  /** 对应 Java `acceptLiquid(Building, Liquid)`。 */
  acceptLiquid(_source: Building, _liquid: any): boolean{
    // Java: `block.hasLiquids && block.consumesLiquid(liquid)`；`consumesLiquid` 依赖消费者体系
    // （S4 未移植，计划 §9）→ 与 `acceptItem` 同处置: **恒 false**。
    // 这与 Java 在「方块不消耗任何液体」时完全一致（S4 的方块集合里没有液体消费者）。
    return false;
  }

  /** 对应 Java `handleLiquid(Building, Liquid, float)`。 */
  handleLiquid(_source: Building, liquid: any, amount: number): void{
    this.liquids.add(liquid, amount);
  }

  /** Java `getX`（Position）。 */
  getX(): number{
    return this.x;
  }

  /** Java `getY`（Position）。 */
  getY(): number{
    return this.y;
  }
}
