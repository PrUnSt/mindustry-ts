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
  /**
   * 是否存在（电力以外的）效率 > 0 的消费者（Java `shouldConsumePower`，:93）。
   *
   * ⚠️ 初值必须是 **false**：Java 里它是 `transient boolean`，未初始化即 false。
   *   这**可观测** —— `PowerGraph.getPowerNeeded()`（`PowerGraph.java:111`）只读它，
   *   所以「还没跑过 `updateConsumption()` 的耗电方块」不计入电网负荷。
   *   golden `java-power.txt` 的 tick 0/1 是 `powerNeeded=0.0`，正源于此；
   *   TS 原先写成 true 会让那两 tick 变成 0.5，逐 tick 对拍直接错位。
   */
  shouldConsumePower = false;

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
  /**
   * `dump` / `offload` / `put` 的轮转游标（Java `transient int cdump`）。
   * 每成功投递或每试过一个邻居就递增，使等价邻居被轮流使用 —— 这是
   * 「多个传送带接同一个路由器时物品均匀分流」的成因。
   */
  cdump: number = 0;
  /**
   * `Interval` 槽位（Java `Interval timers`）。
   *
   * ⚠️ 分配点在 `Block.newTimers()`（见 `create()`），因为 `Interval` 是 arc 类型而生成文件
   * 不能 import。`block.timers === 0` 时保持 `null`。
   */
  timers: any = null;

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
    // 对应 Java `BuildingComp.java:149` 的 `timer(new Interval(block.timers));`。
    // ⚠️ `Interval` 是 arc 类型，生成文件不能 import → 经 `Block.newTimers()` 分配
    //    （`Block.ts` 是手写文件）。`block.timers === 0` 时得到 `null`，语义等价
    //    （没有任何 `timerXxx` 索引会指向它）。
    this.timers = block.newTimers();
    // 仍由**具象建筑的构造器**分配：`items` / `liquids` 需要模块类（生成文件不能 import）。
    // `power` 走 `Block.newPower()` 工厂 —— 与 `newTimers()` 同一个规避手法
    // （`PowerModule` 内部持有 `PowerGraph`，而生成文件 import 不到它）。
    // 对应 Java `BuildingComp.java:153-156`：
    //   if(block.hasPower){ power = new PowerModule(); power.graph.add(self()); }
    // ⚠️ `power.graph.add(self())` 由 `PowerModule` 的构造完成（Java 是字段初值
    //    `new PowerGraph()` + 显式 add），语义等价。
    if(block.hasPower){
      this.power = block.newPower();
      if(this.power !== null && typeof this.power.graph !== "undefined" && this.power.graph !== null){
        this.power.graph.add(this);
      }
    }
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

  /**
   * 对应 Java `BuildingComp.updateConsumption()`（:1950-2011）。
   *
   * 三条分支，与 Java 逐条对齐：
   *  1. **快路径**（:1952-1957）：`!block.hasConsumers || cheating()`。
   *     `efficiency` 只由 `enabled` / `productionValid()` / `shouldConsume()` 决定，
   *     **与库存无关** —— `Conveyor` / `Router` 就是走这条得到 `efficiency === 1`。
   *  2. **`!enabled`**（:1961-1964）：全 0，且 `shouldConsumePower = false`。
   *  3. **慢路径**（:1967-2010）：`efficiency = min(所有非可选消费者的 efficiency)`。
   *
   * ⚠️ 慢路径的两个易错点（照抄时别改）:
   *   · 木桶取**最小值**，不是相乘 —— 「缺一点电」和「缺一点料」是同一个数；
   *   · 第一趟里 `cons !== block.consPower && result <= 1e-7` 才把 `shouldConsumePower`
   *     置 false（:1979-1981）—— 即「**电力之外**的消费者缺料」才让本方块退出电网负荷，
   *     电力自己不足**不**触发（否则永远算不出覆盖率）。
   *   · `update`（:1967）= `shouldConsume() && productionValid()`，为假时
   *     `efficiency` 与 `optionalEfficiency` **归零**但 `potentialEfficiency` 保留（:1999-2001）。
   *
   * 未移植: `cheating()`（`TeamComp.java:17` = `team.rules().cheat`）—— 沙盒作弊，
   *         按「快路径里的 `|| cheating()`」同样会全量供给；TS 无作弊模式，故省略该分支。
   */
  updateConsumption(): void{
    if(!this.block.hasConsumers){
      this.potentialEfficiency = this.enabled && this.productionValid() ? 1 : 0;
      this.efficiency = this.optionalEfficiency = this.shouldConsume() ? this.potentialEfficiency : 0;
      this.shouldConsumePower = true;
      this.updateEfficiencyMultiplier();
      return;
    }

    if(!this.enabled){
      this.potentialEfficiency = this.efficiency = this.optionalEfficiency = 0;
      this.shouldConsumePower = false;
      return;
    }

    const update = this.shouldConsume() && this.productionValid();

    let minEfficiency = 1;

    // ⚠️ Java 的 `self()` 由组件系统生成（`Entityc` 的 `@Final` 方法），返回**具象实体类型**
    //    （这里是 `Building`）。TS 侧 codegen 不生成它，故用本地 `any` 别名代替 ——
    //    只是为了让 `Consume.*(build)` 的签名通过，语义与 Java 的 `self()` 相同。
    const self: any = this;

    // 先假设效率为 1，再让消费者逐个压低（Java :1972-1973）
    this.efficiency = this.optionalEfficiency = 1;
    this.shouldConsumePower = true;

    for(const cons of this.block.nonOptionalConsumers){
      const result = cons.efficiency(self);
      if(cons !== this.block.consPower && result <= 0.0000001){
        this.shouldConsumePower = false;
      }
      minEfficiency = Math.min(minEfficiency, result);
    }

    for(const cons of this.block.optionalConsumers){
      this.optionalEfficiency = Math.min(this.optionalEfficiency, cons.efficiency(self));
    }

    this.efficiency = minEfficiency;
    this.optionalEfficiency = Math.min(this.optionalEfficiency, minEfficiency);
    this.potentialEfficiency = this.efficiency;

    if(!update){
      this.efficiency = this.optionalEfficiency = 0;
    }

    this.updateEfficiencyMultiplier();

    if(update && this.efficiency > 0){
      // Java :2008 是 `cons.update(self())`；TS 侧方法改名，理由见
      // `world/consumers/Consume.ts` 的 `updateConsume` 注释（字段与方法同名在 TS 不合法）。
      for(const cons of this.block.updateConsumers){
        cons.updateConsume(self);
      }
    }
  }

  /**
   * 对应 Java `BuildingComp.consume()`（:1918-1921）—— 遍历全部消费者触发扣料。
   *
   * ⚠️ 这是「工厂不会凭空产资源」的**唯一**保障：`GenericCrafter.craft()` 的第一行就是它。
   * 若 `block.consumers` 为空数组，本方法是 no-op → 原料不扣、产物照出 → 无限刷资源。
   */
  consume(): void{
    const self: any = this;
    for(const cons of this.block.consumers){
      cons.trigger(self);
    }
  }

  /** 对应 Java `consumeTriggerValid()`（:770-772）。基类恒 false；发电机覆写它。 */
  consumeTriggerValid(): boolean{
    return false;
  }

  /** 对应 Java `getPowerProduction()`（:774-776）。基类 0；发电机覆写它。 */
  getPowerProduction(): number{
    return 0;
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

  /**
   * 加入世界（Java `BuildingComp.add()`，:162-168）。
   *
   * ⚠️ 为什么必须有这一条：Java 的 `add()` 里 `if(power != null) power.graph.checkAdd();`
   *   是**电网被驱动的唯一入口** —— `checkAdd()` 把图的 updater 实体加进
   *   `Groups.powerGraph`（`PowerGraph.java:303-305`）。少了这行，耗电方块的图
   *   **永远不会被 `update()`** → `lastPowerNeeded` 恒 0 → 与 golden 里 tick 2 的
   *   `powerNeeded=0.5` 对不上（TS 实测为 0）。
   *
   * ⚠️ `added = true` 不能只照抄 Java（Java 的这行由 `EntityComp.add()` 合并进来）：
   *   这里显式写上，避免 codegen 只保留本方法而丢掉 `EntityComp.add()` 的副作用。
   */
  add(): void{
    this.added = true;
    if(this.power !== null){
      this.power.graph.checkAdd();
    }
  }

  /** 被移除时调用（Java `onRemoved`）。 */
  onRemoved(): void{ }

  /** 销毁时调用（Java `onDestroyed`）。 */
  onDestroyed(): void{ }

  /** 销毁收尾（Java `afterDestroyed`）。 */
  afterDestroyed(): void{ }

  /** 邻近方块变化（Java `onProximityUpdate`）。S3 无邻接行为。 */
  onProximityUpdate(): void{ }

  /**
   * 加入邻近集合（Java `onProximityAdded`，:1152-1156）。
   * Java 原文：`if(power != null) updatePowerGraph();`
   */
  onProximityAdded(): void{
    if(this.power !== null) this.updatePowerGraph();
  }

  /**
   * 离开邻近集合（Java `onProximityRemoved`，:1144-1148）。
   * Java 原文：`if(power != null) powerGraphRemoved();`
   */
  onProximityRemoved(): void{
    if(this.power !== null) this.powerGraphRemoved();
  }

  /**
   * 把本建筑的电网与所有邻接电网合并（Java `updatePowerGraph`，:1163-1169）。
   * ⚠️ 合并是**双向**的：`other.power.graph.addGraph(power.graph)` 内部会按规模
   *    决定谁吞并谁（`PowerGraph.java:259-275`），这里不能改成单向。
   */
  updatePowerGraph(): void{
    for(const other of this.getPowerConnections([])){
      if(other !== null && other.power !== null){
        other.power.graph.addGraph(this.power.graph);
      }
    }
  }

  /**
   * 从电网中摘除（Java `powerGraphRemoved`，:1171-1182）。
   * ⚠️ Java 的 `PowerGraph.remove()` 不原地删，而是「对每条邻接分支新建一张图」——
   *    所以摘除一个节点可能把原图**裂成多张**，这是原版语义，别优化成原地删除。
   */
  powerGraphRemoved(): void{
    if(this.power === null) return;
    this.power.graph.remove(this);
    this.power.links.length = 0;
  }

  /** 是否向 `other` 导电（Java `conductsTo`，:1184-1186）。绝缘方块返回 false。 */
  conductsTo(_other: any): boolean{
    return !this.block.insulated;
  }

  /**
   * 收集电力连接（Java `getPowerConnections(Seq<Building>)`，:1188-1206）。
   *
   * ⚠️ 关键判据（:1195）: 两个**纯耗电**方块（`consumesPower && !outputsPower && !conductivePower`）
   *     彼此**不导通** —— 电力只能靠发电机/导线/节点传播，耗电方块之间不互相传。
   *     这也是 `Block.consumesPower` 默认值必须与 Java 一致（true）的原因。
   *
   * 未移植: `power.links` 的手动连线分支（:1201-1204，属 `PowerNode`）—— 依赖
   *         `IntSeq` 解包与 `Vars.world.build()`，随 `PowerNode` 一起做（计划 §9）。
   */
  getPowerConnections(out: any[]): any[]{
    out.length = 0;
    if(this.power === null) return out;
    for(const other of this.proximity){
      if(other === null || other.power === null || other.team !== this.team) continue;
      // 两个纯耗电方块互不导通（Java :1195）
      if(this.block.consumesPower && other.block.consumesPower
        && !this.block.outputsPower && !other.block.outputsPower
        && !this.block.conductivePower && !other.block.conductivePower) continue;
      if(!this.conductsTo(other) || !other.conductsTo(this)) continue;
      // `power.links` 里已手动连线的跳过。⚠️ arc 的 `IntSeq` 没有 `contains`，
      // 故按 `size` 手工扫（Java :1199 是 `!power.links.contains(other.pos())`）。
      let linked = false;
      for(let i = 0; i < this.power.links.size; i++){
        if(this.power.links.items[i] === other.pos()){
          linked = true;
          break;
        }
      }
      if(!linked) out.push(other);
    }
    return out;
  }

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
   * 对应 Java `acceptItem(Building source, Item item)`（:869-871）：
   * ```java
   * return block.consumesItem(item) && items.get(item) < getMaximumAccepted(item);
   * ```
   *
   * ⚠️ 历史：C21 之前这里**恒返回 false**（S4 没有 `Consume` 体系，`Block.consumesItem`
   *   只能恒 false）。C21 落地 `ConsumeItems` 后已按 Java 原文实现 ——
   *   **这一处是「传送带能不能把矿投进工厂」的唯一闸门**：
   *   恒 false 时 `Conveyor.pass() → next.acceptItem()` 永远失败 →
   *   「钻头 → 传送带 → 工厂」这条链断在最后一米（由 web 演示布局实测发现）。
   *
   * ⚠️ `items` 为 null 的方块（无 ItemModule）直接 false —— Java 会 NPE，
   *    这里收窄并保留注释。
   */
  acceptItem(_source: Building, item: any): boolean{
    if(this.items === null) return false;
    return this.block.consumesItem(item) && this.items.get(item) < this.getMaximumAccepted(item);
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

  // ---------------------------------------------------------------- 定时器与物品搬运
  // 这组方法构成「钻头/工厂定时倾倒、把物品推向邻居」的机制。S4 之前它们缺失，
  // 是 Drill 移植的头号阻塞（见 `Drill.java:288` 的 `timer(timerDump, …)` 与 `:318` 的 `offload`）。

  /**
   * 对应 Java `BuildingComp.timer(Interval timer, float time)`：
   * ```java
   * protected boolean timer(Interval timer, float time){ return timer.get(time); }
   * ```
   * ⚠️ 签名从「传 `Interval` 对象」改为「传槽位 id」：TS 生成文件拿不到 `Interval` 类型，
   * 而所有调用点写的都是 `timer(timerXxx, …)` 这种**编译期常量槽位**（`timerDump` 等），
   * 改成 id 后语义不变、且不需要 import。`timers === null`（`block.timers === 0`）时恒 false ——
   * 与 Java「没有任何 `timerXxx` 指向它，方法永不被调用」等价。
   */
  timer(id: number, time: number): boolean{
    return this.timers !== null && this.timers.get(id, time);
  }

  /** 对应 Java `BuildingComp.incrementDump(int prox)`。 */
  incrementDump(prox: number): void{
    // this is possible if transferring an item changed a block
    if(prox !== 0){
      this.cdump = (this.cdump + 1) % prox;
    }
  }

  /** 对应 Java `BuildingComp.canDump(Building, Item)`（基类恒 `true`，子类可加限制）。 */
  canDump(_to: any, _item: any): boolean{
    return true;
  }

  /**
   * 对应 Java `BuildingComp.dump(Item todump)`（`BuildingComp.java:1078-1117`）：
   * 试图把库存里的物品投给最近的可接收邻居，成功则从自己库存里扣掉 1 个。
   *
   * ⚠️ `todump === null` 分支在 Java 里内层遍历的是 `content.items()` **全表**，
   * 逐 id 判 `items.has(ii)` —— 即**按全局 item id 升序**尝试。这里用
   * `ItemModule.eachItem()` 表达同序（`items` 数组本身就是 id 序）。
   *
   * ⚠️ 邻居遍历用 `(i + dumpIdx) % len`，其中 `dumpIdx` 是**进入时的 `cdump` 快照**；
   * `incrementDump` 改的是字段 `cdump`，不影响本轮快照 —— 与 Java 逐字一致。
   */
  dump(todump: any): boolean{
    if(!this.block.hasItems || this.items === null || this.items.total() === 0 || this.proximity.length === 0)
      return false;
    if(todump !== null && !this.items.has(todump)) return false;

    const prox = this.proximity;
    const dumpIdx = this.cdump;

    if(todump === null){
      for(let i = 0; i < prox.length; i++){
        const other = prox[(i + dumpIdx) % prox.length];
        let found = false;
        this.items.eachItem((item: any) => {
          if(other.acceptItem(this, item) && this.canDump(other, item)){
            other.handleItem(this, item);
            this.items.remove(item, 1);
            this.incrementDump(prox.length);
            found = true;
            return false;
          }
          return true;
        });
        if(found) return true;
        this.incrementDump(prox.length);
      }
    }else{
      for(let i = 0; i < prox.length; i++){
        const other = prox[(i + dumpIdx) % prox.length];
        if(other.acceptItem(this, todump) && this.canDump(other, todump)){
          other.handleItem(this, todump);
          this.items.remove(todump, 1);
          this.incrementDump(prox.length);
          return true;
        }
        this.incrementDump(prox.length);
      }
    }

    return false;
  }

  /**
   * 对应 Java `BuildingComp.offload(Item)`（`BuildingComp.java:1006-1020`）：
   * 先把物品投给邻居，**全都投不出去才进自己库存**（`handleItem(self(), item)`）。
   * 这是钻头产出的落点（`Drill.java:318`）。
   *
   * ⚠️ Java 首行 `produced(item, 1)` 已省略：它只作用于
   * `state.rules.sector != null && team == rules.defaultTeam`（campaign 场景统计 + 解锁），
   * headless 下 `rules.sector` 恒为 null → 条件恒 false，省略后语义等价（见计划 §9）。
   */
  offload(item: any): void{
    const prox = this.proximity;
    const dumpIdx = this.cdump;

    for(let i = 0; i < prox.length; i++){
      // ⚠️ 注意与 `dump` 的差异：Java 原文这里**先** incrementDump **再**取 other。
      //    因局部 `dumpIdx` 是快照，两者结果一致；照抄以免将来对拍时逐行比对失败。
      this.incrementDump(prox.length);
      const other = prox[(i + dumpIdx) % prox.length];
      if(other.acceptItem(this, item) && this.canDump(other, item)){
        other.handleItem(this, item);
        return;
      }
    }

    this.handleItem(this, item);
  }

  /**
   * 对应 Java `BuildingComp.put(Item)`：与 `offload` 相同的寻找逻辑，
   * 但**不修改自身库存**，只回答「投出去了没有」。
   */
  put(item: any): boolean{
    const prox = this.proximity;
    const dumpIdx = this.cdump;

    for(let i = 0; i < prox.length; i++){
      this.incrementDump(prox.length);
      const other = prox[(i + dumpIdx) % prox.length];
      if(other.acceptItem(this, item) && this.canDump(other, item)){
        other.handleItem(this, item);
        return true;
      }
    }

    return false;
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
