// 源: core/src/mindustry/game/Teams.java (500+ 行)
//
// 移植范围（S3 需要的部分）: `map` / `active` / `present` / `get` / `getOrNull` /
// `playerCores` / `cores` / `isActive` / `canInteract` / `getActive` / `updateActive` /
// `updateEnemies` / `updateTeamStats` 的**可移植子集**，以及 `TeamData` 的字段与
// `active/hasCore/isAlive/noCores/core/getBuildings/getCount`。
//
// 未移植（逐条标注）:
//   - `bosses` / `closestEnemyCore` / `closestCore` / `anyEnemyCoresWithinBuildRadius` /
//     `anyEnemyCoresWithin` / `eachEnemyCore` / `units` / `players` 查询
//     —— 依赖 `Unit` / `Player` / `CoreBuild`（S4/S5）
//   - `TeamData` 的 `buildAi` / `rtsAi`（`BaseBuilderAI` / `RtsAI`）、`buildingTree` /
//     `turretTree` / `unitTree`（`QuadTree<Building>`，`Building` 尚未实现 `Hitboxc.hitbox`）、
//     `unitsByType` / `typeCounts` / `unitCap` / `unitCount` 的完整逻辑、`plans` / `coreEnemies`
//     的填充、`getClustered` / `getUnits` / `destroy()` —— 全部属 S4/S5
//   - `updateTeamStats()` 的 `Groups.unit` / `Groups.player` 两段循环 —— S3 这两个组恒为空，
//     移植它们需要 `Unit`/`Player`（未移植）。**已在此标注**，不是静默省略。
//
// ⚠️ `updateTeamStats()` 第一段循环遍历 `Team.all`（256 项）并对每一项调 `team.data()`。
// 这依赖 `Team` 的静态块把 `all[0..255]` 全部填满（见 `Team.ts` 顶部陷阱 #9 说明）：
// 一个 undefined 的槽位会让这里抛 TypeError。

import { Seq } from "@mindustry-ts/arc";
import { Team } from "./Team.js";
import { Vars } from "../Vars.js";
import type { Block } from "../world/Block.js";
import type { Building } from "../gen/Building.js";

/** 对应 `mindustry.game.Teams.TeamData`。 */
export class TeamData{
  readonly team: Team;

  /**
   * Java 里是 `private boolean presentFlag`，但外层类 `Teams` 会直接读写它（Java 允许）。
   * TS 的 `private` 是**类作用域**的，跨类访问会编译失败，因此这里保持公开并加注。
   */
  presentFlag = false;

  /** 该队伍失去核心时的敌人列表（`updateEnemies()` 填充）。 */
  coreEnemies: Team[] = [];
  /** 该队伍存活的核心（`CoreBuild` 未移植，用 `Building`；S3 恒为空）。 */
  readonly cores = new Seq<Building>();
  /** 该队伍最后一个已知存活的核心。 */
  lastCore: Building | null = null;
  /** 该队伍的全部建筑（含 `update()` 为 false 的）。 */
  readonly buildings = new Seq<Building>();
  /** 按方块类型缓存的建筑。Java 是 `ObjectMap<Block, Seq<Building>>`。 */
  readonly buildingTypes = new Map<Block, Seq<Building>>();
  /** 该队伍的单位（`Unit` 未移植 → 用 `unknown` 占位）。 */
  readonly units = new Seq<unknown>();
  /** 该队伍中的玩家（`Player` 未移植 → 用 `unknown` 占位）。 */
  readonly players = new Seq<unknown>();
  /** 单位总数。 */
  unitCount = 0;
  /** 当前单位上限。 */
  unitCap = 0;

  constructor(team: Team){
    this.team = team;
  }

  /** 对应 Java `getBuildings(Block)`。 */
  getBuildings(block: Block): Seq<Building>{
    let seq = this.buildingTypes.get(block);
    if(seq === undefined){
      seq = new Seq<Building>();
      this.buildingTypes.set(block, seq);
    }
    return seq;
  }

  /** 对应 Java `getCount(Block)`。 */
  getCount(block: Block): number{
    const res = this.buildingTypes.get(block);
    return res === undefined ? 0 : res.size;
  }

  /** 对应 Java `TeamData.active()`。 */
  active(): boolean{
    return (
      (this.team === Vars.state.rules.waveTeam && Vars.state.rules.waves) ||
      this.cores.size > 0 ||
      this.buildings.size > 0 ||
      (this.team === Team.neoplastic && this.units.size > 0)
    );
  }

