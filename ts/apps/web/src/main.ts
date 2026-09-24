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
import type { Block, Floor } from "@mindustry-ts/game";
import { hash2, renderWorld } from "./render";
import type { FrameStats } from "./render";

// ---- 世界参数 ----

const WORLD_W = 32;
const WORLD_H = 32;
/** 与 headless 同种子，便于两边对照。 */
const SEED = 123;
/** 自动供料的注入点（演示主线最上游那格传送带）。 */
const FEED_X = 8;
const FEED_Y = 16;
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
    { label: "路由器", kind: "block", block: Blocks.router }
  ];
}
/** 默认选中「传送带」—— 唯一能一眼看出「东西在动」的工具。 */
const DEFAULT_TOOL = 5;

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
 * 演示布局：一条主线 → 路由器 → 三条支线。
 *
 * 选这个形状是因为它一眼能看出 S4 到底实现了什么：
 * 一条直带子只能证明「物品会动」，而这个形状额外证明**路由器会分流**
 * （`RouterBuild.getTileTarget` 的轮转投递）。
 */
function buildDemo(): void{
  // 主线：x = 8..15，全部朝世界 +x（屏幕向右）
  for(let x = FEED_X; x <= 15; x++) place(x, FEED_Y, Blocks.conveyor, 0);

  // 三分流器
  place(16, 16, Blocks.router, 0);

  // 支线 A：继续向右
  for(let x = 17; x <= 22; x++) place(x, 16, Blocks.conveyor, 0);

  // 支线 B：向世界 +y（屏幕向上）
  for(let y = 17; y <= 22; y++) place(16, y, Blocks.conveyor, 1);

  // 支线 C：向世界 -y（屏幕向下）
  for(let y = 15; y >= 10; y--) place(16, y, Blocks.conveyor, 3);

  // 装饰：一段铜墙。顺便体现「墙不进 `Groups.build`」——
  // 状态栏的「建筑」数会比画面上看到的方块少，那是 `Wall.java` 未设 `update` 的正确结果。
  for(let y = 11; y <= 21; y++) place(26, y, Blocks.copperWall);
  for(let x = 6; x <= 10; x++) place(x, 21, Blocks.copperWall);
}

function initWorld(): void{
  createWorld(WORLD_W, WORLD_H, SEED);
  paintTerrain();
  buildDemo();
}

// ---- 操作 ----

/** 左键：应用当前工具。 */
function applyTool(tx: number, ty: number): void{
  const tile = Vars.world.tile(tx, ty);
  if(tile === null) return;

  const tool = palette[selected];
  if(tool === undefined) return;

  if(tool.kind === "floor"){
    tile.setFloor(tool.block as Floor);
    return;
  }
  if(tool.kind === "overlay"){
    tile.setOverlay(tool.block);
    return;
  }

  // 点已存在的同种可旋转方块 → 原地转 90°（比反复新建顺手，也不用先删再放）
  if(tool.block.rotate && tile.block() === tool.block){
    const build = tile.build;
    const next = rot4((build === null ? 0 : build.rotation) + 1);
    tile.setBlock(tool.block, Vars.state.rules.defaultTeam, next);
    currentRotation = next;
    return;
  }

  tile.setBlock(
    tool.block,
    Vars.state.rules.defaultTeam,
    tool.block.rotate ? currentRotation : 0
  );
}

/** 右键：清掉方块（只删方块，地板保留 —— 与游戏的拆除语义一致）。 */
function erase(tx: number, ty: number): void{
  const tile = Vars.world.tile(tx, ty);
  if(tile === null) return;
  if(tile.block() === Blocks.air) return;
  tile.setBlock(Blocks.air);
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

function updateStatus(): void{
  statusAcc++;
  // 每 6 帧刷一次 DOM —— 每帧写 textContent 会让布局在 60fps 下持续重排
  if(statusAcc % 6 !== 0) return;

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
}

// ---- 画布尺寸 ----

function computeCell(): number{
  const availH = window.innerHeight - 170;
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
 * 为什么需要它：渲染结果能靠截图肉眼验证，但 `mousedown → applyTool → setBlock`
 * 这条链路在没有 Playwright 的环境里**无法靠截图验证**（事件不会自己发生）。
 * 这里直接调操作函数本身，而不是伪造 DOM 事件 —— 伪造事件只能证明「事件绑定没写错」，
 * 证明不了操作逻辑对。结果写进 `document.title`，再用
 * `chrome --headless --dump-dom` 抓出来比对。
 *
 * 该分支只在带 `?selftest=1` 时执行，不影响正常路径，也不触碰 headless 那边的断言。
 */
function runSelfTest(): void{
  const out: string[] = [];

  // 1. 放置：选中「传送带」（palette[5]）放到空格上
  selected = 5;
  currentRotation = 0;
  applyTool(2, 2);
  const t1 = Vars.world.tile(2, 2);
  out.push("place=" + (t1 === null ? "null" : t1.block().name));

  // 2. 原地旋转：再点同一格应转 90°（applyTool 的同种方块分支）
  applyTool(2, 2);
  out.push("rotate=" + String(t1 === null || t1.build === null ? -1 : t1.build.rotation));

  // 3. 换工具：路由器（palette[6]）
  selected = 6;
  applyTool(4, 2);
  const t2 = Vars.world.tile(4, 2);
  out.push("router=" + (t2 === null ? "null" : t2.block().name));

  // 4. 地板工具（palette[1] = 沙地）
  selected = 1;
  applyTool(6, 2);
  const t3 = Vars.world.tile(6, 2);
  out.push("floor=" + (t3 === null ? "null" : t3.floor().name));

  // 5. 删除（右键语义走的就是 erase）
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
  selected = 5;
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

  // 顺带验证渲染不抛异常
  renderWorld(ctx, { cell, hoverX: -1, hoverY: -1 });
  out.push("render=ok");

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
  // 只推进 **web 这一份**世界；headless 的快照仍由它自己的 600 tick 决定。
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

  requestAnimationFrame(frame);
}

main();
