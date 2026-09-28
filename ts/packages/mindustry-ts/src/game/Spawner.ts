// 源: core/src/mindustry/ai/WaveSpawner.java (249 行)
//     + core/src/mindustry/game/SpawnGroup.java (196 行)
//
// ⚠️ 任务书里写的 `core/src/mindustry/game/Spawner.java` **不存在**。真实实现是
//    `mindustry.ai.WaveSpawner`：`Vars.java:290` 声明 `public static WaveSpawner spawner;`，
//    `Vars.java:363` 由 `spawner = new WaveSpawner();` 赋值。本文件按任务书要求的文件名
//    `game/Spawner.ts` 落地，类名取 `Spawner`（与 `Vars.spawner` 对应）。
//
// 移植范围（S4 · 波次系统，**收窄移植**）:
//   - `SpawnGroup`（`game/SpawnGroup.java`）：字段 + `canSpawn` / `getSpawned` / `getShield` /
//     `createUnit` / `toString`。⚠️ 任务书不允许新建 `game/SpawnGroup.ts`，故与 `Spawner`
//     同置一文件（两者在 Java 里本就强耦合：`WaveSpawner` 只消费 `SpawnGroup`）。
//     ⚠️ `Rules.spawns` 的类型参数因此从 `Seq<unknown>` 收紧为 `Seq<SpawnGroup>`（`Rules.ts` 里
//     用 `import type`，不产生运行时依赖）。
//   - `Spawner`：构造器的 `TileOverlayChangeEvent` 监听、`countSpawns` / `getSpawns` /
//     `getFirstSpawn` / `spawnEnemies` / `spawnUnit` / `doShockwave` / `eachGroundSpawn` /
//     `countGroundSpawns` / `countFlyerSpawns` / `isSpawning` / `reset` / `spawnEffect`，
//     以及 `runWave()`。
//   - ⚠️ `runWave()` 在 Java 里位于 `Logic.java:319-325`（**不在** `WaveSpawner` 里）。
//     任务书要求 `Spawner` 提供 `runWave()`，故本移植把该方法体放在这里；
//     `Logic.runWave()`（`core/Logic.ts`）转发到此处。行为与 Java **逐行等价**
//     （`spawnEnemies()` → `state.wave++` → 重置 `state.wavetime` → fire `WaveEvent`），
//     只是方法体的归属位置不同 —— 已在报告「偏离」中说明。
//
// 未移植（逐条标注，避免静默丢失）:
//   - **Boss / 战役倍率**：`SpawnGroup.effect == StatusEffects.boss` 与
//     `state.getPlanet().campaignRules.difficulty.enemySpawnMultiplier`（`WaveSpawner.java:77-82`）
//     —— 依赖 `Planet` / `Difficulty`（未移植）。且 `state.isCampaign()` 在 TS 恒 false
//     （`Rules.sector === null`）→ 该分支不可达。
//   - **`state.rules.attackMode` 的「在敌方核心旁生成」路径**：`eachGroundSpawn` 的第二段
//     （`WaveSpawner.java:134-173`，用到 `CoreBuild.commandPos` / `Geometry.circle` /
//     `world.solid`）与 `eachFlyerSpawn` 的第二段（`:192-198`）—— 依赖 `CoreBuild`（S5）。
//     任务书明确要求不做。该分支在 `attackMode === false` 时本就不可达。
//   - **守护者（Guardian）/ `spawner.attackMode` 字段** —— 本版 Java（第 7 代 Mindustry）
//     已无 `attackMode` 字段（任务书描述来自旧版）。`WaveSpawner` 的实际字段是
//     `tmpCount` / `spawns` / `spawning` / `any` / `firstSpawn`，均已移植。
//   - **冲击波伤害**：`doShockwave` 的 `Fx.spawnShockwave.at(...)` 与 `Damage.damage(...)`
//     （`:116-119`）—— `Damage` 类未移植（伤害系统不在 S4 范围）→ 保留方法（空体）与调用点。
//   - **`spawnEffect` 的实际副作用**：`StatusEffects.unmoving` / `invincible` 的
//     `unit.apply(...)`、`unit.unloaded()`、`UnitSpawnEvent`、`Call.spawnEffect`
//     （`:229-236, 242-248`）—— 分别依赖 `Statusc` / `Call` / 网络（未移植）。
//     保留方法（空体）与调用点，保证「单位生成后必经此处」的调用形状不变。
//   - **`playerNear()`**（`:58-60`）—— 依赖 `player`（TS 恒 null，`Vars.player`）→ 省略（无消费者）。
//   - **`group.effect` / `group.items` / `group.payloads` 的装配**（`SpawnGroup.java:84-101`）——
//     依赖 `Statusc.apply` / `ItemModule.addItem` / `Payloadc`（未移植）→ 省略。
//   - **`unit.shield = getShield(wave)`**（`SpawnGroup.java:92`）—— `Shieldc` 未并入冻结组件集
//     （`gen/Unit.ts` 无 `shield` 字段）→ 省略。`getShield()` 本身保留（纯数据，无消费者）。
//   - **存档 / 网络 / 容器语义**：`JsonSerializable` 的 `read` / `write`、`Cloneable` 的 `copy`、
//     `equals` / `hashCode`（`SpawnGroup.java:111-196`）—— 存档/网络 IO（S6）与容器语义，
//     当前无消费者 → 省略。
//   - **`WorldLoadEvent` 触发的自动 `reset()`**（`WaveSpawner.java:32`）—— TS 侧 `reset()` 由
//     调用方显式调用（`harness.createWorld` 会重建 `Vars` 全部模块，`Vars.spawner` 本身是新建的，
//     等价于已重置；测试里再显式 `reset()` 与 Java 导出器一致）。
//
// ⚠️ TS 相对 Java 的**一处必要替代**（出生点标记）:
//    Java 用 `Blocks.spawn`（一个 `OverlayFloor`）标记出生点，`reset()` 比较
//    `tile.overlay() == Blocks.spawn`（`WaveSpawner.java:221-225`），`TileOverlayChangeEvent`
//    监听器也用它（`:34-37`）。TS 的 `content/Blocks.ts` **不在本阶段允许改动的文件范围内**
//    （`spawn` 未移植），因此本文件按**内容名**解析标记：`Spawner.spawnOverlay()` =
//    `Vars.content.block("spawn")`。任意名为 `spawn` 的 `OverlayFloor`（测试里
//    `new OverlayFloor("spawn")`）都会被识别 —— 同名即同一内容，与 Java 的 `Blocks.spawn`
//    语义等价。**未注册 `spawn` 内容 → 出生点列表为空**，与 Java「地图里没有 spawn 标记」一致。

