// S4 验收测试 ②（计划 §7）: `Autotiler` 的自动拼接位掩码。
//
// 覆盖的行为（S4 新增，S3 只有显式空实现 + TODO）:
//   - `Autotilers.buildBlending()` 的 `num` 判定链（`transformCase` 的 6 个 case + `-1` 缺省）
//   - `blendresult[3]`（4 向拼接掩码）与 `blendresult[4]`（非方形精灵掩码）
//   - `Autotilers` 的几何判定: `facing` / `lookingAt` / `lookingAtEither` / `notLookingAt`
//   - `AutotilerHolder.blendresult` 的**共享可变数组**契约（调用方必须立刻取走需要的项）
//   - `TileBitmask.values` 的数据完整性（它是 8 邻域 → 47 个变体索引的映射，
//     `WallBuild.drawCached` 的直接查表对象）
//
// ⚠️ 「位掩码」有**三套**不同口径，计划 §7 把前两者写在一起，这里必须分开钉死:
//
//   ① `Autotilers.buildBlending` 返回的 5 元数组（Java 文档 `Autotiler.java:96-100`）:
//        [0] 连接类型（0..5，由 `transformCase` 决定）  → `ConveyorBuild.blendbits`
//        [1] X 缩放                                    → `ConveyorBuild.blendsclx`
//        [2] Y 缩放                                    → `ConveyorBuild.blendscly`
//        [3] **4 位方向掩码**（bit i ⇔ 与方向 i 的邻居拼接）→ ⚠️ **`Conveyor` 不保存它**
//        [4] 同 [3]，但只统计**非方形精灵**的邻居          → `ConveyorBuild.blending`
//      ⚠️ 实测确认（本文件的关键结论）: `ConveyorBuild.onProximityUpdate` 只拷
//      `[0]/[1]/[2]/[4]`（`Conveyor.java:215-220`），**`[3]` 被丢弃** —— 它唯一的
//      消费者是未移植的 `StackConveyor`（`StackConveyor.java:99`）与放置预览绘制。
//      因此「传送带的 4 位方向掩码」**只能**通过直接调 `buildBlending(...)[3]` 观测，
//      不存在「从 `ConveyorBuild` 字段上读到的方向掩码」这种东西。
//      `blending`（[4]）在 S4 恒为 0，因为所有 `squareSprite` 都是默认 true ——
//      这也是断言（把「恒 0」钉死，而不是回避它）。
//
//   ② **墙 / 地板**的 8 邻域掩码（`WallBuild.autotileBits`），它才通过
//      `TileBitmask.values[mask]` 查变体索引（`Wall.java:138` / `Floor.java:281` /
//      `StaticWall.java:51`）→ 见 `wall-autotile.test.ts`。
//
//   ③ `TileBitmask.values` 本身的数据表（256 项索引空间 → 47 个变体索引）
//      → 本文件末尾的完整性锚点。
//
// 数值来源: 全部**先按源码手推、再用实测值钉死**（推导过程写在每个断言上方）。
//   关键常量: `outputsItems() === hasItems`（传送带为 true）；
//   `Block.rotatedOutput()` 默认 `=== rotate`（传送带 `rotate = true`）；
//   `Geometry.d4 = [(1,0),(0,1),(-1,0),(0,-1)]`。

import { describe, expect, test } from "vitest";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { createWorld, placeBlock } from "../harness.js";
import { ConveyorBuild } from "../world/blocks/distribution/Conveyor.js";
import { AutotilerHolder, Autotilers } from "../world/Autotiler.js";
import { TileBitmask } from "../world/blocks/TileBitmask.js";
import type { Tile } from "../world/Tile.js";

/** 取一个 tile 上的传送带建筑（放置后必然存在）。 */
function conveyorAt(x: number, y: number): ConveyorBuild{
  const build = Vars.world.tile(x, y)!.build;
  if(build === null) throw new Error("conveyorAt: (" + x + "," + y + ") 上没有建筑");
  return build as ConveyorBuild;
}

/**
 * 直接调 `buildBlending` 并取 `[3]`（4 位方向掩码）。
 * ⚠️ 必须这样取: `ConveyorBuild` **不保存** `[3]`（见文件头）。
 */
function maskAt(x: number, y: number, rotation: number): number{
  const bits = Autotilers.buildBlending(Blocks.conveyor, Vars.world.tile(x, y)! as Tile, rotation, null, true);
  return bits[3]!;
}

