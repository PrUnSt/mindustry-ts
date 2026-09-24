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
 * **相对 Java 的有意收窄（S3 Tier C 范围，见计划 §9）**：只保留 tick 闭环与 `Groups.build`
 * 记账所必需的部分。以下 Java 成员明确不做：`ItemModule`/`LiquidModule`/`PowerModule`
 * （无核心、无电力）、`configure`/`config`（逻辑编辑器）、`dump`/`moveLiquid`（S4）、
 * `write/read`（无存档）、`draw*`（headless）。
 *
 * **codegen 约束**（见 `EntityComp.def.ts`）：生成文件无法 import arc-ts / mindustry 的类型，
 * 因此 `tile` / `block` / `proximity` 只能声明为 `any`（边界处由手写代码做类型收窄），
 * 且时间相关的方法体留在具象方块子类里。
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

  /** Java `updateConsumption`。S3 无消耗品系统。 */
  updateConsumption(): void{ }

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
   * S3 缩窄为空实现：邻接只在 S4（传送带/路由器）才被消费；风险见交付说明。
   */
  updateProximity(): void{ }

  /** 从邻近关系中摘除自己（Java `removeFromProximity`）。S3 同上为空。 */
  removeFromProximity(): void{ }

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

  /** Java `getX`（Position）。 */
  getX(): number{
    return this.x;
  }

  /** Java `getY`（Position）。 */
  getY(): number{
    return this.y;
  }
}