import { Angles, Events, Mathf, Seq, Time, Vec2 } from "@mindustry-ts/arc";
import { Vars } from "../Vars.js";
import { World } from "../core/World.js";
import { TileOverlayChangeEvent, WaveEvent } from "./EventType.js";
import type { Tile } from "../world/Tile.js";
import type { UnitType } from "../type/UnitType.js";
import type { Team } from "./Team.js";
import type { UnitRuntime } from "../entities/UnitRuntime.js";

/**
 * 对应 `mindustry.game.SpawnGroup`（`SpawnGroup.java:22`）。
 *
 * ⚠️ 与 Java 的差异：Java `implements JsonSerializable, Cloneable`；TS 无存档/网络需求
 * （见文件头「未移植」）→ 只保留纯数据与生成逻辑。
 */
export class SpawnGroup{
  /** 永不到期（Java `public static final int never = Integer.MAX_VALUE`，`SpawnGroup.java:23`）。 */
  static readonly never = 2147483647;

  /**
   * 生成的单位类型（`SpawnGroup.java:26`）。
   * ⚠️ Java 的字段初值是 `UnitTypes.dagger`（内容已加载后非空）；TS 的 `UnitTypes.dagger` 在
   * 模块求值期尚为 undefined（内容由 `UnitTypes.load()` 显式加载），故默认 `null` 并在
   * `Spawner.spawnEnemies()` 里按 Java 的 `if(group.type == null) continue;` 跳过。
   */
  type: UnitType | null = null;
  /** 本组结束的波次（`SpawnGroup.java:28`）。 */
  end = SpawnGroup.never;
  /** 本组开始的波次（`SpawnGroup.java:30`）。 */
  begin = 0;
  /** 生成间隔（以波为单位；2 = 每隔一波；`SpawnGroup.java:32`）。 */
  spacing = 1;
  /** 最多生成多少单位（`SpawnGroup.java:34`）。 */
  max = 40;
  /** 每多少波把生成数量 +1（`SpawnGroup.java:36`）。 */
  unitScaling = SpawnGroup.never;
  /** 本组单位的护盾值（`SpawnGroup.java:38`）。 */
  shields = 0;
  /** 每波护盾增量（`SpawnGroup.java:40`）。 */
  shieldScaling = 0;
  /** 初始生成数量（无缩放；`SpawnGroup.java:42`）。 */
  unitAmount = 1;
  /** 不为 -1 时，只在这些打包坐标的出生点生成（`SpawnGroup.java:44`）。 */
  spawn = -1;
  /**
   * 生成单位所属队伍；`null` 表示用默认波次队伍（`SpawnGroup.java:52`）。
   * ⚠️ Java 类型是 `Team`（引用）；TS 沿用 `game/Team.ts` 的 `Team` 实例。
   */
  team: Team | null = null;
  // Java `payloads`（`:46`）/ `effect`（`:48`）/ `items`（`:50`）—— 载荷 / 状态效果 / 携带物品，
  // 依赖未移植系统（`Payloadc` / `Statusc` / `ItemModule`）→ 见文件头「未移植」。

