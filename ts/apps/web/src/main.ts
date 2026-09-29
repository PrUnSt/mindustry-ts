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
import type { Block, Floor, Item, ItemModule } from "@mindustry-ts/game";

// ⚠️ **深路径导入**（临时手段，已在交付报告里请编排方把这几条补进包入口）:
//   `Build` / `DrillBuild` / `CoreBuild` 目前**没有**从 `@mindustry-ts/game` 的
//   `index.ts` 导出。`package.json` 无 `exports` 字段 + `moduleResolution: bundler`
//   ⇒ 可以按源码路径解析。本阶段禁止修改 `ts/packages/**`，故唯一可行的写法就是这个。
//   package 侧补上导出后，这三行应改回 `from "@mindustry-ts/game"`。
import { Build } from "@mindustry-ts/game/src/world/Build.js";
import { DrillBuild } from "@mindustry-ts/game/src/world/blocks/production/Drill.js";
// S7 新增（同样是深路径：工厂链 / 电力阶段只把它们加进了 `content/Blocks.ts`）
import { GenericCrafterBuild } from "@mindustry-ts/game/src/world/blocks/production/GenericCrafter.js";
import { ConsumeGeneratorBuild } from "@mindustry-ts/game/src/world/blocks/power/ConsumeGenerator.js";

import { hash2, renderWorld } from "./render";
import type { FrameStats } from "./render";

// ---- 世界参数 ----

const WORLD_W = 32;
const WORLD_H = 32;
/** 与 headless 同种子，便于两边对照。 */
const SEED = 123;

// ---- 演示布局坐标（写在一处，离得远点也一眼能对上）----
//
//   屏幕 y 向下 = 世界 y 向上（本文件的坐标一律是**世界**坐标）:
//
//                        ┌─ 石墨压机 2×2 (11,18)【不耗电 → 一直转】
//                        ↓ 产出的 graphite **直接倒进核心**（相邻）
//                      ┌────────┐
//     太阳能(9,13) 发电(10,13) 硅冶炼炉A 2×2 (11,13)【有电 → 转】──┐
//                                                                  │ silicon 直入核心
//     带(4,16)…(10,16) →→→→→→ 核心 3×3 (12,16) 占 (11,15)-(13,17) ←┘
//     煤矿+钻头 (2,16)                    ↑
//                      硅冶炼炉B 2×2 (14,15)【无电 → 停转】
//
// ⚠️ 两台冶炼炉的**唯一**差别是电力（见 `buildDemo` 的对照说明）。

/** 煤矿覆盖层左上角（2×2）—— 钻头压在上面才产**煤**（石墨压机的原料）。 */
const ORE_X = 2;
const ORE_Y = 16;
/** 机械钻头锚点（size 2）。 */
const DRILL_X = 2;
const DRILL_Y = 16;
/** 主运输带起点 / 长度（朝世界 +x；末格 (10,16) 的 `front()` 正是核心格 (11,16)）。 */
const BELT_X = 4;
const BELT_Y = 16;
const BELT_LEN = 7;

/** 核心锚点（size 3，锚点是**中心**格；`sizeOffset = -1` → 占 (11,15)-(13,17)）。 */
const CORE_X = 12;
const CORE_Y = 16;

/**
 * 石墨压机锚点（size 2，**不耗电**：coal×2 → graphite×1，craftTime 90）。
 * 放在核心正上方 —— 它的邻环含核心格 (11,17)/(12,17)，产出的石墨能直接倒进核心。
 */
const PRESS_X = 11;
const PRESS_Y = 18;

// ---- 支线 A：**有电** ----
/** 硅冶炼炉 A 锚点（size 2，耗电 0.50/tick：coal×1 + sand×2 → silicon×1）。 */
const SMELTER_A_X = 11;
const SMELTER_A_Y = 13;
/** 燃煤发电机（size 1，powerProduction 1.0；它紧邻冶炼炉 A 的邻环格 (10,13)）。 */
const GEN_X = 10;
const GEN_Y = 13;
/** 太阳能板（size 1，powerProduction 0.12；经 (10,13) 并入 A 的同一张电网）。 */
const SOLAR_X = 9;
const SOLAR_Y = 13;

