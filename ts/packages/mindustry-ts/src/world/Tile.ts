// 源: core/src/mindustry/world/Tile.java (942 行)
//
// 移植范围: tile 的核心数据与状态变更链路 —— 四个事件单例、构造器、`setBlock` 全流程
// （`preChanged` / `changeBuild` / `changed` / `fire*Changed`）、`setFloor` / `setOverlay`、
// 全部查询方法（`floor/block/overlay/team/isCenter/passable/solid/drop/wallDrop/...`）。
//
// ⚠️ 陷阱 #4（计划 §6.2）: `tileChange` / `preChange` / `floorChange` / `overlayChange`
// 是**静态单例**，反复 `set(...)` 后复用同一对象再 fire。`arc-ts` 的 `Events.fire(event)`
// 用 `event.constructor` 作 key（`Events.ts:46`），所以复用不会串台，但**必须**提供 `set()`。
//
// ⚠️ headless 守卫（计划 §6.2 的「headless 守卫 4 处」在本文件的分布）:
//   `recacheWall()` / `recache()` / `setFloor()` 里的 renderer 分支 —— Java 原文就是
//   `if(!headless && !world.isGenerating())`。S3 不移植 `renderer`，因此这些分支保留守卫
//   并在分支体内留下 TODO（**不是**把整个方法删掉：调用点与事件顺序必须一致）。
//
// 未移植（逐条标注）:
//   - `display(Table)` / `displayable()` / `getDisplayIcon/Name` —— UI（计划 §9）
//   - 静态 `@Remote` 方法（`setTile` / `removeTile` / `fillTile*` / `setTeams` / `reflowPower` /
//     `buildDestroyed` / `buildHealthUpdate`）—— 网络层与 `Call`（S6）
//   - `getPackedData` / `setPackedData` / `PackedTileDataStruct` —— `@Struct` 序列化（S6）
//   - `circle(...)`（依赖 `Geometry.circle`）、`getLinkedTiles*`（多块结构，S4）、
//     `updateBlockReference` / `cblock`（数据补丁）、`getFlammability()` 的 build 分支
//     （依赖 `ItemModule`/`LiquidModule`，S4）
//   - `isEditorTile()` 保持 false（Java 的 `Tile` 也不覆写它，编辑器子类才覆写）
//   - `firePreChanged`/`fireChanged` 的 `world.isGenerating()` 守卫保留（行为关键）

import { Events, Mathf, Rect } from "@mindustry-ts/arc";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Team } from "../game/Team.js";
import {
  TileChangeEvent,
  TileFloorChangeEvent,
  TileOverlayChangeEvent,
  TilePreChangeEvent
} from "../game/EventType.js";
import { Edges } from "./Edges.js";
import { Geometry } from "../arc-compat/Geometry.js";
import type { Block } from "./Block.js";
import type { Floor } from "./blocks/environment/Floor.js";
import type { Building } from "../gen/Building.js";
import type { Item } from "../type/Item.js";

/** 对应 `mindustry.world.Tile`。 */
export class Tile{
  private static readonly tileChange = new TileChangeEvent();
  private static readonly preChange = new TilePreChangeEvent();
  private static readonly floorChange = new TileFloorChangeEvent();
  private static readonly overlayChange = new TileOverlayChangeEvent();

  /** 复用的临时集合：`changeBuild` 里收集需要 `updateProximity()` 的边界建筑。 */
  private static readonly tileSet = new Set<Building>();

  /**
   * 特定方块的额外数据。仅当 `Block.saveData` 为 true 时才存档。
   * Java 是 `byte`，TS 用 number（本项目统一 float64/int 不分）。
   */
  data = 0;
  floorData = 0;
  overlayData = 0;
  /** 更多数据（Java `int extraData`）。 */
  extraData = 0;
  /** tile 实体，通常为 null。 */
  build: Building | null = null;
  /** 坐标。Java 是 `short`。 */
  x: number;
  y: number;

