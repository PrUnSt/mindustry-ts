// 源: core/src/mindustry/core/World.java (704 行)
//
// 移植范围: S3 tick 闭环与 6 条硬断言会用到的**全部**世界查询与生命周期方法 ——
// `tiles` / `resize` / `beginMapLoad` / `endMapLoad` / `loadGenerator`、坐标与邻居查询
// （`tile` / `tileBuilding` / `build` / `rawTile` / `tileWorld` / `buildWorld`）、
// 地形查询（`solid` / `passable` / `wallSolid` / `wallSolidFull` / `isAccessible` /
// `floor` / `floorWorld`）、`isInMapArea` / `packArray` / `clearBuildings`、
// 黑暗度（`addDarkness` / `getWallDarkness` / `getDarkness`）与 `Context`。
//
// 移植了 `addDarkness` / `getWallDarkness` 的理由: 它们**写 `tile.data`**，而 `tile.data`
// 是断言 #5（「所有 tile 数值非 NaN」）与断言 #6（快照字符串相等）的直接观测对象。
// 跳过它们会让 `data` 恒为 0，断言就变成假测试。两者都是纯计算（无 IO、无随机），
// 逐行照抄即可。
//
// 未移植（逐条标注）:
//   - `loadMap(...)` / `loadSector(...)` / `setSectorRules` / `makeSectorContext` /
//     `filterContext` / `FilterContext` / `applyFilters` / `customMapLoaders` / `addMapLoader`
//     —— 地图文件与扇区（S5/S6）
//   - `raycastEach*` / `raycast` —— 依赖 `Raycaster` / `Raycasterc`（单位与子弹用，S4）
//   - `checkMapArea` —— 依赖 `Rules.limitMapArea` 的实时重算与 `TeamData.buildings`（S5）
//   - `getDarkness` 的**扇区多边形分支**（`state.hasSector() && preset == null` 那段，
//     依赖 `Sector.rect.rotation` / `Intersector.distanceLinePoint` / `Noise` / `Tmp`）
//     —— `Sector` 属 S5。**已移植**的部分: `borderDarkness` 的地图边缘渐隐与
//     `tile.isDarkened()` 时取 `tile.data`，这两条是 headless 下唯一可达的分支
//     （`state.hasSector()` 在 S3 恒为 false，因为 `Rules.sector` 恒为 null）。
//   - `LegacyBlock` 分支（`endMapLoad` 里）—— 无旧存档概念
//   - `tileChanges` / `floorChanges` 的 `WorldLoadEvent` 重置保留了，但 `-1` 的语义
//     （下一帧 `++` 变 0）依赖 Java 的 `ObjectMap<Map, Runnable>` 等未移植系统，见方法内注释。

import { Mathf, Point2, Rect, Events } from "@mindustry-ts/arc";
import type { Cons } from "@mindustry-ts/arc";
import { Vars } from "../Vars.js";
import { Groups } from "../gen/Groups.js";
import { Tiles } from "../world/Tiles.js";
import { Tile } from "../world/Tile.js";
import { Blocks } from "../content/Blocks.js";
import { Geometry } from "../arc-compat/Geometry.js";
import {
  TileChangeEvent,
  TileFloorChangeEvent,
  WorldLoadBeginEvent,
  WorldLoadEndEvent,
  WorldLoadEvent
} from "../game/EventType.js";
import type { Floor } from "../world/blocks/environment/Floor.js";
import type { Building } from "../gen/Building.js";

/** 对应 `mindustry.core.WorldContext`（S3 只保留 `Tiles` 生成器需要的面）。 */
export interface WorldContext{
  tile(index: number): Tile;
  resize(width: number, height: number): void;
  create(x: number, y: number, floorID: number, overlayID: number, wallID: number): Tile;
  isGenerating(): boolean;
  begin(): void;
  end(): void;
}