// ---- 支线 B：**无电**（孤立硅冶炼炉 —— 与 A 同原料、同产物去向，只差一台发电机）----
/** 硅冶炼炉 B 锚点（size 2）。⚠️ 它**周围不放任何发电方块** —— 这是对照组的全部内容。 */
const SMELTER_B_X = 14;
const SMELTER_B_Y = 15;

/** 建图后预置给核心的资源 —— 让「工厂 / 发电机」一开场就建得起。 */
const SEED_COPPER = 800;
const SEED_LEAD = 600;
/**
 * 硅也预置一点：太阳能板要 8 个 silicon，否则页面刚打开时点不动它
 * （等冶炼炉 A 把硅送进来也行，但那要等 40+ tick）。
 */
const SEED_SILICON = 40;

/** 自动供料的注入点（主运输带第一格）。 */
const FEED_X = BELT_X;
const FEED_Y = BELT_Y;
/**
 * 每 N 个逻辑帧注入一颗**煤**（与钻头的产物一致，不混进铜）。
 * 传送带速度 0.035/tick，走完一格约 29 tick。
 */
const FEED_INTERVAL = 48;

/**
 * 演示补货的「维持量」（`demoFeed`）。
 *
 * ⚠️ 为什么必须有这一步（本阶段一个**包侧缺口**的直接后果）:
 *   `Block.consumesItem()` / `Building.acceptItem()` 在 `ts/packages` 里**还是 S4 的收窄版**
 *   （`world/Block.ts:598` 恒 `return false`），所以传送带**投不进**工厂
 *   （`ConveyorBuild.pass()` → `next.acceptItem()` → false）。工厂的原料只能靠
 *   `items.add()` 直接入账 —— 语义上等价于「旁边有个外部料仓在持续上料」。
 *   等包侧把 `consumesItem` 补上（已上报编排方），这一段就可以改成真正的皮带供料。
 *
 * ⚠️ `A` 与 `B` 的维持量**必须完全相同**，否则「有电/没电」的对照就不成立了。
 *   `itemCapacity` 是 10，故 3 + 6 = 9 刚好卡在容量之内。
 */
const KEEP_SMELTER_COAL = 3;
const KEEP_SMELTER_SAND = 6;
/** 石墨压机：coal×2 一次，维持 4 够它连续跑。 */
const KEEP_PRESS_COAL = 4;
/** 燃煤发电机的燃料（一件煤撑 `itemDuration = 120` tick）。 */
const KEEP_GEN_COAL = 10;

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
    { label: "核心", kind: "block", block: Blocks.coreShard },
    // ---- S7 新增：工厂链 + 电力 ----
    // ⚠️ 索引 9..12 —— 前 9 项顺序**不能动**（`runSelfTest` 按下标选工具）。
    { label: "石墨压机", kind: "block", block: Blocks.graphitePress },
    { label: "硅冶炼炉", kind: "block", block: Blocks.siliconSmelter },
    { label: "燃煤发电机", kind: "block", block: Blocks.combustionGenerator },
    { label: "太阳能板", kind: "block", block: Blocks.solarPanel }
  ];
}
/** 默认选中「传送带」—— 唯一能一眼看出「东西在动」的工具。 */
const DEFAULT_TOOL = 5;

