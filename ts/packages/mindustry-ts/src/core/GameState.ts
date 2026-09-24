// 源: core/src/mindustry/core/GameState.java
//
// 移植范围: 全部字段与状态查询方法。
// 未移植（逐条标注）:
//   - `map` 的真实类型 `Map`（地图文件对象）→ S3 用 `unknown | null` 占位；`emptyMap` 同理
//     （Java `Vars.emptyMap` 是 `new Map(new StringMap())`，S3 无地图加载）
//   - `stats`（`GameStats`）/ `markers`（`MapMarkers`）/ `mapLocales`（`MapLocales`）/
//     `data`（`DataManager`）—— 分别属于统计、标记、本地化、数据补丁（计划 §9）
//   - `boss()` / `hasSpawns()` / `getPlanet()` / `getSector()` —— 依赖 `Unit`/`Sector`/`Planet`
//     （未移植）；`isCampaign()` / `hasSector()` 保留并恒为 false（`rules.sector === null`）
//   - `enemies` 字段保留（`Logic` 会写它）

import { Events } from "@mindustry-ts/arc";
import { StateChangeEvent } from "../game/EventType.js";
import { Rules } from "../game/Rules.js";
import { Teams } from "../game/Teams.js";
import { Attributes } from "../world/meta/Attributes.js";

/** 对应 `GameState.State`。 */
export enum State{
  paused,
  playing,
  menu
}

/** 对应 `mindustry.core.GameState`。 */
export class GameState{
  /** 当前波数；非波次模式下可以是任意值。 */
  wave = 1;
  /** 波次倒计时（tick）。 */
  wavetime = 0;
  /** 逻辑 tick。 */
  tick = 0;
  /** 每次非暂停更新都会 +1。 */
  updateId = 0;
  /** 是否处于游戏结束状态。 */
  gameOver = false;
  /** 战役中表示「游戏结束后」状态；此状态下总是暂停。 */
  afterGameOver = false;
  /** 玩家一方是否获胜。 */
  won = false;
  /** 服务器 tick/秒；仅多人有效。 */
  serverTps = -1;
  /** 当前游玩的地图。S3 无地图加载，保留 `unknown` 占位。 */
  map: unknown = null;
  /** 当前游戏规则。 */
  rules = new Rules();
  /** 队伍数据，每局重置。 */
  teams = new Teams();
  /** 敌人数量；仅客户端在服务器上使用。 */
  enemies = 0;
  /** 全局环境属性，由天气计算。 */
  envAttrs = new Attributes();
  /**
   * 当前状态。
   * ⚠️ 必须是 `private` 语义（Java 是 private），只能经 `set()` 改，否则不会 fire `StateChangeEvent`。
   */
  private state: State = State.menu;

  /** 对应 Java `GameState.set(State)`。 */
  set(astate: State): void{
    // 没有变化
    if(this.state === astate) return;

    Events.fire(new StateChangeEvent(this.state, astate));
    this.state = astate;
  }

  /** 对应 Java `hasSpawns()`。 */
  hasSpawns(): boolean{
    return (
      this.rules.waves &&
      ((this.rules.waveTeam.cores().size > 0 && this.rules.attackMode) || this.rules.spawns.size > 0)
    );
  }

  /** 对应 Java `isCampaign()`：注意「处于战役」不一定意味着有 sector。 */
  isCampaign(): boolean{
    return this.rules.sector !== null;
  }

  /** 对应 Java `hasSector()`。 */
  hasSector(): boolean{
    return this.rules.sector !== null;
  }

  /** 对应 Java `isEditor()`。 */
  isEditor(): boolean{
    return this.rules.editor;
  }

  /** 对应 Java `isPaused()`。 */
  isPaused(): boolean{
    return this.state === State.paused;
  }

  /** @return 是否有未暂停的游戏在进行中。对应 Java `isPlaying()`。 */
  isPlaying(): boolean{
    return this.state === State.playing;
  }

  /** @return 当前状态是否**不是**菜单。对应 Java `isGame()`。 */
  isGame(): boolean{
    return this.state !== State.menu;
  }

  /** 对应 Java `isMenu()`。 */
  isMenu(): boolean{
    return this.state === State.menu;
  }

  /** 对应 Java `is(State)`。 */
  is(astate: State): boolean{
    return this.state === astate;
  }

  /** 对应 Java `getState()`。 */
  getState(): State{
    return this.state;
  }
}