  /**
   * 底层数据字段。
   *
   * ⚠️ 陷阱 #16（**TS 相对 Java 的一处被迫改名**）: Java 允许**字段与方法同名**
   * （`Tile.java` 同时有 `protected Block block;` 与 `public Block block()`），
   * TS 不允许（`TS2300: Duplicate identifier`，且属性会静默吃掉方法）。
   * 处置：**保留公开访问器的 Java 名字**（`block()` / `floor()` / `overlay()` —— 全项目
   * 有 300+ 处调用点，是真正的公开 API），把 `protected` **字段**加 `Ref` 后缀改名。
   * 字段在 Java 里是 `protected`（仅 `mindustry.world` 同包与子类可见），本移植里
   * **唯一**的读取点就是 `Tile.ts` 自身，所以该改名对 `Tile` 之外不可见。
   * 未来移植 `TileEditor`（S4）时，同样用 `blockRef` / `floorRef` / `overlayRef` 访问。
   */
  protected blockRef: Block;
  protected floorRef: Floor;
  protected overlayRef: Floor;
  /** 是否正在变更中（`changed()` 会读它以避免重入）。 */
  protected changing = false;

  /** 对应 Java `Tile(int x, int y)`。 */
  constructor(x: number, y: number);
  /** 对应 Java `Tile(int x, int y, Block floor, Block overlay, Block wall)`。 */
  constructor(x: number, y: number, floor: Block, overlay: Block, wall: Block);
  /** 对应 Java `Tile(int x, int y, int floor, int overlay, int wall)`。 */
  constructor(x: number, y: number, floor: number, overlay: number, wall: number);
  constructor(
    x: number,
    y: number,
    floor?: Block | number,
    overlay?: Block | number,
    wall?: Block | number
  ){
    // Java 是 `this.x = (short)x` —— 用 16 位有符号截断保持语义
    this.x = (x << 16) >> 16;
    this.y = (y << 16) >> 16;

    if(floor === undefined){
      // Java: block = floor = overlay = (Floor)Blocks.air;
      this.blockRef = Blocks.air;
      this.floorRef = Blocks.air.asFloor();
      this.overlayRef = Blocks.air.asFloor();
    }else{
      // Java: 两个 5 参构造器 —— `(Block, Block, Block)` 与 `(int, int, int)`。
      // id 越界时 `content.block(id)` 返回 null，Java 也**直接**把 null 存进字段
      // （后续使用才会 NPE），这里保持同一语义（断言而非报错）。
      const f = typeof floor === "number" ? Vars.content.block(floor) : floor;
      const o = typeof overlay === "number" ? Vars.content.block(overlay!) : (overlay as Block);
      const w = typeof wall === "number" ? Vars.content.block(wall) : (wall as Block);
      this.floorRef = f as unknown as Floor;
      this.overlayRef = o as unknown as Floor;
      this.blockRef = w as Block;

      // 更新实体并在需要时创建它
      this.changeBuild(Team.derelict, () => this.blockRef.newBuilding(), 0);
      this.changed();
    }
  }

  // ---------------------------------------------------------------- 坐标

  /** @return 本 tile 位置的打包坐标。对应 Java `pos()`（`Point2.pack`）。 */
  pos(): number{
    return (((this.x & 0xffff) << 16) | (this.y & 0xffff)) | 0;
  }

  /** @return 以 world 宽度打包的位置，用于 `width*height` 数组。对应 Java `array()`。 */
  array(): number{
    return this.x + this.y * Vars.world.tiles.width;
  }

  /** 对应 Java `relativeTo(Tile)`。 */
  relativeTo(tile: Tile): number{
    return Tile.relativeToXY(this.x, this.y, tile.x, tile.y);
  }

  /** 对应 Java `static relativeTo(int,int,int,int)`。 */
  static relativeToXY(x: number, y: number, cx: number, cy: number): number{
    if(x === cx && y === cy - 1) return 1;
    if(x === cx && y === cy + 1) return 3;
    if(x === cx - 1 && y === cy) return 0;
    if(x === cx + 1 && y === cy) return 2;
    return -1;
  }