/** 工具下标（`runSelfTest` 与键盘 1–9 都用它，不要散落魔法数字）。 */
const TOOL_CONVEYOR = 5;
const TOOL_ROUTER = 6;
const TOOL_DRILL = 7;
const TOOL_CORE = 8;
const TOOL_PRESS = 9;
const TOOL_SMELTER = 10;
const TOOL_GEN = 11;

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
const powerEl = need<HTMLSpanElement>("power");
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
 * 演示布局：**一条采矿闭环 + 一组「有电 / 没电」对照**。
 *
 * ```
 *   煤矿 2×2 → 机械钻头 → 传送带×7 → 核心 3×3        ← 采矿闭环（煤进核心）
 *
 *   石墨压机（核心正上方，不耗电：coal×2 → graphite×1）→ 核心   ← 一直转
 *
 *   太阳能板 + 燃煤发电机 → 硅冶炼炉 A → 核心         ← 左边这台**转**
 *                          （耗电 0.50：coal×1 + sand×2 → silicon×1）
 *
 *   硅冶炼炉 B（核心右侧，周围**没有**任何发电方块）→ 核心 ← 右边这台**不转**
 * ```
 *
 * ⚠️ 对照组的**唯一**差别是电力（本阶段的核心演示）:
 *   · A 与 B 是同一种方块、经 `demoFeed()` 补到**完全相同**的原料（coal×3 + sand×6）；
 *   · A 的电网里有燃煤发电机(1.0) + 太阳能板(0.12)，需求只有 0.5 ⇒ `power.status === 1`
 *     ⇒ `efficiency === 1` ⇒ 进度环走、齿轮转、产出 silicon 进核心；
 *   · B 是**孤立**的耗电方块：它的 `PowerGraph` 永不入组（`PowerGraph.checkAdd()` 只在
 *     图合并时调用）⇒ `power.status` 停在初值 **0** ⇒ `efficiency === 0` ⇒ 画面上整体压暗
 *     + 红色闪电标。**「右边这台不转是因为没电」** 就是这么来的，不是 bug。
 *
 * ⚠️ 三台工厂都**紧贴核心**放（`dump()` 只投给邻接方块）：核心的 `acceptItem` 是
 *   `CoreBlock` 自己的覆写（恒真），所以产物能一直倒出去，不会把 `itemCapacity`(10) 撑满
 *   而「假停机」。这是让演示能长期自转的关键 —— 否则工厂产满 10 个就自己停了。
 *
 * ⚠️ 建图一律用 `tile.setBlock`（免费）而**不是** `Build.beginPlace` —— 演示布局不该
 *   消耗资源（否则「先有核心才能建核心」死锁）。资源在 `seedCoreItems()` 里预置。
 */
function buildDemo(): void{
  // ---- ① 矿脉：2×2 **煤**矿覆盖层（钻头压在上面才产煤）----
  for(let dx = 0; dx < 2; dx++){
    for(let dy = 0; dy < 2; dy++){
      const tile = Vars.world.tile(ORE_X + dx, ORE_Y + dy);
      if(tile !== null) tile.setOverlay(Blocks.oreCoal);
    }
  }

  // ---- ② 存储端：3×3 核心。锚点是**中心格**（`sizeOffset = -1` 由 `setBlock` 自行铺开）----
  place(CORE_X, CORE_Y, Blocks.coreShard, 0);

  // ---- ③ 采矿闭环的运输带：末格 (10,16) 的 `front()` 是 (11,16)，正落在核心里 ----
  for(let i = 0; i < BELT_LEN; i++) place(BELT_X + i, BELT_Y, Blocks.conveyor, 0);

  // ---- ④ 石墨压机（不耗电）：核心正上方，邻环含核心格 (11,17)/(12,17) ----
  place(PRESS_X, PRESS_Y, Blocks.graphitePress, 0);

  // ---- ⑤ 支线 A（有电）：先放发电方块，再放冶炼炉 ----
  //     ⚠️ 顺序有意义：`setBlock` 的 `changed()` → `updatePowerGraph()` 会在冶炼炉落地
  //        那一刻把三张独立的图合并成一张，并 `checkAdd()` 把图塞进 `Groups.powerGraph`
  //        —— 不入组的图**不会**被 tick，`power.status` 就永远停在 0。
  place(SOLAR_X, SOLAR_Y, Blocks.solarPanel, 0);
  place(GEN_X, GEN_Y, Blocks.combustionGenerator, 0);
  place(SMELTER_A_X, SMELTER_A_Y, Blocks.siliconSmelter, 0);

  // ---- ⑥ 支线 B（无电）：**不要**在它周围放任何发电方块，这正是对照组的内容 ----
  place(SMELTER_B_X, SMELTER_B_Y, Blocks.siliconSmelter, 0);

  // ---- ⑦ 采矿端：2×2 机械钻头。**最后放** —— 它自己的 `changed()` 会重建邻接，
  //        从而立刻把已就位的传送带收进 `proximity`（钻头只往邻居 dump）----
  place(DRILL_X, DRILL_Y, Blocks.mechanicalDrill, 0);

  // 兜底：万一放置顺序被改动，显式重建一次各多块建筑的邻接（幂等）。
  for(const [bx, by] of [
    [DRILL_X, DRILL_Y],
    [PRESS_X, PRESS_Y],
    [SMELTER_A_X, SMELTER_A_Y],
    [SMELTER_B_X, SMELTER_B_Y]
  ] as const){
    const tile = Vars.world.tile(bx, by);
    const build = tile === null ? null : tile.build;
    if(build !== null) build.updateProximity();
  }

  // ---- 装饰：两段铜墙。顺便体现「墙不进 `Groups.build`」——
  //      状态栏的「建筑」数会比画面上看到的方块少，那是 `Wall.java` 未设 `update` 的正确结果。
  for(let y = 11; y <= 21; y++) place(26, y, Blocks.copperWall);
  for(let x = 2; x <= 6; x++) place(x, 24, Blocks.copperWall);
}

