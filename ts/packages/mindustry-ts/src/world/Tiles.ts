// 源: core/src/mindustry/world/Tiles.java
//
// 移植范围: tile 数组 + tmp 状态数组 + 全部查询/写入方法。
// **未移植**: `puddles` / `fires` 两个平行数组（`Puddle` / `Fire` 是生成实体，S3 无液体/火焰
// 系统，计划 §9）。因此 `getPuddle/setPuddle/getFire/setFire` 也一并省去，等 S4/后续阶段加回。
//
// ⚠️ 陷阱 #3（计划 §6.2）: `Tiles.fill()` 会 `new Tile(i % width, i / width)`，而
// `Tile` 构造器**读 `Blocks.air`**（`Tile.java:53`）。所以 `MinimalBlocks.load()` 的
// 第一行必须是创建 `air`，否则 fill 出来的 tile 的 floor/overlay/block 全是 undefined。

import { Tile } from "./Tile.js";

/** 对应 `mindustry.world.Tiles`：tile 容器。 */
export class Tiles{
  readonly width: number;
  readonly height: number;

  readonly array: Tile[];
  /** 对应 Java `tmpFloorState`（Java 是 `long[]`，TS 用 number[]）。 */
  tmpFloorState: number[] | null = null;
  /** 对应 Java `tmpBlockState`。 */
  tmpBlockState: number[] | null = null;

  constructor(width: number, height: number){
    this.array = new Array<Tile>(width * height);
    this.width = width;
    this.height = height;
  }

  /** 对应 Java `Tiles.getTmpFloorState(int)`。 */
  getTmpFloorState(pos: number): number{
    return this.tmpFloorState === null ? 0 : this.tmpFloorState[pos]!;
  }

  /** 对应 Java `Tiles.setTmpFloorState(int, long)`。 */
  setTmpFloorState(pos: number, value: number): void{
    if(this.tmpFloorState === null || this.tmpFloorState.length !== this.array.length){
      this.tmpFloorState = new Array<number>(this.array.length).fill(0);
    }
    this.tmpFloorState[pos] = value;
  }

  /** 对应 Java `Tiles.getTmpBlockState(int)`。 */
  getTmpBlockState(pos: number): number{
    return this.tmpBlockState === null ? 0 : this.tmpBlockState[pos]!;
  }

  /** 对应 Java `Tiles.setTmpBlockState(int, long)`。 */
  setTmpBlockState(pos: number, value: number): void{
    if(this.tmpBlockState === null || this.tmpBlockState.length !== this.array.length){
      this.tmpBlockState = new Array<number>(this.array.length).fill(0);
    }
    this.tmpBlockState[pos] = value;
  }

  /** 对应 Java `Tiles.each(Intc2)`：按 x 外层、y 内层遍历坐标。 */
  each(cons: (x: number, y: number) => void): void{
    for(let x = 0; x < this.width; x++){
      for(let y = 0; y < this.height; y++){
        cons(x, y);
      }
    }
  }

  /** 用空空气 tile 填满本容器。对应 Java `Tiles.fill()`。 */
  fill(): void{
    for(let i = 0; i < this.array.length; i++){
      this.array[i] = new Tile(i % this.width, Math.trunc(i / this.width));
    }
  }

  /** 在坐标处放一个 tile（不越界检查）。对应 Java `Tiles.set(int,int,Tile)`。 */
  set(x: number, y: number, tile: Tile): void{
    this.array[y * this.width + x] = tile;
  }

  /** 按一维下标放 tile。对应 Java `Tiles.seti`。 */
  seti(i: number, tile: Tile): void{
    this.array[i] = tile;
  }

  /** @return 坐标是否在界内。对应 Java `Tiles.in`。 */
  in(x: number, y: number): boolean{
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /** @return 坐标处的 tile，越界返回 null。对应 Java `Tiles.get`。 */
  get(x: number, y: number): Tile | null{
    return x < 0 || x >= this.width || y < 0 || y >= this.height ? null : this.array[y * this.width + x]!;
  }

  /** @return 坐标处的 tile，越界抛错。对应 Java `Tiles.getn`。 */
  getn(x: number, y: number): Tile{
    if(x < 0 || x >= this.width || y < 0 || y >= this.height){
      throw new Error(x + ", " + y + " out of bounds: width=" + this.width + ", height=" + this.height);
    }
    return this.array[y * this.width + x]!;
  }

  /** @return 坐标处的 tile，clamp 到界内。对应 Java `Tiles.getc`。 */
  getc(x: number, y: number): Tile{
    const cx = Math.min(Math.max(x, 0), this.width - 1);
    const cy = Math.min(Math.max(y, 0), this.height - 1);
    return this.array[cy * this.width + cx]!;
  }

  /** @return 一维下标处的 tile。对应 Java `Tiles.geti`。 */
  geti(idx: number): Tile{
    return this.array[idx]!;
  }

  /** @return 打包坐标处的 tile（等价 `get(Point2.x(pos), Point2.y(pos))`）。对应 Java `Tiles.getp`。 */
  getp(pos: number): Tile | null{
    const x = ((pos >>> 16) << 16) >> 16;
    const y = ((pos & 0xffff) << 16) >> 16;
    return this.get(x, y);
  }

  /** 遍历所有 tile。对应 Java `Tiles.eachTile`。 */
  eachTile(cons: (tile: Tile) => void): void{
    for(const tile of this.array){
      cons(tile);
    }
  }

  /** 对应 Java `Tiles.iterator()`（顺序即数组顺序）。 */
  [Symbol.iterator](): Iterator<Tile>{
    let index = 0;
    const array = this.array;
    return {
      next(): IteratorResult<Tile>{
        return index < array.length ? { value: array[index++]!, done: false } : { value: undefined, done: true };
      }
    };
  }
}
