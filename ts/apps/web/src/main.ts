// ============================================================================
// Web 入口 —— 可交互的俯视世界视图。
//
// 与 `apps/headless/src/index.ts` 的关系（这是本文件存在的理由）：
//   两者**共用** `@mindustry-ts/game` 的 harness（`createWorld` / `runTicks`），
//   区别只在「跑完之后干什么」：
//     headless → `snapshot()` 打印确定性文本（回归网，`snapshotLen=15540`）
//     web      → 每帧 `renderWorld()` 把**同一份** `Vars.world` 画到 canvas
//   所以这里不是「另一个游戏」，只是同一份模拟的另一个出口 —— 也正是为什么
//   web 端画面能与 headless 快照逐字节对应（同种子、同 tick 数 → 同一世界）。
//
//   ⚠️ `snapshot()` 仍然保留（见 `logSnapshot`）：点「重置」时往 console 打一份，
//      任何时候都能把画面与 headless 的文本对拍，视觉升级没有丢掉这条验证手段。
//
// ⚠️ 时间模型: `runTicks(1)` == `logic.update()` 一次 == 一个逻辑帧，
//   `Time.delta` 恒为 1（`MockGraphics.getDeltaTime()` 固定 1/60，对齐
//   `HeadlessApplication.java:39`）。用 `requestAnimationFrame` 驱动 → 60fps 下即单倍速。
//
// ⚠️ 本文件**不新增游戏规则**。物品靠 `ConveyorBuild.handleStack()` 注入 ——
//   那是游戏自身的入料 API（语义 = 「外部往这条带子上放东西」）。
//   传送带上的每一颗物品都是传送带逻辑真的在搬运，没有任何"为了好看而写死的动画"。
//
// ─────────────────────────── S6: 采矿/核心闭环 ───────────────────────────
//  演示布局从「传送带 + 路由器」升级为**一条真实的采矿闭环**:
//      铜矿(2×2) → 机械钻头(2×2, `Blocks.mechanicalDrill`) → 传送带 ×3 → 核心(3×3, `Blocks.coreShard`)
//  · 「放置方块」走 `Build.beginPlace` —— 校验 + **扣队伍核心库存** + 落地；
//    资源不足时返回 false 且库存不变，界面给出闪烁提示（`flash`）。
//  · 「拆除」走 `Build.breakBlock` —— 按 `deconstructRefundMultiplier` 退款。
//  · 地板/矿石仍走 `setFloor` / `setOverlay`（这两者本来就不消耗资源）。
//  ⚠️ 唯一的**有意例外**是 `buildDemo()`：建图用 `tile.setBlock`（免费），
//     否则「先有核心才能建核心」是个死锁。建图后再给核心预置一批资源（见 `seedCoreItems`）。
// ============================================================================

import {
  Blocks,
  ConveyorBuild,
  createWorld,
  Groups,
  Items,
  runTicks,
  snapshot,
  Vars
} from "@mindustry-ts/game";
import type { Block, Floor, ItemModule } from "@mindustry-ts/game";

// ⚠️ **深路径导入**（临时手段，已在交付报告里请编排方把这几条补进包入口）:
//   `Build` / `DrillBuild` / `CoreBuild` 目前**没有**从 `@mindustry-ts/game` 的
//   `index.ts` 导出。`package.json` 无 `exports` 字段 + `moduleResolution: bundler`
//   ⇒ 可以按源码路径解析。本阶段禁止修改 `ts/packages/**`，故唯一可行的写法就是这个。
//   package 侧补上导出后，这三行应改回 `from "@mindustry-ts/game"`。
import { Build } from "@mindustry-ts/game/src/world/Build.js";
import { DrillBuild } from "@mindustry-ts/game/src/world/blocks/production/Drill.js";

import { hash2, renderWorld } from "./render";
import type { FrameStats } from "./render";

// ---- 世界参数 ----

const WORLD_W = 32;
const WORLD_H = 32;
/** 与 headless 同种子，便于两边对照。 */
const SEED = 123;

// ---- 采矿闭环的布局坐标（写在一处，离得远点也一眼能对上）----
//
//   y
//   ↑        ┌──────── 核心 3×3（锚点 (12,16)，sizeOffset=-1 → 占 (11,15)-(13,17)）
//   │   传送带 →→→→
//   │   钻头 2×2（锚点 (6,16)，sizeOffset=0 → 占 (6,16)-(7,17)）
//   │   铜矿 2×2（钻头压在上面才产矿）
//   └──────────────────────────────────→ x

/** 铜矿覆盖层左上角（2×2）。 */
const ORE_X = 6;
const ORE_Y = 16;
/** 机械钻头锚点（size 2）。 */
const DRILL_X = 6;
const DRILL_Y = 16;
/** 传送带起点 / 长度（朝世界 +x，最末一格正对核心西侧格 (11,16)）。 */
const BELT_X = 8;
const BELT_Y = 16;
const BELT_LEN = 3;
/** 核心锚点（size 3，锚点是**中心**格）。 */
const CORE_X = 12;
const CORE_Y = 16;
/** 建图后预置给核心的资源 —— 让「机械钻头」(12 铜) 一开场就建得起。 */
const SEED_COPPER = 800;
const SEED_LEAD = 600;