  /** 对应 Java `SpawnGroup(UnitType)`（`SpawnGroup.java:54-56`）。 */
  constructor(type?: UnitType | null){
    if(type !== undefined && type !== null) this.type = type;
  }

  /** 对应 Java `canSpawn(int position)`（`SpawnGroup.java:62-64`）。 */
  canSpawn(position: number): boolean{
    return this.spawn === -1 || this.spawn === position;
  }

  /** @return 指定波次生成的数量。对应 Java `getSpawned(int wave)`（`SpawnGroup.java:67-73`）。 */
  getSpawned(wave: number): number{
    if(this.spacing === 0) this.spacing = 1;
    if(wave < this.begin || wave > this.end || (wave - this.begin) % this.spacing !== 0){
      return 0;
    }
    // Java: `Math.min(unitAmount + (int)(((wave - begin) / spacing) / unitScaling), max)`
    // ⚠️ `(wave - begin) / spacing` 在 Java 里是 **int / int = 整数除法**（向零截断），
    //    之后 `/ unitScaling`（float）才是浮点除法，最后 `(int)` 再截断一次。
    //    TS 用两层 `Math.trunc` 逐字复刻（`spacing === 2` 时二者会分叉，必须分开写）。
    const wavesPassed = Math.trunc((wave - this.begin) / this.spacing);
    const scaled = Math.trunc(wavesPassed / this.unitScaling);
    return Math.min(this.unitAmount + scaled, this.max);
  }

  /** @return 指定波次下每个单位的护盾值。对应 Java `getShield(int wave)`（`SpawnGroup.java:76-78`）。 */
  getShield(wave: number): number{
    return Math.max(this.shields + this.shieldScaling * (wave - this.begin), 0);
  }

  /**
   * 对应 Java `createUnit(Team, float, float, float, int, Cons<Unit>)`（`SpawnGroup.java:81-104`）
   * 的**收窄版**。
   *
   * ⚠️ 与 Java 的差异：
   *   - Java 的 `cons` 由 `type.spawn(team,x,y,rotation,cons)` **在入组之后**调用
   *     （`UnitType.java:583-587`）；TS 的 `UnitType.spawn` 只收 4 参（无 `cons`）→ 这里在
   *     `spawn()` 返回后调用 `cons`，顺序**等价**（都在 `add()` 之后）。
   *   - `effect` / `items` / `payloads` / `unit.shield` 的装配未移植（见文件头）。
   */
  createUnit(
    team: number,
    x: number,
    y: number,
    rotation: number,
    wave: number,
    cons: ((unit: UnitRuntime) => void) | null = null
  ): UnitRuntime{
    // Java: `Unit unit = type.spawn(team, x, y, rotation, cons);`
    const unit = this.type!.spawn(team, x, y, rotation);
    // Java `:84-92`: effect / items / `unit.shield = getShield(wave)` —— 未移植（见文件头）。
    // Java `:94-101`: payloads —— 未移植（见文件头）。
    void wave;
    if(cons !== null) cons(unit);
    return unit;
  }

  /** 对应 Java `toString()`（`SpawnGroup.java:158-171`）。 */
  toString(): string{
    return (
      "SpawnGroup{" +
      "type=" +
      (this.type === null ? "null" : this.type.name) +
      ", end=" +
      this.end +
      ", begin=" +
      this.begin +
      ", spacing=" +
      this.spacing +
      ", max=" +
      this.max +
      ", unitScaling=" +
      this.unitScaling +
      ", unitAmount=" +
      this.unitAmount +
      ", team=" +
      (this.team === null ? "null" : this.team.name) +
      "}"
    );
  }
}