  /** 对应 Java `static relativeTo(float,float,float,float)`。 */
  static relativeToF(x: number, y: number, cx: number, cy: number): number{
    if(Math.abs(x - cx) > Math.abs(y - cy)){
      if(x <= cx - 1) return 0;
      if(x >= cx + 1) return 2;
    }else{
      if(y <= cy - 1) return 1;
      if(y >= cy + 1) return 3;
    }
    return -1;
  }

  /** 对应 Java `absoluteRelativeTo(int, int)`。 */
  absoluteRelativeTo(cx: number, cy: number): number{
    // 奇数尺寸非常直接
    if(this.blockRef.size % 2 === 1){
      if(Math.abs(this.x - cx) > Math.abs(this.y - cy)){
        if(this.x <= cx - 1) return 0;
        if(this.x >= cx + 1) return 2;
      }else{
        if(this.y <= cy - 1) return 1;
        if(this.y >= cy + 1) return 3;
      }
    }else{
      // 偶数尺寸需要偏移
      if(Math.abs(this.x - cx + 0.5) > Math.abs(this.y - cy + 0.5)){
        if(this.x + 0.5 <= cx - 1) return 0;
        if(this.x + 0.5 >= cx + 1) return 2;
      }else{
        if(this.y + 0.5 <= cy - 1) return 1;
        if(this.y + 0.5 >= cy + 1) return 3;
      }
    }

    return -1;
  }

  // ---------------------------------------------------------------- 查询

  /**
   * @return 该 tile 的可燃性，用于火焰计算。
   *
   * ⚠️ 只移植了 `block == Blocks.air` 分支与 `build != null` 的骨架：Java 在 build 分支里
   * 用 `build.items`（`ItemModule`）与 `build.liquids`（`LiquidModule`）做加权求和，
   * 两者都是 S4 的产物。此处返回 0 并标注。
   */
  getFlammability(): number{
    if(this.blockRef === Blocks.air){
      if(this.floorRef.liquidDrop !== null) return this.floorRef.liquidDrop.flammability;
      return 0;
    }else if(this.build !== null){
      // TODO(S4): block.hasItems / block.hasLiquids 的加权求和
      return 0;
    }
    return 0;
  }

  /** 对应 Java `inMapArea()`。 */
  inMapArea(): boolean{
    return Vars.world.isInMapArea(this.x, this.y);
  }

  /** 对应 Java `worldx()`。 */
  worldx(): number{
    return this.x * Vars.tilesize;
  }

  /** 对应 Java `worldy()`。 */
  worldy(): number{
    return this.y * Vars.tilesize;
  }

  /** 对应 Java `drawx()`。 */
  drawx(): number{
    return this.block().offset + this.worldx();
  }

  /** 对应 Java `drawy()`。 */
  drawy(): number{
    return this.block().offset + this.worldy();
  }

  /** 对应 Java `isDarkened()`。 */
  isDarkened(): boolean{
    return this.blockRef.isDarkened(this);
  }

  /** 对应 Java `floor()`。 */
  floor(): Floor{
    return this.floorRef;
  }

  /** 对应 Java `block()`。 */
  block(): Block{
    return this.blockRef;
  }

  /** 对应 Java `overlay()`。 */
  overlay(): Floor{
    return this.overlayRef;
  }

  /** 内部方法，供数据补丁使用。对应 Java `updateBlockReference(Block)`。 */
  updateBlockReference(block: Block): void{
    this.blockRef = block;
  }

  /**
   * 对应 Java `Tile.team()`。
   * Java 返回 `Team` 对象（`build.team`）；TS 的 `Building.team` 是 **阵营 id**（codegen 约束），
   * 因此这里用 `Team.get(id)` 还原。
   */
  team(): Team{
    return this.build === null ? Team.derelict : Team.get(this.build.team);
  }

