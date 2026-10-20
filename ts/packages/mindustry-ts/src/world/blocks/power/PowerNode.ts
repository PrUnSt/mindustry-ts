// 源: core/src/mindustry/world/blocks/power/PowerNode.java (529 行)
//
// 移植范围（C22）: **手动拉线（laser 连线）的图语义** —— 构造器全部可观测字段、
//   `overlaps`（Building 重载 + Tile 核心实现）、`linkValid`（2/3 参数）、以及
//   `PowerNodeBuild` 的 `created` / `configure` / `configureLinks` / `config` / `linked` /
//   `dropped`。这是让 `java-power.txt [3]`（一机供三炉 → coverage=0.6666667）与
//   「玩家用 powerNode 手动拉线」真正成立的模拟层。
//
// ⚠️ C25 已落地“放置自动连线”：`placed()` / `getPotentialLinks()` / `getNodeLinks()` /
//   `insulated()`（:157-347, 374-386, :391-404）。两处与 Java 的分岔已注记（见方法内）:
//   `team.data().buildingTree`（空间索引未移植）→ 激光范围矩形扫描；`World.raycast`未移植
//   → 本文件内部实现 Bresenham 登影（同源）。
// ⚠️ 引发时机与 Java 一致：`placed()` 只在正式放置（`Build.beginPlace`）后被调；
//   headless/golden 的 `Tile.setBlock` **不**调它。基类 `BuildingComp.placed()` 的
//   “任意电力方块自动连到附近节点”在 `Tile.afterPlaced`（边界适配器）。
//   - 渲染 / 音效 / UI: `@Load` 贴图（laser/laserEnd）、`drawLaser`/`setupColor`/`drawPlace`/
//     `drawConfigure`/`drawSelect`/`drawCached`/`draw`（:161-216, 440-513）、`setBars`（:105-123）、
//     `setStats`（:144-149）、`changePlacementPath`/`planConfigClipSize`/`drawPlanConfigTop`
//     （:158-160, :331-356）—— 计划 §9。
//   - `config(Integer.class, ...)` / `config(Point2[].class, ...)`（:62-101）在 Java 注册到
//     `Block.configurations`，由 `Building.configure()` 分发。TS **没有**这套配置分发系统
//     （`Block.ts` 文件头的 `configurations` 整块未移植）→ 把两个 handler 的**方法体**直接落成
//     `PowerNodeBuild.configure(pos)` / `configureLinks(points)`。`configure(pos)` ≡ Java 的
//     「Integer 配置被调用一次」。语义逐行一致。`configurable` / `ignoreResizeConfig` /
//     `delayLandingConfig` / `schematicPriority` 均属该未移植系统，不设字段。
//
// ⚠️ 为什么 powerNode 必须 `consumesPower=false, outputsPower=false`（PowerNode.java:47-48）:
//   `PowerGraph.add()`（PowerGraph.java:290-299）按这两个标志把建筑分进 producers/consumers/
//   batteries；两者都 false → 只进 `all`（纯导体，不计产耗）。同时
//   `BuildingComp.getPowerConnections()`（BuildingComp.java:1195）的「两个纯耗电方块互不导通」
//   判据因此**不**拦它 —— 电力靠邻接 + 手动 laser 连线传播。
// ⚠️ `update=false`（PowerNode.java:57-58）: 节点不需要逐 tick 更新；`PowerBlock` 的默认
//   `update=true` 被覆掉。headless 下它仍会创建 `Building`（`hasPower=true` 有电力模块），
//   但不进 `Groups.build`（`Tile.changeBuild` 的 `shouldAdd` 判据）—— 与 Java 一致。
// ⚠️ `group = BlockGroup.power`（继承自 `PowerBlock`）: 电力方块之间可互相替换。

import { IntSeq, Point2, Rect } from "@mindustry-ts/arc";
import { Vars } from "../../../Vars.js";
import { Building } from "../../../gen/Building.js";
import { Env } from "../../meta/Env.js";
import { PowerGraph } from "./PowerGraph.js";
import { PowerBlock } from "./PowerBlock.js";
import { Edges } from "../../Edges.js";
import { Team } from "../../../game/Team.js";
import type { Tile } from "../../Tile.js";
import type { Block } from "../../Block.js";

/** 对应 `mindustry.world.blocks.power.PowerNode`。 */
export class PowerNode extends PowerBlock{
  /** Java `protected static float maxRange`（:25）—— 全图最大 laser 射程（放置预览用）。 */
  static maxRange = 0;

