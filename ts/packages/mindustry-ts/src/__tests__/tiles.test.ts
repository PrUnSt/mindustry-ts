// S3 子步 2（tiles）验收测试：`world/Tiles.ts`。
//
// 对应硬断言 #2: `new Tiles(8, 8).fill()` 之后 `tiles.get(3, 4).block() === Blocks.air`。
//
// 覆盖的陷阱:
//   #2 `Tiles.fill()` 会 `new Tile(...)`，而 `Tile` 构造器读 `Blocks.air` —— 所以 fill
//      必须在 bootstrap（`Blocks.load()` 创建了 air）之后调用，否则 floor/overlay 全是
//      undefined。本测试的 beforeAll 正是这个顺序。
//   #3 同上（计划里 #3 就是这条）。
//
// 反事实测试（文件末尾）: `fill()` 之前数组是**稀疏**的 —— `geti(0)` 为 undefined。
// 若 `fill()` 被误写成空实现或只填了一部分，断言会失败。

import { beforeAll, describe, expect, test } from "vitest";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Tiles } from "../world/Tiles.js";
import { Tile } from "../world/Tile.js";

beforeAll(() => {
  Vars.bootstrap();
});

/** 造一个已 fill 的 8x8 容器。 */
function filled(): Tiles{
  const tiles = new Tiles(8, 8);
  tiles.fill();
  return tiles;
}

describe("tiles: 尺寸与填充（硬断言 #2）", () => {
  test("构造器记录 width/height，array 长度 = w*h", () => {
    const tiles = new Tiles(8, 8);
    expect(tiles.width).toBe(8);
    expect(tiles.height).toBe(8);
    expect(tiles.array.length).toBe(64);
  });

  test("fill() 之后每个 tile 的 block/floor/overlay 都是 Blocks.air", () => {
    const tiles = filled();
    for(let i = 0; i < 64; i++){
      const tile = tiles.geti(i);
      expect(tile, "geti(" + i + ")").toBeInstanceOf(Tile);
      expect(tile.block()).toBe(Blocks.air);
      expect(tile.floor()).toBe(Blocks.air.asFloor());
      expect(tile.overlay()).toBe(Blocks.air.asFloor());
    }
  });

  test("硬断言 #2: get(3, 4).block() === Blocks.air", () => {
    const tiles = filled();
    const tile = tiles.get(3, 4);
    expect(tile).not.toBeNull();
    expect(tile!.block()).toBe(Blocks.air);
  });

  test("fill() 的坐标映射是 x 在内、y 在外（Java `i % width`, `i / width`）", () => {
    const tiles = filled();
    // 下标 3 + 4*8 = 35 必须是 (3,4)
    expect(tiles.geti(35)).toBe(tiles.get(3, 4));
    expect(tiles.geti(35)!.x).toBe(3);
    expect(tiles.geti(35)!.y).toBe(4);
    // 反向：get(0,0) 是下标 0，(7,7) 是下标 63
    expect(tiles.geti(0)).toBe(tiles.get(0, 0));
    expect(tiles.geti(63)).toBe(tiles.get(7, 7));
  });

  test("重新 fill() 会**整体替换** tile 对象（Java 语义：每次 new Tile）", () => {
    const tiles = new Tiles(4, 4);
    tiles.fill();
    const first = tiles.geti(0);
    tiles.fill();
    expect(tiles.geti(0)).not.toBe(first);
    expect(tiles.geti(0)).toBeInstanceOf(Tile);
  });
});