  /** 对应 Java `TeamData.hasCore()`。 */
  hasCore(): boolean{
    return this.cores.size > 0;
  }

  /** @return 该队伍是否有存活核心（标准队伍）或心脏（neoplasm）。对应 Java `isAlive()`。 */
  isAlive(): boolean{
    return this.hasCore();
  }

  /** 对应 Java `TeamData.noCores()`。 */
  noCores(): boolean{
    return this.cores.isEmpty();
  }

  /** 对应 Java `TeamData.core()`。 */
  core(): Building | null{
    return this.cores.isEmpty() ? null : this.cores.first();
  }
}

/** 对应 `mindustry.game.Teams`。 */
export class Teams{
  /** 队伍 id → 队伍数据。 */
  private readonly map: Array<TeamData | undefined> = new Array<TeamData | undefined>(256);
  /** 活跃队伍。 */
  readonly active = new Seq<TeamData>();
  /** 有方块或单位存在的队伍。 */
  readonly present = new Seq<TeamData>();

  constructor(){
    // ⚠️ Java 原文：`active.add(get(Team.crux))` —— crux 总是「活跃」的。
    this.active.add(this.get(Team.crux));
  }

  /** 按队伍取数据（不存在则创建）。对应 Java `get(Team)`。 */
  get(team: Team): TeamData{
    const data = this.map[team.id];
    if(data !== undefined){
      return data;
    }
    const created = new TeamData(team);
    this.map[team.id] = created;
    return created;
  }

  /** 对应 Java `getOrNull(Team)`。 */
  getOrNull(team: Team): TeamData | null{
    return this.map[team.id] ?? null;
  }

  /** 对应 Java `playerCores()`。 */
  playerCores(): Seq<Building>{
    return this.get(Vars.state.rules.defaultTeam).cores;
  }

  /** 不要直接修改返回值。对应 Java `cores(Team)`。 */
  cores(team: Team): Seq<Building>{
    return this.get(team).cores;
  }

  /** @return 队伍是否活跃（是否有存活核心）。对应 Java `isActive(Team)`。 */
  isActive(team: Team): boolean{
    // 敌方波次队伍总是活跃的
    return this.get(team).active();
  }

  /** 对应 Java `canInteract(Team, Team)`。 */
  canInteract(team: Team, other: Team): boolean{
    return team === other || other === Team.derelict;
  }

  /** 不要修改返回值。对应 Java `getActive()`。 */
  getActive(): Seq<TeamData>{
    this.active.removeAll((t) => !t.active());
    return this.active;
  }

  /** 对应 Java `updateActive(Team)`。 */
  updateActive(team: Team): void{
    const data = this.get(team);
    // 需要时登记进活跃列表
    if(data.active() && !this.active.contains(data)){
      this.active.add(data);
      this.updateEnemies();
    }
  }

  /** 对应 Java `updateEnemies()`（私有）。 */
  private updateEnemies(): void{
    if(Vars.state.rules.waves && !this.active.contains(this.get(Vars.state.rules.waveTeam))){
      this.active.add(this.get(Vars.state.rules.waveTeam));
    }

    for(const data of this.active){
      const enemies: Team[] = [];

      for(const other of this.active){
        if(data.team !== other.team){
          enemies.push(other.team);
        }
      }

      data.coreEnemies = enemies;
    }
  }

  /**
   * 对应 Java `updateTeamStats()`。
   * ⚠️ 未移植 `Groups.unit` / `Groups.player` 两段（见文件头）。第一段的 `unitTree.clear()` /
   * `typeCounts` / `unitsByType` 同样未移植（那些字段不在 S3 的 `TeamData` 里）。
   */
  updateTeamStats(): void{
    this.present.clear();

    for(const team of Team.all){
      const data = team.data();

      data.presentFlag = data.buildings.size > 0;
      data.unitCount = 0;
      data.units.clear();
      data.players.clear();
      if(data.cores.size > 0){
        data.lastCore = data.cores.first();
      }
    }

    // TODO(S4/S5): for(Unit unit : Groups.unit){ ... } 与 for(Player player : Groups.player){ ... }

    // 更新每个队伍的存在性
    for(const team of Team.all){
      const data = team.data();

      if(data.presentFlag || data.active()){
        this.present.add(data);
      }
    }
  }
}