  /** Java `public float laserRange = 6`（:33）—— laser 连线最大距离（格）。内容注册可覆写。 */
  laserRange = 6;
  /** Java `public int maxNodes = 3`（:34）—— 单节点最大连线数（`Blocks.powerNode` 覆写为 10）。 */
  maxNodes = 3;
  /** Java `public boolean autolink = true`（:35）—— 放置自动连线。本阶段未移植（见文件头）。 */
  autolink = true;
  /** Java `public boolean drawRange = true`（:35）—— 放置时画射程圈。渲染层，仅留值。 */
  drawRange = true;
  /** Java `public boolean sameBlockConnection = false`（:35）—— 只连同类方块。 */
  sameBlockConnection = false;
  /** Java `public float laserScale = 0.25f`（:36）—— 渲染层，仅留值。 */
  laserScale = 0.25;
  /** Java `public boolean useLod = true`（:37）—— 渲染层，仅留值。 */
  useLod = true;
  /** Java `public float powerLayer = Layer.power`（:38）—— 渲染层，仅留值。 */
  powerLayer = 0;

  /** 对应 Java `PowerNode(String name)`（:41-60）。 */
  constructor(name: string){
    super(name);
    // Java 原文（:42-58）逐条。有渲染/UI/未移植配置系统副作用的用注释标注、不设字段。
    this.consumesPower = false;
    this.outputsPower = false;
    this.canOverdrive = false;
    this.swapDiagonalPlacement = true; // 放置体验（`changePlacementPath` 配套），值对齐
    this.drawDisabled = false;
    this.envEnabled |= Env.space;
    this.destructible = true;
    this.drawCached = true; // 渲染层，值对齐
    // Java: `update = false;` —— 节点不需要逐 tick 更新（覆掉 `PowerBlock` 的默认 true）。
    this.update = false;

    // 陷阱 #6：显式注册建筑工厂（子类在自己的构造器里覆盖成自己的 Build 类）
    this.buildType = () => new PowerNodeBuild();
  }

  /**
   * Java `Intersector.overlaps(Circle, Rect)`（arc `Intersector.java:36-44`）的方法体。
   * arc-ts 的 `Intersector` 尚未移植圆-矩形重载 → 按 Java 原文本地实现。
   */
  private static circleRectOverlaps(cx: number, cy: number, radius: number, r: Rect): boolean{
    const closestX = cx < r.x ? r.x : (cx > r.x + r.width ? r.x + r.width : cx);
    const closestY = cy < r.y ? r.y : (cy > r.y + r.height ? r.y + r.height : cy);
    const dx = closestX - cx;
    const dy = closestY - cy;
    return (dx * dx + dy * dy) < (radius * radius);
  }

  /** 对应 Java `overlaps(float, float, Tile, float)`（:203-208）—— 圆 vs 方块 hitbox。 */
  overlapsTile(srcx: number, srcy: number, other: Tile, range: number): boolean{
    return PowerNode.circleRectOverlaps(srcx, srcy, range, other.getHitbox(new Rect()));
  }

  /** 对应 Java `overlaps(float, float, Tile, Block, float)`（:197-201）—— 圆 vs 按 offset 居中的方块矩形。 */
  overlapsTileBlock(srcx: number, srcy: number, other: Tile, otherBlock: Block, range: number): boolean{
    return PowerNode.circleRectOverlaps(
      srcx,
      srcy,
      range,
      new Rect().setCentered(
        other.worldx() + otherBlock.offset,
        other.worldy() + otherBlock.offset,
        otherBlock.size * Vars.tilesize,
        otherBlock.size * Vars.tilesize
      )
    );
  }

  /** 对应 Java `overlaps(Building, Building, float)`（:209-211）。 */
  overlaps(src: Building, other: Building, range: number): boolean{
    return this.overlapsTile(src.x, src.y, other.tile, range);
  }

  /**
   * 对应 Java `linkValid(Building, Building)`（:358-359）。
   * ⚠️ 注意：Java 的 Integer 配置处理体（:87）在连线分支里**会**调它 —— 这是
   *   `configure(pos)` 能否接受一条手动连线的唯一闸门。
   */
  linkValid(tile: Building, link: Building | null): boolean;
  /** 对应 Java `linkValid(Building, Building, boolean)`（:362-372）。 */
  linkValid(tile: Building, link: Building | null, checkMaxNodes: boolean): boolean;
  linkValid(tile: Building, link: Building | null, checkMaxNodes = true): boolean{
    if(tile === link || link === null || !link.block.hasPower || !link.block.connectedPower
      || tile.team !== link.team || (this.sameBlockConnection && tile.block !== link.block)) return false;

    if(this.overlaps(tile, link, this.laserRange * Vars.tilesize)
      || (link.block instanceof PowerNode && this.overlaps(link, tile, (link.block as PowerNode).laserRange * Vars.tilesize))){
      if(checkMaxNodes && link.block instanceof PowerNode){
        const node = link.block as PowerNode;
        return link.power.links.size < node.maxNodes || link.power.links.contains(tile.pos());
      }
      return true;
    }
    return false;
  }