  /** 不要在不知道后果的情况下调用！这不会更新 indexer。对应 Java `setTeam(Team)`。 */
  setTeam(team: Team): void{
    if(this.build !== null){
      this.build.team = team.id;
    }
  }

  /** 对应 Java `isCenter()`。 */
  isCenter(): boolean{
    return this.build === null || this.build.tile === this;
  }

  /** 对应 Java `centerX()`。 */
  centerX(): number{
    return this.build === null ? this.x : this.build.tile.x;
  }

  /** 对应 Java `centerY()`。 */
  centerY(): number{
    return this.build === null ? this.y : this.build.tile.y;
  }

  /** 对应 Java `getTeamID()`。 */
  getTeamID(): number{
    return this.team().id;
  }

  /** 对应 Java `passable()`。 */
  passable(): boolean{
    return !(
      (this.floorRef.solid && (this.blockRef === Blocks.air || this.blockRef.solidifes)) ||
      (this.blockRef.solid && (!this.blockRef.destructible && !this.blockRef.update))
    );
  }

  /** @return 该方块是否由玩家/单位放置。对应 Java `synthetic()`。 */
  synthetic(): boolean{
    return this.blockRef.update || this.blockRef.destructible;
  }

  /** 对应 Java `solid()`。 */
  solid(): boolean{
    return this.blockRef.solid || this.floorRef.solid || (this.build !== null && this.build.checkSolid());
  }

  /** 对应 Java `breakable()`。 */
  breakable(): boolean{
    return this.blockRef.destructible || this.blockRef.breakable || this.blockRef.update;
  }

  /** @return 该 tile 的地板是否造成伤害或可溺水。对应 Java `dangerous()`。 */
  dangerous(): boolean{
    return !this.blockRef.solid && (this.floorRef.isDeep() || this.floorRef.damages());
  }

  /** 对应 Java `isDeep()`。 */
  isDeep(): boolean{
    return this.blockRef === Blocks.air && this.floorRef.isDeep();
  }

  /** 对应 Java `isEditorTile()`（基类恒 false，编辑器子类覆写）。 */
  isEditorTile(): boolean{
    return false;
  }

  /** 对应 Java `overlayID()`。 */
  overlayID(): number{
    return this.overlayRef.id;
  }

  /** 对应 Java `blockID()`。 */
  blockID(): number{
    return this.blockRef.id;
  }

  /** 对应 Java `floorID()`。 */
  floorID(): number{
    return this.floorRef.id;
  }

  /** 对应 Java `getHitbox(Rect)`。 */
  getHitbox(rect: Rect): Rect{
    return rect.setCentered(this.drawx(), this.drawy(), this.blockRef.size * Vars.tilesize, this.blockRef.size * Vars.tilesize);
  }

  /** 对应 Java `getBounds(Rect)`。 */
  getBounds(rect: Rect): Rect{
    return rect.set(
      this.x * Vars.tilesize - Vars.tilesize / 2,
      this.y * Vars.tilesize - Vars.tilesize / 2,
      Vars.tilesize,
      Vars.tilesize
    );
  }

  /** 对应 Java `nearby(Point2)`。 */
  nearbyPoint(relativeX: number, relativeY: number): Tile | null{
    return Vars.world.tile(this.x + relativeX, this.y + relativeY);
  }

  /** 对应 Java `nearby(int dx, int dy)`。 */
  nearby(dx: number, dy: number): Tile | null{
    return Vars.world.tile(this.x + dx, this.y + dy);
  }

  /** 对应 Java `nearby(int rotation)`。 */
  nearbyRotation(rotation: number): Tile | null{
    switch(rotation){
      case 0:
        return Vars.world.tile(this.x + 1, this.y);
      case 1:
        return Vars.world.tile(this.x, this.y + 1);
      case 2:
        return Vars.world.tile(this.x - 1, this.y);
      case 3:
        return Vars.world.tile(this.x, this.y - 1);
      default:
        return null;
    }
  }

