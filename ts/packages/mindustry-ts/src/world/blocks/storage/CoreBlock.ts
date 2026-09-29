// 源: core/src/mindustry/world/blocks/storage/CoreBlock.java (933 行)
//     core/src/mindustry/world/blocks/storage/StorageBlock.java (142 行，其构造器字段已内联，见下)
//
// 移植范围（S5）:
//   ── 方块级元数据（`CoreBlock`）──
//   `isFirstTier` / `requiresCoreZone` / `incinerateNonBuildable` / `coreMerge`（来自 StorageBlock），
//   以及构造器里对**行为**有影响的那批字段（`solid` / `update` / `hasItems` / `alwaysAllowDeposit` /
//   `priority` / `unitCapModifier` / `sync` / `canOverdrive` / `envEnabled` / `replaceable` /
//   `alwaysAllowDeposit` / `group` / `destructible` / `separateItemCapacity`）。
//   ── 建筑行为（`CoreBuild`）──
//   `acceptItem` / `getMaximumAccepted` / `handleItem` / `handleStack` / `placed` / `onRemoved` /
//   `onProximityUpdate`（含**多核共享 items 实例**、容量累计、超容量裁剪）。
//
// 未移植（逐条标注 Java 行号，避免静默丢失语义）:
//   - 全部绘制: `draw()` / `drawLanding()` / `drawThrusters()` / `drawLaunch()` / `drawLight()` /
//     `drawSelect()` / `setBars()` / `icons()` / 全部贴图字段（`thruster1/2` / `region` / …）
//     —— `CoreBlock.java:124-163, 340-573, 738-741, 814-832`；计划 §9「渲染不做」。
//   - 发射/降落动画（`LaunchAnimator`）: `thrusterSizes` / `thrusterLength` / `landDuration` /
//     `beginLaunch` / `endLaunch` / `updateLaunch` / `zoomLaunch` / `thrusterTime` / `cloudSeed` /
//     `landParticleTimer` —— `CoreBlock.java:39-67, 258-264, 358-478, 653-675`。
//   - 单位/重生: `unitType`（`UnitTypes.alpha`）/ `playerSpawn` / `requestSpawn` / `canControlSelect` /
//     `onControlSelect` / `allowSpawn` 的消费点 —— `CoreBlock.java:56, 94-122, 619-644`。
//     ⚠️ `unitType` 依赖单位系统，**不移植**（字段省略并在此标注）。
//   - 指挥/命令: `isCommandable` / `getCommandPosition` / `onCommand` / `commandPos` /
//     `write` / `read` / `version` —— `CoreBlock.java:264, 269-281, 914-931`（命令系统 + 存档 IO）。
//   - 团队切换/配置 UI: `buildConfiguration` / `configured` / `shouldHideConfigure` /
//     `created()` 里的 `configurable` / `changeTeam` / `CoreChangeEvent` —— `CoreBlock.java:289-337, 585-604`。
//   - 逻辑传感器: `sense(LAccess)` / `sense(Content)` —— `CoreBlock.java:606-617`（逻辑系统，计划 §9）。
//   - 摧毁/占领: `onDestroyed` / `afterDestroyed` / `playDestroySound` / `damage(source, …)` /
//     `iframes` / `lastDamage` / `captureInvicibility` —— `CoreBlock.java:576-583, 677-736`（占领与子弹系统）。
//   - 放置合法性: `canBreak` / `canReplace` / `canPlaceOn` / `placeBegan` / `beforePlaceBegan` /
//     `drawPlace` / `nextItems` —— `CoreBlock.java:42-43, 173-256`（建造计划系统 + 核心升级物返还）。
//   - 卸载器: `canUnload` —— `CoreBlock.java:283-286`（`BuildingComp.canUnload` 未移植）。
//   - 战役统计: `state.stats.coreItemCount`（`:889-891`）、`state.rules.sector.info.handleCoreItem`
//     （`:792-800, 878-883`）、`itemTaken`（`:877-883`）、`removeStack` 的战役分支（`:803-812`）
//     —— `state.isCampaign()` 在 TS 恒 false / `sector` 恒 null，见 `core/GameState.ts`。
//   - `incinerateEffect`（`:900-903, 907-910`）与 `noEffect` 的渲染/音效 —— 计划 §9。
//   - `StorageBlock.StorageBuild` / `StorageBlock.StorageBuild.linkedCore`（`StorageBlock.java:50-141`）
//     与 `CoreBlock.owns(...)`（`CoreBlock.java:834-840`）—— container/vault 合并进核心库存的系统。
//     ⚠️ 这是本次移植的**关键偏差**: `proximity` 里不存在 `StorageBuild` → `owns()` 恒 false
//     （见 `CoreBlockBuild.owns` 的说明）。因此「核心 + 邻近容器共享容量」这条路径**未覆盖**，
//     但「多核共享同一 items」这条路径**已完整移植**（`onProximityUpdate` 的前两个循环）。
//   - `Explosion`/`Effect`/`Fx`/`Damage`/`Musics`/`Sound`/`Core.camera`/`renderer`/`ui` / `Groups` 相关
//     —— 渲染、音效、相机、UI（计划 §9）。
//
// ⚠️ 构造器字段来源说明: Java 的 `CoreBlock extends StorageBlock`，后者的构造器
//   （`StorageBlock.java:19-33`）先写了一批字段（`hasItems/solid/update/sync/destructible/
//   separateItemCapacity/group/allowResupply/envEnabled/drawCached/drawDynamic`），
//   `CoreBlock` 构造器再覆写。本文件把两者**按 Java 的先后顺序**内联到 `CoreBlock` 构造器，
//   并在此注明——读者对照 Java 时应知道 `group = BlockGroup.transportation` /
//   `destructible = true` / `separateItemCapacity = true` 来自 StorageBlock 而非 CoreBlock。
//
// ⚠️ 与 Java 的一处**必须的**结构差异（陷阱 #6）: Java 用内部类 `CoreBuild`，靠反射在
//   `initBuilding()` 里找到它；TS 侧改为在构造器里显式注册 `this.buildType = () => new CoreBuild()`。

