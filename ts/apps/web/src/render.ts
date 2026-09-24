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

import { ConveyorBuild, RouterBuild, Vars } from "@mindustry-ts/game";

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

/** 渲染一帧所需的视图参数。 */
export interface Viewport{
  /** 单个格子的边长（逻辑像素）。 */
  cell: number;
  /** 鼠标悬停的格子；越界时为 `-1`。 */
  hoverX: number;
  hoverY: number;
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
 * 渲染整个世界。**按 4 趟遍历** — 顺序即图层（地板 → 方块 → 物品 → 悬停高亮），
 * 分开跑的理由是物品可能略微溢出格子，若与方块同趟会被后画的邻格传送带盖住。
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

    if(build instanceof ConveyorBuild){
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

  // ---- 趟 3: 物品 ----
  for(const tile of world.tiles){
    const build = tile.build;
    if(build === null) continue;

    const px = tile.x * cell;
    const py = (height - 1 - tile.y) * cell;

    if(build instanceof ConveyorBuild){
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

  if(view.hoverX >= 0 && view.hoverX < width && view.hoverY >= 0 && view.hoverY < height){
    const hx = view.hoverX * cell;
    const hy = (height - 1 - view.hoverY) * cell;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(hx + 1, hy + 1, cell - 2, cell - 2);
  }

  return stats;
}