/** 自动供料的注入点（闭环第一格传送带）—— 供料不是闭环必需，纯粹让画面立刻有东西在动。 */
const FEED_X = BELT_X;
const FEED_Y = BELT_Y;
/** 每 N 个逻辑帧注入一颗铜 —— 传送带速度 0.035/tick，走完一格约 29 tick。 */
const FEED_INTERVAL = 24;

/** 世界方向 → 屏幕方位符号（rotation 1 在世界里是 +y，翻转后屏幕上也是「向上」）。 */
const DIR_NAMES = ["→", "↑", "←", "↓"];

// ---- 工具调色板 ----

type ToolKind = "floor" | "overlay" | "block";

interface Tool{
  label: string;
  kind: ToolKind;
  block: Block;
}

/**
 * 工具调色板。
 *
 * ⚠️ **不能写成模块顶层常量** —— 这是本项目一个很隐蔽的坑：
 *   `Blocks` 是**类**，它的成员（`Blocks.stone` / `Blocks.conveyor` / …）由
 *   `Blocks.load()` 逐条赋值，而 `load()` 是 `Vars.bootstrap()` 调的，也就是
 *   `createWorld()` 的时候。模块顶层代码跑在 `main()` **之前**，那时 `Blocks.stone`
 *   等**全部是 `undefined`**，可 `tsc` 完全看不出来（静态字段的声明类型就是有值的类型）。
 *
 *   症状极具误导性：工具栏按钮文字一切正常（`label` 是纯字面量），
 *   但一放置方块就 `Cannot read properties of undefined (reading 'rotate')`。
 *
 *   所以用 `let` 占位，等 `initWorld()`（= 内容已 load）之后再 `buildPalette()` 填。
 *   headless 那边遇不到这个问题 —— 它不在模块顶层引用 `Blocks` 成员。
 */
let palette: Tool[] = [];

function buildPalette(): void{
  palette = [
    { label: "石地", kind: "floor", block: Blocks.stone },
    { label: "沙地", kind: "floor", block: Blocks.sand },
    { label: "草地", kind: "floor", block: Blocks.grass },
    { label: "铜矿", kind: "overlay", block: Blocks.oreCopper },
    { label: "铜墙", kind: "block", block: Blocks.copperWall },
    { label: "传送带", kind: "block", block: Blocks.conveyor },
    { label: "路由器", kind: "block", block: Blocks.router },
    // S6 新增：闭环的两端。⚠️ 索引 7/8 —— 前 7 项顺序**不能动**（`runSelfTest` 按下标选工具）。
    { label: "机械钻头", kind: "block", block: Blocks.mechanicalDrill },
    { label: "核心", kind: "block", block: Blocks.coreShard }
  ];
}
/** 默认选中「传送带」—— 唯一能一眼看出「东西在动」的工具。 */
const DEFAULT_TOOL = 5;

/** 工具下标（`runSelfTest` 与键盘 1–9 都用它，不要散落魔法数字）。 */
const TOOL_CONVEYOR = 5;
const TOOL_ROUTER = 6;
const TOOL_DRILL = 7;
const TOOL_CORE = 8;

// ---- 运行时状态 ----

let cell = 22;
let paused = false;
let autoFeed = true;
let currentRotation = 0;
let selected = DEFAULT_TOOL;
let hoverX = -1;
let hoverY = -1;
let dragging = 0;
let lastDragX = -99;
let lastDragY = -99;
let feedAcc = 0;
let statusAcc = 0;
let stats: FrameStats = { items: 0, builds: 0 };

/**
 * 资源不足等操作的可见反馈。
 *
 * ⚠️ 用**帧计数**衰减（`noticeTicks`），不用 `Date.now()` —— 与「不引入非确定量」的
 *   项目约定一致（渲染每帧重跑，若用墙上时钟则同一次操作在不同机器上表现不同）。
 */
let notice = "";
let noticeTicks = 0;
/** 提示停留帧数（120 帧 ≈ 2 秒 @60fps）。 */
const NOTICE_FRAMES = 120;

// ---- DOM ----

function need<T extends HTMLElement>(id: string): T{
  const el = document.getElementById(id);
  if(el === null){
    throw new Error("缺少 DOM 节点 #" + id);
  }
  return el as T;
}

const canvas = need<HTMLCanvasElement>("screen");
const toolbar = need<HTMLDivElement>("toolbar");
const statusEl = need<HTMLSpanElement>("status");
const hudEl = need<HTMLSpanElement>("hud");
const noticeEl = need<HTMLSpanElement>("notice");

const ctxOrNull = canvas.getContext("2d");
if(ctxOrNull === null){
  throw new Error("浏览器不支持 Canvas 2D");
}
const ctx: CanvasRenderingContext2D = ctxOrNull;

// ---- 工具函数 ----

/** 夹到 `[0,4)`，对应 Java `Mathf.mod(rotation, 4)`。 */
function rot4(r: number): number{
  return ((r % 4) + 4) % 4;
}