import { Vars } from "../../../Vars.js";
import { Building } from "../../../gen/Building.js";
import { Block } from "../../Block.js";
import { BlockGroup } from "../../meta/BlockGroup.js";
import { Env } from "../../meta/Env.js";
import { TargetPriority } from "../../../entities/TargetPriority.js";
import { Team } from "../../../game/Team.js";
import { ItemModule } from "../../modules/ItemModule.js";
import type { Item } from "../../../type/Item.js";

/** 对应 `mindustry.world.blocks.storage.CoreBlock.CoreBuild`。 */
export class CoreBuild extends Building{
  /**
   * 可存储的物品总量。Java `CoreBlock.java:259`（默认 0），在 `onProximityUpdate` 里赋值
   * （`:764-772`）。
   */
  storageCapacity = 0;
  /**
   * Java `CoreBlock.java:260`。用途是抑制重复的焚化特效 —— **渲染/音效**未移植，
   * 故本字段在 TS 里没有外部消费者，仅为结构对齐保留（见文件头「未移植」）。
   */
  noEffect = false;
  // Java `:261-264`: `lastDamage` / `iframes` / `thrusterTime` / `commandPos` —— 未移植（见文件头）。

  /**
   * ⚠️ 必须显式声明 public 构造器: `Building` 的构造器由 codegen 生成为 `protected`
   * （`gen/Building.ts`），外部 `new CoreBuild()` 会报 `TS2674`。显式 `super()` 提升为 public。
   *
   * `ItemModule` 的分配: Java 在 `BuildingComp.create()` 里按 `block.hasItems` 建 `ItemModule`；
   * TS 的生成文件不能 import 模块类 → 改在本构造器里分配（时机与 Java 等价，见 `Conveyor.ts` 文件头）。
   */
  constructor(){
    super();
    this.items = new ItemModule();
  }

  /** Java 的 `CoreBuild` 是内部类，直接读外部 `CoreBlock.this.*`；TS 显式取回。 */
  private get core(): CoreBlock{
    return this.block as CoreBlock;
  }

  /**
   * 对应 Java `CoreBlock.java:744-746`。
   * `coreIncinerates` 为 true 时**无条件**接收（多余物品被焚化）。
   */
  override acceptItem(_source: Building, item: Item): boolean{
    return Vars.state.rules.coreIncinerates || this.items.get(item) < this.getMaximumAccepted(item);
  }

