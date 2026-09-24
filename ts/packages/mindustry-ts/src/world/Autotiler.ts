// 源: core/src/mindustry/world/blocks/Autotiler.java (237 行)
//
// ⚠️ 计划 §7 把本文件写成 `core/src/mindustry/world/Autotiler.java` —— **路径勘误**，
//   真实路径是 `world/blocks/Autotiler.java`（`TileBitmask` / `ControlBlock` 同样在
//   `world/blocks/` 下）。本文件的 TS 位置按 §7 的表格放在 `src/world/Autotiler.ts`
//   （import 更短），并在交付报告里标注这处位置选择。
//
// 语义: 「方块自动拼接」——根据 4/8 邻域里有哪些产出/带物品的方块，算出
//   `ConveyorBuild.blendbits / blendsclx / blendscly / blending` 与
//   `Floor` / `Wall` 的自动拼接位掩码。
//
// ⚠️ TS 表达方式（相对于 Java 的关键差异，必须知道）:
//   Java 是**接口 + default 方法**。TS 的 `interface` 不能带实现，而实现者
//   `Conveyor extends Block` 已占用唯一的继承位。因此:
//     - `export interface Autotiler` 只保留 Java 的那个**抽象**方法
//       `blends(tile, rotation, otherx, othery, otherrot, otherblock)`；
//     - Java 的 default 方法全部搬进 `Autotilers` 这个静态工具类，并把**显式 `self:
//       Autotiler` 作为第一个参数**（Java 的隐式 `this`）。调用点形如
//       `Autotilers.buildBlending(this, tile, rotation, null, true)`。
//   `transformCase` / `facing` 不读 `this`，保持普通静态方法。
//
// 未移植（逐条标注）:
//   - `getTiling(BuildPlan, Eachable<BuildPlan>)` 与 `AutotilerHolder.plan` /
//     `blendFinder` / `directionals` —— 依赖 `Block.findPlan` + `BuildPlan`
//     （「建造计划」系统：放置预览时的实时拼接）。该系统未移植（S3/S4 都不建方块计划），
//     而 S4 的自动拼接只需要 `buildBlending(tile, rotation, null, true)` 这条**世界分支**。
//   - `SliceMode` / `sliced` / `topHalf` / `botHalf` —— `TextureRegion` 切片，纯渲染（计划 §9）。
//
// ⚠️ `blendresult` 是**共享静态可变数组**（Java `AutotilerHolder.blendresult`）。
//   调用方必须在同一个 tick 内立即取走需要的那几项（Java 的 `ConveyorBuild.onProximityUpdate`
//   就是拷 `bits[0]/bits[1]/bits[2]/bits[4]`）。单线程 tick 下无别名风险。

import { Mathf, Point2 } from "@mindustry-ts/arc";
import { Edges } from "./Edges.js";
import { Geometry } from "../arc-compat/Geometry.js";
import type { Block } from "./Block.js";
import type { Tile } from "./Tile.js";

/**
 * 「建造计划」的最小结构面（Java `BuildPlan`）。S4 **没有生产者** —— 参数恒为 `null`；
 * 保留类型是为了让 `blends(tile, rotation, directional, ...)` 的分支形状与 Java 一致，
 * 将来移植建造计划时只需补生产者。
 */
export interface AutotilerPlan{
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly block: Block;
}

/** 对应 Java `Autotiler.AutotilerHolder`（静态临时变量，避免每帧分配）。 */
export class AutotilerHolder{
  /** 对应 Java `static final int[] blendresult = new int[5]`。 */
  static readonly blendresult: number[] = new Array<number>(5).fill(0);
}

/** 对应 `mindustry.world.blocks.Autotiler`（只保留抽象方法，见文件头）。 */
export interface Autotiler{
  /**
   * 对应 Java `boolean blends(Tile, int rotation, int otherx, int othery, int otherrot, Block otherblock)`。
   * @return 本方块是否应与 `otherblock` 拼接。
   */
  blends(tile: Tile, rotation: number, otherx: number, othery: number, otherrot: number, otherblock: Block): boolean;
}

/** Java `Autotiler` 的 `default` 方法集（TS 无 default 方法，见文件头）。 */
export class Autotilers{
  /**
   * 对应 Java `buildBlending(Tile, int, BuildPlan[], boolean)`。
   * @return 长度为 5 的共享数组（见 `AutotilerHolder.blendresult`），
   *   `[0]` 连接类型、`[1]` X 缩放、`[2]` Y 缩放、`[3]` 4 位方向掩码、`[4]` 非方形精灵掩码。
   */
  static buildBlending(
    self: Autotiler,
    tile: Tile,
    rotation: number,
    directional: readonly (AutotilerPlan | null)[] | null,
    world: boolean
  ): number[]{
    const blendresult = AutotilerHolder.blendresult;
    blendresult[0] = 0;
    blendresult[1] = 1;
    blendresult[2] = 1;

    const num =
      Autotilers.blends(self, tile, rotation, directional, 2, world) &&
      Autotilers.blends(self, tile, rotation, directional, 1, world) &&
      Autotilers.blends(self, tile, rotation, directional, 3, world)
        ? 0
        : Autotilers.blends(self, tile, rotation, directional, 1, world) &&
            Autotilers.blends(self, tile, rotation, directional, 3, world)
          ? 1
          : Autotilers.blends(self, tile, rotation, directional, 1, world) &&
              Autotilers.blends(self, tile, rotation, directional, 2, world)
            ? 2
            : Autotilers.blends(self, tile, rotation, directional, 3, world) &&
                Autotilers.blends(self, tile, rotation, directional, 2, world)
              ? 3
              : Autotilers.blends(self, tile, rotation, directional, 1, world)
                ? 4
                : Autotilers.blends(self, tile, rotation, directional, 3, world)
                  ? 5
                  : -1;

    Autotilers.transformCase(num, blendresult);

    // 计算方向位掩码
    blendresult[3] = 0;
    for(let i = 0; i < 4; i++){
      if(Autotilers.blends(self, tile, rotation, directional, i, world)){
        blendresult[3]! |= 1 << i;
      }
    }

    // 计算「非方形精灵」的方向掩码
    blendresult[4] = 0;
    for(let i = 0; i < 4; i++){
      const realDir = Mathf.mod(rotation - i, 4);
      const neighbor = tile.nearbyBuild(realDir);
      if(Autotilers.blends(self, tile, rotation, directional, i, world) && neighbor !== null && !neighbor.block.squareSprite){
        blendresult[4]! |= 1 << i;
      }
    }

    return blendresult;
  }