/**
 * 给队伍核心预置一批资源，让页面一打开就「建得起东西」。
 *
 * ⚠️ 为什么必须有这一步：`Build.beginPlace` 的扣费来源是**队伍核心的库存**
 *   （`state.teams.get(team).core().items`），而演示布局是免费建图 → 核心是空的 →
 *   用户点「机械钻头」会一律失败。预置量取 800 铜 / 600 铅 / 40 硅:
 *     · 够建石墨压机(75 铜+30 铅)、硅冶炼炉(30+25)、燃煤发电机(25+15)、太阳能板(10 铅+8 硅)
 *       以及任意多台传送带/路由器/钻头；
 *     · **不够**建核心（1000 铜 + 800 铅）—— `runSelfTest` 的 `buildfail` 正好借这个差值。
 */
function seedCoreItems(): void{
  const items = teamItems();
  if(items === null) return;
  items.add(Items.copper, SEED_COPPER);
  items.add(Items.lead, SEED_LEAD);
  items.add(Items.silicon, SEED_SILICON);
}

/**
 * 演示补货：把三台工厂与发电机的原料维持在一个固定水位。
 *
 * ⚠️ 存在的理由见 `KEEP_SMELTER_COAL` 的注释 —— 包侧 `Block.consumesItem()` 尚未实现，
 *   传送带投不进工厂，原料只能直接入账。这里走 `ItemModule.add()`，语义是
 *   「外部料仓持续上料」（与 `feed()` 用 `handleStack` 往带子上放东西是同一种外部注入）。
 *
 * ⚠️ A / B 两台冶炼炉的补货量**严格相同** —— 这是「有电/没电」对照成立的前提。
 * ⚠️ 全部按帧触发（不碰 `Math.random()` / `Date.now()`），保持确定性。
 */
function demoFeed(): void{
  topUp(PRESS_X, PRESS_Y, Items.coal, KEEP_PRESS_COAL);
  topUp(SMELTER_A_X, SMELTER_A_Y, Items.coal, KEEP_SMELTER_COAL);
  topUp(SMELTER_A_X, SMELTER_A_Y, Items.sand, KEEP_SMELTER_SAND);
  topUp(SMELTER_B_X, SMELTER_B_Y, Items.coal, KEEP_SMELTER_COAL);
  topUp(SMELTER_B_X, SMELTER_B_Y, Items.sand, KEEP_SMELTER_SAND);
  topUp(GEN_X, GEN_Y, Items.coal, KEEP_GEN_COAL);
}

/** 把 (x,y) 上那个建筑的 `item` 库存补到 `keep`（不足才补，超了不动）。 */
function topUp(x: number, y: number, item: Item, keep: number): void{
  const tile = Vars.world.tile(x, y);
  const build = tile === null ? null : tile.build;
  if(build === null || build === undefined) return;

  const items = build.items as ItemModule | null;
  if(items === null) return;

  const have = items.get(item);
  if(have < keep) items.add(item, keep - have);
}