/** 直接调 `buildBlending` 并取 `[0]`（连接类型编号）。 */
function typeAt(x: number, y: number, rotation: number): number{
  const bits = Autotilers.buildBlending(Blocks.conveyor, Vars.world.tile(x, y)! as Tile, rotation, null, true);
  return bits[0]!;
}

describe("autotiler: Autotilers 的几何判定（逐条对照 Java 的 default 方法）", () => {
  test("facing / lookingAt / lookingAtEither / notLookingAt 的精确布尔值", () => {
    createWorld(16, 16, 1);
    placeBlock(2, 2, Blocks.conveyor, 0);
    placeBlock(3, 2, Blocks.conveyor, 0);

    const tile = Vars.world.tile(2, 2)!;
    const other = Vars.world.tile(3, 2)!;
    const block = Blocks.conveyor;

    // `facing(x, y, rotation, x2, y2)` = 「rotation 指向的相邻格是否就是 (x2,y2)」
    // `Geometry.d4(0) = (1,0)` → 从 (2,2) 出发朝 rotation 0 就是 (3,2)
    expect(Autotilers.facing(2, 2, 0, 3, 2)).toBe(true);
    expect(Autotilers.facing(2, 2, 0, 2, 3)).toBe(false);
    expect(Autotilers.facing(2, 2, 1, 2, 3)).toBe(true); // d4(1) = (0,1)

    // `lookingAt(tile, rotation, otherx, othery, otherblock)`:
    //   `Edges.getFacingEdge(otherblock, otherx, othery, tile)` 在非多块结构时就是 (otherx,othery)，
    //   于是判据退化为 `facing(tile.x, tile.y, rotation, otherx, othery)`
    expect(Autotilers.lookingAt(tile, 0, 3, 2, block)).toBe(true);
    expect(Autotilers.lookingAt(tile, 0, 2, 3, block)).toBe(false);

    // `lookingAtEither(tile, rotation, otherx, othery, otherrot, otherblock)`:
    //   ① 本 tile 朝向对方，或 ② 对方**不按朝向输出**（本阶段 `rotatedOutput === rotate === true`
    //   → 这一条恒假），或 ③ 对方朝向本 tile
    // ③: 对方在 (3,2) 朝 rotation 2（`d4(2) = (-1,0)`）→ 指向 (2,2) ✓
    expect(Autotilers.lookingAtEither(tile, 0, 3, 2, 2, block)).toBe(true);
    // ①: 本 tile 朝 0 → (3,2) ✓（即使对方朝向 (4,2)）
    expect(Autotilers.lookingAtEither(tile, 0, 3, 2, 0, block)).toBe(true);
    // 对方在 (2,3)（与本 tile 的 rotation 0 不对齐），且它朝 0（指向 (3,3)，不是 (2,2)）→ 全假
    expect(Autotilers.lookingAtEither(tile, 0, 2, 3, 0, block)).toBe(false);

    // `notLookingAt` 是 ③ 的**取反**（Java 只判「otherblock 是否朝向本 tile」）
    expect(Autotilers.notLookingAt(tile, 0, 3, 2, 2, block)).toBe(false); // 对方朝向本 tile
    expect(Autotilers.notLookingAt(tile, 0, 3, 2, 0, block)).toBe(true); // 对方朝外

    void other;
  });
});