/** 放一个方块（越界静默忽略，方便写演示布局）。 */
function place(x: number, y: number, block: Block, rotation = 0): void{
  const tile = Vars.world.tile(x, y);
  if(tile === null) return;
  tile.setBlock(block, Vars.state.rules.defaultTeam, rotation);
}

/** 把当前世界打成与 headless 同格式的文本快照，输出到 console。 */
function logSnapshot(): void{
  console.log(snapshot());
}

// ---- 世界初始化 ----

/**
 * 铺地板 + 撒矿。
 * 用确定性哈希而**不是** `Mathf.rand` —— 后者会消耗全局随机序列，把
 * `snapshot()` 里的 `rand seed0/seed1` 推离 headless 的值，破坏两边对照。
 */
function paintTerrain(): void{
  for(let x = 0; x < WORLD_W; x++){
    for(let y = 0; y < WORLD_H; y++){
      const tile = Vars.world.tile(x, y);
      if(tile === null) continue;

      const region = hash2(x >> 2, y >> 2);
      if(region > 0.70){
        tile.setFloor(Blocks.sand);
      }else if(region < 0.22){
        tile.setFloor(Blocks.grass);
      }else{
        tile.setFloor(Blocks.stone);
      }

      if(hash2(x * 3 + 1, y * 5 + 2) > 0.94){
        tile.setOverlay(Blocks.oreCopper);
      }
    }
  }
}

/**
 * 演示布局：**一条真实的采矿闭环**。
 *
 *   铜矿(2×2)  →  机械钻头(2×2)  →  传送带 ×3  →  核心(3×3)
 *   产矿端          2 倍速挖掘        朝 +x 运输      队伍库存
 *
 * 每一段都是**真的接上了**，不是摆着好看：
 *   · 钻头的 `canMine` 只看 `Tile.drop()`（= overlay/floors 的 `itemDrop`），
 *     所以「钻头压在矿上」这句话必须靠 `tile.setOverlay(Blocks.oreCopper)` 落实；
 *   · 钻头产出走 `offload()` → 邻居 `acceptItem` ⇒ 必须让传送带落在钻头的邻环里。
 *     size 2 的邻环（`Edges.getEdges(2)`）在锚点 (6,16) 时是
 *     (6,15)(7,15)(6,18)(7,18)(5,16)(5,17)**(8,16)**(8,17) —— (8,16) 正是传送带起点；
 *   · 传送带的 `next = front()` ⇒ 最末一格 (10,16) 的 `front()` 是 (11,16)，
 *     而核心 3×3（锚点 (12,16)、`sizeOffset = -1`）**恰好**覆盖 (11,15)-(13,17)。
 *
 * ⚠️ 建图一律用 `tile.setBlock`（免费）而**不是** `Build.beginPlace` —— 演示布局不该
 *   消耗资源（否则「先有核心才能建核心」死锁）。资源在 `seedCoreItems()` 里预置。
 */
function buildDemo(): void{
  // ---- ① 矿脉：2×2 铜矿覆盖层（钻头的产矿来源）----
  for(let dx = 0; dx < 2; dx++){
    for(let dy = 0; dy < 2; dy++){
      const tile = Vars.world.tile(ORE_X + dx, ORE_Y + dy);
      if(tile !== null) tile.setOverlay(Blocks.oreCopper);
    }
  }

  // ---- ② 存储端：3×3 核心。锚点是**中心格**（`sizeOffset = -1` 由 `setBlock` 自行铺开）----
  place(CORE_X, CORE_Y, Blocks.coreShard, 0);

  // ---- ③ 运输：3 格传送带朝 +x。最后一段要放在核心之前，`front()` 才找得到核心 ----
  for(let i = 0; i < BELT_LEN; i++) place(BELT_X + i, BELT_Y, Blocks.conveyor, 0);

  // ---- ④ 采矿端：2×2 机械钻头。**最后放** —— 它自己的 `changed()` 会重建邻接，
  //        从而立刻把已就位的传送带收进 `proximity`（钻头只往邻居 dump）----
  place(DRILL_X, DRILL_Y, Blocks.mechanicalDrill, 0);

  // 兜底：万一放置顺序被改动，显式重建一次钻头邻接（幂等）。
  const drillTile = Vars.world.tile(DRILL_X, DRILL_Y);
  const drillBuild = drillTile === null ? null : drillTile.build;
  if(drillBuild !== null) drillBuild.updateProximity();

  // ---- 装饰：一段铜墙。顺便体现「墙不进 `Groups.build`」——
  //      状态栏的「建筑」数会比画面上看到的方块少，那是 `Wall.java` 未设 `update` 的正确结果。
  for(let y = 11; y <= 21; y++) place(26, y, Blocks.copperWall);
  for(let x = 6; x <= 10; x++) place(x, 21, Blocks.copperWall);
}

/**
 * 给队伍核心预置一批资源，让页面一打开就「建得起东西」。
 *
 * ⚠️ 为什么必须有这一步：`Build.beginPlace` 的扣费来源是**队伍核心的库存**
 *   （`state.teams.get(team).core().items`），而演示布局是免费建图 → 核心是空的 →
 *   用户点「机械钻头」会一律失败。预置量取 800 铜 / 600 铅:
 *     · 够建机械钻头（12 铜）与任意多台传送带/路由器；
 *     · **不够**建核心（1000 铜 + 800 铅）—— `runSelfTest` 的 `buildfail` 正好借这个差值。
 */
