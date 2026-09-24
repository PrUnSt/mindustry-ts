// `@mindustry-ts/game` 的公开入口。
//
// 用途:
//   1. `package.json` 的 `main` / `types` 指向本文件 —— `apps/headless` 与 `apps/web`
//      都通过 `@mindustry-ts/game` 解析到这里（pnpm 的 workspace 软链）。
//   2. 汇聚 S3 的公开面，作为「下游阶段该 import 什么」的清单。
//
// ⚠️ 不做 `export *`: 本项目里同名导出很常见（`Content` / `Block` / `Item` 既有类也有
// 枚举成员，`State` 既是枚举也在 `GameState` 里），`export *` 会让冲突在**消费方**才爆出来。
// 逐条具名导出把冲突挡在这里，也顺便当文档。
//
// ⚠️ `gen/` 下的产物只导出 `Groups` 与 `Building`: 其余是 codegen 的实现细节，下游应通过
// `Vars` / `Blocks` / 具体方块类访问。`Groups` 是例外 —— Java 里它也是全局单例入口
// （`mindustry.gen.Groups`），测试与 app 都要读 `Groups.build.size()`。

// ---- 全局 ----
export { Vars } from "./Vars.js";

// ---- 内容 ----
export { Blocks } from "./content/Blocks.js";
export { Items } from "./content/Items.js";
export { Liquids } from "./content/Liquids.js";
export { ContentLoader } from "./core/ContentLoader.js";

// ---- 类型系统 ----
export { Content } from "./ctype/Content.js";
export { MappableContent } from "./ctype/MappableContent.js";
export { UnlockableContent } from "./ctype/UnlockableContent.js";
export { ContentType } from "./ctype/ContentType.js";
export { Category } from "./type/Category.js";
export { Item } from "./type/Item.js";
export { ItemStack } from "./type/ItemStack.js";
export { Liquid } from "./type/Liquid.js";

// ---- 世界 ----
export { Block } from "./world/Block.js";
export { Tile } from "./world/Tile.js";
export { Tiles } from "./world/Tiles.js";
export { World } from "./core/World.js";
export { Edges } from "./world/Edges.js";
export { Floor } from "./world/blocks/environment/Floor.js";
export { AirBlock } from "./world/blocks/environment/AirBlock.js";
export { Prop } from "./world/blocks/environment/Prop.js";
export { StaticWall } from "./world/blocks/environment/StaticWall.js";
export { Wall, WallBuild } from "./world/blocks/defense/Wall.js";
export { Conveyor, ConveyorBuild } from "./world/blocks/distribution/Conveyor.js";
export { Router, RouterBuild } from "./world/blocks/distribution/Router.js";
export { BlockGroup } from "./world/meta/BlockGroup.js";
export { BuildVisibility } from "./world/meta/BuildVisibility.js";
export { Env } from "./world/meta/Env.js";
export { Attributes } from "./world/meta/Attributes.js";

// ---- 游戏状态 ----
export { GameState, State } from "./core/GameState.js";
export { Rules } from "./game/Rules.js";
export { Team } from "./game/Team.js";
export { Teams } from "./game/Teams.js";
export { Gamemode } from "./game/Gamemode.js";
export { defaultEnv } from "./game/defaults.js";
export {
  BlockDestroyEvent,
  ContentInitEvent,
  GameOverEvent,
  StateChangeEvent,
  TileChangeEvent,
  TileFloorChangeEvent,
  TileOverlayChangeEvent,
  TilePreChangeEvent,
  Trigger,
  WaveEvent,
  WorldLoadBeginEvent,
  WorldLoadEndEvent,
  WorldLoadEvent
} from "./game/EventType.js";

// ---- tick 闭环（S3 子步 5/6）----
export { Logic } from "./core/Logic.js";
export { createWorld, placeBlock, runTicks, snapshot } from "./harness.js";

// ---- 实体 ----
export { Groups } from "./gen/Groups.js";
export { EntityGroup } from "./entities/EntityGroup.js";
export { EntityCollisions } from "./entities/EntityCollisions.js";
export { TargetPriority } from "./entities/TargetPriority.js";
export { Building } from "./gen/Building.js";