/** 对应 `mindustry.core.World`。 */
export class World{
  /** 生成器用上下文（`Tiles` 生成器通过它创建 tile）。 */
  readonly context: Context;
  /** tile 容器。Java 初值是 `new Tiles(0, 0)`。 */
  tiles: Tiles = new Tiles(0, 0);
  /** 本会话 tile 变更次数。需要低频轮询世界状态的方块会读它。 */
  tileChanges = 1;
  /** 本会话地板变更次数。 */
  floorChanges = 1;

  /** 是否正在生成地图（生成期间不 fire tile 事件）。 */
  private generating = false;
  /** 地图是否非法（S3 无地图校验路径，恒为 false）。 */
  private invalidMap = false;

  constructor(){
    // Java 的 `context` 是字段初始化时 `new Context()`（内部类，隐式持有 World.this）。
    this.context = new Context(this);

    Events.on(TileChangeEvent, () => {
      this.tileChanges++;
    });
    Events.on(TileFloorChangeEvent, () => {
      this.floorChanges++;
    });

    Events.on(WorldLoadEvent, () => {
      // Java: tileChanges = floorChanges = -1;
      // Java 注释: 下一帧的第一个变更会把 -1 变成 0，即「地图加载本身不算变更」。
      // 这里照抄（`World.java:48-49`）。
      this.tileChanges = -1;
      this.floorChanges = -1;

      // 让每个建筑检查自己能否在当前地图区域更新。
      // S3 的 `checkAllowUpdate()` 是 `allowUpdate()`（基类恒 true）+ 可能置
      // `enabled = false`；逐条遍历保持与 Java 相同的副作用顺序。
      for(const build of Groups.build){
        build.checkAllowUpdate();
      }
    });
  }

  // ---------------------------------------------------------------- 地形查询

  /** 对应 Java `isInvalidMap()`。 */
  isInvalidMap(): boolean{
    return this.invalidMap;
  }

  /** 对应 Java `solid(int, int)`。 */
  solid(x: number, y: number): boolean{
    const tile = this.tile(x, y);
    return tile === null || tile.solid();
  }

  /** 对应 Java `passable(int, int)`。 */
  passable(x: number, y: number): boolean{
    const tile = this.tile(x, y);
    return tile !== null && tile.passable();
  }

  /** 对应 Java `wallSolid(int, int)`。 */
  wallSolid(x: number, y: number): boolean{
    const tile = this.tile(x, y);
    return tile === null || tile.block().solid;
  }

  /** 对应 Java `wallSolidFull(int, int)`。 */
  wallSolidFull(x: number, y: number): boolean{
    const tile = this.tile(x, y);
    return tile === null || (tile.block().solid && tile.block().fillsTile);
  }

  /** 对应 Java `isAccessible(int, int)`。 */
  isAccessible(x: number, y: number): boolean{
    return (
      !this.wallSolid(x, y - 1) ||
      !this.wallSolid(x, y + 1) ||
      !this.wallSolid(x - 1, y) ||
      !this.wallSolid(x + 1, y)
    );
  }

  // ---------------------------------------------------------------- 尺寸

  /** 对应 Java `width()`。 */
  width(): number{
    return this.tiles.width;
  }

  /** 对应 Java `height()`。 */
  height(): number{
    return this.tiles.height;
  }

  /** 对应 Java `unitWidth()`。 */
  unitWidth(): number{
    return this.width() * Vars.tilesize;
  }

  /** 对应 Java `unitHeight()`。 */
  unitHeight(): number{
    return this.height() * Vars.tilesize;
  }

  /** 对应 Java `floor(int, int)`。 */
  floor(x: number, y: number): Floor{
    const tile = this.tile(x, y);
    return tile === null ? Blocks.air.asFloor() : tile.floor();
  }

  /** 对应 Java `floorWorld(float, float)`。 */
  floorWorld(x: number, y: number): Floor{
    const tile = this.tileWorld(x, y);
    return tile === null ? Blocks.air.asFloor() : tile.floor();
  }