function initWorld(): void{
  createWorld(WORLD_W, WORLD_H, SEED);
  paintTerrain();
  buildDemo();
  seedCoreItems();
  // 一开场就把演示布景的原料/燃料补上，否则前 40 tick 画面上是「全停」。
  demoFeed();
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

/**
 * 往主线起点注入一颗**煤** —— 走 `ConveyorBuild.handleStack`，即游戏自身的入料 API。
 *
 * ⚠️ 为什么是煤不是铜：这条带的下游是**煤矿钻头**（产物是煤），注入铜会混进钻头的产物里，
 *   而铜对石墨压机毫无用处（只占料仓）。保持与主链同种物品，画面才说得通。
 */
function feed(): void{
  const tile = Vars.world.tile(FEED_X, FEED_Y);
  const build = tile === null ? null : tile.build;
  if(build instanceof ConveyorBuild){
    build.handleStack(Items.coal, 1, null);
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

/** 电量 HUD 的**结构化**数据（HUD 与 `runSelfTest` 共用这一份定义）。 */
interface PowerStats{
  /** 世界里不同电网的张数。 */
  graphs: number;
  /** 上一 tick 的**发电量**（该电网 `getLastPowerProduced()`）。 */
  produced: number;
  /** 上一 tick 的**用电量**（该电网 `getLastPowerNeeded()`）。 */
  needed: number;
  /** 覆盖率 0..1（该电网 `getSatisfaction()`）。 */
  satisfaction: number;
}

/**
 * 遍历 `Groups.build`，收集**所有不同的电网**。
 *
 * ⚠️ 为什么扫 `Groups.build` 而不是「核心所在的电网」: 核心（`CoreBlock`）**没有**
 *   `PowerModule`（`power === null`），它没有「自己所在的电网」这个概念。
 *   所以按任务书给的兜底办法做：找第一个 `power !== null` 的建筑。
 *   ⚠️ 但世界里的电网**可能不止一张**（本演示就有：A 的电网 + B 的孤立图），
 *   只报第一张会漏掉信息 —— 故这里收集全部，再由 `powerStats()` 选**成员最多**的那张
 *   作为「主网」上报，并把总张数一并显示出来。
 */
function collectPowerGraphs(): unknown[]{
  const seen: unknown[] = [];
  Groups.build.each((b) => {
    const p = (b as unknown as { power: { graph: unknown } | null }).power;
    if(p === null || p === undefined) return;
    const graph = p.graph;
    if(graph === null || graph === undefined) return;
    if(!seen.includes(graph)) seen.push(graph);
  });
  return seen;
}

/** 取「主网」= 成员最多的那张电网（`all.size`）；并列时取先出现的那张。 */
function mainGraph(graphs: unknown[]): unknown | null{
  let best: unknown = null;
  let bestSize = -1;
  for(const g of graphs){
    const size = (g as { all: { size: number } }).all.size;
    if(size > bestSize){
      bestSize = size;
      best = g;
    }
  }
  return best;
}

/** 读一次电网的真实数据（`null` = 世界里没有任何电力方块）。 */
function powerStats(): PowerStats | null{
  const graphs = collectPowerGraphs();
  if(graphs.length === 0) return null;

  const graph = mainGraph(graphs) as {
    getLastPowerProduced(): number;
    getLastPowerNeeded(): number;
    getSatisfaction(): number;
  };
  return {
    graphs: graphs.length,
    produced: graph.getLastPowerProduced(),
    needed: graph.getLastPowerNeeded(),
    satisfaction: graph.getSatisfaction()
  };
}

/** `PowerStats` → HUD 文本。⚠️ 这是**唯一**的电量 HUD 文案来源（`runSelfTest` 也用它）。 */
function formatPowerHud(stats: PowerStats | null): string{
  if(stats === null) return "电网：无";
  return (
    "电网 发电 " + stats.produced.toFixed(2) +
    " / 用电 " + stats.needed.toFixed(2) +
    " / 覆盖 " + String(Math.round(stats.satisfaction * 100)) + "%" +
    "（" + String(stats.graphs) + " 张网）"
  );
}

/** 电量 HUD：发电 / 用电 / 覆盖率。没有电力方块时显示「电网：无」。 */
function updatePowerHud(): void{
  powerEl.textContent = formatPowerHud(powerStats());
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
  // ⚠️ 电量 HUD **必须**走这一条路（而不是另起一个 rAF 回调）:
  //   无头环境下 `requestAnimationFrame` 不持续发帧（`--dump-dom` 抓的是首帧之后的 DOM），
  //   任何「靠 rAF 循环刷」的 HUD 都会永远停在 `index.html` 的占位文案，
  //   `runSelfTest` 的 `powerhud` 条目就会假失败。
  updatePowerHud();
}

// ---- 画布尺寸 ----

function computeCell(): number{
  // 页脚占了 3 行（状态 / 资源 HUD / 电量 HUD / 演示说明 / 操作提示），比 S6 再留 40px
  const availH = window.innerHeight - 240;
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
    // 演示补货（工厂原料 + 发电机燃料）—— 见 `demoFeed` 的说明
    demoFeed();
    if(autoFeed){
      feedAcc++;
      if(feedAcc >= FEED_INTERVAL){
        feedAcc = 0;
        feed();
      }
    }
  }

  stats = renderWorld(ctx, {
    cell,
    hoverX,
    hoverY,
    hoverSize: palette[selected] === undefined ? 1 : palette[selected]!.block.size
  });
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
 * 条目（`key=value`，` | ` 分隔，共 17 条）:
 *   原有 8 条 place / rotate / router / floor / erase / feed / transport / render
 *   S6 新增 5 条 build / buildfail / mine / deconstruct / hud
 *   S7 新增 4 条 craft / starve / power / powerhud
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

  // ---------------------------- S7 新增 4 条 ----------------------------

  // 13. craft —— 石墨压机吃 2 coal 产出 1 graphite。
  //
  //   ⚠️ 放置走**工具栏路径**（`applyTool` → `Build.beginPlace`）而不是免费的 `place()`：
  //     顺带把「size 2 方块按锚点放置」这条交互链路也钉住（`Tile.setBlock` 自己铺开 2×2）。
  //   ⚠️ 位置选在 (18,6)（空地，离演示布景远）：**周围不能有邻居**，否则 `craft()` 的
  //     `offload()` 会把 graphite 投出去，`items.get(graphite)` 就观测不到了。
  //   ⚠️ 时序：`craftTime = 90`，Java(f32) 第 90 tick、TS(f64) 第 **91** tick 才触发首次 craft
  //     （`1/90` 累加 90 次在 f64 下得 0.99999…），故跑 200 tick 留足余量。
  const CRAFT_X = 18;
  const CRAFT_Y = 6;
  selected = TOOL_PRESS;
  currentRotation = 0;
  applyTool(CRAFT_X, CRAFT_Y);

  const craftTile = Vars.world.tile(CRAFT_X, CRAFT_Y);
  const craftBuild = craftTile === null ? null : craftTile.build;
  let craftResult = "fail(no-build)";
  if(craftBuild instanceof GenericCrafterBuild){
    const inv = craftBuild.items as ItemModule;
    inv.add(Items.coal, 2);
    runTicks(200);
    const graphite = inv.get(Items.graphite);
    const coal = inv.get(Items.coal);
    // 断言「产出 1 且 coal 精确减 2」—— 即 `craft()` 首行 `consume()` 真的扣了原料
    craftResult =
      graphite === 1 && coal === 0
        ? "ok"
        : "fail(graphite=" + String(graphite) + ",coal=" + String(coal) + ")";
  }
  out.push("craft=" + craftResult);

  // 14. starve —— 缺料时 `efficiency === 0` 且**不产出**（防「无中生有刷资源」）。
  //     只给 1 个 coal（配方要 2 个）→ `ConsumeItems.efficiency` 归零 → 木桶取小后
  //     `efficiency === 0` → `updateTile` 走 else 支，`progressRef` 不涨，永不 craft。
  //     ⚠️ 这台用免费的 `place()`：本条测的是**合成**不是建造，别让它去消耗核心库存。
  const STARVE_X = 22;
  const STARVE_Y = 6;
  place(STARVE_X, STARVE_Y, Blocks.graphitePress, 0);
  const starveTile = Vars.world.tile(STARVE_X, STARVE_Y);
  const starveBuild = starveTile === null ? null : starveTile.build;
  let starveResult = "fail(no-build)";
  if(starveBuild instanceof GenericCrafterBuild){
    const inv = starveBuild.items as ItemModule;
    inv.add(Items.coal, 1);
    runTicks(200);
    const graphite = inv.get(Items.graphite);
    const coal = inv.get(Items.coal);
    starveResult =
      starveBuild.efficiency === 0 && graphite === 0 && coal === 1
        ? "ok"
        : "fail(eff=" + String(starveBuild.efficiency) +
          ",graphite=" + String(graphite) + ",coal=" + String(coal) + ")";
  }
  out.push("starve=" + starveResult);

  // 15. power —— 孤立硅冶炼炉 vs 接上发电机的硅冶炼炉（本阶段**最强**的一条）。
  //
  //   ① 孤立：`PowerGraph.checkAdd()` 只在图**合并**时调用 → 孤立耗电方块的图永不入组
  //      → `graph.update()` 永不跑 → `power.status` 停在 `PowerModule` 的初值 **0**
  //      → `ConsumePower.efficiency()` 返回 0 → 木桶取小后 `efficiency === 0` → 不产出。
  //   ② 接上发电机（size 1，放它在冶炼炉的邻环格 (17,10)）：`setBlock` 的 `changed()`
  //      → `updatePowerGraph()` 合并两张图并入组 → 从第 **2** tick 起进入稳态
  //      （第 1 tick 发电机的 `productionEfficiency` 还是初值 0，见 `power.test.ts` 文件头）
  //      → produced = 1.0 > needed = 0.5 ⇒ `coverage = min(1, 2) = 1` ⇒ status/efficiency = 1。
  const POW_SM_X = 18;
  const POW_SM_Y = 10;
  const POW_GEN_X = 17;
  const POW_GEN_Y = 10;

  place(POW_SM_X, POW_SM_Y, Blocks.siliconSmelter, 0);
  const powTile = Vars.world.tile(POW_SM_X, POW_SM_Y);
  const powBuild = powTile === null ? null : powTile.build;

  let powerResult = "fail(no-build)";
  if(powBuild instanceof GenericCrafterBuild){
    const inv = powBuild.items as ItemModule;
    inv.add(Items.coal, KEEP_SMELTER_COAL);
    inv.add(Items.sand, KEEP_SMELTER_SAND);
    runTicks(20);

    const isoStatus = powBuild.power === null ? -1 : (powBuild.power as { status: number }).status;
    const isoEff = powBuild.efficiency;
    const isoSilicon = inv.get(Items.silicon);

    // ---- 接上发电机 ----
    place(POW_GEN_X, POW_GEN_Y, Blocks.combustionGenerator, 0);
    const genTile = Vars.world.tile(POW_GEN_X, POW_GEN_Y);
    const genBuild = genTile === null ? null : genTile.build;
    let genFuel = -1;
    if(genBuild instanceof ConsumeGeneratorBuild){
      (genBuild.items as ItemModule).add(Items.coal, KEEP_GEN_COAL);
      genFuel = (genBuild.items as ItemModule).get(Items.coal);
    }
    // 100 tick：足够产出 ≥1 个 silicon（craftTime 40），又不会把 3 个 coal 全烧完
    runTicks(100);

    const gridStatus = powBuild.power === null ? -1 : (powBuild.power as { status: number }).status;
    const gridEff = powBuild.efficiency;
    const silicon = inv.get(Items.silicon);

    const ok =
      isoStatus === 0 && isoEff === 0 && isoSilicon === 0 &&
      gridStatus === 1 && gridEff === 1 && silicon >= 1;
    powerResult = ok
      ? "ok(silicon=" + String(silicon) + ")"
      : "fail(iso[status=" + String(isoStatus) + ",eff=" + String(isoEff) +
        ",si=" + String(isoSilicon) + "] grid[status=" + String(gridStatus) +
        ",eff=" + String(gridEff) + ",si=" + String(silicon) +
        ",fuel=" + String(genFuel) + "])";
  }
  out.push("power=" + powerResult);

  // 16. powerhud —— 电量 HUD 的文本与电网**真实数据**一致。
  //
  //   ⚠️ 先 `renderWorld` 一次：此时画面里已经有工厂(2×2)/发电机/电力连线这些新分支，
  //     顺带把「新增绘制分支不抛异常」也钉住（抛了会走 `SELFTEST-ERROR` 而不是假通过）。
  //   ⚠️ 期望值在这里**独立重算一遍**（自己扫 `Groups.build` 取图、直接读 `PowerGraph` 的
  //     三个 getter），只共用 `formatPowerHud` 做格式化 —— 若 HUD 写死或没刷新，立刻不一致。
  //   ⚠️ 先补一次演示料再跑几 tick：`runSelfTest` 全程不调 `demoFeed`（那是帧循环的事），
  //     跑到这里主网的冶炼炉早就缺料停产了 —— 而 `PowerGraph.getPowerNeeded()` **不对**
  //     停产方块计负荷，会得到「用电 0.00」。补料后才是真实负荷 0.50，断言也更有意义。
  demoFeed();
  runTicks(4);

  renderWorld(ctx, { cell, hoverX: -1, hoverY: -1 });
  updatePowerHud();
  const domPower = powerEl.textContent;

  const seenGraphs: unknown[] = [];
  Groups.build.each((b) => {
    const p = (b as unknown as { power: { graph: unknown } | null }).power;
    if(p === null || p === undefined) return;
    if(p.graph === null || p.graph === undefined) return;
    if(!seenGraphs.includes(p.graph)) seenGraphs.push(p.graph);
  });

  // `PowerGraph` 的只读查询面（只取 HUD 需要的三个 getter + 成员数）
  interface GraphView{
    all: { size: number };
    getLastPowerProduced(): number;
    getLastPowerNeeded(): number;
    getSatisfaction(): number;
  }
  let top: GraphView | null = null;
  for(const g of seenGraphs){
    const cand = g as GraphView;
    if(top === null || cand.all.size > top.all.size) top = cand;
  }
  const expectPower =
    top === null
      ? "电网：无"
      : formatPowerHud({
          graphs: seenGraphs.length,
          produced: top.getLastPowerProduced(),
          needed: top.getLastPowerNeeded(),
          satisfaction: top.getSatisfaction()
        });
  out.push(
    "powerhud=" +
      (domPower === expectPower && domPower.startsWith("电网 发电")
        ? "ok(" + domPower + ")"
        : "fail(dom=" + JSON.stringify(domPower) + ",expect=" + JSON.stringify(expectPower) + ")")
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
  //     画面是静的。所以预热里额外用 `feed()` 往主线注入若干颗煤，让带子和核心立刻有货。
  //   · `demoFeed()` 同时把三台工厂 / 发电机的料补满，让电力对照一开场就成立。
  //   · 只推进 **web 这一份**世界；headless 的快照仍由它自己的 600 tick 决定。
  for(let i = 0; i < 10; i++){
    feed();
    demoFeed();
    runTicks(FEED_INTERVAL);
  }
  demoFeed();

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
  //   首屏会一直显示 `index.html` 的占位文案（「初始化…」/「核心：无核心」/「电网：无」），
  //   而真实库存其实早已就位。在真实浏览器里这只是 100ms 的闪烁，
  //   但在**无头**环境（`rAF` 不持续发帧）里会永久停在占位文案上，
  //   使 `--dump-dom` 无法验证 HUD —— 这不是渲染 bug，是「首次写 DOM 的时机」问题。
  stats = renderWorld(ctx, {
    cell,
    hoverX,
    hoverY,
    hoverSize: palette[DEFAULT_TOOL] === undefined ? 1 : palette[DEFAULT_TOOL]!.block.size
  });
  updateStatus(true);

  requestAnimationFrame(frame);
}

main();
