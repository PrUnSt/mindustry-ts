// S3 子步 6：headless 与 web **共用**的世界模拟 harness。
//
// 四个函数把「建世界 → 放方块 → 跑 tick → 取快照」这条链路封装成可复现的纯函数式 API：
//   createWorld(w, h, seed)     建一张 w×h 的全 air 世界并进入 playing
//   placeBlock(x, y, block, r?) 在坐标放一个方块
//   runTicks(n)                 推进 n 个虚拟帧（**不 sleep**）
//   snapshot()                  返回**确定性字符串**（硬断言 #6 的观测对象）
//
// ⚠️ 虚拟时钟的重置（本 harness 相对 Java 的**关键设计**，必须知道）:
//   Java 的 `Time.time` 是单调的墙上时钟，跨新游戏不归零；`state.tick` 由 `PlayEvent`
//   归零。硬断言 #6 要求「两次**全新建图**、同种子、同 tick 数 → 快照字符串完全相等」，
//   而 `snapshot()` 必须包含 `Time.time`。若 `createWorld` 不重置虚拟时钟，第二次建图
//   的 `Time.time` 会从 600 起算 → 快照必然不等。
//   因此 `createWorld` 显式做 `Time.clear(); Time.setInternalTime(0);` ——
//   语义等价于 Java `Logic.reset()`（它调 `Time.clear()`）+ 开局归零，
//   只是把「墙上时钟」换成「每个新世界从 0 起的虚拟时钟」。这是 headless 可复现的前提。
//
// ⚠️ `Mathf.rand` 的种子在 `bootstrap()` **之后**设置：基础内容创建过程可能（也是
//   Java 的行为）消耗全局随机；先 bootstrap 再设种子，保证「同一 seed → 同一起点」。
//
// ⚠️ `snapshot()` **绝不包含**：对象地址、`Date.now()`、`Map`/`Set` 的迭代顺序、
//   实体 id（`EntityGroup.lastId` 是跨世界不重置的静态计数器）、以及任何非确定量。
//   只包含：tick、Time.time、rand 种子、各组 size、逐 tile 的 floor/overlay/block **名字**、
//   data 与建筑摘要（名字/队伍/血量）。

import { Mathf, Time } from "@mindustry-ts/arc";
import { Vars } from "./Vars.js";
import { State } from "./core/GameState.js";
import { Logic } from "./core/Logic.js";
import { Groups } from "./gen/Groups.js";
import type { Block } from "./world/Block.js";
import type { Tile } from "./world/Tile.js";

/** 当前世界的 `Logic` 实例（`createWorld` 时重建）。 */
let logic: Logic | null = null;

/**
 * 建一张 `width × height` 的全 air 世界并进入 `playing`。
 *
 * 顺序（对齐 `server/ServerLauncher.java` 的「init → 内容 → 进入游戏 → 载图」）：
 *   1. `Vars.bootstrap()` —— 幂等；每次调用都会重建 `content` / `world` / `state` / `Groups`。
 *   2. `state.set(State.playing)` —— 让 `Logic.update()` 进入 `isGame()` 分支。
 *   3. 重置虚拟时钟（见文件头）。
 *   4. `Mathf.rand.setSeed(seed)` —— 固定全局随机起点。
 *   5. `new Logic()` —— **必须在 `loadGenerator` 之前**：构造器注册了 `WorldLoadEvent`
 *      监听（对齐 Java 在 launcher 初始化期 `new Logic()`）。
 *   6. `world.loadGenerator(width, height, tiles => tiles.fill())`。
 */
export function createWorld(width: number, height: number, seed: number): void{
  Vars.bootstrap();
  Vars.state.set(State.playing);

  Time.clear();
  Time.setInternalTime(0);

  Mathf.rand.setSeed(seed);

  logic = new Logic();

  Vars.world.loadGenerator(width, height, (tiles) => {
    tiles.fill();
  });
}

/**
 * 在 `(x, y)` 放置 `block`（`rotation` 默认 0），队伍用当前规则默认队伍
 * （`state.rules.defaultTeam`，默认 `Team.sharded`）。
 * 对应 `Tile.setBlock(Block, Team, int)`。
 */
export function placeBlock(x: number, y: number, block: Block, rotation = 0): void{
  const tile = Vars.world.tile(x, y);
  if(tile === null){
    throw new Error("placeBlock: 坐标越界 (" + x + "," + y + ")");
  }
  tile.setBlock(block, Vars.state.rules.defaultTeam, rotation);
}

/**
 * 推进 `n` 个虚拟帧（每次 `logic.update()`）。**不 sleep** —— 时间由 `MockGraphics`
 * 的固定 `deltaTime = 1/60` 驱动，每帧 `state.tick += 1`、`Time.time += 1`。
 */
export function runTicks(n: number): void{
  if(logic === null){
    throw new Error("runTicks: 必须先调用 createWorld(...)");
  }
  for(let i = 0; i < n; i++){
    logic.update();
  }
}

/** 把单个 tile 渲染成一行确定性文本。 */
function tileLine(tile: Tile): string{
  const build = tile.build;
  const buildDesc =
    build === null
      ? "null"
      : build.block.name + ":" + String(build.team) + ":" + String(build.health) + ":" + String(build.rotation);
  return (
    "tile " +
    String(tile.x) +
    "," +
    String(tile.y) +
    " floor=" +
    tile.floor().name +
    " overlay=" +
    tile.overlay().name +
    " block=" +
    tile.block().name +
    " data=" +
    String(tile.data) +
    " build=" +
    buildDesc
  );
}

/**
 * @return 当前世界的**确定性字符串快照**（硬断言 #6 的观测对象）。
 * 内容与顺序固定：先标量（tick / Time.time / rand 种子 / 各组 size），再按 tile 数组
 * 顺序逐格输出 floor/overlay/block 名字、data 与建筑摘要。不含任何非确定量。
 */
export function snapshot(): string{
  const state = Vars.state;
  const lines: string[] = [];

  lines.push("tick=" + String(state.tick));
  lines.push("time=" + String(Time.time));
  lines.push("rand seed0=" + String(Mathf.rand.seed0) + " seed1=" + String(Mathf.rand.seed1));
  lines.push(
    "groups" +
      " all=" + String(Groups.all.size()) +
      " effect=" + String(Groups.effect.size()) +
      " player=" + String(Groups.player.size()) +
      " bullet=" + String(Groups.bullet.size()) +
      " unit=" + String(Groups.unit.size()) +
      " build=" + String(Groups.build.size()) +
      " sync=" + String(Groups.sync.size()) +
      " draw=" + String(Groups.draw.size()) +
      " weather=" + String(Groups.weather.size()) +
      " powerGraph=" + String(Groups.powerGraph.size())
  );

  // tile 网格尺寸（也进快照：建图尺寸变了必须体现在快照里）
  lines.push("size=" + String(Vars.world.width()) + "x" + String(Vars.world.height()));

  for(const tile of Vars.world.tiles){
    lines.push(tileLine(tile));
  }

  return lines.join("\n");
}