  // ---------------------------------------------------------------- tile / build

  /** 对应 Java `tile(int pos)`（打包坐标）。 */
  tile(pos: number): Tile | null;
  /** 对应 Java `tile(int x, int y)`。 */
  tile(x: number, y: number): Tile | null;
  tile(posOrX: number, y?: number): Tile | null{
    return y === undefined
      ? this.tiles.get(Point2.x(posOrX), Point2.y(posOrX))
      : this.tiles.get(posOrX, y);
  }

  /** 对应 Java `tileBuilding(int, int)`：返回该位置建筑**中心** tile，否则自身。 */
  tileBuilding(x: number, y: number): Tile | null{
    const tile = this.tiles.get(x, y);
    if(tile === null) return null;
    if(tile.build !== null){
      return tile.build.tile as Tile;
    }
    return tile;
  }

  /** 对应 Java `build(int, int)`。 */
  build(x: number, y: number): Building | null;
  /** 对应 Java `build(int pos)`。 */
  build(pos: number): Building | null;
  build(xOrPos: number, y?: number): Building | null{
    const tile = y === undefined ? this.tile(xOrPos) : this.tile(xOrPos, y);
    if(tile === null) return null;
    return tile.build;
  }

  /** 对应 Java `rawTile(int, int)`（越界抛错）。 */
  rawTile(x: number, y: number): Tile{
    return this.tiles.getn(x, y);
  }

  /** 对应 Java `tileWorld(float, float)`。 */
  tileWorld(x: number, y: number): Tile | null{
    return this.tile(Math.round(x / Vars.tilesize), Math.round(y / Vars.tilesize));
  }

  /** 对应 Java `buildWorld(float, float)`。 */
  buildWorld(x: number, y: number): Building | null{
    return this.build(Math.round(x / Vars.tilesize), Math.round(y / Vars.tilesize));
  }

  /** 对应 Java `static conv(float)`（世界坐标 → 逻辑 tile 坐标）。 */
  static conv(coord: number): number{
    return coord / Vars.tilesize;
  }

  /** 对应 Java `static unconv(float)`（tile 坐标 → 世界坐标）。 */
  static unconv(coord: number): number{
    return coord * Vars.tilesize;
  }

  /** 对应 Java `static toTile(float)`。 */
  static toTile(coord: number): number{
    return Math.round(coord / Vars.tilesize);
  }

  /** 对应 Java `packArray(int, int)`。 */
  packArray(x: number, y: number): number{
    return x + y * this.tiles.width;
  }

  /** 对应 Java `clearBuildings()`。 */
  clearBuildings(): void{
    for(const tile of this.tiles){
      if(tile !== null && tile.build !== null){
        tile.build.remove();
      }
    }
  }

  /**
   * 对应 Java `resize(int, int)`（仅用于加载存档/地图）。
   * ⚠️ 尺寸变化时**整体替换** `tiles`（旧 tile 被丢弃，Java 语义如此）。
   */
  resize(width: number, height: number): Tiles{
    this.clearBuildings();

    if(this.tiles.width !== width || this.tiles.height !== height){
      this.tiles = new Tiles(width, height);
    }

    return this.tiles;
  }

  // ---------------------------------------------------------------- 地图加载

  /** 对应 Java `beginMapLoad()`：标记生成中并 fire `WorldLoadBeginEvent`。 */
  beginMapLoad(): void{
    this.generating = true;
    Events.fire(new WorldLoadBeginEvent());
  }