function seedCoreItems(): void{
  const items = teamItems();
  if(items === null) return;
  items.add(Items.copper, SEED_COPPER);
  items.add(Items.lead, SEED_LEAD);
}

function initWorld(): void{
  createWorld(WORLD_W, WORLD_H, SEED);
  paintTerrain();
  buildDemo();
  seedCoreItems();
}

// ---- 队伍库存 ----

/** 当前默认队伍的可花资源池（= 该队伍第一个核心的 `items`）。无核心时 `null`。 */
function teamItems(): ItemModule | null{
  const core = Vars.state.teams.get(Vars.state.rules.defaultTeam).core();
  return core === null ? null : (core.items as ItemModule | null);
}

/**
 * 队伍核心库存的**文本形式**（`物品名 数量`，按 item id 升序 —— 即 `ItemModule.each` 的顺序）。
 *
 * 这条函数是**唯一**的库存文本来源：HUD 用它渲染，`runSelfTest` 的 `hud` 条目
 * 也用它算期望值，两边不可能「各写一套」而对不上。
 */
function coreItemsText(items: ItemModule | null): string{
  if(items === null) return "核心：无核心";
  const parts: string[] = [];
  items.each((item, amount) => {
    parts.push(item.name + " " + String(amount));
  });
  return parts.length === 0 ? "核心：空" : "核心 " + parts.join(" · ");
}

// ---- 操作 ----

/** 显示一条会闪烁的提示（帧计数衰减，见 `noticeTicks` 的说明）。 */
function flash(msg: string): void{
  notice = msg;
  noticeTicks = NOTICE_FRAMES;
}

/**
 * 预检放置失败的原因，成功（可以放）时返回 `null`。
 *
 * 存在的理由: `Build.beginPlace` 只返回一个 bool，分不清「这里不能放」和「资源不够」，
 * 而这两种情况给用户的反馈应该完全不同。这里做一次**只读**预检只为产出文案，
 * 真正的校验与扣费仍然只发生在 `beginPlace` 一处（不做第二套真实逻辑）。
 */
function placementBlocker(x: number, y: number, block: Block, rotation: number): string | null{
  const team = Vars.state.rules.defaultTeam;
  if(!Build.validPlace(x, y, block, team, rotation)) return "此处无法放置「" + block.name + "」";

  const items = teamItems();
  if(items === null) return "无核心：不能建造「" + block.name + "」";

  const mult = Vars.state.rules.buildCostMultiplier;
  const missing: string[] = [];
  for(const stack of block.requirements){
    const need = Math.round(stack.amount * mult);
    const have = items.get(stack.item);
    if(have < need) missing.push(stack.item.name + " " + String(have) + "/" + String(need));
  }
  return missing.length === 0 ? null : "资源不足：" + missing.join("，");
}

/** 左键：应用当前工具。 */
function applyTool(tx: number, ty: number): void{
  const tile = Vars.world.tile(tx, ty);
  if(tile === null) return;

  const tool = palette[selected];
  if(tool === undefined) return;

  const team = Vars.state.rules.defaultTeam;

  // 地板 / 矿石覆盖层**不消耗资源**（对齐原版：它们不是「建筑」）
  if(tool.kind === "floor"){
    tile.setFloor(tool.block as Floor);
    return;
  }
  if(tool.kind === "overlay"){
    tile.setOverlay(tool.block);
    return;
  }

  // 点已存在的同种可旋转方块 → 原地转 90°（比反复新建顺手，也不用先删再放）。
  // ⚠️ 免费 —— 对齐 Java `Build.beginPlace` 里的 quickRotate 分支（它同样不扣费）。
  if(tool.block.rotate && tile.block() === tool.block){
    const build = tile.build;
    const next = rot4((build === null ? 0 : build.rotation) + 1);
    tile.setBlock(tool.block, team, next);
    currentRotation = next;
    return;
  }

  const rotation = tool.block.rotate ? currentRotation : 0;

  const blocker = placementBlocker(tx, ty, tool.block, rotation);
  if(blocker !== null){
    flash(blocker);
    return;
  }

  // ⚠️ 走 `Build.beginPlace`（而不是 `tile.setBlock`）才会有建造玩法:
  //   校验 + **扣队伍核心库存**（`rules.buildCostMultiplier` 倍率）+ 落地。
  //   失败时返回 false 且**库存不变** —— 所以这里必须给出可见反馈，不能静默。
  if(!Build.beginPlace(tx, ty, tool.block, team, rotation)){
    flash("建造失败：" + tool.block.name);
  }
}

/**
 * 右键：拆除方块（地板保留 —— 与游戏的拆除语义一致）。
 * ⚠️ 走 `Build.breakBlock`，退款按 `rules.deconstructRefundMultiplier`（默认 0.5）到账。
 */
function erase(tx: number, ty: number): void{
  const tile = Vars.world.tile(tx, ty);
  if(tile === null) return;
  if(tile.block() === Blocks.air) return;
  Build.breakBlock(tx, ty, Vars.state.rules.defaultTeam);
}

