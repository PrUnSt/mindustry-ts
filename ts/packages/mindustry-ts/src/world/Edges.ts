// 源: core/src/mindustry/world/Edges.java (86 行)
//
// 移植范围（S4 起为完整移植）: `edges` / `edgeInside` / `polygons` 三张静态表，
//   `getFacingEdge` 的三个重载（见下面的改名说明）、`getPixelPolygon`、`getEdges`、`getInsideEdges`。
//
// ⚠️ 相对 S3 的**关键变化**: S3 把 `polygons` / `getPixelPolygon` 标为「S4 或渲染，故未移植」，
//   文件头留了 `TODO(S4)`。S4 已补齐。
//
// ⚠️ 陷阱 #16 同型改名（**必须知道**）: Java 的 `getFacingEdge` 有**三个重载**
//   （`(Building,Building)` / `(Tile,Tile)` / `(Block,int,int,Tile)`）。TS 无法用同名不同元数
//   表达，且前两个的返回类型不同（前者恒非 null，后者可空）。处置与 `Tile.block()` 同判据 ——
//   保留最常用的 `getFacingEdge(Tile, Tile)`（S4 传送带 `acceptItem` / `handleItem` 都用它），
//   其余两个加后缀:
//     `getFacingEdge(Building, Building)`      → `getFacingEdgeBuild(...)`
//     `getFacingEdge(Block, int, int, Tile)`   → `getFacingEdgeOf(...)`（**可返回 null**）
//
// ⚠️ `polygons` 的初始化时机: Java 放在 `static{}` 里（类加载即算 24 个像素圆）。
//   TS 侧放进惰性的 `init()`（与 S3 建 `edges` 的既有处置一致）—— 理由: `pixelCircle`
//   是纯几何算法，类加载期执行会把「算法 bug」变成「所有 import Edges 的测试全崩」，
//   惰性化后影响面收敛到真正调用它的地方。

import { Mathf, Point2, Vec2 } from "@mindustry-ts/arc";
import { Vars } from "../Vars.js";
import { Geometry } from "../arc-compat/Geometry.js";
import type { Tile } from "./Tile.js";
import type { Block } from "./Block.js";
import type { Building } from "../gen/Building.js";

/** Java `Vars.maxBlockSize`。 */
const maxBlockSize = 16;
/** Java `Edges.maxRadius`。 */
const maxRadius = 12;

/** 对应 `mindustry.world.Edges`。 */
export class Edges{
  private static readonly edges: Point2[][] = new Array<Point2[]>(maxBlockSize).fill([]);
  private static readonly edgeInside: Point2[][] = new Array<Point2[]>(maxBlockSize).fill([]);
  /** Java `private static Vec2[][] polygons = new Vec2[maxRadius * 2][0]`。 */
  private static readonly polygons: Vec2[][] = new Array<Vec2[]>(maxRadius * 2).fill([]);
  private static initialized = false;

  /**
   * 对应 Java 的 `static{}` 初始化块。TS 的「静态块」语义在类体外显式执行 —— 对齐本仓库
   * `Mathf.ts` 对 `static{}` 的处置（模块体里跑一次），并额外**惰性化**（见文件头）。
   */
  static init(): void{
    if(Edges.initialized) return;
    Edges.initialized = true;

    // Java: `for(int i = 0; i < maxRadius * 2; i++){ polygons[i] = Geometry.pixelCircle((i + 1) / 2f); }`
    for(let i = 0; i < maxRadius * 2; i++){
      Edges.polygons[i] = Geometry.pixelCircle((i + 1) / 2);
    }

    for(let i = 0; i < maxBlockSize; i++){
      const bot = -Math.trunc(i / 2) - 1;
      const top = Math.trunc(i / 2 + 0.5) + 1;
      const points: Point2[] = [];

      for(let j = 0; j < i + 1; j++){
        // bottom
        points.push(new Point2(bot + 1 + j, bot));
        // top
        points.push(new Point2(bot + 1 + j, top));
        // left
        points.push(new Point2(bot, bot + j + 1));
        // right
        points.push(new Point2(top, bot + j + 1));
      }

      points.sort((e1, e2) => Mathf.angle(e1.x, e1.y) - Mathf.angle(e2.x, e2.y));
      Edges.edges[i] = points;
      Edges.edgeInside[i] = points.map(
        (point) =>
          new Point2(
            Mathf.clamp(point.x, -Math.trunc(i / 2), Math.trunc(i / 2 + 0.5)),
            Mathf.clamp(point.y, -Math.trunc(i / 2), Math.trunc(i / 2 + 0.5))
          )
      );
    }
  }

  /** 对应 Java `Edges.getFacingEdge(Tile, Tile)`。 */
  static getFacingEdge(tile: Tile, other: Tile): Tile{
    const res = Edges.getFacingEdgeOf(tile.block(), tile.x, tile.y, other);
    return res === null ? tile : res;
  }

  /** 对应 Java `Edges.getFacingEdge(Building, Building)`。⚠️ 改名原因见文件头。 */
  static getFacingEdgeBuild(tile: Building, other: Building): Tile{
    const res = Edges.getFacingEdgeOf(tile.block, tile.tileX(), tile.tileY(), other.tile as Tile);
    return res === null ? (tile.tile as Tile) : res;
  }

  /**
   * 对应 Java `Edges.getFacingEdge(Block, int tilex, int tiley, Tile other)`。
   * ⚠️ 改名原因见文件头；**可返回 null**（`world.tile(...)` 越界时）。
   */
  static getFacingEdgeOf(block: Block, tilex: number, tiley: number, other: Tile): Tile | null{
    if(!block.isMultiblock()) return Vars.world.tile(tilex, tiley);

    const size = block.size;
    return Vars.world.tile(
      tilex + Mathf.clamp(other.x - tilex, -Math.trunc((size - 1) / 2), Math.trunc(size / 2)),
      tiley + Mathf.clamp(other.y - tiley, -Math.trunc((size - 1) / 2), Math.trunc(size / 2))
    );
  }

  /** 对应 Java `Edges.getPixelPolygon(float radius)`。 */
  static getPixelPolygon(radius: number): Vec2[]{
    Edges.init();
    if(radius < 1 || radius > maxRadius)
      throw new Error("Polygon size must be between 1 and " + maxRadius);
    return Edges.polygons[Math.trunc(radius * 2) - 1]!;
  }

  /** 对应 Java `Edges.getEdges(int size)`。 */
  static getEdges(size: number): Point2[]{
    Edges.init();
    if(size < 0 || size > maxBlockSize) throw new Error("Block size must be between 0 and " + maxBlockSize);
    return Edges.edges[size - 1]!;
  }

  /** 对应 Java `Edges.getInsideEdges(int size)`。 */
  static getInsideEdges(size: number): Point2[]{
    Edges.init();
    if(size < 0 || size > maxBlockSize) throw new Error("Block size must be between 0 and " + maxBlockSize);
    return Edges.edgeInside[size - 1]!;
  }
}

/** 占位: 供 `Block` 的类型引用（`Edges` 里 `getFacingEdge` 需要 `Block`）。 */
export type { Block as BlockType };