  /**
   * 对应 Java `endMapLoad()`：结束生成、更新邻近、算黑暗度、调 `Groups.resize`，
   * 最后 fire `WorldLoadEvent`。
   */
  endMapLoad(): void{
    Events.fire(new WorldLoadEndEvent());

    for(const tile of this.tiles){
      // Java: `if(tile.block() instanceof LegacyBlock l){ l.removeSelf(tile); continue; }`
      // —— 无旧存档概念，故省略（S3 无 LegacyBlock）。

      if(tile.build !== null){
        tile.build.updateProximity();
      }
    }

    this.addDarkness(this.tiles);

    Groups.resize(
      -Vars.finalWorldBounds,
      -Vars.finalWorldBounds,
      this.tiles.width * Vars.tilesize + Vars.finalWorldBounds * 2,
      this.tiles.height * Vars.tilesize + Vars.finalWorldBounds * 2
    );

    this.generating = false;
    Events.fire(new WorldLoadEvent());
  }

  /** 对应 Java `getQuadBounds(Rect)`。 */
  getQuadBounds(input: Rect): Rect{
    return input.set(
      -Vars.finalWorldBounds,
      -Vars.finalWorldBounds,
      this.width() * Vars.tilesize + Vars.finalWorldBounds * 2,
      this.height() * Vars.tilesize + Vars.finalWorldBounds * 2
    );
  }

  /** 对应 Java `setGenerating(boolean)`。 */
  setGenerating(gen: boolean): void{
    this.generating = gen;
  }

  /** 对应 Java `isGenerating()`。 */
  isGenerating(): boolean{
    return this.generating;
  }

  /** 对应 Java `loadGenerator(int, int, Cons<Tiles>)`。 */
  loadGenerator(width: number, height: number, generator: Cons<Tiles>): void{
    this.beginMapLoad();

    this.resize(width, height);
    generator(this.tiles);

    this.endMapLoad();
  }

  /** 对应 Java `isInMapArea(int, int)`。 */
  isInMapArea(x: number, y: number): boolean{
    return (
      this.tiles.in(x, y) &&
      (!Vars.state.rules.limitMapArea ||
        Rect.contains(
          Vars.state.rules.limitX,
          Vars.state.rules.limitY,
          Vars.state.rules.limitWidth,
          Vars.state.rules.limitHeight,
          x,
          y
        ))
    );
  }

  // ---------------------------------------------------------------- 黑暗度

  /**
   * 对应 Java `addDarkness(Tiles)`：给「被黑暗覆盖」的 tile 计算并写入 `tile.data`。
   * 这是 `tile.data` 的唯一写入点之一（另一个是编辑器），因此必须移植 —— 见文件头。
   * Java 用 `byte[]`；S3 用 `number[]`（本项目统一 float64/int 不分，且取值恒在 0..5）。
   */
  addDarkness(tiles: Tiles): void{
    const dark = new Array<number>(tiles.width * tiles.height).fill(0);
    const writeBuffer = new Array<number>(tiles.width * tiles.height).fill(0);

    const darkIterations = Vars.darkRadius;

    for(let i = 0; i < dark.length; i++){
      const tile = tiles.geti(i);
      if(tile.isDarkened()){
        dark[i] = darkIterations;
      }
    }

    for(let i = 0; i < darkIterations; i++){
      for(const tile of tiles){
        const idx = tile.y * tiles.width + tile.x;
        let min = false;
        for(const point of Geometry.d4){
          const newX = tile.x + point.x;
          const newY = tile.y + point.y;
          const nidx = newY * tiles.width + newX;
          if(tiles.in(newX, newY) && dark[nidx]! < dark[idx]!){
            min = true;
            break;
          }
        }
        writeBuffer[idx] = Math.max(0, dark[idx]! - Mathf.num(min));
      }

      // Java: System.arraycopy(writeBuffer, 0, dark, 0, writeBuffer.length);
      for(let k = 0; k < writeBuffer.length; k++){
        dark[k] = writeBuffer[k]!;
      }
    }

    for(const tile of tiles){
      const idx = tile.y * tiles.width + tile.x;

      if(tile.isDarkened()){
        tile.data = dark[idx]!;
      }

      if(dark[idx] === Vars.darkRadius){
        let full = true;
        for(const p of Geometry.d4){
          const px = p.x + tile.x;
          const py = p.y + tile.y;
          const nidx = py * tiles.width + px;
          if(tiles.in(px, py) && !(tile.isDarkened() && dark[nidx] === 4)){
            full = false;
            break;
          }
        }
        if(full) tile.data = Vars.darkRadius + 1;
      }
    }
  }