  /**
   * 对应 Java `CoreBlock.java:748-751`。
   * ⚠️ `Integer.MAX_VALUE/2` 在 JS 里用 `Math.trunc(2147483647 / 2)` 表达（= 1073741823）。
   */
  override getMaximumAccepted(_item: Item): number{
    return Vars.state.rules.coreIncinerates ? Math.trunc(2147483647 / 2) : this.storageCapacity;
  }

  /**
   * 对应 Java `CoreBlock.java:885-912`。
   *
   * **必须保留的语义**（两条都是硬断言，见 `core.test.ts` 的容量封顶用例）:
   *   ① `items.get(item) >= storageCapacity` 时 **不增加**库存；
   *   ② `incinerateNonBuildable && !item.buildable` 时 **不增加**库存。
   *
   * 未移植（原位标注）:
   *   - `state.stats.coreItemCount.increment(item)`（`:889-891`）—— 统计（无 UI）。
   *   - `state.isCampaign() && state.rules.sector.info.handleCoreItem(item, 1)`（`:894-896`）
   *     —— 战役扇区统计；`state.isCampaign()` 在 TS 恒 false，`sector` 恒 null。
   *   - `incinerateEffect(this, source)`（`:901`）—— 焚化特效（渲染/音效，计划 §9）。
   *   - `net.active() && !net.server()` 的客户端分支（`:907-911`）—— `Vars.net` 是 `MockNet`
   *     （`client()===false` / `active()===false`），该分支恒不可达；其唯一副作用也是
   *     `incinerateEffect`（渲染）。
   */
  override handleItem(source: Building, item: Item): void{
    const incinerate = this.core.incinerateNonBuildable && !item.buildable;

    // Java: `if(team == state.rules.defaultTeam){ state.stats.coreItemCount.increment(item); }`

    if(Vars.net.server() || !Vars.net.active()){
      // Java `:894-896` 的战役扇区统计在此省略（见方法注释）。

      if(this.items.get(item) >= this.storageCapacity || incinerate){
        // Java `:900-902`: `if(!noEffect){ incinerateEffect(this, source); noEffect = false; }`
        // —— `incinerateEffect` 是渲染/音效（见文件头未移植清单），故只保留 `noEffect` 的复位。
        //    注意此处**不调用** `super.handleItem` → 库存不增加（语义①/②）。
        this.noEffect = false;
      }else{
        // = `BuildingComp.handleItem` → `items.add(item, 1)`
        super.handleItem(source, item);
      }
    }
    // Java `:907-911` 的客户端分支：`net.active() && !net.server()` 在 `MockNet` 下恒不可达。
  }

  /**
   * 对应 Java `CoreBlock.java:787-801`。
   * ⚠️ 与 `handleItem` 同样受 `storageCapacity` 封顶: `realAmount` 截断到剩余空间，
   * 超出的部分被丢弃（焚化/溢出）。未移植: 战役统计与 `Fx.coreBurn`（渲染）。
   */
  override handleStack(item: Item, amount: number, source: unknown): void{
    const incinerate = this.core.incinerateNonBuildable && !item.buildable;
    const realAmount = incinerate ? 0 : Math.min(amount, this.storageCapacity - this.items.get(item));
    super.handleStack(item, realAmount, source);

    // Java `:792-800`: 战役扇区统计 + `Fx.coreBurn` —— 未移植（见文件头）。
  }

  /**
   * 对应 Java `CoreBlock.java:871-875`。
   *
   * ⚠️ 重要（已向编排方报告，见交付说明）: `Tile.setBlock` → `changeBuild` **不会**调用 `placed()`。
   *   这与 Java 一致 —— Java 的 `placed()` 由 `ConstructBlock.java:154`（建造完成）与
   *   `BaseGenerator.java:181`（建图）调用，`Tile.setBlock` 走的是 `init()` → `created()`。
   *   因此本方法在本阶段的真实触发点只有测试显式调用；实际注册由 `onProximityUpdate()`
   *   （`:762`）完成（那条路径在 `Tile.rebuildProximity` 里必然被执行）。
   * ⚠️ 本方法**没有** `override` 修饰符: `gen/Building.ts`（codegen 产物）**未声明** `placed()`
   *   —— Java 的 `BuildingComp.placed()` 是空实现，codegen 的 `def` 里没有把它列为可选覆写点。
   *   TS 侧仍以同名方法表达 Java 的覆写（调用点显式调 `core.placed()`）。
   */
  placed(): void{
    // Java `super.placed();`（`BuildingComp.placed()` 是空实现）→ 省略。
    Vars.state.teams.registerCore(this);
  }

