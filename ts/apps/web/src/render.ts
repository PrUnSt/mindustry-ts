// ============================================================================
// Web 表现层（Canvas 2D）—— 本仓库的第一块「渲染」代码。
//
// ⚠️ **这不是 `arc.graphics` 的移植**，边界必须写清楚：
//   原版渲染栈是 `arc.graphics`(GL20/Texture/SpriteBatch) → `Draw` → 各方块 `draw()`，
//   它依赖贴图图集 / 着色器 / 位图字体 —— 三者都在计划 §9「明确不做的事」清单里
//   （原话：「渲染（`arc.graphics` 全量、`arc.scene` UI、`Draw`、shaders）—— headless
//   不需要；`apps/web` 只显示文本快照」）。本文件把最后半句**改写**为「显示几何图形」，
//   这是 S4 之后的第一步表现层代码，**不改变 §9 其余各条**（仍无贴图、无 shader、无 UI 框架）。
//
//   关键：数据源是 `Vars.world.tiles` —— 与 headless 的 `snapshot()` 读的是**同一个对象**。
//   因此画面与快照必然一致，不存在「渲染用的第二套世界」。
//
// 坐标约定（最容易搞错，写在第 1 屏）：
//   · 世界 y 轴**向上**（Mindustry 惯例），屏幕 y 轴向下 →
//     绘制时翻转：`py = (height - 1 - tile.y) * cell`。
//   · `rotation` 是**世界方向**，取自 `Geometry.d4 = [(1,0),(0,1),(-1,0),(0,-1)]`
//     （见 `arc-compat/Geometry.ts`，S3 时按上游源码校正过顺序）。
//     rotation = 1 在世界里是 +y（向上），翻转后屏幕上**也是**「向上」，与原版观感一致。
//     故屏幕方向 = `(d4x(rot), -d4y(rot))`。
// ============================================================================

import { ConveyorBuild, Groups, RouterBuild, Vars } from "@mindustry-ts/game";
import { DrillBuild } from "@mindustry-ts/game/src/world/blocks/production/Drill.js";
import { CoreBuild } from "@mindustry-ts/game/src/world/blocks/storage/CoreBlock.js";
import { GenericCrafterBuild } from "@mindustry-ts/game/src/world/blocks/production/GenericCrafter.js";
import { ConsumeGeneratorBuild } from "@mindustry-ts/game/src/world/blocks/power/ConsumeGenerator.js";
import { PowerGeneratorBuild } from "@mindustry-ts/game/src/world/blocks/power/PowerGenerator.js";
import type { Drill } from "@mindustry-ts/game/src/world/blocks/production/Drill.js";
import type { ItemModule } from "@mindustry-ts/game";

// ⚠️ 上面几条**深路径导入**的说明（不是随手写的）:
//   `Build` / `Drill` / `DrillBuild` / `CoreBlock` / `CoreBuild` 尚未从 `@mindustry-ts/game`
//   的公开入口 `index.ts` 导出（本阶段不修改 `ts/packages/**`）。`package.json` 没有
//   `exports` 字段，`moduleResolution: bundler` 因此允许按源码路径解析 —— 这是**临时手段**，
//   已在交付报告里请编排方把这几条补进 `index.ts` 的导出清单，之后应改回包入口导入。
//   （S7 新增：`GenericCrafterBuild` / `ConsumeGeneratorBuild` / `PowerGeneratorBuild`
//   同样是深路径 —— 工厂链与电力阶段只把它们加进了 `content/Blocks.ts`，没补 `index.ts`。）

/**
 * 可渲染的电力节点（`gen/Building.power` 的静态类型是 `any`，这里收窄成结构化类型）。
 *
 * ⚠️ 为什么不用 `PowerModule`: 它**已**从包入口导出，但 `getPowerConnections()` 是
 *   `Building` 的方法 —— 画连线必须同时拿到「建筑」和「模块」，所以建一个「建筑 + 电力」
 *   的交叉类型比分开传两个参数更不容易传错。
 *   ⚠️ `power` **可能为 null**（不耗电也不发电的方块，如石墨压机、传送带）—— 判空是必需的。
 */
interface Powered{
  tile: { x: number; y: number };
  block: { size: number };
  power: { status: number } | null;
  getPowerConnections(out: unknown[]): unknown[];
  pos?(): number;
}

/** 与 `arc.graphics.Color` 结构兼容（只读 r/g/b/a，均为 0-1）。 */
interface Rgba{
  r: number;
  g: number;
  b: number;
  a: number;
}

/** `Geometry.d4` 的 x 分量。 */
const D4X: number[] = [1, 0, -1, 0];
/** `Geometry.d4` 的 y 分量（**世界**方向）。 */
const D4Y: number[] = [0, 1, 0, -1];

/** 把任意整数夹到 `[0,4)`，对应 Java `Mathf.mod(rotation, 4)`。 */
function rot4(r: number): number{
  return ((r % 4) + 4) % 4;
}

/** 世界方向 → 屏幕方向（y 取反）。 */
function screenDir(rotation: number): [number, number]{
  const r = rot4(rotation);
  return [D4X[r] ?? 0, -(D4Y[r] ?? 0)];
}

/** `Rgba` → CSS 颜色串。 */
function css(c: Rgba, alpha = 1): string{
  const to255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (
    "rgba(" + String(to255(c.r)) + "," + String(to255(c.g)) + "," + String(to255(c.b)) +
    "," + String(Math.max(0, Math.min(1, c.a * alpha))) + ")"
  );
}