  /** 对应 Java `transformCase(int num, int[] bits)`。`num == -1` 时**不改动** `bits`（Java 的 switch 无 default）。 */
  static transformCase(num: number, bits: number[]): void{
    switch(num){
      case 0:
        bits[0] = 3;
        break;
      case 1:
        bits[0] = 4;
        break;
      case 2:
        bits[0] = 2;
        break;
      case 3:
        bits[0] = 2;
        bits[2] = -1;
        break;
      case 4:
        bits[0] = 1;
        bits[2] = -1;
        break;
      case 5:
        bits[0] = 1;
        break;
      default:
        break;
    }
  }

  /** 对应 Java `facing(int x, int y, int rotation, int x2, int y2)`。 */
  static facing(x: number, y: number, rotation: number, x2: number, y2: number): boolean{
    return Point2.equals(x + Geometry.d4At(rotation).x, y + Geometry.d4At(rotation).y, x2, y2);
  }

  /** 对应 Java `blends(Tile, int, BuildPlan[], int direction, boolean checkWorld)`。 */
  static blends(
    self: Autotiler,
    tile: Tile,
    rotation: number,
    directional: readonly (AutotilerPlan | null)[] | null,
    direction: number,
    checkWorld: boolean
  ): boolean{
    const realDir = Mathf.mod(rotation - direction, 4);
    if(directional !== null && directional[realDir] != null){
      const req = directional[realDir]!;
      if(self.blends(tile, rotation, req.x, req.y, req.rotation, req.block)){
        return true;
      }
    }
    return checkWorld && Autotilers.blendsDirection(self, tile, rotation, direction);
  }

  /** 对应 Java `blends(Tile, int rotation, int direction)`。 */
  static blendsDirection(self: Autotiler, tile: Tile, rotation: number, direction: number): boolean{
    const other = tile.nearbyBuild(Mathf.mod(rotation - direction, 4));
    // ⚠️ Java 是 `other.team == tile.team()`（两个 Team 对象）；TS 的 `Building.team` 是阵营 **id**，
    //    故与 `tile.team().id` 比较（等价，见 `Tile.team()` 的说明）。
    return other !== null && other.team === tile.team().id && self.blends(tile, rotation, other.tileX(), other.tileY(), other.rotation, other.block);
  }

  /** 对应 Java `blendsArmored(...)`。 */
  static blendsArmored(tile: Tile, rotation: number, otherx: number, othery: number, otherrot: number, otherblock: Block): boolean{
    return (
      Point2.equals(tile.x + Geometry.d4At(rotation).x, tile.y + Geometry.d4At(rotation).y, otherx, othery) ||
      (!otherblock.rotatedOutput(otherx, othery, tile) &&
        Edges.getFacingEdgeOf(otherblock, otherx, othery, tile) !== null &&
        Edges.getFacingEdgeOf(otherblock, otherx, othery, tile)!.relativeTo(tile) === rotation) ||
      (otherblock.rotatedOutput(otherx, othery, tile) &&
        Point2.equals(otherx + Geometry.d4At(otherrot).x, othery + Geometry.d4At(otherrot).y, tile.x, tile.y))
    );
  }

  /** 对应 Java `notLookingAt(...)`：`otherblock` **没有**朝向本 tile。 */
  static notLookingAt(tile: Tile, rotation: number, otherx: number, othery: number, otherrot: number, otherblock: Block): boolean{
    return !(
      otherblock.rotatedOutput(otherx, othery, tile) &&
      Point2.equals(otherx + Geometry.d4At(otherrot).x, othery + Geometry.d4At(otherrot).y, tile.x, tile.y)
    );
  }

  /**
   * 对应 Java `lookingAtEither(...)`：本 tile 朝向对方，或对方朝向本 tile；
   * 对方不按朝向输出时视为**总是**朝向本 tile。
   */
  static lookingAtEither(tile: Tile, rotation: number, otherx: number, othery: number, otherrot: number, otherblock: Block): boolean{
    return (
      Point2.equals(tile.x + Geometry.d4At(rotation).x, tile.y + Geometry.d4At(rotation).y, otherx, othery) ||
      !otherblock.rotatedOutput(otherx, othery, tile) ||
      Point2.equals(otherx + Geometry.d4At(otherrot).x, othery + Geometry.d4At(otherrot).y, tile.x, tile.y)
    );
  }

  /** 对应 Java `lookingAt(Tile, int rotation, int otherx, int othery, Block otherblock)`。 */
  static lookingAt(tile: Tile, rotation: number, otherx: number, othery: number, otherblock: Block): boolean{
    const facing = Edges.getFacingEdgeOf(otherblock, otherx, othery, tile);
    return (
      facing !== null &&
      Point2.equals(tile.x + Geometry.d4At(rotation).x, tile.y + Geometry.d4At(rotation).y, facing.x, facing.y)
    );
  }
}
