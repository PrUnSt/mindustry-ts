// 源: core/src/mindustry/game/EventType.java
//
// 只移植 S3 tick 闭环会 fire/on 的事件与 Trigger 枚举值。Java 有 100+ 事件类。
//
// ⚠️ 陷阱 #4（计划 §6.2）: `Tile.java:26-32` 的四个事件是**静态单例**，反复 `set()` 后复用
// 同一个对象再 fire。`arc-ts` 的 `Events.fire(event)` 以 `event.constructor` 为 key
// （见 `Events.ts:46`），所以复用对象不会串台。这里必须提供 `set(...)` 方法。

import type { Tile } from "../world/Tile.js";
import type { State } from "../core/GameState.js";

/** 对应 Java `EventType.ContentInitEvent`（`Vars.java:387-389` 用它给 `emptyTile` 赋值）。 */
export class ContentInitEvent{ }

/** 对应 Java `EventType.WorldLoadBeginEvent`。 */
export class WorldLoadBeginEvent{ }

/** 对应 Java `EventType.WorldLoadEndEvent`。 */
export class WorldLoadEndEvent{ }

/** 对应 Java `EventType.WorldLoadEvent`。 */
export class WorldLoadEvent{ }

/** 对应 Java `EventType.StateChangeEvent`。 */
export class StateChangeEvent{
  readonly from: State;
  readonly to: State;

  constructor(from: State, to: State){
    this.from = from;
    this.to = to;
  }
}

/** 对应 Java `EventType.TileChangeEvent`（复用单例）。 */
export class TileChangeEvent{
  tile: Tile | null = null;

  set(tile: Tile): TileChangeEvent{
    this.tile = tile;
    return this;
  }
}

/** 对应 Java `EventType.TilePreChangeEvent`（复用单例）。 */
export class TilePreChangeEvent{
  tile: Tile | null = null;

  set(tile: Tile): TilePreChangeEvent{
    this.tile = tile;
    return this;
  }
}

/** 对应 Java `EventType.TileFloorChangeEvent`（复用单例）。 */
export class TileFloorChangeEvent{
  tile: Tile | null = null;
  previous: unknown = null;
  floor: unknown = null;

  set(tile: Tile, previous: unknown, floor: unknown): TileFloorChangeEvent{
    this.tile = tile;
    this.previous = previous;
    this.floor = floor;
    return this;
  }
}

/** 对应 Java `EventType.TileOverlayChangeEvent`（复用单例）。 */
export class TileOverlayChangeEvent{
  tile: Tile | null = null;
  previous: unknown = null;
  overlay: unknown = null;

  set(tile: Tile, previous: unknown, overlay: unknown): TileOverlayChangeEvent{
    this.tile = tile;
    this.previous = previous;
    this.overlay = overlay;
    return this;
  }
}

/** 对应 Java `EventType.BlockDestroyEvent`。 */
export class BlockDestroyEvent{
  readonly tile: Tile;

  constructor(tile: Tile){
    this.tile = tile;
  }
}

/** 对应 Java `EventType.WaveEvent`（`Logic.runWave()` 会 fire）。 */
export class WaveEvent{ }

/** 对应 Java `EventType.GameOverEvent`（`Logic.checkGameState()` 会 fire）。 */
export class GameOverEvent{
  /** 获胜方队伍（`Team`；未移植 S3 泛化类型，用 unknown 保持事件可构造）。 */
  readonly winner: unknown;

  constructor(winner: unknown){
    this.winner = winner;
  }
}

/**
 * 对应 Java `EventType.Trigger` 枚举（用 `Events.fireTrigger` 触发，key 是枚举值本身）。
 * 顺序与 Java 一致；S3 只用到 game update 前后那几个。
 */
export enum Trigger{
  update,
  beforeGameUpdate,
  afterGameUpdate,
  beforeRender,
  afterRender,
  clientLoad,
  worldLoad,
  wave,
  turn,
  play,
  pause,
  reset,
  dispose,
  missionControl
}