describe("tiles: 查询边界（get / getn / getc / getp / in）", () => {
  test("get(x, y) 越界返回 null（硬断言 #3 的边界部分）", () => {
    const tiles = filled();
    expect(tiles.get(-1, 0)).toBeNull();
    expect(tiles.get(0, -1)).toBeNull();
    expect(tiles.get(8, 0)).toBeNull();
    expect(tiles.get(0, 8)).toBeNull();
    expect(tiles.get(9999, 9999)).toBeNull();
    // 界内
    expect(tiles.get(0, 0)).not.toBeNull();
    expect(tiles.get(7, 7)).not.toBeNull();
  });

  test("in(x, y) 的判据与 get 一致", () => {
    const tiles = filled();
    expect(tiles.in(0, 0)).toBe(true);
    expect(tiles.in(7, 7)).toBe(true);
    expect(tiles.in(-1, 0)).toBe(false);
    expect(tiles.in(8, 8)).toBe(false);
  });

  test("getn 越界抛错（Java 语义），错误信息含坐标与尺寸", () => {
    const tiles = filled();
    expect(() => tiles.getn(-1, 0)).toThrowError(/-1, 0 out of bounds: width=8, height=8/);
    expect(tiles.getn(7, 7)).toBe(tiles.geti(63));
  });

  test("getc 把坐标 clamp 到界内", () => {
    const tiles = filled();
    expect(tiles.getc(-5, -5)).toBe(tiles.get(0, 0));
    expect(tiles.getc(99, 99)).toBe(tiles.get(7, 7));
    expect(tiles.getc(3, 4)).toBe(tiles.get(3, 4));
  });

  test("getp(pos) 解析打包坐标（x 高 16 位、y 低 16 位）", () => {
    const tiles = filled();
    const pos = ((3 & 0xffff) << 16) | (4 & 0xffff);
    expect(tiles.getp(pos)).toBe(tiles.get(3, 4));
    // 同一坐标的另一种构造方式：Tile.pos()
    expect(tiles.getp(tiles.get(3, 4)!.pos())).toBe(tiles.get(3, 4));
  });

  test("set / seti 可以换掉单个 tile", () => {
    const tiles = filled();
    const replacement = new Tile(3, 4);
    tiles.set(3, 4, replacement);
    expect(tiles.get(3, 4)).toBe(replacement);
    tiles.seti(0, replacement);
    expect(tiles.geti(0)).toBe(replacement);
  });
});

describe("tiles: 遍历", () => {
  test("each(x, y) 覆盖全部坐标，x 在外层", () => {
    const tiles = new Tiles(3, 2);
    tiles.fill();
    const seen: string[] = [];
    tiles.each((x, y) => {
      seen.push(x + "," + y);
    });
    expect(seen).toEqual(["0,0", "0,1", "1,0", "1,1", "2,0", "2,1"]);
  });

  test("eachTile / 迭代器走数组顺序", () => {
    const tiles = filled();
    const viaEachTile: Tile[] = [];
    tiles.eachTile((t) => {
      viaEachTile.push(t);
    });
    const viaIterator: Tile[] = [];
    for(const t of tiles){
      viaIterator.push(t);
    }
    expect(viaEachTile.length).toBe(64);
    expect(viaIterator).toEqual(viaEachTile);
    expect(viaIterator[0]).toBe(tiles.geti(0));
    expect(viaIterator[63]).toBe(tiles.geti(63));
  });

  test("tmpFloorState / tmpBlockState 的惰性分配与读写", () => {
    const tiles = filled();
    expect(tiles.getTmpFloorState(0)).toBe(0);
    tiles.setTmpFloorState(5, 42);
    expect(tiles.getTmpFloorState(5)).toBe(42);
    expect(tiles.getTmpFloorState(4)).toBe(0);

    expect(tiles.getTmpBlockState(0)).toBe(0);
    tiles.setTmpBlockState(63, 7);
    expect(tiles.getTmpBlockState(63)).toBe(7);
  });
});

describe("tiles: 反事实测试 —— fill() 确实填满了数组", () => {
  test("未 fill() 时数组是稀疏的，geti 返回 undefined；fill() 后全部有值", () => {
    const tiles = new Tiles(8, 8);

    // 反事实：`new Tiles(...)` 只分配长度，不建 Tile 对象。
    expect(tiles.array.length).toBe(64);
    expect(tiles.geti(0)).toBeUndefined();
    expect(tiles.get(3, 4)).toBeUndefined();

    tiles.fill();

    // 正向：fill() 之后每一个下标都被真实对象占据。
    for(let i = 0; i < 64; i++){
      expect(tiles.geti(i), "geti(" + i + ") 应为 Tile").toBeInstanceOf(Tile);
    }
  });
});
