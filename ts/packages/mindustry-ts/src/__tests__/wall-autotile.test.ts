// S4 验收测试 ③: `WallBuild` 的 8 邻域自动拼接（`autotileBits`）。
//
// 为什么它属于 S4 而不是 S3（S3 文件头里写过「死代码」的判断已被推翻）:
//   S3 略过 `updateAutotileBits` / `updateOtherBits` / `onProximityUpdate|Added|Removed` 的理由
//   是「唯一副作用是 `recache()`，headless 下是 no-op」——**这只说对了一半**:
//   `autotileBits` 本身是 Wall 的**真实状态**（`drawCached()` 直接查
//   `TileBitmask.values[autotileBits]`），而 S3 的 `BuildingComp.updateProximity()` 是空实现
//   → 这些回调根本不会被调用。S4 把邻接做成真实现后，它们**真的会跑**，因此补齐。
//
// 位掩码的编号（与 `Geometry.d8` 同序，**必须知道**）:
//   bit0=(+1,0) bit1=(+1,+1) bit2=(0,+1) bit3=(-1,+1)
//   bit4=(-1,0) bit5=(-1,-1) bit6=(0,-1) bit7=(+1,-1)
//
// 断言口径: 位掩码**精确值**（按 `Geometry.d8` 手推，与实现无关地写死）+ 该掩码经
//   `TileBitmask.values` 得到的**变体索引**（这才是这些位的用途）。再加上反事实:
//   关掉 `autotile` 后同一摆放必须全为 0 —— 证明非零值确实来自自动拼接逻辑，
//   而不是「位掩码被别处随手写进去」。
//
// ⚠️ 测试里把 `Blocks.copperWall.autotile` 置为 true: 这是**唯一**能让自动拼接真正执行的开关
//   （Java 里 `copperWall.autotile` 默认也是 false，`Wall.autotile` 只给 tile-gen 生成的
//   墙使用）。每次 `createWorld()` 都会 `Vars.bootstrap()` → 重新 `Blocks.load()` →
//   `Blocks.copperWall` 是**新实例**，因此这个改动不会泄漏到本文件之外。

import { describe, expect, test } from "vitest";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { createWorld, placeBlock } from "../harness.js";
import { Team } from "../game/Team.js";
import { WallBuild } from "../world/blocks/defense/Wall.js";
import { TileBitmask } from "../world/blocks/TileBitmask.js";

/** 取一个 tile 上的墙建筑。 */
function wallAt(x: number, y: number): WallBuild{
  const build = Vars.world.tile(x, y)!.build;
  if(build === null) throw new Error("wallAt: (" + x + "," + y + ") 上没有建筑");
  return build as WallBuild;
}