/** 往主线起点注入一颗铜 —— 走 `ConveyorBuild.handleStack`，即游戏自身的入料 API。 */
function feed(): void{
  const tile = Vars.world.tile(FEED_X, FEED_Y);
  const build = tile === null ? null : tile.build;
  if(build instanceof ConveyorBuild){
    build.handleStack(Items.copper, 1, null);
  }
}

// ---- 输入 ----

function toWorld(ev: MouseEvent): { x: number; y: number }{
  const rect = canvas.getBoundingClientRect();
  const sx = ev.clientX - rect.left;
  const sy = ev.clientY - rect.top;
  return { x: Math.floor(sx / cell), y: WORLD_H - 1 - Math.floor(sy / cell) };
}

function inBounds(x: number, y: number): boolean{
  return x >= 0 && x < WORLD_W && y >= 0 && y < WORLD_H;
}

function bindInput(): void{
  canvas.addEventListener("mousemove", (ev) => {
    const p = toWorld(ev);
    hoverX = p.x;
    hoverY = p.y;

    if(dragging !== 0 && inBounds(p.x, p.y) && (p.x !== lastDragX || p.y !== lastDragY)){
      lastDragX = p.x;
      lastDragY = p.y;
      if(dragging === 1) applyTool(p.x, p.y);
      else erase(p.x, p.y);
    }
  });

  canvas.addEventListener("mouseleave", () => {
    hoverX = -1;
    hoverY = -1;
  });

  canvas.addEventListener("mousedown", (ev) => {
    ev.preventDefault();
    const p = toWorld(ev);
    if(!inBounds(p.x, p.y)) return;

    dragging = ev.button === 2 ? 2 : 1;
    lastDragX = p.x;
    lastDragY = p.y;

    if(dragging === 1) applyTool(p.x, p.y);
    else erase(p.x, p.y);
  });

  window.addEventListener("mouseup", () => {
    dragging = 0;
  });

  canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());

  window.addEventListener("keydown", (ev) => {
    if(ev.key === " "){
      paused = !paused;
      ev.preventDefault();
      return;
    }
    if(ev.key === "r" || ev.key === "R"){
      currentRotation = rot4(currentRotation + 1);
      return;
    }
    if(ev.key === "f" || ev.key === "F"){
      autoFeed = !autoFeed;
      return;
    }
    const n = Number.parseInt(ev.key, 10);
    if(!Number.isNaN(n) && n >= 1 && n <= palette.length){
      selected = n - 1;
      syncToolbar();
    }
  });

  window.addEventListener("resize", () => {
    resize();
  });
}

// ---- 工具栏 / 状态栏 ----

function syncToolbar(): void{
  const buttons = toolbar.querySelectorAll("button");
  for(let i = 0; i < buttons.length; i++){
    buttons[i]?.classList.toggle("active", i === selected);
  }
}

function buildToolbar(): void{
  palette.forEach((tool, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tool";
    btn.textContent = tool.label;
    btn.addEventListener("click", () => {
      selected = i;
      syncToolbar();
    });
    toolbar.appendChild(btn);
  });
  syncToolbar();
}

/** 资源 HUD：显示队伍核心的库存（每物品种类 + 数量）。无核心时显示「无核心」。 */
function updateHud(): void{
  hudEl.textContent = coreItemsText(teamItems());
}

/** 闪烁提示：每 10 帧切换一次（只用帧计数，不引入 `Date.now()`）。 */
function updateNotice(): void{
  if(noticeTicks <= 0){
    if(noticeEl.textContent !== "") noticeEl.textContent = "";
    return;
  }
  noticeTicks--;
  noticeEl.textContent = Math.floor(noticeTicks / 10) % 2 === 0 ? notice : "⚠ " + notice;
}

/**
 * 刷新状态栏 + 资源 HUD。
 *
 * @param force 跳过 6 帧节流，立即写 DOM。
 *   ⚠️ 为什么需要：节流用的是「调用次数 % 6」，而**首帧同步调用**时 `statusAcc` 只递增到 1，
 *   会命中 `return` → 状态栏与 HUD 永久停在 `index.html` 的占位文案
 *   （「初始化…」/「核心：无核心」）。无头环境下 `rAF` 不持续发帧，这个洞就永久暴露。
 *   启动时必须显式 `updateStatus(true)`。
 */
function updateStatus(force = false): void{
  // 提示需要逐帧衰减/闪烁，所以放在节流之前
  updateNotice();

  statusAcc++;
  // 每 6 帧刷一次 DOM —— 每帧写 textContent 会让布局在 60fps 下持续重排
  if(!force && statusAcc % 6 !== 0) return;

  statusEl.textContent = [
    "tick " + String(Vars.state.tick),
    "物品 " + String(stats.items),
    // 画面建筑数 vs `Groups.build` 的真实大小 —— 这两个数**不相等**是正确行为：
    // `Wall.java` 未设 `update`，而 `Groups.build` 只收 `update === true` 的建筑
    // （`BuildingComp.shouldAdd = block.update && !state.isEditor()`）。
    "建筑 " + String(stats.builds) + "（参与 tick " + String(Groups.build.size()) + "）",
    "朝向 " + (DIR_NAMES[currentRotation] ?? "→"),
    paused ? "已暂停" : "运行中",
    autoFeed ? "供料开" : "供料关"
  ].join("  ·  ");

  updateHud();
}