describe("autotiler: 3 连传送带（直线）的拼接位掩码", () => {
  test("4 位方向掩码精确等于 1 / 5 / 4；blendbits 全为 0；blending（非方形掩码）恒 0", () => {
    createWorld(16, 16, 1);
    placeBlock(2, 2, Blocks.conveyor, 0);
    placeBlock(3, 2, Blocks.conveyor, 0);
    placeBlock(4, 2, Blocks.conveyor, 0);

    const c1 = conveyorAt(2, 2);
    const c2 = conveyorAt(3, 2);
    const c3 = conveyorAt(4, 2);

    // 推导（`blendresult[3]` 是 4 向掩码，bit i ⇔ `blends(..., direction = i, ...)`；
    //  `blends(direction)` 的 realDir = `mod(rotation - direction, 4)`，
    //  而 `nearbyBuild(realDir)` 与 `Geometry.d4` 同序）:
    //   c1（2,2）: direction 0 的邻居是 (3,2) → bit0 → 0b0001 = 1
    //   c2（3,2）: direction 0 的邻居是 (4,2)，direction 2 的邻居是 (2,2) → bit0|bit2 → 0b0101 = 5
    //   c3（4,2）: direction 2 的邻居是 (3,2) → bit2 → 0b0100 = 4
    expect(maskAt(2, 2, 0)).toBe(1);
    expect(maskAt(3, 2, 0)).toBe(5); // ← §7 的「3 连传送带 bitmask」
    expect(maskAt(4, 2, 0)).toBe(4);
    expect(maskAt(3, 2, 0).toString(2)).toBe("101");

    // 与 `TileBitmask` 交叉验证（写死的具体条目）: 掩码 5 在这张表里的条目是 16
    expect(TileBitmask.values[5]).toBe(16);
    expect(TileBitmask.values[1]).toBe(36);
    expect(TileBitmask.values[4]).toBe(27);

    // `blendresult[0]`（连接类型）: `num` 的判定链只看 direction 1 / 2 / 3，
    // 而这三条在「沿 x 轴的直线」上全部为假 → `num = -1` → `transformCase` 的 switch
    // **没有 default** → `bits[0]` 保持初值 0。所以直线传送带的 `blendbits` 是 0
    // （= 完整 1×1 贴图），伸缩量保持 1。
    expect(typeAt(3, 2, 0)).toBe(0);
    expect(c1.blendbits).toBe(0);
    expect(c2.blendbits).toBe(0);
    expect(c3.blendbits).toBe(0);
    expect(c1.blendsclx).toBe(1);
    expect(c1.blendscly).toBe(1);
    expect(c2.blendsclx).toBe(1);
    expect(c2.blendscly).toBe(1);
    expect(c3.blendsclx).toBe(1);
    expect(c3.blendscly).toBe(1);

    // ⚠️ `ConveyorBuild.blending` 存的是 `blendresult[4]`（非方形精灵掩码），**不是** [3]。
    // 它恒为 0，因为 `neighbor.block.squareSprite` 默认 true（传送带未改）→ 钉死这个 0。
    expect(c1.blending).toBe(0);
    expect(c2.blending).toBe(0);
    expect(c3.blending).toBe(0);
  });
});

describe("autotiler: 三向拼接触发 transformCase(0)（blendbits 变成 3）", () => {
  test("中心传送带的 direction 1/2/3 三个邻居都能拼接 → blendbits === 3、方向掩码 === 14", () => {
    createWorld(16, 16, 1);

    // 中心 (3,3) 朝 rotation 0（+x）。
    // `blends(direction)` 的 realDir = `mod(rotation - direction, 4)`:
    //   direction 1 → realDir 3 → `nearbyBuild(3) = (x, y-1)` = (3,2)
    //   direction 2 → realDir 2 → `nearbyBuild(2) = (x-1, y)` = (2,3)
    //   direction 3 → realDir 1 → `nearbyBuild(1) = (x, y+1)` = (3,4)
    // 三个邻居各自都朝**中心**（`lookingAtEither` 的第 ③ 条），因此三条 `blends` 全真
    // → `num = 0` → `transformCase(0)` 把 `bits[0]` 写成 3。
    placeBlock(3, 3, Blocks.conveyor, 0); // 中心
    placeBlock(3, 2, Blocks.conveyor, 1); // 朝 +y → 指向中心
    placeBlock(2, 3, Blocks.conveyor, 0); // 朝 +x → 指向中心
    placeBlock(3, 4, Blocks.conveyor, 3); // 朝 -y → 指向中心

    const center = conveyorAt(3, 3);

    // 方向掩码: bit1 | bit2 | bit3 = 2 | 4 | 8 = 14（bit0 的 (4,3) 是空气）
    expect(maskAt(3, 3, 0)).toBe(14);
    // 连接类型: num === 0 → transformCase(0) → 3
    expect(typeAt(3, 3, 0)).toBe(3);
    expect(center.blendbits).toBe(3);
    expect(center.blendsclx).toBe(1);
    expect(center.blendscly).toBe(1);
    expect(center.blending).toBe(0); // [4] 恒 0（方形精灵）

    // 三个邻居各自的方向掩码都只有「朝中心」那一位（各自只有一个拼接邻居）
    expect(maskAt(3, 2, 1)).toBe(1); // direction 0 → realDir 1 → 中心
    expect(maskAt(2, 3, 0)).toBe(1);
    expect(maskAt(3, 4, 3)).toBe(1);
    // 它们都是「单端点」→ num = -1 → blendbits 不变（0）
    expect(typeAt(3, 2, 1)).toBe(0);
    expect(conveyorAt(3, 2).blendbits).toBe(0);
    expect(conveyorAt(2, 3).blendbits).toBe(0);
    expect(conveyorAt(3, 4).blendbits).toBe(0);
  });

  test("反事实: 拿掉 direction 1 的邻居 → num 变成 3，连接类型与 Y 缩放同时变化", () => {
    createWorld(16, 16, 1);
    placeBlock(3, 3, Blocks.conveyor, 0);
    // 只放 direction 2 与 3 的邻居（缺 direction 1）
    placeBlock(2, 3, Blocks.conveyor, 0);
    placeBlock(3, 4, Blocks.conveyor, 3);

    const center = conveyorAt(3, 3);

    // `num` 判定链: (2&&1&&3) 假（缺 1）、(1&&3) 假、(1&&2) 假、**(3&&2) 真** → num = 3
    // → `transformCase(3)`: `bits[0] = 2`、`bits[2] = -1`（Y 缩放翻转）
    // 方向掩码只剩 bit2 | bit3 = 4 | 8 = 12
    expect(maskAt(3, 3, 0)).toBe(12);
    expect(typeAt(3, 3, 0)).toBe(2);
    expect(center.blendbits).toBe(2);
    expect(center.blendsclx).toBe(1);
    expect(center.blendscly).toBe(-1);
    expect(center.blending).toBe(0);

    // 对照: 补上 direction 1 的邻居 → num 变 0、Y 缩放回到 1
    placeBlock(3, 2, Blocks.conveyor, 1);
    expect(maskAt(3, 3, 0)).toBe(14);
    expect(center.blendbits).toBe(3);
    expect(center.blendscly).toBe(1);
  });
});