  /** Java `protected final static ObjectSet<PowerGraph> graphs`（:24）—— 防重复连线的共享集合。 */
  private static readonly linkGraphs = new Set<PowerGraph>();

  /** Java `Building.dst2(Position)`（arc `Position.dst2`）的局部实现。 */
  private static dst2(a: Building, tile: Tile): number{
    const dx = tile.drawx() - a.x;
    const dy = tile.drawy() - a.y;
    return dx * dx + dy * dy;
  }

  /** Java `World.raycast`（`World.java:587-606`，Bresenham）的布尔版本地实现。 */
  private static raycast(x1: number, y1: number, x2: number, y2: number, accept: (x: number, y: number) => boolean): boolean{
    let x = x1;
    let y = y1;
    const dx = Math.abs(x2 - x);
    const sx = x < x2 ? 1 : -1;
    const dy = Math.abs(y2 - y);
    const sy = y < y2 ? 1 : -1;
    let err = dx - dy;
    for(;;){
      if(accept(x, y)) return true;
      if(x === x2 && y === y2) return false;
      const e2 = 2 * err;
      if(e2 > -dy){
        err -= dy;
        x += sx;
      }
      if(e2 < dx){
        err += dx;
        y += sy;
      }
    }
  }

  /**
   * 对应 Java `insulated(int, int, int, int)`（:382-386）—— 两点连线上的建筑是否绝缘。
   * ⚠️ `World.raycast` 未移植 → 用本文件的 `raycast`（Bresenham 同源）。
   */
  static insulated(x: number, y: number, x2: number, y2: number): boolean;
  /** 对应 Java `insulated(Tile, Tile)`（:374-376）。 */
  static insulated(tileA: Tile, tileB: Tile): boolean;
  static insulated(a: Tile | number, b: Tile | number, c?: number, d?: number): boolean{
    if(typeof a === "number"){
      return PowerNode.raycast(a, b as number, c!, d!, (wx, wy) => {
        const build = Vars.world.build(wx, wy);
        return build !== null && build.block.insulated;
      });
    }
    const t1 = a as Tile;
    const t2 = b as Tile;
    return PowerNode.insulated(t1.x, t1.y, t2.x, t2.y);
  }

  /**
   * 对应 Java `getPotentialLinks(Tile, Team, Cons<Building>)`（:222-275）—— 放置自动连线的扫描。
   * ⚠️ 分岔：Java 用 `team.data().buildingTree.intersect(...)`（空间索引）收候选；TS 未移植
   *   → 用「激光范围矩形」逐格 `world.build` 扫描（候选集等价，树只是加速）。
   */
  getPotentialLinks(tile: Tile, team: Team, others: (other: Building) => void): void{
    if(!this.autolink) return;

    const valid = (other: Building | null): boolean =>
      other !== null && other.tile !== tile && other.block.connectedPower && other.power !== null
        && (other.block.outputsPower || other.block.consumesPower || other.block instanceof PowerNode)
        && this.overlapsTile(tile.x * Vars.tilesize + this.offset, tile.y * Vars.tilesize + this.offset, other.tile, this.laserRange * Vars.tilesize)
        && other.team === team.id
        && !PowerNode.linkGraphs.has(other.power.graph)
        && !PowerNode.insulated(tile, other.tile)
        && !(other instanceof PowerNodeBuild && other.power.links.size >= (other.block as PowerNode).maxNodes)
        && !Edges.getEdges(this.size).some(p => {
          const t = Vars.world.tile(tile.x + p.x, tile.y + p.y);
          return t !== null && t.build === other;
        });

    const tempBuilds: Building[] = [];
    PowerNode.linkGraphs.clear();

    // 把「邻近已导电图」记下来，防止重复连线（Java :250-255）
    for(const p of Edges.getEdges(this.size)){
      const other = tile.nearby(p.x, p.y);
      if(other !== null && other.team().id === team.id && other.build !== null && other.build.power !== null){
        PowerNode.linkGraphs.add(other.build.power.graph);
      }
    }
    if(tile.build !== null && tile.build.power !== null){
      PowerNode.linkGraphs.add(tile.build.power.graph);
    }

    // buildingTree 未移植 → 激光范围矩形扫描（Java :257-263 的 tree.intersect）
    const r = this.laserRange;
    const minX = Math.max(0, tile.x - r);
    const maxX = Math.min(Vars.world.width() - 1, tile.x + r);
    const minY = Math.max(0, tile.y - r);
    const maxY = Math.min(Vars.world.height() - 1, tile.y + r);
    for(let cx = minX; cx <= maxX; cx++){
      for(let cy = minY; cy <= maxY; cy++){
        const b = Vars.world.build(cx, cy);
        if(b !== null && valid(b) && !tempBuilds.includes(b)){
          tempBuilds.push(b);
        }
      }
    }

    // 筛序：powerNode 优先，其次按距离近到远（Java :264-268）
    tempBuilds.sort((a, b) => {
      const type = (a.block instanceof PowerNode ? 0 : 1) - (b.block instanceof PowerNode ? 0 : 1);
      if(type !== 0) return type;
      return PowerNode.dst2(a, tile) - PowerNode.dst2(b, tile);
    });

    let returnInt = 0;
    for(const t of tempBuilds){
      if(valid(t) && returnInt++ < this.maxNodes){
        PowerNode.linkGraphs.add(t.power.graph);
        others(t);
      }
    }
  }

