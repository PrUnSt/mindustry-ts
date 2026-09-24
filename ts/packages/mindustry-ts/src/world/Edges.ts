// 源: core/src/mindustry/world/Edges.java
//
// 移植范围: `edges` / `edgeInside` 两张静态表（`Tile.changeBuild` 用它找多块结构的边界邻居）。
// `polygons`（`Geometry.pixelCircle` 缓存）与 `getFacingEdge(...)` 属于 S4（传送带/多块结构
// 面向计算）或渲染，S3 不需要，故未移植并在此标注。
//
// TODO(S4): 补齐 `getFacingEdge(Building, Building)` 与 `getPixelPolygon`。

import { Mathf, Point2 } from "@mindustry-ts/arc";
import { Vars } from "../Vars.js";
import type { Tile } from "./Tile.js";
import type { Block } from "./Block.js";

/** Java `Vars.maxBlockSize`。 */
const maxBlockSize = 16;

/** 对应 `mindustry.world.Edges`。 */
export class Edges{
  private static readonly edges: Point2[][] = new Array<Point2[]>(maxBlockSize).fill([]);
  private static readonly edgeInside: Point2[][] = new Array<Point2[]>(maxBlockSize).fill([]);
  private static initialized = false;

  /**
   * 对应 Java 的 `static{}` 初始化块。TS 的「静态块」语义在类体外显式执行 —— 对齐本仓库
   * `Mathf.ts` 对 `static{}` 的处置（模块体里跑一次）。
   */
  static init(): void{
    if(Edges.initialized) return;
    Edges.initialized = true;

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

  /** 对应 Java `Edges.getFacingEdge(Tile, Tile)`（S4 之前只保留签名，见文件头 TODO）。 */
  static getFacingEdge(tile: Tile, other: Tile): Tile{
    if(!tile.block().isMultiblock()) return Vars.world.tile(tile.x, tile.y) ?? tile;
    const size = tile.block().size;
    return (
      Vars.world.tile(
        tile.x + Mathf.clamp(other.x - tile.x, -Math.trunc((size - 1) / 2), Math.trunc(size / 2)),
        tile.y + Mathf.clamp(other.y - tile.y, -Math.trunc((size - 1) / 2), Math.trunc(size / 2))
      ) ?? tile
    );
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