describe("autotiler: blendresult 是共享可变数组（契约）", () => {
  test("buildBlending 每次返回**同一个**数组实例 → 调用方必须立刻拷走需要的项", () => {
    createWorld(16, 16, 1);
    placeBlock(2, 2, Blocks.conveyor, 0);
    placeBlock(3, 2, Blocks.conveyor, 0);

    const tile = Vars.world.tile(2, 2)! as Tile;

    const first = Autotilers.buildBlending(Blocks.conveyor, tile, 0, null, true);
    expect(first).toBe(AutotilerHolder.blendresult); // 身份相等，不是等值拷贝

    // 用**另一个** tile 再算一次 → 同一个数组被覆写（这就是 `ConveyorBuild.onProximityUpdate`
    // 必须「立刻把 4 个值拷进自己的字段」的原因）
    const other = Vars.world.tile(3, 2)! as Tile;
    const second = Autotilers.buildBlending(Blocks.conveyor, other, 0, null, true);
    expect(second).toBe(first);

    // 参数是 `other`（3,2），它的方向掩码是 4（只有 direction 2 的邻居 (2,2)）——
    // 而 `first` 现在**也是** 4：因为 `first` 就是同一个数组对象，
    // 早先为 (2,2) 算出的 1 已被就地覆写。
    expect(second[3]).toBe(4);
    expect(first[3]).toBe(4);

    // 而 `ConveyorBuild` 的两条传送带在**各自**的字段里保存了互不干扰的快照:
    // 它们各自被放置时 `onProximityUpdate()` 立刻拷走了当时的值。
    const c1 = conveyorAt(2, 2);
    const c2 = conveyorAt(3, 2);
    expect(c1.blendbits).toBe(0);
    expect(c2.blendbits).toBe(0);
    expect(c1.blending).toBe(0);
    expect(c2.blending).toBe(0);
    // 方向掩码只能**现场重算**（`ConveyorBuild` 不存 `[3]`，见文件头）：
    // 重算 (2,2) 得 1，(3,2) 得 4 —— 两者不同，证明掩码确实随摆放而变。
    expect(maskAt(2, 2, 0)).toBe(1);
    expect(maskAt(3, 2, 0)).toBe(4);
    expect(maskAt(2, 2, 0)).not.toBe(maskAt(3, 2, 0));
  });
});