/** `Tmp.v1` 的等价物（`arc.util.Tmp` 未移植；`WaveSpawner.java:100` 用它做随机散布）。 */
const tmpV1 = new Vec2();

/**
 * 对应 `mindustry.ai.WaveSpawner`（见文件头关于文件名的说明）。
 * `Vars.spawner` 持有本类的唯一实例（`Vars.java:290,363`）。
 */
export class Spawner{
  /** 出生点散布的边距（`WaveSpawner.java:23`）。 */
  private static readonly margin = 0;

  /** `countGroundSpawns` / `countFlyerSpawns` 的临时计数（`WaveSpawner.java:25`）。 */
  private tmpCount = 0;
  /** 出生点 tile 列表（`WaveSpawner.java:26`，Java `new Seq<>(false)` —— 无序）。 */
  private readonly spawns = new Seq<Tile>();
  /** 是否正在生成（`WaveSpawner.java:27`）。 */
  private spawning = false;
  /** `getFirstSpawn()` 的临时结果（`WaveSpawner.java:29`）。 */
  private firstSpawn: Tile | null = null;
  // Java `:28` 的 `any` 字段与 `:23` 的 `coreMargin` / `maxSteps` 仅被 attackMode 的核心旁生成
  // 路径使用（未移植，见文件头）→ 省略。

  constructor(){
    // Java `:32`: `Events.on(WorldLoadEvent.class, e -> reset());`
    //   —— 见文件头「未移植」：`harness.createWorld` 会重建 `Vars.spawner`（等价于已重置），
    //   测试里再显式 `reset()`（与导出器 `GoldenExportTest.java:471` 一致）。
    // Java `:34-37`: 覆盖层变更时维护 spawns 列表（`Blocks.spawn` → TS 的 `spawnOverlay()`）。
    Events.on(TileOverlayChangeEvent, (raw) => {
      const e = raw as TileOverlayChangeEvent;
      const overlay = this.spawnOverlay();
      if(overlay === null) return;
      if((e.previous as unknown) === overlay) this.spawns.remove(e.tile as Tile);
      if((e.overlay as unknown) === overlay) this.spawns.add(e.tile as Tile);
    });
  }

  /** @return 该坐标的出生点 tile（第一个），无则 null。对应 Java `getFirstSpawn()`（`:40-47`）。 */
  getFirstSpawn(): Tile | null{
    this.firstSpawn = null;
    this.eachGroundSpawn((cx, cy) => {
      this.firstSpawn = Vars.world.tile(cx, cy);
    });
    return this.firstSpawn;
  }

  /** @return 出生点数量。对应 Java `countSpawns()`（`:49-51`）。 */
  countSpawns(): number{
    return this.spawns.size;
  }

  /** @return 出生点列表（**不要直接改**）。对应 Java `getSpawns()`（`:53-55`）。 */
  getSpawns(): Seq<Tile>{
    return this.spawns;
  }

  // Java `:58-60` `playerNear()` —— 依赖 `player`（TS 恒 null）→ 省略（见文件头）。

  /**
   * 生成一波的全部敌人。对应 Java `spawnEnemies()`（`WaveSpawner.java:62-109`）。
   *
   * ⚠️ 未移植（见文件头）：战役难度倍率（`:77-82`）；`state.rules.attackMode` 的核心旁生成
   * （在 `eachGroundSpawn` / `eachFlyerSpawn` 内）。
   */
  spawnEnemies(): void{
    const state = Vars.state;
    this.spawning = true;

    this.eachGroundSpawnRaw(-1, (spawnX, spawnY, doShockwave) => {
      if(doShockwave){
        this.doShockwave(spawnX, spawnY);
      }
    });

    for(const group of state.rules.spawns){
      if(group.type === null) continue;

      const spawned = group.getSpawned(state.wave - 1);
      if(spawned === 0) continue;

      // Java `:77-82`: 战役倍率（`enemySpawnMultiplier`）—— 未移植（见文件头）。

      if(group.type.flying){
        const spread = Spawner.margin / 1.5;

        this.eachFlyerSpawnRaw(group.spawn, (spawnX, spawnY) => {
          for(let i = 0; i < spawned; i++){
            this.spawnUnit(group, spawnX + Mathf.range(spread), spawnY + Mathf.range(spread));
          }
        });
      }else{
        const spread = Vars.tilesize * 2;

        this.eachGroundSpawnRaw(group.spawn, (spawnX, spawnY, _doShockwave) => {
          for(let i = 0; i < spawned; i++){
            tmpV1.rnd(spread);

            this.spawnUnit(group, spawnX + tmpV1.x, spawnY + tmpV1.y);
          }
        });
      }
    }

    // Java `:108`: `Time.run(121f, () -> spawning = false);`
    Time.run(121, () => {
      this.spawning = false;
    });
  }