  /**
   * 对应 Java `CoreBlock.java:851-869`。
   *
   * 未移植: 开头把核心库存**按比例分回**每个 `StorageBuild` 的整段（`:853-862`）——
   * `StorageBlock` / `StorageBuild` 未移植（见文件头）。当核心被拆除且它曾与容器共享库存时，
   * Java 会把库存按容器容量比例写入容器；本移植无容器，故该段落无对象可处理。
   */
  override onRemoved(): void{
    // Java `:853-862`: StorageBuild 的库存拆分 —— 未移植（见方法注释）。

    Vars.state.teams.unregisterCore(this);

    // Java `:866-868`: 让同队剩余核心重算邻接与容量。
    const team = Team.get(this.team);
    for(const other of Vars.state.teams.cores(team)){
      (other as CoreBuild).onProximityUpdate();
    }
  }

  /**
   * 对应 Java `CoreBlock.java:753-784`。**多核共享**在这里完成:
   *   ① 同队其它核心已存在 → 把 `this.items` 指向对方的 `items`（**同一实例**，共享资源池）；
   *   ② 注册本核心（`:762`）;
   *   ③ 累计 `storageCapacity` = 本方 `itemCapacity` + 邻近存储容量 + 同队其它核心（及其邻近存储）容量;
   *   ④ 非建图期把超容量库存裁剪回 `storageCapacity`（`:775-779`);
   *   ⑤ 把算好的容量同步给同队所有核心（`:781-783`）。
   *
   * ⚠️ 偏差（`owns` 恒 false）: Java 的 ③ 里 `proximity.sum(e -> owns(e) ? … : 0)` 统计的是
   *   **可合并的容器**（`StorageBlock.coreMerge`）。本移植没有 `StorageBlock`/`StorageBuild`，
   *   `owns()` 恒返回 false → 这部分容量为 0。**多核之间的容量累计仍然完整生效**（`other.block.itemCapacity`）。
   */
  override onProximityUpdate(): void{
    super.onProximityUpdate();

    const team = Team.get(this.team);

    // Java `:757-761`: 同队核心共享同一个 items 实例。
    for(const other of Vars.state.teams.cores(team)){
      if(other.tile !== this.tile){
        this.items = other.items;
      }
    }

    // Java `:762`
    Vars.state.teams.registerCore(this);

    // Java `:764`: `itemCapacity + proximity.sum(owns ? e.block.itemCapacity : 0)`
    // ⚠️ `owns()` 恒 false → 邻近存储项为 0（见方法注释）。
    this.storageCapacity = this.core.itemCapacity + this.ownedProximityCapacity();

    // Java `:770-773`: 加上同队**其它**核心（及其邻近存储）的容量。
    for(const other of Vars.state.teams.cores(team)){
      if(other.tile === this.tile) continue;
      this.storageCapacity += other.block.itemCapacity + this.ownedProximityCapacityOf(other);
    }

    // Java `:775-779`: 建图期不裁剪（生成器可能写入超过容量的库存）。
    if(!Vars.world.isGenerating()){
      for(const item of Vars.content.items()){
        this.items.setAmount(item, Math.min(this.items.get(item), this.storageCapacity));
      }
    }

    // Java `:781-783`: 容量同步给同队所有核心（含自己）。
    for(const other of Vars.state.teams.cores(team)){
      (other as CoreBuild).storageCapacity = this.storageCapacity;
    }
  }

  /**
   * 对应 Java `CoreBlock.java:834-840` 的两个 `owns(...)` 重载。
   *
   * ⚠️ **恒返回 false**，原因: Java 的判据是
   * `tile instanceof StorageBuild b && ((StorageBlock)b.block).coreMerge && (b.linkedCore == core || b.linkedCore == null)`
   * —— `StorageBlock` / `StorageBuild`（container/vault）尚未移植（见文件头）。因此
   * 「容器并入核心库存」这条路在全项目范围内不可能发生（没有任何 `StorageBuild` 实例），
   * 返回 false 与 Java 在「没有任何容器」时的结果一致。补上 StorageBlock 后**必须**改回真实现。
   */
  private owns(_tile: Building, _core: Building): boolean{
    return false;
  }