  /** 对应 Java `getWallDarkness(Tile)`。 */
  getWallDarkness(tile: Tile): number{
    if(tile.isDarkened()){
      let minDst = Vars.darkRadius + 1;
      for(let cx = tile.x - Vars.darkRadius; cx <= tile.x + Vars.darkRadius; cx++){
        for(let cy = tile.y - Vars.darkRadius; cy <= tile.y + Vars.darkRadius; cy++){
          if(this.tiles.in(cx, cy) && !this.rawTile(cx, cy).isDarkened()){
            minDst = Math.min(minDst, Math.abs(cx - tile.x) + Math.abs(cy - tile.y));
          }
        }
      }
      return Math.max(minDst - 1, 0);
    }
    return 0;
  }

  /**
   * 对应 Java `getDarkness(int, int)`。
   * 已移植: `borderDarkness` 的地图边缘渐隐 + `tile.isDarkened()` 时取 `tile.data`。
   * 未移植: 扇区多边形分支（S5），见文件头。
   */
  getDarkness(x: number, y: number): number{
    let dark = 0;

    if(Vars.state.rules.borderDarkness){
      const edgeBlend = 2;
      let edgeDst: number;

      if(!Vars.state.rules.limitMapArea){
        edgeDst = Math.min(
          x,
          Math.min(y, Math.min(-(x - (this.tiles.width - 1)), -(y - (this.tiles.height - 1))))
        );
      }else{
        edgeDst = Math.min(
          x - Vars.state.rules.limitX,
          Math.min(
            y - Vars.state.rules.limitY,
            Math.min(
              -(x - (Vars.state.rules.limitX + Vars.state.rules.limitWidth - 1)),
              -(y - (Vars.state.rules.limitY + Vars.state.rules.limitHeight - 1))
            )
          )
        );
      }

      if(edgeDst <= edgeBlend){
        dark = Math.max((edgeBlend - edgeDst) * (4 / edgeBlend), dark);
      }
    }

    // TODO(S5): `state.hasSector() && preset == null` 的扇区多边形黑暗分支。

    const tile = this.tile(x, y);
    if(tile !== null && tile.isDarkened()){
      dark = Math.max(dark, tile.data);
    }

    return dark;
  }

  /** 对应 Java `makeSectorContext(Sector)` —— S3 只保留无参上下文（见文件头）。 */
  makeContext(): WorldContext{
    return this.context;
  }
}

/**
 * 对应 Java `World.Context`（非静态内部类，隐式持有外部 `World`）。
 * TS 侧显式保存外部引用（`world`），语义等价。
 */
export class Context implements WorldContext{
  private readonly world: World;

  constructor(world: World){
    this.world = world;
  }

  /** 对应 Java `tile(int index)`。 */
  tile(index: number): Tile{
    return this.world.tiles.geti(index);
  }

  /** 对应 Java `resize(int, int)`。 */
  resize(width: number, height: number): void{
    this.world.resize(width, height);
  }

  /** 对应 Java `create(int, int, int, int, int)`。 */
  create(x: number, y: number, floorID: number, overlayID: number, wallID: number): Tile{
    const tile = new Tile(x, y, floorID, overlayID, wallID);
    this.world.tiles.set(x, y, tile);
    return tile;
  }

  /** 对应 Java `isGenerating()`。 */
  isGenerating(): boolean{
    return this.world.isGenerating();
  }

  /** 对应 Java `begin()`。 */
  begin(): void{
    this.world.beginMapLoad();
  }

  /** 对应 Java `end()`。 */
  end(): void{
    this.world.endMapLoad();
  }
}