  /** 对应 Java `spawnUnit(SpawnGroup, float, float)`（`WaveSpawner.java:111-114`）。 */
  spawnUnit(group: SpawnGroup, x: number, y: number): void{
    const state = Vars.state;
    group.createUnit(
      group.team === null ? state.rules.waveTeam.id : group.team.id,
      x,
      y,
      // Java: `Angles.angle(x, y, world.width()/2f*tilesize, world.height()/2f*tilesize)`
      Angles.angle(
        x,
        y,
        (Vars.world.width() / 2) * Vars.tilesize,
        (Vars.world.height() / 2) * Vars.tilesize
      ),
      state.wave - 1,
      (unit) => this.spawnEffect(unit)
    );
  }

  /**
   * 对应 Java `doShockwave(float, float)`（`WaveSpawner.java:116-119`）。
   * ⚠️ `Fx.spawnShockwave.at(...)` 与 `Damage.damage(...)` 依赖未移植系统 → **空体**
   * （见文件头「未移植」）。保留方法以维持调用点与 Java 同形。
   */
  doShockwave(_x: number, _y: number): void{
    // Java: Fx.spawnShockwave.at(x, y, state.rules.dropZoneRadius);
    // Java: Damage.damage(state.rules.waveTeam, x, y, state.rules.dropZoneRadius, 99999999f, true);
  }

  /** 对应 Java `eachGroundSpawn(Intc2 cons)`（`WaveSpawner.java:121-123`）：回调 tile 坐标。 */
  eachGroundSpawn(cons: (tileX: number, tileY: number) => void): void{
    this.eachGroundSpawnRaw(-1, (x, y, _shock) => cons(World.toTile(x), World.toTile(y)));
  }

  /**
   * 对应 Java **私有** `eachGroundSpawn(int filterPos, SpawnConsumer cons)`（`WaveSpawner.java:125-174`）。
   *
   * ⚠️ 第二段（`state.rules.wavesSpawnAtCores && attackMode && …` 的核心旁生成，`:134-173`）
   * 依赖 `CoreBuild` / `Geometry.circle` / `world.solid`（S5）→ 未移植（见文件头）。
   */
  private eachGroundSpawnRaw(filterPos: number, cons: (x: number, y: number, shockwave: boolean) => void): void{
    const state = Vars.state;

    if(state.hasSpawns()){
      for(const spawn of this.spawns){
        if(filterPos !== -1 && filterPos !== spawn.pos()) continue;

        cons(spawn.worldx(), spawn.worldy(), true);
      }
    }

    // Java `:134-173`: `wavesSpawnAtCores && attackMode` 的核心旁生成 —— 未移植（见文件头）。
  }

  /**
   * 对应 Java **私有** `eachFlyerSpawn(int filterPos, Floatc2 cons)`（`WaveSpawner.java:176-199`）。
   *
   * ⚠️ 第二段（`:192-198`，核心旁生成）未移植（见文件头）。
   */
  private eachFlyerSpawnRaw(filterPos: number, cons: (x: number, y: number) => void): void{
    const state = Vars.state;

    for(const tile of this.spawns){
      if(filterPos !== -1 && filterPos !== tile.pos()) continue;

      if(!state.rules.airUseSpawns){
        const angle = Angles.angle(Vars.world.width() / 2, Vars.world.height() / 2, tile.x, tile.y);
        const trns = Math.max(Vars.world.width(), Vars.world.height()) * Mathf.sqrt2 * Vars.tilesize;
        const spawnX = Mathf.clamp(
          (Vars.world.width() * Vars.tilesize) / 2 + Angles.trnsx(angle, trns),
          -Spawner.margin,
          Vars.world.width() * Vars.tilesize + Spawner.margin
        );
        const spawnY = Mathf.clamp(
          (Vars.world.height() * Vars.tilesize) / 2 + Angles.trnsy(angle, trns),
          -Spawner.margin,
          Vars.world.height() * Vars.tilesize + Spawner.margin
        );
        cons(spawnX, spawnY);
      }else{
        cons(tile.worldx(), tile.worldy());
      }
    }

    // Java `:192-198`: `wavesSpawnAtCores && attackMode` 的飞行单位核心旁生成 —— 未移植（见文件头）。
  }