describe("wall-autotile: 8 邻域位掩码的精确值", () => {
  test("L 形三格墙 → 位掩码 5 / 24 / 192，且经 TileBitmask.values 得到 16 / 38 / 3", () => {
    createWorld(16, 16, 1);
    Blocks.copperWall.autotile = true;

    placeBlock(2, 2, Blocks.copperWall, 0); // 中心（L 的拐角）
    placeBlock(3, 2, Blocks.copperWall, 0); // +x
    placeBlock(2, 3, Blocks.copperWall, 0); // +y

    const corner = wallAt(2, 2);
    const east = wallAt(3, 2);
    const north = wallAt(2, 3);

    // (2,2) 的邻居: +x=(3,2) ✓ bit0、+y=(2,3) ✓ bit2 → 0b101 = 5
    expect(corner.autotileBits).toBe(5);
    // (3,2) 的邻居: (-1,+1)=(2,3) ✓ bit3、(-1,0)=(2,2) ✓ bit4 → 0b11000 = 24
    expect(east.autotileBits).toBe(24);
    // (2,3) 的邻居: (0,-1)=(2,2) ✓ bit6、(+1,-1)=(3,2) ✓ bit7 → 0b11000000 = 192
    expect(north.autotileBits).toBe(192);

    // 这些位的**用途**: `WallBuild.drawCached()` 查 `TileBitmask.values[autotileBits]`
    // 选变体贴图（顺带覆盖了 S4 新增的 `TileBitmask.values` 表）
    expect(TileBitmask.values[corner.autotileBits]).toBe(16);
    expect(TileBitmask.values[east.autotileBits]).toBe(38);
    expect(TileBitmask.values[north.autotileBits]).toBe(3);

    // `updateAutotileBits()` 的返回值是 Java 里 `recache()` 的触发条件
    // （`if(prev != autotileBits) recache();`）。把缓存人为置 0 → 重算产生变化 → true。
    corner.autotileBits = 0;
    expect(corner.updateAutotileBits()).toBe(true);
    expect(corner.autotileBits).toBe(5);
    // 再算一次（缓存已是最新）→ false，不会反复触发 recache
    expect(corner.updateAutotileBits()).toBe(false);
  });

  test("移除中间那一格 → 两端位掩码立即重算（onProximityRemoved → updateOtherBits）", () => {
    createWorld(16, 16, 1);
    Blocks.copperWall.autotile = true;

    placeBlock(2, 2, Blocks.copperWall, 0);
    placeBlock(3, 2, Blocks.copperWall, 0);
    placeBlock(2, 3, Blocks.copperWall, 0);

    const corner = wallAt(2, 2);
    const east = wallAt(3, 2);
    const north = wallAt(2, 3);
    expect(corner.autotileBits).toBe(5);
    expect(east.autotileBits).toBe(24);
    expect(north.autotileBits).toBe(192);

    // 移除 (3,2): `removeFromProximity()` → `onProximityRemoved()` → `updateOtherBits()`
    // → 让 8 邻域里**同方块同队伍且已是中心**的墙各自重算。
    Vars.world.tile(3, 2)!.remove();

    // (2,2) 只剩 +y 的邻居 → bit2 = 4
    expect(corner.autotileBits).toBe(4);
    // (2,3) 只剩 -y 的邻居 → bit6 = 64
    expect(north.autotileBits).toBe(64);
    expect(TileBitmask.values[corner.autotileBits]).toBe(27);
    expect(TileBitmask.values[north.autotileBits]).toBe(3);
  });

  test("异队的同类墙不计入拼接（`other.build.team == team`）", () => {
    createWorld(16, 16, 1);
    Blocks.copperWall.autotile = true;

    placeBlock(2, 2, Blocks.copperWall, 0);
    // 直接用 crux 队伍放第二格（`placeBlock` 固定用默认队伍，这里用 `setBlock`）
    Vars.world.tile(3, 2)!.setBlock(Blocks.copperWall, Team.crux, 0);

    const corner = wallAt(2, 2);
    expect(corner.autotileBits).toBe(0); // 异队邻居 → 不算连接
  });
});

describe("wall-autotile: 反事实 —— 关掉 autotile 后同一摆放必须全为 0", () => {
  test("autotile = false（Java 默认）→ 三个位置都是 0，且回调不会改写它", () => {
    createWorld(16, 16, 1);
    // 断言基线: Java 与 S4 的 `Wall.autotile` 默认都是 false
    expect(Blocks.copperWall.autotile).toBe(false);

    placeBlock(2, 2, Blocks.copperWall, 0);
    placeBlock(3, 2, Blocks.copperWall, 0);
    placeBlock(2, 3, Blocks.copperWall, 0);

    // 同一摆放、同一邻接（`proximity` 照样建立），但 `onProximityUpdate()` 里的
    // `if(autotile) updateAutotileBits();` 不成立 → 位掩码保持初值 0。
    // 这条用例证明了上一个 describe 里的 5 / 24 / 192 **确实来自自动拼接逻辑**。
    expect(wallAt(2, 2).autotileBits).toBe(0);
    expect(wallAt(3, 2).autotileBits).toBe(0);
    expect(wallAt(2, 3).autotileBits).toBe(0);

    // 邻接本身仍然是建立的（不是「因为没邻接所以是 0」）
    expect(wallAt(2, 2).proximity.length).toBe(2);
    expect(wallAt(2, 2).proximity.includes(wallAt(3, 2))).toBe(true);
    expect(wallAt(3, 2).proximity.includes(wallAt(2, 2))).toBe(true);
  });
});