// ---- 画布尺寸 ----

function computeCell(): number{
  // 比 S4 多留 30px —— 页脚多了一行资源 HUD
  const availH = window.innerHeight - 200;
  const availW = window.innerWidth - 48;
  const byH = Math.floor(availH / WORLD_H);
  const byW = Math.floor(availW / WORLD_W);
  return Math.max(10, Math.min(26, Math.min(byH, byW)));
}

function resize(): void{
  cell = computeCell();

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = WORLD_W * cell;
  const cssH = WORLD_H * cell;

  canvas.style.width = String(cssW) + "px";
  canvas.style.height = String(cssH) + "px";
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  // 逻辑坐标 = CSS 像素，DPR 只影响清晰度
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---- 主循环 ----

function frame(): void{
  if(!paused){
    runTicks(1);
    if(autoFeed){
      feedAcc++;
      if(feedAcc >= FEED_INTERVAL){
        feedAcc = 0;
        feed();
      }
    }
  }

  stats = renderWorld(ctx, { cell, hoverX, hoverY });
  updateStatus();
  requestAnimationFrame(frame);
}

// ---- 启动 ----

function bindActions(): void{
  need<HTMLButtonElement>("btn-pause").addEventListener("click", () => {
    paused = !paused;
  });
  need<HTMLButtonElement>("btn-step").addEventListener("click", () => {
    runTicks(1);
  });
  need<HTMLButtonElement>("btn-feed").addEventListener("click", () => {
    feed();
    feed();
  });
  need<HTMLButtonElement>("btn-reset").addEventListener("click", () => {
    initWorld();
    logSnapshot();
  });
}

// ---- 无头自检 ----

/**
 * `?selftest=1` 自检 —— 在无头浏览器里验证**交互链路**真的能跑通。
 *
 * 为什么需要它：渲染结果能靠截图肉眼验证，但 `mousedown → applyTool → beginPlace`
 * 这条链路在没有 Playwright 的环境里**无法靠截图验证**（事件不会自己发生）。
 * 这里直接调操作函数本身，而不是伪造 DOM 事件 —— 伪造事件只能证明「事件绑定没写错」，
 * 证明不了操作逻辑对。结果写进 `document.title`，再用
 * `chrome --headless --dump-dom` 抓出来比对。
 *
 * 条目（`key=value`，` | ` 分隔）:
 *   原有 8 条 place / rotate / router / floor / erase / feed / transport / render
 *   S6 新增 5 条 build / buildfail / mine / deconstruct / hud
 *
 * 该分支只在带 `?selftest=1` 时执行，不影响正常路径，也不触碰 headless 那边的断言。
 */
function runSelfTest(): void{
  const out: string[] = [];
  const team = Vars.state.rules.defaultTeam;
  const mult = Vars.state.rules.buildCostMultiplier;

  /** 免费铺一格铜矿（矿石覆盖层不是「建造」，不消耗资源）。 */
  const setOre = (x: number, y: number): void => {
    const t = Vars.world.tile(x, y);
    if(t !== null) t.setOverlay(Blocks.oreCopper);
  };
  /** 某方块在当前倍率下的**铜**成本（本项目所有被检方块都只吃铜）。 */
  const copperCost = (block: Block): number =>
    block.requirements
      .filter((s) => s.item === Items.copper)
      .reduce((sum, s) => sum + Math.round(s.amount * mult), 0);

  // ------------------------------- 原有 8 条 -------------------------------

  // 1. 放置：选中「传送带」放到空格上（现在走 `Build.beginPlace`，会扣 1 铜）
  selected = TOOL_CONVEYOR;
  currentRotation = 0;
  applyTool(2, 2);
  const t1 = Vars.world.tile(2, 2);
  out.push("place=" + (t1 === null ? "null" : t1.block().name));

  // 2. 原地旋转：再点同一格应转 90°（applyTool 的同种方块分支）
  applyTool(2, 2);
  out.push("rotate=" + String(t1 === null || t1.build === null ? -1 : t1.build.rotation));

  // 3. 换工具：路由器
  selected = TOOL_ROUTER;
  applyTool(4, 2);
  const t2 = Vars.world.tile(4, 2);
  out.push("router=" + (t2 === null ? "null" : t2.block().name));

  // 4. 地板工具（palette[1] = 沙地）
  selected = 1;
  applyTool(6, 2);
  const t3 = Vars.world.tile(6, 2);
  out.push("floor=" + (t3 === null ? "null" : t3.floor().name));

  // 5. 删除（右键语义走的就是 erase —— 现在走 `Build.breakBlock`，会按 0.5 退款）
  erase(2, 2);
  out.push("erase=" + (t1 === null ? "null" : t1.block().name));

  // 6. 供料：走游戏自身的 handleStack，注入后该带子上应当有物品
  feed();
  const feedTile = Vars.world.tile(FEED_X, FEED_Y);
  const feedBuild = feedTile === null ? null : feedTile.build;
  out.push("feed=" + String(feedBuild instanceof ConveyorBuild ? feedBuild.len : -1));

  // 7. 运输验证（本自检**最强**的一条）：在空地上现放一条 3 格带子，
  //    从最上游注入一颗铜，跑 90 tick —— 物品走一格约 29 tick，
  //    所以 90 tick 后它**必须已经离开第一格**，`transported=1` 即为通过。
  //
  //    ⚠️ 别拿演示主线做这个验证：那边已被预热喂满，`len` 恒等于容量 3，
  //    物品进出同时发生 → 前后差值恒为 0（写错了会得到**假阴性**，
  //    第一版就是这么写的，实测 `transport=1->1`）。
  currentRotation = 0;
  selected = TOOL_CONVEYOR;
  for(let x = 20; x <= 22; x++) applyTool(x, 28);

  const headTile = Vars.world.tile(20, 28);
  const headBuild = headTile === null ? null : headTile.build;
  let transported = -1;
  if(headBuild instanceof ConveyorBuild){
    headBuild.handleStack(Items.copper, 1, null);
    const before = headBuild.len;
    runTicks(90);
    transported = before - headBuild.len;
  }
  out.push("transport=" + String(transported));

  // 顺带验证渲染不抛异常（此时画面里已经有钻头(2×2)与核心(3×3)两条新分支）
  renderWorld(ctx, { cell, hoverX: -1, hoverY: -1 });
  out.push("render=ok");

  // ---------------------------- S6 新增 5 条 ----------------------------

  // 8. build —— 走 `Build.beginPlace` **真的建出一台机械钻头**，且库存按倍率精确减少。
  //    位置选在 (2,26)（空地，离演示闭环远），先免费铺 2×2 铜矿 ——
  //    机械钻头的 `canPlaceOn` 要求覆盖范围内至少有一格可挖，没有矿就放不下。
  const BX = 2;
  const BY = 26;
  for(let dx = 0; dx < 2; dx++){
    for(let dy = 0; dy < 2; dy++) setOre(BX + dx, BY + dy);
  }

  const items = teamItems();
  const drillCost = copperCost(Blocks.mechanicalDrill);
  const cuBeforeBuild = items === null ? -1 : items.get(Items.copper);
  const built = Build.beginPlace(BX, BY, Blocks.mechanicalDrill, team, 0);
  const cuAfterBuild = items === null ? -1 : items.get(Items.copper);
  const builtTile = Vars.world.tile(BX, BY);
  const okBuild =
    built &&
    cuAfterBuild === cuBeforeBuild - drillCost &&
    builtTile !== null &&
    builtTile.build instanceof DrillBuild;
  out.push(
    "build=" +
      (okBuild
        ? "ok"
        : "fail(built=" + String(built) + ",cu=" + String(cuBeforeBuild) + "->" +
          String(cuAfterBuild) + ",cost=" + String(drillCost) + ")")
  );

  // 9. buildfail —— 资源不足时 `beginPlace` 必须返回 false 且**库存一分不动**。
  //    用核心（size 3，需 1000 铜 + 800 铅）制造「必然不足」：见 `seedCoreItems` 的预置量。
  const cuBeforeFail = items === null ? -1 : items.get(Items.copper);
  const pbBeforeFail = items === null ? -1 : items.get(Items.lead);
  // ⚠️ 先钉住「位置本身是合法的」—— 否则 `beginPlace` 返回 false 可能只是因为放不下，
  //    这条用例就变成了「假阳性」（测的不是资源不足那条分支）。
  const corePlaceable = Build.validPlace(26, 26, Blocks.coreShard, team, 0);
  const failPlaced = Build.beginPlace(26, 26, Blocks.coreShard, team, 0);
  const cuAfterFail = items === null ? -1 : items.get(Items.copper);
  const pbAfterFail = items === null ? -1 : items.get(Items.lead);
  const okFail =
    corePlaceable && !failPlaced && cuAfterFail === cuBeforeFail && pbAfterFail === pbBeforeFail;
  out.push(
    "buildfail=" +
      (okFail
        ? "ok"
        : "fail(placeable=" + String(corePlaceable) + ",placed=" + String(failPlaced) +
          ",cu=" + String(cuBeforeFail) + "->" + String(cuAfterFail) +
          ",pb=" + String(pbBeforeFail) + "->" + String(pbAfterFail) + ")")
  );

  // 10. mine —— 钻头在矿石上跑 N tick 后**真的产出了物品**。
  //     用第 8 条刚建的那台钻头（(2,26) 周围没有别的建筑）→ `offload` 的邻居投递
  //     全部失败，产物回落到它**自己的 `items`**（`BuildingComp.java:1006-1020`）。
  //     这是个「本地」观测量：演示闭环那边的铜增长不会污染这条断言。
  //     时序依据（`ts/golden/java-drill.txt` + `drill.test.ts`）: 2×2 全压矿
  //     → `dominantItems = 4`、`delay = getDrillTime(copper) = 650`，
  //     warmup 在 tick 67 达到 1，**首个物品在 tick 196** 产出 ⇒ 跑 300 tick 必 ≥ 1。
  const mineTile = Vars.world.tile(BX, BY);
  const mineBuild = mineTile === null ? null : mineTile.build;
  let produced = -1;
  let mineOre = -1;
  if(mineBuild instanceof DrillBuild){
    const before = mineBuild.items === null ? 0 : (mineBuild.items as ItemModule).total();
    mineOre = mineBuild.dominantItems;
    runTicks(300);
    const after = mineBuild.items === null ? 0 : (mineBuild.items as ItemModule).total();
    produced = after - before;
  }
  out.push(
    "mine=" + (produced >= 1 ? "ok(" + String(produced) + ",ore=" + String(mineOre) + ")" : "fail(" + String(produced) + ")")
  );

  // 11. deconstruct —— `Build.breakBlock` 拆除后退款到账。
  //     退款公式（`ConstructBlock.java:386`）:
  //       round(sum(item.amount) * buildCostMultiplier * deconstructRefundMultiplier)
  //     机械钻头 = 12 铜 × 1 × 0.5 → 6 铜。
  const refund = Blocks.mechanicalDrill.requirements.reduce(
    (sum, s) => sum + Math.round(s.amount * mult * Vars.state.rules.deconstructRefundMultiplier),
    0
  );
  const cuBeforeBreak = items === null ? -1 : items.get(Items.copper);
  const broke = Build.breakBlock(BX, BY, team);
  const cuAfterBreak = items === null ? -1 : items.get(Items.copper);
  const brokenTile = Vars.world.tile(BX, BY);
  const okDecon =
    broke &&
    cuAfterBreak === cuBeforeBreak + refund &&
    brokenTile !== null &&
    brokenTile.block() === Blocks.air;
  out.push(
    "deconstruct=" +
      (okDecon
        ? "ok"
        : "fail(broke=" + String(broke) + ",cu=" + String(cuBeforeBreak) + "->" +
          String(cuAfterBreak) + ",refund=" + String(refund) + ")")
  );

  // 12. hud —— 资源 HUD 的文本与 `core.items` 一致。
  //     `updateHud()` 是画面上真正写 `#hud` 的那个函数，这里先把 DOM 刷一次再读回来比，
  //     所以这条同时钉住了「DOM 内容」与「库存数据」两侧。
  updateHud();
  const domHud = hudEl.textContent;
  const expectHud = coreItemsText(teamItems());
  out.push(
    "hud=" +
      (domHud === expectHud && expectHud.includes("copper")
        ? "ok"
        : "fail(dom=" + JSON.stringify(domHud) + ",expect=" + JSON.stringify(expectHud) + ")")
  );

  document.title = "SELFTEST " + out.join(" | ");
}

function main(): void{
  initWorld();
  // ⚠️ 顺序关键：内容 load 完（= `createWorld` 跑过）才有 `Blocks` 成员可读，见 `palette` 的说明
  buildPalette();
  buildToolbar();
  bindActions();
  bindInput();
  resize();

  // 预热：让页面一打开就是「有东西在动」的状态，而不是一条空带子。
  //   · 钻头的**首个产物要到 tick 196**（见 `runSelfTest` 的 `mine`）—— 光靠它，开场几秒
  //     画面是静的。所以预热里额外用 `feed()` 往主线注入 14 颗铜，让带子和核心立刻有货。
  //   · 只推进 **web 这一份**世界；headless 的快照仍由它自己的 600 tick 决定。
  for(let i = 0; i < 14; i++){
    feed();
    runTicks(FEED_INTERVAL);
  }

  if(new URLSearchParams(window.location.search).has("selftest")){
    // 先落一个「已进入」标记：若 `runSelfTest` 中途抛异常，title 会停在 ERROR 而不是原样，
    // 这样从一次 `--dump-dom` 就能区分「没进入分支」和「进入后失败」。
    document.title = "SELFTEST-RUNNING";
    try{
      runSelfTest();
    }catch(err){
      const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
      document.title = "SELFTEST-ERROR " + detail.slice(0, 500).replace(/\s+/g, " ");
      throw err;
    }
    return;
  }

  console.log("mindustry-ts web · 世界 %dx%d seed=%d · 初始快照已输出", WORLD_W, WORLD_H, SEED);
  logSnapshot();

  // 首帧**同步**画一次，再交给 rAF。
  //
  // ⚠️ 为什么必须有：`updateStatus()` 里 `updateHud()` 排在 6 帧节流之后，若只等 rAF，
  //   首屏会一直显示 `index.html` 的占位文案（「初始化…」/「核心：无核心」），而真实库存
  //   其实早已就位（预热 14 颗铜后的 1412）。在真实浏览器里这只是 100ms 的闪烁，
  //   但在**无头**环境（`rAF` 不持续发帧）里会永久停在占位文案上，
  //   使 `--dump-dom` 无法验证 HUD —— 这不是渲染 bug，是「首次写 DOM 的时机」问题。
  stats = renderWorld(ctx, { cell, hoverX, hoverY });
  updateStatus(true);

  requestAnimationFrame(frame);
}

main();