  /** 对应 Java `countGroundSpawns()`（`WaveSpawner.java:201-205`）。 */
  countGroundSpawns(): number{
    this.tmpCount = 0;
    this.eachGroundSpawn((_x, _y) => {
      this.tmpCount++;
    });
    return this.tmpCount;
  }

  /** 对应 Java `countFlyerSpawns()`（`WaveSpawner.java:207-211`）。 */
  countFlyerSpawns(): number{
    this.tmpCount = 0;
    this.eachFlyerSpawnRaw(-1, (_x, _y) => {
      this.tmpCount++;
    });
    return this.tmpCount;
  }

  /** 对应 Java `isSpawning()`（`WaveSpawner.java:213-215`）。 */
  isSpawning(): boolean{
    return this.spawning && !Vars.net.client();
  }

  /**
   * 重扫出生点。对应 Java `reset()`（`WaveSpawner.java:217-226`）。
   * ⚠️ Java 比较 `tile.overlay() == Blocks.spawn`；TS 用 `spawnOverlay()`（见文件头
   * 「TS 相对 Java 的一处必要替代」）。
   */
  reset(): void{
    this.spawning = false;
    this.spawns.clear();

    const overlay = this.spawnOverlay();
    if(overlay === null) return;

    for(const tile of Vars.world.tiles){
      if((tile.overlay() as unknown) === overlay){
        this.spawns.add(tile);
      }
    }
  }

  /**
   * 对应 `Blocks.spawn`（Java 里是一个 `OverlayFloor`）。
   * TS 的 `content/Blocks.ts` 不在允许改动范围内（`spawn` 未移植）→ 按内容名 `"spawn"` 解析。
   * 未注册该内容时返回 null → 出生点为空（与 Java「地图无 spawn 标记」一致）。
   */
  spawnOverlay(): unknown | null{
    return Vars.content.block("spawn");
  }

  /**
   * 对应 Java `spawnEffect(Unit)`（`WaveSpawner.java:228-236`）。
   * ⚠️ 全部副作用（`apply(unmoving/invincible)` / `unloaded()` / `UnitSpawnEvent` /
   * `Call.spawnEffect`）依赖未移植系统 → **空体**（见文件头「未移植」）。
   */
  spawnEffect(_unit: UnitRuntime): void{
    // Java: unit.apply(StatusEffects.unmoving, 30f);
    // Java: unit.apply(StatusEffects.invincible, 60f);
    // Java: unit.unloaded();
    // Java: Events.fire(new UnitSpawnEvent(unit));
    // Java: Call.spawnEffect(unit.x, unit.y, unit.rotation, unit.type);
  }

  /**
   * 推进一波。对应 Java `Logic.runWave()`（`Logic.java:319-325`）：
   *
   * ```java
   * public void runWave(){
   *     spawner.spawnEnemies();
   *     state.wave++;
   *     state.wavetime = state.rules.waveSpacing * (state.isCampaign() ? … : 1f);
   *     Events.fire(new WaveEvent());
   * }
   * ```
   *
   * ⚠️ 与 Java 的位置差异见文件头（Java 在 `Logic`，本移植在 `Spawner`，`Logic.runWave()` 转发）。
   * ⚠️ 战役倍率（`campaignRules.difficulty.waveTimeMultiplier`）未移植：`state.isCampaign()` 在 TS
   * 恒 false（`Rules.sector === null`）→ 乘数恒为 1。
   */
  runWave(): void{
    const state = Vars.state;

    this.spawnEnemies();
    state.wave++;
    // Java: `state.wavetime = state.rules.waveSpacing * (state.isCampaign() ? state.getPlanet().
    //         campaignRules.difficulty.waveTimeMultiplier : 1f);`
    state.wavetime = state.rules.waveSpacing;

    Events.fire(new WaveEvent());
  }
}