  /**
   * 对应 Java `getNodeLinks(Tile, Block, Team, Cons<Building>)`（:278-312）—— 放置任意电力方块时，
   * 找出范围内可连的 powerNode 并逐个回调。由基类 `BuildingComp.placed()`
   * （经 `Tile.afterPlaced`）驱动。分岔同 `getPotentialLinks`：buildingTree → maxRange 矩形扫描。
   */
  static getNodeLinks(tile: Tile, block: Block, team: Team, others: (other: Building) => void): void{
    const valid = (other: Building | null): boolean =>
      other !== null && other.tile !== tile && other.block instanceof PowerNode
        && other.block.autolink
        && other.power.links.size < other.block.maxNodes
        && (other.block as PowerNode).overlapsTileBlock(other.x, other.y, tile, block, (other.block as PowerNode).laserRange * Vars.tilesize)
        && other.team === team.id
        && !PowerNode.linkGraphs.has(other.power.graph)
        && !PowerNode.insulated(tile, other.tile)
        && !Edges.getEdges(block.size).some(p => {
          const t = Vars.world.tile(tile.x + p.x, tile.y + p.y);
          return t !== null && t.build === other;
        });

    const tempBuilds: Building[] = [];
    PowerNode.linkGraphs.clear();

    for(const p of Edges.getEdges(block.size)){
      const other = tile.nearby(p.x, p.y);
      if(other !== null && other.team().id === team.id && other.build !== null && other.build.power !== null
        && !(block.consumesPower && other.block().consumesPower && !block.outputsPower && !other.block().outputsPower)){
        PowerNode.linkGraphs.add(other.build.power.graph);
      }
    }
    if(tile.build !== null && tile.build.power !== null){
      PowerNode.linkGraphs.add(tile.build.power.graph);
    }

    // buildingTree 未移植 → maxRange 矩形扫描（Java :291-297 的 tree.intersect）
    const r = PowerNode.maxRange;
    const minX = Math.max(0, tile.x - r);
    const maxX = Math.min(Vars.world.width() - 1, tile.x + r);
    const minY = Math.max(0, tile.y - r);
    const maxY = Math.min(Vars.world.height() - 1, tile.y + r);
    for(let cx = minX; cx <= maxX; cx++){
      for(let cy = minY; cy <= maxY; cy++){
        const b = Vars.world.build(cx, cy);
        if(b !== null && valid(b) && !tempBuilds.includes(b)){
          tempBuilds.push(b);
        }
      }
    }

    tempBuilds.sort((a, b) => {
      const type = (a.block instanceof PowerNode ? 0 : 1) - (b.block instanceof PowerNode ? 0 : 1);
      if(type !== 0) return type;
      return PowerNode.dst2(a, tile) - PowerNode.dst2(b, tile);
    });

    for(const t of tempBuilds){
      if(valid(t)){
        PowerNode.linkGraphs.add(t.power.graph);
        others(t);
      }
    }
  }
}