  /** 对应 Java `nearbyBuild(int rotation)`。 */
  nearbyBuild(rotation: number): Building | null{
    switch(rotation){
      case 0:
        return Vars.world.build(this.x + 1, this.y);
      case 1:
        return Vars.world.build(this.x, this.y + 1);
      case 2:
        return Vars.world.build(this.x - 1, this.y);
      case 3:
        return Vars.world.build(this.x, this.y - 1);
      default:
        return null;
    }
  }

  /** 对应 Java `interactable(Team)`。 */
  interactable(team: Team): boolean{
    return Vars.state.teams.canInteract(team, this.team());
  }

  /** 对应 Java `drop()`。 */
  drop(): Item | null{
    return this.overlayRef === Blocks.air.asFloor() || this.overlayRef.itemDrop === null
      ? this.floorRef.itemDrop
      : this.overlayRef.itemDrop;
  }

  /** 对应 Java `wallDrop()`。 */
  wallDrop(): Item | null{
    return this.blockRef.solid
      ? this.blockRef.itemDrop !== null
        ? this.blockRef.itemDrop
        : this.overlayRef.wallOre && !this.blockRef.synthetic()
          ? this.overlayRef.itemDrop
          : null
      : null;
  }

  /** 对应 Java `shouldSaveData()`。 */
  shouldSaveData(): boolean{
    return this.floorRef.saveData || this.overlayRef.saveData || this.blockRef.saveData;
  }

  /** 对应 Java `staticDarkness()`。 */
  staticDarkness(): number{
    return this.blockRef.solid && this.blockRef.fillsTile && !this.blockRef.synthetic() ? this.data : 0;
  }

  /** @return 该 tile 对步行单位是否实体。对应 Java `legSolid()`。 */
  legSolid(): boolean{
    return this.staticDarkness() >= 2 || (this.floorRef.solid && this.blockRef === Blocks.air);
  }

  /** @return 两个 tile 是否紧邻。对应 Java `adjacentTo(Tile)`。 */
  adjacentTo(tile: Tile): boolean{
    return this.relativeTo(tile) !== -1;
  }

  /** 对应 Java `getX()`（`Position`）。 */
  getX(): number{
    return this.drawx();
  }

  /** 对应 Java `getY()`（`Position`）。 */
  getY(): number{
    return this.drawy();
  }

  // ---------------------------------------------------------------- 状态变更

  /** 对应 Java `setBlock(Block type, Team team, int rotation)`。 */
  setBlock(type: Block, team: Team, rotation: number): void;
  /** 对应 Java `setBlock(Block, Team, int, Prov<Building>)`。 */
  setBlock(type: Block, team: Team, rotation: number, entityprov: () => Building): void;
  /** 对应 Java `setBlock(Block type, Team team)`。 */
  setBlock(type: Block, team: Team): void;
  /** 对应 Java `setBlock(Block type)`。 */
  setBlock(type: Block): void;
  setBlock(
    type: Block,
    team?: Team,
    rotation?: number,
    entityprov?: () => Building
  ): void{
    let actualTeam = team ?? Team.derelict;
    const actualRotation = rotation ?? 0;
    const actualProv = entityprov ?? (() => type.newBuilding());

    this.changing = true;

    if(type.isStatic() || this.blockRef.isStatic()){
      this.recache();
      this.recacheWall();
    }

    if(type.forceTeam !== null) actualTeam = type.forceTeam;

    this.preChanged();

    this.blockRef = type;
    this.changeBuild(actualTeam, actualProv, Mathf.mod(actualRotation, 4));

    if(this.build !== null){
      // Java: `build.team(team)` 是一个 setter；TS 的 `Building.team` 是数字字段（codegen 约束）。
      this.build.team = actualTeam.id;
    }

    // 设置多块结构
    if(this.blockRef.isMultiblock()){
      const offset = -((this.blockRef.size - 1) / 2);
      const entity = this.build;
      const block = this.blockRef;

      // 两趟：第一趟清理，第二趟设置
      for(let pass = 0; pass < 2; pass++){
        for(let dx = 0; dx < block.size; dx++){
          for(let dy = 0; dy < block.size; dy++){
            const wx = dx + offset + this.x;
            const wy = dy + offset + this.y;
            if(!(wx === this.x && wy === this.y)){
              const other = Vars.world.tile(wx, wy);

              if(other !== null){
                if(pass === 0){
                  // 第一趟：删除已有方块 —— 若存在重叠，这会自动触发移除
                  other.setBlock(Blocks.air);
                }else{
                  // 第二趟：写入变更后的数据
                  // 把实体与类型赋给这些方块，让它们作为本块的代理
                  other.build = entity;
                  other.blockRef = block;
                }
              }
            }
          }
        }
      }

      this.build = entity;
      this.blockRef = block;
    }

    this.changed();
    this.changing = false;

    this.blockRef.blockChanged(this);
  }

