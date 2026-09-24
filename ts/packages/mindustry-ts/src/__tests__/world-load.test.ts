// S3 子步 3（world）验收测试：`World.loadGenerator` 与 `Groups.resize` 的精确接线。
//
// 对应硬断言 #3: `world.loadGenerator(8,8,fn)` → `width()===8 && height()===8 && tiles.geti(63)!=null`。
// 对齐 Java `World.java:234` → TS `World.endMapLoad()`：
//   Groups.resize(-finalWorldBounds, -finalWorldBounds,
//                 tiles.width * tilesize + finalWorldBounds * 2,
//                 tiles.height * tilesize + finalWorldBounds * 2)
// 其中 finalWorldBounds = 250、tilesize = 8 → 8×8 图应为 (-250, -250, 564, 564)。
//
// 反事实（第二个用例）: spy 记录两次不同尺寸的 `Groups.resize` 实参，断言实参**随 tiles 尺寸变化**。
//   若 `endMapLoad` 漏调 `Groups.resize` 或传常量，用例必红（见交付报告的实测失败输出）。

import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Groups } from "../gen/Groups.js";
import { Tile } from "../world/Tile.js";

beforeAll(() => {
  Vars.bootstrap();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("world-load: loadGenerator 与 Groups.resize（硬断言 #3）", () => {
  test("loadGenerator(8,8,fn) → width/height 精确为 8，geti(63) 是 Tile，且 Groups.resize 参数精确", () => {
    const resizeSpy = vi.spyOn(Groups, "resize");

    Vars.world.loadGenerator(8, 8, (tiles) => {
      tiles.fill();
    });

    // 尺寸（硬断言 #3）
    expect(Vars.world.width()).toBe(8);
    expect(Vars.world.height()).toBe(8);
    // tiles 数组长度 = w*h
    expect(Vars.world.tiles.array.length).toBe(64);
    // geti(63) 是真实 Tile 且坐标正确
    const last = Vars.world.tiles.geti(63);
    expect(last).toBeInstanceOf(Tile);
    expect(last.x).toBe(7);
    expect(last.y).toBe(7);
    // 全 air 世界的地板/方块
    expect(Vars.world.tiles.get(3, 4)!.block()).toBe(Blocks.air);
    expect(Vars.world.tiles.get(3, 4)!.floor()).toBe(Blocks.air.asFloor());

    // `Groups.resize` 恰被调用一次，且四个实参精确 = Java `World.java:234`
    expect(resizeSpy).toHaveBeenCalledTimes(1);
    expect(resizeSpy.mock.calls[0]).toEqual([-250, -250, 8 * 8 + 250 * 2, 8 * 8 + 250 * 2]);
    // 显式钉死数值（避免上面的算式与实现同源、掩盖偏差）
    expect(resizeSpy.mock.calls[0]).toEqual([-250, -250, 564, 564]);
  });

  test("反事实：resize 实参随 tiles 尺寸变化（漏调或写常量则必红）", () => {
    const resizeSpy = vi.spyOn(Groups, "resize");

    Vars.world.loadGenerator(8, 8, (tiles) => {
      tiles.fill();
    });
    Vars.world.loadGenerator(4, 5, (tiles) => {
      tiles.fill();
    });

    // 每次 loadGenerator 恰好触发一次 resize
    expect(resizeSpy).toHaveBeenCalledTimes(2);

    const first: number[] = resizeSpy.mock.calls[0] as number[];
    const second: number[] = resizeSpy.mock.calls[1] as number[];

    expect(first).toEqual([-250, -250, 564, 564]); // 8×8
    expect(second).toEqual([-250, -250, 4 * 8 + 500, 5 * 8 + 500]); // 4×5 → 532, 540
    expect(second).toEqual([-250, -250, 532, 540]);

    // 关键反事实判据：w/h 必须随尺寸变化。若 endMapLoad 传了常量，这一条必红。
    expect(second[2]).not.toBe(first[2]);
    expect(second[3]).not.toBe(first[3]);
  });

  test("beginMapLoad/endMapLoad 的 generating 标志成对：loadGenerator 结束后 isGenerating() 为 false", () => {
    Vars.world.loadGenerator(2, 2, (tiles) => {
      // 生成期间应为 true
      expect(Vars.world.isGenerating()).toBe(true);
      tiles.fill();
    });
    expect(Vars.world.isGenerating()).toBe(false);
    expect(Vars.world.tiles.array.length).toBe(4);
  });
});