/**
 * 对应 Java `PowerNode.PowerNodeBuild`（:388-528）。
 *
 * ⚠️ `configure(pos)` / `configureLinks(points)` 在 Java 里是**块级配置 handler**（经
 *   `Block.configurations` + `Building.configure()` 分发）；TS 无配置分发系统，把方法体
 *   直接落在建筑上。语义等价（见文件头）。
 */
export class PowerNodeBuild extends Building{
  /** ⚠️ 必须显式声明 public 构造器（`gen/Building.ts` 的构造器是 `protected`，不声明会 TS2674）。 */
  constructor(){
    super();
  }

  /** Java 的 `PowerNodeBuild` 是内部类，直接读外部 `PowerNode.this.xxx`；TS 显式取回。 */
  protected get node(): PowerNode{
    return this.block as PowerNode;
  }

  /** 对应 Java `created()`（:389-393）—— 放置/加载时更新全图最大射程。 */
  override created(): void{
    if(this.node.autolink && this.node.laserRange > PowerNode.maxRange){
      PowerNode.maxRange = this.node.laserRange;
    }
    super.created();
  }

  /**
   * 对应 Java `placed()`（:395-404）—— 放置后自动拉线到范围内电力方块。
   * ⚠️ Java: `if(net.client() || power.links.size > 0) return;` —— net 未移植（无多人）。
   * ⚠️ 只在正式放置（`Build.beginPlace`）后被调；`Tile.setBlock` 不调它
   *   （与 Java 一致，golden 不会自动拉线）。
   */
  override placed(): void{
    if(this.power.links.size > 0) return;

    this.node.getPotentialLinks(this.tile, Team.get(this.team), (other) => {
      if(!this.power.links.contains(other.pos())){
        this.configure(other.pos());
      }
    });

    super.placed();
  }

  /**
   * 对应 Java 的 `config(Integer.class, ...)` 处理体（:64-90）—— 一次「连 / 断」。
   *
   * ⚠️ 断线的图重建是**关键语义**: 摘掉一条 laser 连线后原图可能裂成两张，
   *   Java 对两端各 `reflow` 一次（`PowerGraph.reflow` 按 `getPowerConnections` BFS）。
   *   别简化成「原地删链接」—— 那会让对端仍留在旧图里。
   */
  configure(pos: number): void{
    const power = this.power;
    const other = Vars.world.build(pos);
    const contains = power.links.contains(pos);
    const valid = other !== null && other.power !== null;

    if(contains){
      // unlink（Java :69-85）
      power.links.removeValue(pos);
      if(valid) other.power.links.removeValue(this.pos());

      const newgraph = new PowerGraph();
      // 从本节点这一侧重新泛洪
      newgraph.reflow(this);
      newgraph.update();

      if(valid && other.power.graph !== newgraph){
        // 对端不在同一张新图里 → 另一侧也要重建
        const og = new PowerGraph();
        og.reflow(other);
        og.update();
      }
    }else if(this.node.linkValid(this, other) && valid && power.links.size < this.node.maxNodes){
      // link（Java :87-96）
      power.links.addUnique(other.pos());
      if(other.team === this.team){
        other.power.links.addUnique(this.pos());
      }
      power.graph.addGraph(other.power.graph);
    }
  }

  /**
   * 对应 Java 的 `config(Point2[].class, ...)` 处理体（:97-101）—— 整体重设连线列表。
   * 先按旧列表逐个 `configure`（即逐个断开），再按新列表逐个连上。
   */
  configureLinks(points: Point2[]): void{
    const old = new IntSeq(this.power.links);
    for(let i = 0; i < old.size; i++){
      this.configure(old.get(i)!);
    }
    for(const p of points){
      this.configure(Point2.pack(p.x + this.tileX(), p.y + this.tileY()));
    }
  }

  /** 对应 Java `config()`（:524-529）—— 相对坐标的连线列表（UI/存档用）。 */
  config(): Point2[]{
    const out: Point2[] = new Array<Point2>(this.power.links.size);
    for(let i = 0; i < out.length; i++){
      out[i] = Point2.unpack(this.power.links.get(i)!).sub(this.tile.x, this.tile.y);
    }
    return out;
  }

  /** 对应 Java `linked(Building)`（:515-517）。 */
  linked(other: Building): boolean{
    return this.power.links.contains(other.pos());
  }

  /** 对应 Java `dropped()`（:407-410）—— 被拆除/掉落时清空连线并重算电网。 */
  dropped(): void{
    this.power.links.clear();
    this.updatePowerGraph();
  }
}