  /** 对应 Java `setFloor(Floor type)`。 */
  setFloor(type: Floor): void{
    if(this.floorRef === type) return;

    const prev = this.floorRef;
    this.floorRef = type;

    if(!Vars.headless && !Vars.world.isGenerating() && !this.isEditorTile()){
      // TODO(渲染, S4+): renderer.blocks.removeFloorIndex(this)
    }

    this.recache();
    if(this.build !== null){
      this.build.onProximityUpdate();
    }
    // TODO(S4): if(!world.isGenerating() && pathfinder != null && !state.isEditor()) pathfinder.updateTile(this);

    if(!Vars.world.isGenerating()){
      Events.fire(Tile.floorChange.set(this, prev, type));
    }

    if(this.floorRef !== prev){
      this.floorRef.floorChanged(this);
    }
  }

  /** 把方块设为 air。对应 Java `setAir()`。 */
  setAir(): void{
    this.setBlock(Blocks.air);
  }

  /** 对应 Java `remove()`。 */
  remove(): void{
    // 这会自动移除指向本方块的多块结构引用
    this.setBlock(Blocks.air);
  }

  /**
   * 对应 Java `recacheWall()`。
   * ⚠️ headless 守卫：Java 是 `if(!headless && !world.isGenerating())`。
   */
  recacheWall(): void{
    if(!Vars.headless && !Vars.world.isGenerating()){
      // TODO(渲染, S4+): renderer.blocks.recacheWall(this)
    }
  }

  /**
   * 对应 Java `recache()`。
   * ⚠️ headless 守卫：Java 是 `if(!headless && !world.isGenerating())`。
   * 注意 Java 原文还会连带 recache 周围 8 个 tile（`Geometry.d8`）。
   */
  recache(): void{
    if(!Vars.headless && !Vars.world.isGenerating()){
      // TODO(渲染, S4+): renderer.blocks.floor.recacheTile(this) / minimap.update(this) /
      //                   blocks.invalidateTile(this) / blocks.addFloorIndex(this)
      for(let i = 0; i < 8; i++){
        const other = Vars.world.tile(this.x + Geometry.d8[i]!.x, this.y + Geometry.d8[i]!.y);
        if(other !== null){
          // TODO(渲染, S4+): renderer.blocks.floor.recacheTile(other)
        }
      }
    }
  }

  /** 对应 Java `setOverlay(Block block)`。 */
  setOverlay(block: Block): void{
    if(this.overlayRef === (block as unknown as Floor)) return;

    const prev = this.overlayRef;
    this.overlayRef = block as unknown as Floor;

    this.recache();

    if(!Vars.world.isGenerating()){
      Events.fire(Tile.overlayChange.set(this, prev, this.overlayRef));
    }

    if(!Vars.world.isGenerating() && this.build !== null){
      this.build.onProximityUpdate();
    }
  }

  /** 无 recache 地设置覆盖层。对应 Java `setOverlayQuiet(Block)`。 */
  setOverlayQuiet(block: Block): void{
    this.overlayRef = block as unknown as Floor;
  }