describe("autotiler: TileBitmask.values 的数据完整性（8 邻域变体表的锚点）", () => {
  test("256 项（8 位掩码的完整索引空间）、取到的变体索引恰好覆盖 0..46；抽样与 Java 表一致", () => {
    const values = TileBitmask.values;
    // ⚠️ Java 的表长是 **256**（`int[256]`，直接按 8 位掩码索引），而不是 47 ——
    //    47 是 `load(String)` 里分配的**变体贴图数量**（`new TextureRegion[47]`），
    //    也是本表所取值的值域。两者容易混淆，故这里把两条都钉死。
    expect(values.length).toBe(256);
    expect(new Set(values).size).toBe(47);
    expect([...new Set(values)].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 47 }, (_v, i) => i)
    );

    // 抽样锚点（直接抄自 `TileBitmask.java`）
    expect(values[0]).toBe(39); // 8 邻域空
    expect(values[1]).toBe(36); // 只有 bit0
    expect(values[5]).toBe(16);
    expect(values[15]).toBe(24); // 低 4 位全 1
    expect(values[26]).toBe(38);
    expect(values[254]).toBe(14);
    expect(values[255]).toBe(13); // 8 邻域全满
  });
});

describe("autotiler: transformCase 的 switch 表（逐 case 写死）", () => {
  test("num = 0..5 与 -1 / 越界值的精确结果（无 default → 完全不动）", () => {
    /** 入参数组的初值与 `buildBlending` 的前 3 步一致: `[0, 1, 1, 0, 0]`。 */
    function apply(num: number): number[]{
      const bits = [0, 1, 1, 0, 0];
      Autotilers.transformCase(num, bits);
      return bits;
    }

    // Java `Autotiler.transformCase` 原文:
    //   case 0 -> bits[0] = 3;
    //   case 1 -> bits[0] = 4;
    //   case 2 -> bits[0] = 2;
    //   case 3 -> { bits[0] = 2; bits[2] = -1; }
    //   case 4 -> { bits[0] = 1; bits[2] = -1; }
    //   case 5 -> bits[0] = 1;
    //   （无 default → 其它值**完全不动**）
    expect(apply(0)).toEqual([3, 1, 1, 0, 0]);
    expect(apply(1)).toEqual([4, 1, 1, 0, 0]);
    expect(apply(2)).toEqual([2, 1, 1, 0, 0]);
    expect(apply(3)).toEqual([2, 1, -1, 0, 0]);
    expect(apply(4)).toEqual([1, 1, -1, 0, 0]);
    expect(apply(5)).toEqual([1, 1, 1, 0, 0]);
    expect(apply(-1)).toEqual([0, 1, 1, 0, 0]);
    expect(apply(6)).toEqual([0, 1, 1, 0, 0]);
  });
});

describe("autotiler: L 型拐角触发 transformCase(5)（blendbits 1，Y 缩放保持 1）", () => {
  test("(5,8) rot0 → (6,8) rot1 → (6,9) rot1：拐角的三项精确值", () => {
    createWorld(16, 16, 1);
    placeBlock(5, 8, Blocks.conveyor, 0);
    placeBlock(6, 8, Blocks.conveyor, 1);
    placeBlock(6, 9, Blocks.conveyor, 1);

    // 拐角 (6,8) 的邻居: direction 0（realDir 1 → (6,9)，它自己的 front）
    // 与 direction 3（realDir 2 → (5,8)，横着接进来的那条）→ mask = 1 | 8 = 9
    expect(maskAt(6, 8, 1)).toBe(9);
    // num 判定链: (2&&1&&3) 假、(1&&3) 假、(1&&2) 假、(3&&2) 假、`bl1` 假、**`bl3` 真** → num = 5
    // → `transformCase(5)`: 只有 `bits[0] = 1`，**`bits[2]` 保持 1**
    //   （对比 `transformCase(3)/(4)` 才把 Y 缩放置 −1 —— 这条差异就是本用例的判别力）
    expect(typeAt(6, 8, 1)).toBe(1);
    const corner = conveyorAt(6, 8);
    expect(corner.blendbits).toBe(1);
    expect(corner.blendsclx).toBe(1);
    expect(corner.blendscly).toBe(1);

    // 两端: (5,8) 只有 direction 0 → mask 1；type -1 → bit[0] 保持 0
    expect(maskAt(5, 8, 0)).toBe(1);
    expect(typeAt(5, 8, 0)).toBe(0);
    expect(conveyorAt(5, 8).blendbits).toBe(0);
    // (6,9) 只有 direction 2 → mask 4；type -1
    expect(maskAt(6, 9, 1)).toBe(4);
    expect(conveyorAt(6, 9).blendbits).toBe(0);
  });
});