  /** Java `:764` 的 `proximity.sum(e -> owns(e) ? e.block.itemCapacity : 0)`。 */
  private ownedProximityCapacity(): number{
    let sum = 0;
    for(const other of this.proximity as Building[]){
      if(this.owns(other, this)) sum += other.block.itemCapacity;
    }
    return sum;
  }

  /** Java `:772` 的 `other.proximity.sum(e -> owns(other, e) ? e.block.itemCapacity : 0)`。 */
  private ownedProximityCapacityOf(core: Building): number{
    let sum = 0;
    for(const other of core.proximity as Building[]){
      if(this.owns(core, other)) sum += other.block.itemCapacity;
    }
    return sum;
  }
}

/** 对应 `mindustry.world.blocks.storage.CoreBlock`。 */
export class CoreBlock extends Block{
  /** 是否可通过 `LaunchAnimator` 发射（渲染/动画未移植，仅保留数据）。Java `CoreBlock.java:49`。 */
  isFirstTier = false;
  /**
   * 是否忽略「核心必须放在可放置核心的地板上」的限制。Java `CoreBlock.java:53`。
   * 消费点在 `canPlaceOn`（未移植，见文件头），故本移植只保留字段。
   */
  requiresCoreZone = false;
  /** 是否焚化不可建造的物品（如 sand/coal），而不是拒收。Java `CoreBlock.java:54`。 */
  incinerateNonBuildable = false;
  /** 来自 `StorageBlock.java:17`：是否允许邻近容器与本核心合并库存。见文件头与 `owns`。 */
  coreMerge = true;
  // Java `:50-53, 56-67`: `allowSpawn` / `unitType` / 发射音效与动画字段 —— 未移植（见文件头）。

  constructor(name: string){
    super(name);

    // ---- 以下字段来自 Java `StorageBlock` 构造器（`StorageBlock.java:19-33`）----
    this.hasItems = true;
    this.solid = true;
    this.update = false; // CoreBlock 覆写为 true（下一段）
    this.sync = true; // CoreBlock 覆写为 false
    this.destructible = true;
    this.separateItemCapacity = true;
    this.group = BlockGroup.transportation;
    // Java: `flags = EnumSet.of(BlockFlag.storage);` —— `BlockFlag` 未移植（渲染/元数据）。
    // Java: `allowResupply = true;` —— 无该字段（补给系统未移植）。
    this.envEnabled = Env.any;
    this.drawCached = true;
    this.drawDynamic = false;

    // ---- 以下字段来自 Java `CoreBlock` 构造器（`CoreBlock.java:69-92`）----
    this.solid = true;
    this.update = true;
    this.hasItems = true;
    this.alwaysAllowDeposit = true;
    this.priority = TargetPriority.core;
    // Java: `flags = EnumSet.of(BlockFlag.core);` —— `BlockFlag` 未移植。
    this.unitCapModifier = 10;
    this.sync = false; // 核心物品走别的同步路径
    this.drawDisabled = false;
    this.canOverdrive = false;
    // Java: `commandable = true;` —— 命令系统未移植（无该字段）。
    this.envEnabled |= Env.space;
    this.drawCached = false;
    this.drawDynamic = true;
    this.allowedInPayloads = false;

    // 支持一切
    this.replaceable = false;
    // Java: `destroySound = Sounds.explosionCore; destroySoundVolume = 1.6f;`
    // ⚠️ `Sounds.explosionCore` 未在 TS 的 `mocks/Sounds.ts` 里（S3 只定义了被引用的音效）。
    //    未在此赋值 → `Block.init()` 会按 size 回落 `Sounds.blockExplode3`。这是**已知偏差**。
    this.destroySoundVolume = 1.6;

    // 陷阱 #6：显式注册建筑工厂（Java 走反射找 `CoreBuild` 内部类）。
    this.buildType = () => new CoreBuild();
  }
}