  /** 对应 Java `clearOverlay()`。 */
  clearOverlay(): void{
    this.setOverlay(Blocks.air);
  }

  // ---------------------------------------------------------------- 内部变更链路

  /** 对应 Java `preChanged()`。 */
  protected preChanged(): void{
    this.firePreChanged();

    if(this.build !== null){
      // 只对中心方块调用 removed() —— 这里只会被调用一次
      this.build.onRemoved();
      this.build.removeFromProximity();

      // 移除本 tile 的悬空实体
      if(this.build.block.isMultiblock()){
        const cx = this.build.tileX();
        const cy = this.build.tileY();
        const size = this.build.block.size;
        const offsetx = -((size - 1) / 2);
        const offsety = -((size - 1) / 2);
        for(let dx = 0; dx < size; dx++){
          for(let dy = 0; dy < size; dy++){
            const other = Vars.world.tile(cx + dx + offsetx, cy + dy + offsety);
            if(other !== null){
              // **手动**重置实体与方块 —— 因此多块结构的其它 tile 不会再次触发 preChanged()
              if(other !== this){
                // 手动为其它 tile 触发 pre-change 事件
                other.firePreChanged();

                other.build = null;
                other.blockRef = Blocks.air;

                // 手动触发 changed 事件
                other.fireChanged();
              }
            }
          }
        }
      }
    }
  }

  /**
   * 对应 Java `changeBuild(Team, Prov<Building>, int)`。
   * ⚠️ `shouldAdd = block.update && !state.isEditor()` —— 这是「哪些建筑会进入 `Groups.build`」
   * 的**唯一**判据：`update` 为 false 的方块（墙、地板、静态墙）会创建 `Building` 实例
   * 但**不会**入组。这是 Java 的真实行为（参见 `TeamData.buildings` 的注释
   * "Includes even buildings that do not update()"，说明 `Groups.build` 恰恰相反）。
   */
  protected changeBuild(team: Team, entityprov: () => Building, rotation: number): void{
    if(this.build !== null){
      const size = this.build.block.size;
      this.build.remove();
      this.build = null;

      // 更新边界实体
      Tile.tileSet.clear();

      for(const edge of Edges.getEdges(size)){
        const other = Vars.world.build(this.x + edge.x, this.y + edge.y);
        if(other !== null){
          Tile.tileSet.add(other);
        }
      }

      // 多块结构刚被移除，更新邻接
      for(const t of Tile.tileSet){
        t.updateProximity();
      }
    }

    if(this.blockRef.hasBuilding()){
      this.build = entityprov().init(this, team.id, this.blockRef.update && !Vars.state.isEditor(), rotation);
    }
  }

  // ---------------------------------------------------------------- 建筑的邻近列表
  //
  // ⚠️ 为什么这两段代码在 `Tile` 而不在 `BuildingComp`（S4 新增，必须知道）:
  //   Java 的实现在 `BuildingComp.updateProximity()` / `removeFromProximity()`
  //   （`BuildingComp.java:1866-1914`），它们需要 `Edges.getEdges(block.size)` 与
  //   `world.build(...)`。TS 的 `Building` 是 **codegen 产物**，只能 import「组件接口名 /
  //   `Groups` / 基类名」，无法 import `Edges`（见 `BuildingComp.def.ts` 文件头）。
  //   而 `Tile` 是手写文件且**本来就** import 了 `Edges`（`changeBuild` 用它找边界建筑），
  //   所以把真实实现放在这里，`BuildingComp.updateProximity()` 只做 `this.tile.rebuildProximity()`
  //   的转发。语义与 Java 逐行一致（同样的 `block.size`、同样的 `tile.x/tile.y`）。
  //
  //   `proximityTmp` 对应 Java 的 `static final ObjectSet<Building> tmpTiles`
  //   （`BuildingComp.java:57`）—— 共享的临时集合；JS 的 `Set` 与 arc 的 `ObjectSet`
  //   都保持**首次插入顺序**，故 `proximity` 的最终顺序与 Java 一致（确定性前提）。