/**
 * 确定性 2D 哈希（返回 `[0,1)`）—— 给矿石斑点等「随机装饰」用。
 *
 * ⚠️ 必须**确定性**：渲染每帧都会重跑，用 `Math.random()` 会让矿石闪烁。
 * 这也是本文件不引入任何随机源的原因（与 headless 的确定性原则一致）。
 */
export function hash2(x: number, y: number): number{
  let n = (x * 374761393 + y * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// ---- 调色板 ----
//
// 地板/墙体取「原版观感」的近似色（原版是贴图，这里是纯色）。物品颜色**不**硬编码 ——
// 直接读 `Item.color`，那是 `Items.java:43-` 里逐条声明的原版值（如 copper = d99d73）。

const FLOOR_COLORS: Record<string, string> = {
  air: "#12151a",
  stone: "#3a4046",
  "sand-floor": "#9c7f45",
  grass: "#33612e",
  snow: "#8d97a3"
};

const WALL_COLORS: Record<string, string> = {
  "copper-wall": "#a4593c",
  "stone-wall": "#4a4f55"
};

/** 传送带的带面 / 边框 / 箭头。 */
const BELT_FACE = "#3f444c";
const BELT_EDGE = "#22252a";
const BELT_ARROW = "#828b98";
const ROUTER_FACE = "#474c56";
const ROUTER_HUB = "#2f333a";

/** 机械钻头 / 核心的机体配色（同为「原版观感的近似色」）。 */
const DRILL_FACE = "#4a4136";
const DRILL_EDGE = "#241f18";
const DRILL_BIT = "#c8a878";
const DRILL_ORE_EMPTY = "#6d6152";
const CORE_FACE = "#2f3c49";
const CORE_EDGE = "#171e25";
const CORE_RIM = "#5fc8b4";
const CORE_TEXT = "#ddf2ed";

// ---- 工厂 / 电力（S7）----
//
// 配色原则同上方：取「原版观感的近似色」。⚠️ 关键是**停机色**与**进度色**必须拉开对比 ——
// 本阶段最有信息量的一笔就是「一眼看出它停了」，所以停机不靠变暗一点点，而是叠一层压暗。

/** 工厂机体（石墨压机 / 硅冶炼炉）。 */
const CRAFT_FACE = "#3c424e";
const CRAFT_EDGE = "#171b21";
/** 进度环：运转中（琥珀）/ 停机（灰）。 */
const CRAFT_RING = "#ffb454";
const CRAFT_RING_IDLE = "#59606b";
/** 转速齿轮（受 `warmupRef` 控制透明度）。 */
const CRAFT_GEAR = "#c9ced8";
/** 停机压暗层。alpha 要够大，否则在深色地板上看不出来。 */
const CRAFT_DIM = "rgba(8,10,14,0.58)";

/** 燃煤发电机机体 / 火焰。 */
const GEN_FACE = "#4a3f33";
const GEN_EDGE = "#211b15";
const GEN_FLAME = "#ff8a3c";
const GEN_FLAME_CORE = "#ffe0a3";
/** 太阳能板机体 / 电池片。 */
const SOLAR_FACE = "#1d3550";
const SOLAR_EDGE = "#0a1520";
const SOLAR_CELL = "#3f7fb8";

/**
 * 电力连线（RGB 三元组，便于按 `power.status` 插 alpha）。
 * 「满供亮、不足暗」是本阶段「电网可见」的实现方式：同一条线的 alpha 直接等于覆盖率。
 */
const POWER_LINE_RGB = "255,214,92";
/** 连线的最低可见度 —— 覆盖率 0 时也要能看出「这里有一根线」，否则看不出它属于电网。 */
const POWER_LINE_MIN_ALPHA = 0.22;

/** 缺电闪电标：完全断电（红）/ 供电不足（琥珀）。 */
const BOLT_OFF = "#ff5d5d";
const BOLT_LOW = "#ffb454";
/** 缺料「⊘」标。 */
const STARVE_MARK = "#8e95a1";

/** 渲染一帧所需的视图参数。 */
export interface Viewport{
  /** 单个格子的边长（逻辑像素）。 */
  cell: number;
  /** 鼠标悬停的格子；越界时为 `-1`。 */
  hoverX: number;
  hoverY: number;
  /**
   * 当前工具方块的尺寸（1 / 2 / 3）—— 悬停高亮按**占地**画而不只画一格。
   * ⚠️ 为什么需要它：size 2 的方块按锚点放置，若只高亮 1 格，用户看不出这一笔会铺多大。
   * 省略时按 1（与 S6 之前的行为一致）。
   */
  hoverSize?: number;
}

/** 本帧统计（给底部状态栏用，避免调用方再遍历一遍世界）。 */
export interface FrameStats{
  /** 传送带上正在运输的物品总数。 */
  items: number;
  /** `Groups.build` 里的建筑数（含不 tick 的墙）。 */
  builds: number;
}

/** 画一个格子的底板。 */
function drawFloor(ctx: CanvasRenderingContext2D, px: number, py: number, cell: number, name: string): void{
  ctx.fillStyle = FLOOR_COLORS[name] ?? "#3a4046";
  ctx.fillRect(px, py, cell, cell);
}

/**
 * 画矿石覆盖层：在格子内撒几颗确定性位置的小圆点。
 *
 * 颜色取自覆盖层自己的 `mapColor` —— 它在 `OreBlock` 构造器里就被设成 `ore.color`
 * （`OreBlock.ts:39`，对应 Java `mapColor.set(ore.color)`），正是「给这个地块着色」
 * 的官方字段，比另建一张名字→颜色表更不容易与内容层脱节。
 * 取不到时退回 `itemDrop.color`，再退回中性灰。
 */
function drawOre(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cell: number,
  tx: number,
  ty: number,
  overlay: unknown
): void{
  const ore = overlay as { mapColor?: Rgba; itemDrop?: { color?: Rgba } | null };
  const color = ore.mapColor ?? ore.itemDrop?.color;
  ctx.fillStyle = color === undefined ? "#8a8f96" : css(color, 0.95);

  const r = Math.max(1.2, cell * 0.07);
  for(let i = 0; i < 4; i++){
    const a = hash2(tx * 7 + i, ty * 13 + i * 3);
    const b = hash2(tx * 17 + i * 5, ty * 3 + i);
    ctx.beginPath();
    ctx.arc(px + (0.16 + a * 0.68) * cell, py + (0.16 + b * 0.68) * cell, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 画实心方块（墙等无特殊行为的方块）。 */
function drawSolid(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cell: number,
  name: string
): void{
  ctx.fillStyle = WALL_COLORS[name] ?? "#6b7078";
  ctx.fillRect(px, py, cell, cell);

  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);

  // 内高光：让方块看起来有厚度
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  const inset = Math.max(2, cell * 0.14);
  ctx.strokeRect(px + inset + 0.5, py + inset + 0.5, cell - inset * 2 - 1, cell - inset * 2 - 1);
}

/** 画传送带底盘 + 朝向箭头。 */
function drawConveyor(ctx: CanvasRenderingContext2D, px: number, py: number, cell: number, rotation: number): void{
  ctx.fillStyle = BELT_FACE;
  ctx.fillRect(px, py, cell, cell);

  ctx.strokeStyle = BELT_EDGE;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);

  const [dx, dy] = screenDir(rotation);
  // 前向的垂直方向（用于把箭头的两翼撑开）
  const [perpX, perpY] = [-dy, dx];

  const cx = px + cell / 2;
  const cy = py + cell / 2;
  const tip = cell * 0.22;
  const wing = cell * 0.18;

  ctx.strokeStyle = BELT_ARROW;
  ctx.lineWidth = Math.max(1.5, cell * 0.085);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 两个 V 形人字，指向旋转方向
  for(const offset of [-0.26, 0.04]){
    const bx = cx + dx * cell * offset;
    const by = cy + dy * cell * offset;
    const hx = bx + dx * tip;
    const hy = by + dy * tip;

    ctx.beginPath();
    ctx.moveTo(hx - dx * tip - perpX * wing, hy - dy * tip - perpY * wing);
    ctx.lineTo(hx, hy);
    ctx.lineTo(hx - dx * tip + perpX * wing, hy - dy * tip + perpY * wing);
    ctx.stroke();
  }
}

/**
 * 画路由器：四向短臂 + 中心轮毂。
 *
 * 画成十字而不是普通方块，是为了表达 `RouterBuild.getTileTarget` 的真实语义 ——
 * 路由器**不朝固定方向**投递，它维护 `cycles[]` 轮转计数，向邻近所有能接收的方块轮流投。
 * 「箭头」在这里是错的形状，「十字」才对应代码。
 */
function drawRouter(ctx: CanvasRenderingContext2D, px: number, py: number, cell: number): void{
  ctx.fillStyle = ROUTER_FACE;
  ctx.fillRect(px, py, cell, cell);

  ctx.strokeStyle = BELT_EDGE;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);

  const cx = px + cell / 2;
  const cy = py + cell / 2;
  const arm = cell * 0.36;

  ctx.strokeStyle = "#5d646f";
  ctx.lineWidth = Math.max(1.5, cell * 0.08);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy);
  ctx.lineTo(cx + arm, cy);
  ctx.moveTo(cx, cy - arm);
  ctx.lineTo(cx, cy + arm);
  ctx.stroke();

  ctx.fillStyle = ROUTER_HUB;
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 画传送带上的物品。
 *
 * 位置公式来自 `ConveyorBuild` 自身的字段语义（**不是**重新发明的）：
 *   · `ys[i]` ∈ [0,1] —— 物品在带子上的前向进度（0 = 刚从后端进入，1 = 到达前端）。
 *   · `xs[i]` ∈ [-1,1] —— 横向偏移（侧向输入时非 0，`updateTile` 里 `approach(xs,0,·)` 逐渐归中）。
 *   · 因此格子内位置 = 中心 + 前向×(ys-0.5)×cell + 垂直向×xs×0.3×cell。
 */
function drawConveyorItems(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cell: number,
  build: ConveyorBuild
): void{
  const [dx, dy] = screenDir(build.rotation);
  const [perpX, perpY] = [-dy, dx];

  const cx = px + cell / 2;
  const cy = py + cell / 2;
  const radius = Math.max(1.8, cell * 0.15);

  for(let i = 0; i < build.len; i++){
    const item = build.ids[i];
    if(item === null || item === undefined) continue;

    const ys = build.ys[i] ?? 0;
    const xs = build.xs[i] ?? 0;

    const along = (ys - 0.5) * cell;
    const lateral = xs * cell * 0.3;

    const ix = cx + dx * along + perpX * lateral;
    const iy = cy + dy * along + perpY * lateral;

    ctx.fillStyle = css(item.color);
    ctx.beginPath();
    ctx.arc(ix, iy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** 画路由器当前待投递的物品（`RouterBuild.lastItem`）。 */
function drawRouterItem(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cell: number,
  build: RouterBuild
): void{
  const item = build.lastItem;
  if(item === null || item === undefined) return;

  ctx.fillStyle = css(item.color);
  ctx.beginPath();
  ctx.arc(px + cell / 2, py + cell / 2, Math.max(1.8, cell * 0.15), 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * 多块结构的「锚点格」判据。
 *
 * `Tile.setBlock` 只把 `build.tile` 指向**锚点格**，其余格拿到的是**同一个**建筑实体
 * （代理格），因此遍历 `world.tiles` 时同一个建筑会被访问 `size×size` 次。
 * 只在 `build.tile === tile` 那一格画整块，才不会画出 `size²` 个重叠的方块。
 * （size 1 时恒成立，所以这个判据对所有方块都可以统一使用。）
 */
function isAnchor(build: { tile: unknown }, tile: unknown): boolean{
  return build.tile === tile;
}

/**
 * 方块占地在**屏幕坐标**里的矩形。
 *
 * 世界 y 轴向上、屏幕 y 轴向下，且多块结构的锚点**不一定是左上角**：
 * `sizeOffset = -Math.trunc((size-1)/2)` —— size 2 → 0（锚点 = 左下角，
 * 因为 y 向上时 `y+1` 在屏幕上方）、size 3 → -1（锚点 = 中心）。
 * 所以不能简单地把锚点当成左上角画 `size*cell`，必须按 `sizeOffset` 推最小角。
 */
function footprintRect(
  tile: { x: number; y: number },
  size: number,
  worldHeight: number,
  cell: number
): { px: number; py: number; w: number }{
  const offset = -Math.trunc((size - 1) / 2);
  const minX = tile.x + offset;
  // 屏幕上的最小 py 对应世界坐标里**最大**的 y
  const maxY = tile.y + offset + size - 1;
  return {
    px: minX * cell,
    py: (worldHeight - 1 - maxY) * cell,
    w: size * cell
  };
}

/**
 * 画机械钻头（2×2）。
 *
 * 三个元素**全部由真实状态驱动**（没有一处「为了好看而写死的动画」）:
 *   · 转子角度   ← `timeDrilled`（`updateTile` 每帧按 `warmup * delta` 累加）
 *   · 转速/亮度  ← `warmup`（0..1，`Mathf.approachDelta(warmup, speed, warmupSpeed)`）
 *   · 进度环     ← `progressRef / getDrillTime(dominantItem)`
 *   · 环上刻度   ← `dominantItems`（本钻头压住了几格矿，直接决定挖矿倍速）
 *   · 中心矿色   ← `dominantItem.color`（`canMine` 选出的主矿）
 * 未压矿时 `dominantItem === null`，中心退化为中性灰、不画进度环 —— 一眼能看出「这里没矿」。
 */
function drawDrill(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cell: number,
  w: number,
  build: DrillBuild
): void{
  // ---- 机体 ----
  ctx.fillStyle = DRILL_FACE;
  ctx.fillRect(px, py, w, w);

  ctx.strokeStyle = DRILL_EDGE;
  ctx.lineWidth = Math.max(1, cell * 0.07);
  ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);

  const cx = px + w / 2;
  const cy = py + w / 2;

  const warm = Math.max(0, Math.min(1, build.warmup));
  const items = Math.max(0, build.dominantItems);
  const item = build.dominantItem;

  // ---- 中心: 主矿色圆盘（矿色取自 Item.color）----
  ctx.fillStyle = item === null ? DRILL_ORE_EMPTY : css(item.color, 0.85);
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.29, 0, Math.PI * 2);
  ctx.fill();

  // ---- 转子：4 片叶，角度 = timeDrilled 的线性函数 ----
  //     warmup 同时控制亮度（冷机几乎看不见，转起来才亮 —— 与 `drawSpinSprite` 的意图一致）
  const spin = build.timeDrilled * 0.05;
  ctx.globalAlpha = 0.25 + 0.75 * warm;
  ctx.strokeStyle = DRILL_BIT;
  ctx.lineWidth = Math.max(1.2, cell * 0.1);
  ctx.lineCap = "round";
  for(let i = 0; i < 4; i++){
    const a = spin + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * w * 0.26, cy + Math.sin(a) * w * 0.26);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // ---- 进度环：progressRef / getDrillTime(dominantItem) ----
  const drill = build.block as Drill;
  const delay = item === null ? 0 : drill.getDrillTime(item);
  const progress = delay > 0 ? Math.max(0, Math.min(1, build.progressRef / delay)) : 0;

  const ringR = w * 0.4;
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = Math.max(2, cell * 0.14);
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.stroke();

  if(progress > 0){
    ctx.strokeStyle = item === null ? DRILL_BIT : css(item.color);
    ctx.lineWidth = Math.max(2, cell * 0.14);
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
  }

  // ---- 压住的矿格数：环上 `dominantItems` 个小刻度（4 格矿 = 4 倍速，画出来才看得出来）----
  if(items > 0){
    ctx.fillStyle = ctx.strokeStyle;
    for(let i = 0; i < Math.min(items, 8); i++){
      const a = -Math.PI / 2 + (i / Math.min(items, 8)) * Math.PI * 2;
      const tx = cx + Math.cos(a) * ringR * 1.34;
      const ty = cy + Math.sin(a) * ringR * 1.34;
      ctx.beginPath();
      ctx.arc(tx, ty, Math.max(1, cell * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * 画核心（3×3）+ 库存。
 *
 * 数字是 `items.total()`（队伍可花资源的总量，`Build.beginPlace` 校验/扣除的就是它）；
 * 底部色带按各物品**占总量比例**分段，颜色取 `Item.color` —— 于是「铜多还是铅多」
 * 不看数字也能一眼分辨。核心不存在时这一趟根本不会跑到（没有 `CoreBuild`）。
 */
function drawCore(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cell: number,
  w: number,
  build: CoreBuild
): void{
  ctx.fillStyle = CORE_FACE;
  ctx.fillRect(px, py, w, w);

  ctx.strokeStyle = CORE_EDGE;
  ctx.lineWidth = Math.max(1, cell * 0.07);
  ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);

  const inset = Math.max(3, cell * 0.3);
  ctx.strokeStyle = CORE_RIM;
  ctx.lineWidth = Math.max(1, cell * 0.06);
  ctx.strokeRect(px + inset, py + inset, w - inset * 2, w - inset * 2);

  const items = build.items as ItemModule | null;

  // ---- 库存总量 ----
  ctx.fillStyle = CORE_TEXT;
  ctx.font =
    "600 " + String(Math.max(10, Math.round(cell * 0.9))) + "px ui-monospace, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(items === null ? 0 : items.total()), px + w / 2, py + w / 2);
  // 复位（canvas 的 textAlign / textBaseline 是全局状态，别泄漏给别的绘制）
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";

  // ---- 底部色带（按各物品比例）----
  const bandH = Math.max(3, cell * 0.26);
  drawItemBand(ctx, px + inset, py + w - inset - bandH, w - inset * 2, bandH, items);
}

/** 按各物品**占比**画一条分段色带（颜色取 `Item.color`）。 */
function drawItemBand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  items: ItemModule | null
): void{
  if(items === null) return;
  const total = items.total();
  if(total <= 0) return;

  let cursor = x;
  items.each((item, amount) => {
    const seg = Math.max(0.5, (amount / total) * w);
    ctx.fillStyle = css(item.color);
    ctx.fillRect(cursor, y, seg, h);
    cursor += seg;
  });
}

/** 画钻头**自己库存**里的物品（有邻居时它会把产物推出去，这里是「推不出去」的存量）。 */
function drawDrillItems(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cell: number,
  w: number,
  build: DrillBuild
): void{
  const items = build.items as ItemModule | null;
  if(items === null || items.total() <= 0) return;

  const radius = Math.max(1.6, cell * 0.12);
  let i = 0;
  items.each((item, amount) => {
    for(let k = 0; k < amount && i < 10; k++, i++){
      const col = i % 5;
      const row = Math.trunc(i / 5);
      ctx.fillStyle = css(item.color);
      ctx.beginPath();
      ctx.arc(
        px + cell * (0.22 + col * 0.14),
        py + w - cell * (0.22 + row * 0.14),
        radius,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });
}

// ============================================================================
// S7：工厂链 + 电力系统
// ============================================================================

/** 画一个「闪电」多边形（缺电标记）。纯几何，不用字体。 */
function drawBolt(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void{
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.34, cy - r);
  ctx.lineTo(cx - r * 0.46, cy + r * 0.14);
  ctx.lineTo(cx + r * 0.02, cy + r * 0.14);
  ctx.lineTo(cx - r * 0.3, cy + r);
  ctx.lineTo(cx + r * 0.5, cy - r * 0.16);
  ctx.lineTo(cx - r * 0.02, cy - r * 0.16);
  ctx.closePath();
  ctx.fill();

  // 描一圈深色边，免得与机体的深色糊在一起
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.stroke();
}

/** 画一个「⊘」（缺料标记）：空心圆 + 斜杠。 */
function drawSlash(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void{
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.4, r * 0.24);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  const d = r * 0.72;
  ctx.beginPath();
  ctx.moveTo(cx - d, cy + d);
  ctx.lineTo(cx + d, cy - d);
  ctx.stroke();
}

/** 一个「停机压暗 + 虚线边框」层。停机状态的最外层视觉，压在机体之上。 */
function drawStoppedOverlay(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  w: number
): void{
  ctx.fillStyle = CRAFT_DIM;
  ctx.fillRect(px, py, w, w);

  ctx.save();
  ctx.setLineDash([Math.max(2, w * 0.08), Math.max(2, w * 0.07)]);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = Math.max(1, w * 0.045);
  ctx.strokeRect(px + 1, py + 1, w - 2, w - 2);
  ctx.restore();
}

/**
 * 画工厂（`GenericCrafterBuild`：石墨压机 / 硅冶炼炉）。
 *
 * 四个元素**全部由真实状态驱动**:
 *   · 进度环   ← `progressRef`（0..1，≥1 触发 `craft()`）
 *   · 转速齿轮 ← `warmupRef`（0..1，转速；角度用 `totalProgressRef`，与钻头转子同一思路）
 *   · 料仓色带 ← `items` 的实际构成（`Item.color`）
 *   · 停机/缺料/缺电标记 ← `efficiency` / `power.status`
 *
 * ⚠️ **「停了」必须一眼看出**（本阶段的核心诉求）:
 *     `efficiency === 0` → 整体压暗 + 虚线边框 + 进度环转灰；
 *     再按**停机的原因**分两种标记，缺料与缺电不能长一个样:
 *       · `power !== null && power.status < 1` → 闪电（红 = 完全断电，琥珀 = 供电不足）
 *       · 有电但仍停 → 「⊘」缺料
 *     两台硅冶炼炉并排时，左边转、右边压暗带闪电，对比就出来了。
 */
function drawCrafter(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cell: number,
  w: number,
  build: GenericCrafterBuild
): void{
  // ---- 机体 ----
  ctx.fillStyle = CRAFT_FACE;
  ctx.fillRect(px, py, w, w);

  ctx.strokeStyle = CRAFT_EDGE;
  ctx.lineWidth = Math.max(1, cell * 0.07);
  ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);

  const cx = px + w / 2;
  const cy = py + w / 2;

  const warm = Math.max(0, Math.min(1, build.warmupRef));
  const prog = Math.max(0, Math.min(1, build.progressRef));
  const running = build.efficiency > 0;
  const power = build.power as { status: number } | null;

  // ---- 转速齿轮：6 根辐条，角度 = totalProgressRef；透明度 = warmupRef ----
  //     冷机时几乎看不见，转起来才亮 —— 与钻头 `drawSpinSprite` 的意图一致。
  const spin = build.totalProgressRef * 0.12;
  ctx.globalAlpha = 0.12 + 0.88 * warm;
  ctx.strokeStyle = CRAFT_GEAR;
  ctx.lineWidth = Math.max(1.2, cell * 0.075);
  ctx.lineCap = "round";
  for(let i = 0; i < 6; i++){
    const a = spin + (i * Math.PI) / 3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * w * 0.14, cy + Math.sin(a) * w * 0.14);
    ctx.lineTo(cx + Math.cos(a) * w * 0.3, cy + Math.sin(a) * w * 0.3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // ---- 进度环：progressRef（0..1）----
  const ringR = w * 0.36;
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = Math.max(2, cell * 0.13);
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.stroke();

  if(prog > 0){
    ctx.strokeStyle = running ? CRAFT_RING : CRAFT_RING_IDLE;
    ctx.lineWidth = Math.max(2, cell * 0.13);
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
    ctx.stroke();
  }

  // ---- 料仓色带（底部，按各物品比例）----
  const inset = Math.max(2, cell * 0.16);
  const bandH = Math.max(3, cell * 0.22);
  drawItemBand(
    ctx,
    px + inset,
    py + w - inset - bandH,
    w - inset * 2,
    bandH,
    build.items as ItemModule | null
  );

  // ---- 停机标记 ----
  if(!running){
    drawStoppedOverlay(ctx, px, py, w);

    const markR = w * 0.15;
    if(power !== null && power.status < 1){
      // 缺电：闪电。status === 0 是「完全没电」，0 < status < 1 是「供电不足」。
      drawBolt(ctx, px + w - inset - markR, py + inset + markR, markR, power.status > 0 ? BOLT_LOW : BOLT_OFF);
    }else{
      // 有电（或本就不耗电）却停 → 缺料
      drawSlash(ctx, px + w - inset - markR, py + inset + markR, markR, STARVE_MARK);
    }
  }
}

/**
 * 画发电机（`PowerGeneratorBuild`：燃煤发电机 / 太阳能板）。
 *
 * · 燃煤发电机（`ConsumeGeneratorBuild`）：火焰高度 ← `productionEfficiency`，
 *   底部燃料条 ← `generateTime`（1 → 0 的燃烧进度），燃料色带 ← `items`（烧的是什么）。
 * · 太阳能板（`SolarGeneratorBuild`）：电池片网格 + 辉光 ← `productionEfficiency`。
 * · 两者 `productionEfficiency === 0` 时都压暗 —— 「有电/没电」在光源处就要看得出来。
 */
function drawGenerator(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cell: number,
  w: number,
  build: PowerGeneratorBuild
): void{
  const burner = build instanceof ConsumeGeneratorBuild;

  ctx.fillStyle = burner ? GEN_FACE : SOLAR_FACE;
  ctx.fillRect(px, py, w, w);

  ctx.strokeStyle = burner ? GEN_EDGE : SOLAR_EDGE;
  ctx.lineWidth = Math.max(1, cell * 0.08);
  ctx.strokeRect(px + 0.5, py + 0.5, w - 1, w - 1);

  const cx = px + w / 2;
  const cy = py + w / 2;
  const eff = Math.max(0, Math.min(1, build.productionEfficiency));

  if(burner){
    // ---- 火焰：高度与亮度都 ∝ productionEfficiency ----
    if(eff > 0){
      const fh = w * (0.16 + 0.24 * eff);
      const fw = w * 0.18;
      ctx.globalAlpha = 0.35 + 0.65 * eff;

      // 外焰
      ctx.fillStyle = GEN_FLAME;
      ctx.beginPath();
      ctx.moveTo(cx - fw, cy + w * 0.16);
      ctx.lineTo(cx, cy + w * 0.16 - fh);
      ctx.lineTo(cx + fw, cy + w * 0.16);
      ctx.closePath();
      ctx.fill();

      // 内焰（高温核心）
      ctx.fillStyle = GEN_FLAME_CORE;
      ctx.beginPath();
      ctx.moveTo(cx - fw * 0.5, cy + w * 0.16);
      ctx.lineTo(cx, cy + w * 0.16 - fh * 0.6);
      ctx.lineTo(cx + fw * 0.5, cy + w * 0.16);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 1;
    }

    // ---- 燃烧进度条：`generateTime` 从 1 递减到 0（一件燃料烧 itemDuration tick）----
    const gen = build as unknown as { generateTime: number };
    const burn = Math.max(0, Math.min(1, gen.generateTime));
    const barW = w * 0.62;
    const barH = Math.max(2, cell * 0.16);
    const barX = cx - barW / 2;
    const barY = py + w - Math.max(3, cell * 0.3) - barH;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = GEN_FLAME;
    ctx.fillRect(barX, barY, barW * burn, barH);
  }else{
    // ---- 太阳能：2×2 电池片 + 辉光 ----
    const g = w * 0.1;
    const cw = (w - g * 3) / 2;
    for(let i = 0; i < 2; i++){
      for(let j = 0; j < 2; j++){
        ctx.fillStyle = SOLAR_CELL;
        ctx.globalAlpha = 0.28 + 0.72 * eff;
        ctx.fillRect(px + g + i * (cw + g), py + g + j * (cw + g), cw, cw);
        ctx.globalAlpha = 1;
      }
    }
    // 满发时的一圈辉光
    if(eff > 0){
      ctx.strokeStyle = "rgba(120,190,255," + String(0.15 + 0.5 * eff) + ")";
      ctx.lineWidth = Math.max(1, cell * 0.06);
      ctx.strokeRect(px + 1.5, py + 1.5, w - 3, w - 3);
    }
  }

  // ---- 燃料 / 停机 ----
  const fuel = build.items as ItemModule | null;
  if(burner && fuel !== null && fuel.total() > 0){
    const inset = Math.max(2, cell * 0.16);
    const bandH = Math.max(2, cell * 0.16);
    drawItemBand(ctx, px + inset, py + w - inset - bandH, w - inset * 2, bandH, fuel);
  }

  if(eff <= 0){
    drawStoppedOverlay(ctx, px, py, w);
    drawBolt(ctx, px + w / 2, py + w / 2, w * 0.18, BOLT_OFF);
  }
}

/** 建筑占地中心在**屏幕坐标**里的位置（多块结构按 `sizeOffset` 反推）。 */
function centerOf(
  build: { tile: { x: number; y: number }; block: { size: number } },
  height: number,
  cell: number
): [number, number]{
  const rect = footprintRect(build.tile, build.block.size, height, cell);
  return [rect.px + rect.w / 2, rect.py + rect.w / 2];
}

/**
 * 电力连线趟：把**同一张电网**里相邻建筑连起来。
 *
 * ⚠️ 为什么不扫 `world.tiles` 而扫 `Groups.build`: 连线是「建筑 ↔ 建筑」的关系，
 *   按格子扫会重复访问多块结构（`size²` 次）。`Groups.build` 里每个建筑只有一条。
 *   数据来源是 `Building.getPowerConnections()`（电力系统的**真**连接判据，
 *   含「两个纯耗电方块互不导通」那条规则），所以画出来的线与模拟看到的电网一致。
 *
 * ⚠️ 去重: `getPowerConnections` 是**对称**的（A 能看到 B，B 也能看到 A），
 *   用打包坐标 `pos()` 的大小关系只画一次，否则每条线会被画两遍（视觉上只是更粗，
 *   但 alpha 叠加会让「覆盖率」的读数失真）。
 *
 * ⚠️ 线色按 `power.status` 取：满供亮、不足暗 —— 「电网」这件事因此在画面上真实可见。
 */
function drawPowerLines(ctx: CanvasRenderingContext2D, height: number, cell: number): void{
  const nodes: Powered[] = [];
  Groups.build.each((b) => {
    const p = b as unknown as Powered;
    if(p.power !== null && p.power !== undefined) nodes.push(p);
  });

  const conns: unknown[] = [];

  // ---- 连线 ----
  for(const a of nodes){
    const [ax, ay] = centerOf(a, height, cell);
    const aPos = typeof a.pos === "function" ? a.pos() : 0;

    for(const other of a.getPowerConnections(conns)){
      const b = other as Powered;
      if(b === null || b === undefined) continue;
      const bPos = typeof b.pos === "function" ? b.pos() : 0;
      // 每条线只画一次（见上面的去重说明）
      if(aPos >= bPos) continue;

      const [bx, by] = centerOf(b, height, cell);
      // 一条线两端的覆盖率理论上相同（同一张图），取小值以保守表达「不足」
      const status = Math.max(
        0,
        Math.min(1, Math.min(a.power === null ? 0 : a.power.status, b.power === null ? 0 : b.power.status))
      );

      // 深色底衬：让亮线在浅色地板上也能看清
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = Math.max(2.5, cell * 0.2);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();

      ctx.strokeStyle =
        "rgba(" + POWER_LINE_RGB + "," +
        String(POWER_LINE_MIN_ALPHA + (1 - POWER_LINE_MIN_ALPHA) * status) + ")";
      ctx.lineWidth = Math.max(1.4, cell * 0.11);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }

  // ---- 节点：每个带电建筑中心一个小方块（颜色同样取覆盖率）----
  const r = Math.max(1.6, cell * 0.1);
  for(const a of nodes){
    const [ax, ay] = centerOf(a, height, cell);
    const status = Math.max(0, Math.min(1, a.power === null ? 0 : a.power.status));
    ctx.fillStyle =
      "rgba(" + POWER_LINE_RGB + "," +
      String(POWER_LINE_MIN_ALPHA + (1 - POWER_LINE_MIN_ALPHA) * status) + ")";
    ctx.fillRect(ax - r, ay - r, r * 2, r * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ax - r, ay - r, r * 2, r * 2);
  }
}

/** 画工厂**自己库存**里的物品（投入的原料 + 推不出去的产物）。 */
function drawCrafterItems(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cell: number,
  w: number,
  build: GenericCrafterBuild
): void{
  const items = build.items as ItemModule | null;
  if(items === null || items.total() <= 0) return;

  const radius = Math.max(1.6, cell * 0.11);
  let i = 0;
  items.each((item) => {
    const amount = items.get(item);
    for(let k = 0; k < amount && i < 8; k++, i++){
      const col = i % 4;
      const row = Math.trunc(i / 4);
      ctx.fillStyle = css(item.color);
      ctx.beginPath();
      ctx.arc(
        px + cell * (0.3 + col * 0.14),
        py + w - cell * (0.42 + row * 0.14),
        radius,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });
}

/**
 * 渲染整个世界。**按 5 趟遍历** — 顺序即图层
 * （地板 → 方块 → 电力连线 → 物品 → 悬停高亮），
 * 分开跑的理由是物品可能略微溢出格子，若与方块同趟会被后画的邻格传送带盖住。
 * 电力连线单独一趟是因为它要跨格子连接两个建筑，放在方块趟里会被后画的建筑盖掉。
 */
export function renderWorld(ctx: CanvasRenderingContext2D, view: Viewport): FrameStats{
  const world = Vars.world;
  const width = world.width();
  const height = world.height();
  const cell = view.cell;
  const stats: FrameStats = { items: 0, builds: 0 };

  ctx.fillStyle = "#0d0f12";
  ctx.fillRect(0, 0, width * cell, height * cell);

  // ---- 趟 1: 地板 + 矿石 ----
  for(const tile of world.tiles){
    const px = tile.x * cell;
    const py = (height - 1 - tile.y) * cell;
    drawFloor(ctx, px, py, cell, tile.floor().name);

    const overlay = tile.overlay();
    if(overlay.name !== "air"){
      drawOre(ctx, px, py, cell, tile.x, tile.y, overlay);
    }
  }

  // ---- 趟 2: 方块 ----
  for(const tile of world.tiles){
    const block = tile.block();
    if(block.name === "air") continue;

    const px = tile.x * cell;
    const py = (height - 1 - tile.y) * cell;
    const build = tile.build;

    // 多块结构（钻头 2×2 / 核心 3×3 / 工厂 2×2）只在锚点格画一次，矩形按 `sizeOffset` 反推。
    if(build instanceof DrillBuild || build instanceof CoreBuild || build instanceof GenericCrafterBuild){
      if(!isAnchor(build, tile)) continue;

      const rect = footprintRect(tile, block.size, height, cell);
      if(build instanceof DrillBuild){
        drawDrill(ctx, rect.px, rect.py, cell, rect.w, build);
      }else if(build instanceof CoreBuild){
        drawCore(ctx, rect.px, rect.py, cell, rect.w, build);
      }else{
        drawCrafter(ctx, rect.px, rect.py, cell, rect.w, build);
      }
      stats.builds++;
    }else if(build instanceof PowerGeneratorBuild){
      // 发电机：目前只有 size 1（燃煤发电机 / 太阳能板）；仍走 `isAnchor` 判据，
      // 将来若出现多块发电机，这里不用改。
      if(!isAnchor(build, tile)) continue;
      const rect = footprintRect(tile, block.size, height, cell);
      drawGenerator(ctx, rect.px, rect.py, cell, rect.w, build);
      stats.builds++;
    }else if(build instanceof ConveyorBuild){
      drawConveyor(ctx, px, py, cell, build.rotation);
      stats.builds++;
    }else if(build instanceof RouterBuild){
      drawRouter(ctx, px, py, cell);
      stats.builds++;
    }else{
      drawSolid(ctx, px, py, cell, block.name);
      if(build !== null) stats.builds++;
    }
  }

  // ---- 趟 2.5: 电力连线 ----
  //     在方块**之后**、物品**之前**: 线要压在机体上才看得见，但不能盖住物品。
  drawPowerLines(ctx, height, cell);

  // ---- 趟 3: 物品 ----
  for(const tile of world.tiles){
    const build = tile.build;
    if(build === null) continue;

    const px = tile.x * cell;
    const py = (height - 1 - tile.y) * cell;

    if(build instanceof DrillBuild){
      if(!isAnchor(build, tile)) continue;
      const rect = footprintRect(tile, tile.block().size, height, cell);
      drawDrillItems(ctx, rect.px, rect.py, cell, rect.w, build);
      const items = build.items as ItemModule | null;
      if(items !== null) stats.items += items.total();
    }else if(build instanceof GenericCrafterBuild){
      if(!isAnchor(build, tile)) continue;
      const rect = footprintRect(tile, tile.block().size, height, cell);
      drawCrafterItems(ctx, rect.px, rect.py, cell, rect.w, build);
    }else if(build instanceof ConveyorBuild){
      drawConveyorItems(ctx, px, py, cell, build);
      stats.items += build.len;
    }else if(build instanceof RouterBuild){
      drawRouterItem(ctx, px, py, cell, build);
    }
  }

  // ---- 趟 4: 网格 + 悬停高亮 ----
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for(let x = 1; x < width; x++){
    ctx.moveTo(x * cell + 0.5, 0);
    ctx.lineTo(x * cell + 0.5, height * cell);
  }
  for(let y = 1; y < height; y++){
    ctx.moveTo(0, y * cell + 0.5);
    ctx.lineTo(width * cell, y * cell + 0.5);
  }
  ctx.stroke();

  const hoverSize = view.hoverSize === undefined ? 1 : view.hoverSize;
  if(view.hoverX >= 0 && view.hoverX < width && view.hoverY >= 0 && view.hoverY < height){
    // 高亮按**占地**画（size 2/3 的方块锚点 ≠ 左上角，故复用 `footprintRect`）
    const rect = footprintRect({ x: view.hoverX, y: view.hoverY }, hoverSize, height, cell);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.px + 1, rect.py + 1, rect.w - 2, rect.w - 2);
  }

  return stats;
}