  /** 复用的临时集合（Java `BuildingComp.tmpTiles`）。 */
  private static readonly proximityTmp = new Set<Building>();

  /**
   * 对应 Java `BuildingComp.updateProximity()`。
   * 重建**本 tile 上建筑**的 `proximity`，并对**两个方向**都维护: 既把邻居加进自己的列表，
   * 也把自己加进邻居的列表（`other.proximity.addUnique(self())`），最后让所有相关建筑
   * 重跑 `onProximityUpdate()` —— 这是 `Conveyor` 的 `next` / `Router` 的轮转投递
   * 能立即生效的前提。
   */
  rebuildProximity(): void{
    const build = this.build;
    if(build === null) return;

    const tmp = Tile.proximityTmp;
    tmp.clear();
    build.proximity.length = 0;

    for(const point of Edges.getEdges(build.block.size)){
      const other = Vars.world.build(this.x + point.x, this.y + point.y);

      if(other === null || other.team !== build.team) continue;

      // Java: `other.proximity.addUnique(self())` —— 按**身份**去重
      if(!other.proximity.includes(build)) other.proximity.push(build);
      tmp.add(other);
    }

    // Java 注释: 「using a set to prevent duplicates」
    for(const other of tmp) build.proximity.push(other);

    build.onProximityAdded();
    build.onProximityUpdate();

    for(const other of tmp) other.onProximityUpdate();

    // Java 末尾: `if(!headless && block.drawCached) recache();`
    // —— `recache()` 的唯一副作用是 renderer 缓存失效，headless 下本就是 no-op（计划 §9）。
  }

  /** 对应 Java `BuildingComp.removeFromProximity()`。 */
  removeBuildProximity(): void{
    const build = this.build;
    if(build === null) return;

    build.onProximityRemoved();

    const tmp = Tile.proximityTmp;
    tmp.clear();

    for(const point of Edges.getEdges(build.block.size)){
      const other = Vars.world.build(this.x + point.x, this.y + point.y);
      if(other !== null){
        tmp.add(other);
      }
    }

    for(const other of tmp){
      // Java: `other.proximity.remove(self(), true)` —— 按身份移除**首个**匹配项
      const idx = other.proximity.indexOf(build);
      if(idx !== -1) other.proximity.splice(idx, 1);
      other.onProximityUpdate();
    }

    build.proximity.length = 0;
  }

  /** 对应 Java `changed()`。 */
  protected changed(): void{
    if(!Vars.world.isGenerating()){
      if(this.build !== null){
        this.build.updateProximity();
      }else{
        // 实体不会为我们更新邻接，所以手动更新所有邻近 tile
        for(const p of Geometry.d4){
          const tile = Vars.world.build(this.x + p.x, this.y + p.y);
          if(tile !== null && !tile.tile.changing){
            tile.onProximityUpdate();
          }
        }
      }
    }

    this.fireChanged();

    // 静态方块加入时 recache
    if(this.blockRef.isStatic()){
      this.recache();
    }
  }

  /** 对应 Java `fireChanged()`。 */
  protected fireChanged(): void{
    if(!Vars.world.isGenerating()){
      Events.fire(Tile.tileChange.set(this));
    }
  }

  /** 对应 Java `firePreChanged()`。 */
  protected firePreChanged(): void{
    if(!Vars.world.isGenerating()){
      Events.fire(Tile.preChange.set(this));
    }
  }

  /** 对应 Java `toString()`。 */
  toString(): string{
    return (
      this.floorRef.name +
      ":" +
      this.blockRef.name +
      ":" +
      this.overlayRef +
      "[" +
      this.x +
      "," +
      this.y +
      "] " +
      "entity=" +
      (this.build === null ? "null" : "Building") +
      ":" +
      this.team()
    );
  }
}
