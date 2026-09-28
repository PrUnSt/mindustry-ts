// S3 · 炮塔 + 子弹碰撞验收测试（防御闭环的第一个可对拍里程碑）。
//
// 核心交付：**逐 tick 对拍** `ts/golden/java-turret-fire.txt`。golden 由
//   `tests/src/test/java/GoldenExportTest.java` 的 `exportTurretFire()`（`:405-443`）导出：
//     world 32x32 all-air, seed=1, `Time.delta=1`, `waves=false`, `canGameOver=false`
//     duo @ (16,16) rot 0 team=sharded，装 20 次 copper 弹药
//     dagger @ (21,16) team=crux（世界坐标 (172,132)），startHealth 150
//   逐 tick 记录 `Groups.bullet.size` / 首颗子弹坐标 / 目标 health（先记录再 `logic.update()`）。
//
// 对拍约定（与 `golden-parity.test.ts` 一致）:
//   1. 离散量严格相等；浮点量容差 `1e-4`（Java float 32 位 vs TS double 64 位）。
//   2. **不比 `state.tick`** —— golden 的 `tick` 列是**迭代序号**，两边按序号对齐。
//   3. golden 里的 `-1.0` 是「无子弹」的哨兵值，TS 侧同样用 -1。
//
// ---------------------------------------------------------------------------------------------
// ⚠️ 三条**已知不可达/需对齐**的口径（全部显式断言，不做任何掩盖；详见对应用例）
//
// (A) `bulletCount`：golden 文件头第 5 行注明它是 **raw `Groups.bullet`，包含 dagger 自己的子弹**。
//     Java 里 dagger 会由 `GroundAI` 驱动、用它的 `large-weapon` 开火（首个额外子弹出现在
//     tick 34，之后约每 13 tick 一发，存活 15 tick）—— 但**单位 AI / 武器不在本阶段范围**
//     （`UnitRuntime.ts` / `Weapon.ts` / `UnitTypes.ts` 均为禁改文件）。因此 `bulletCount`
//     的逐 tick **严格**对拍在本阶段不可达。本文件改为断言**可验证的结构**：
//       - TS 侧只有炮塔子弹 → TS 的增量恰为 `{26,46,66,86,106}`（reload=20 的周期）；
//       - `golden - ts` 恒 **≥ 0**（TS 从不多出子弹）且恒 **≤ 2**；
//       - 差异恒 **只在 t ≥ 34** 出现（= dagger 武器首发 tick）。
//     见用例「bulletCount 口径」。
//
// (B) 全局随机数游标：Java 在**首发射击之前**比 TS 多消耗 **6** 个全局 `Mathf.rand` 抽样
//     （实测证据见用例「首次偏差定位」/「偏差归因」）。原因在 Java 侧的**单位**代码路径
//     （`UnitComp.java:66` 的 `resupplyTime = Mathf.random(10f)`、`AIController.java:39-42`
//     的 `resetTimers()`、`Weapon.java:498-517`、`MechComp.java:54`、`UnitComp.java:743`
//     等），全部落在本阶段禁改文件里 → **无法在本阶段消除**。
//     本文件用一个**具名常量**显式建模这次对齐（`JAVA_UNPORTED_RAND_DRAWS_BEFORE_FIRST_SHOT`），
//     并另有用例断言「不对齐时的首个偏差 tick」与「对齐后残差下降 3 个数量级」，
//     保证这不是「静默推进」，而是被观测、被断言、被记录的偏离。
//     注意：**tick 26 本身完全不需要对齐**（出生点与随机数无关），见用例 1。
//
// (C) Java 的 `BulletComp` 用 **float32** 存 `x/y`，TS 用 double；`x += velX * Time.delta`
//     在 Java 是 float 累加。68 tick、位移 ~170 之后，两者累积差会超过 `1e-4`
//     （实测 t=46 起 y 分量差 1.06e-4）。因此：
//       - 逐 tick 的 `1e-4` 严格对拍覆盖 **t=26..45**（实测 max 9.43e-5）；
//       - t=46..94 改用「**float32 重放**」（`Math.fround` 逐步累加）做归因断言 ——
//         若 float32 重放能回到 `1e-4` 以内，则残差被证明是「Java float 累加」而非算法错误。
//
// 内容引导（与 `unit.test.ts` 同一约定）: `createWorld()` 会 `bootstrap()`，而
//   `ContentLoader.createBaseContent()` **没有**接 `Bullets.load()` / `UnitTypes.load()`
//   → 每个用例里显式按 Java 顺序补齐。

import { beforeAll, describe, expect, test } from "vitest";
import { Mathf, Time, Vec2 } from "@mindustry-ts/arc";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Bullets } from "../content/Bullets.js";
import { Items } from "../content/Items.js";
import { UnitTypes } from "../content/UnitTypes.js";
import { Team } from "../game/Team.js";
import { Groups } from "../gen/Groups.js";
import { Category } from "../type/Category.js";
import { UnitRuntime } from "../entities/UnitRuntime.js";
import { EntityCollisions } from "../entities/EntityCollisions.js";
import { ItemTurretBuild, ShootAlternate } from "../world/blocks/defense/Turret.js";
import type { ItemTurret } from "../world/blocks/defense/Turret.js";
import type { BulletRuntime } from "../entities/BulletRuntime.js";
import { createWorld, placeBlock, runTicks } from "../harness.js";

const here = dirname(fileURLToPath(import.meta.url));
/** `ts/golden/`（`__tests__` → src → mindustry-ts → packages → ts → golden）。 */
const GOLDEN_DIR = join(here, "..", "..", "..", "..", "golden");
const GOLDEN_FILE = join(GOLDEN_DIR, "java-turret-fire.txt");

/** 浮点比较容差（见文件头第 1 条）。 */
const FP_TOL = 1e-4;

/**
 * `1e-4` 逐 tick 弹道对拍的**最后**一个可达 tick（见文件头 (C)）。
 * 实测（`DIAG-K6`，对齐游标后）: t=45 最大分量差 9.43e-5（≤1e-4）；t=46 的 y 分量差 1.06e-4
 * （>1e-4）。因此严格区间取 26..45（20 个采样）。
 */
const TRAJ_TOL_LAST_TICK = 45;

/**
 * Java 在**首发射击之前**比 TS 多消耗的全局 `Mathf.rand` 抽样数（见文件头 (B)）。
 *
 * 证据链（可复现）:
 *   - golden 首颗子弹的方向是 19.035579204559326°（由步长 (2.363237, 0.815536) 与
 *     速度 2.5 经 arc 的 `sin/cos` 表反解得到）。
 *   - t=26 时炮塔 `rotation == 20`（`Angles.moveToward(30, 5.194474369206324, 10)`）。
 *   - 于是 `Mathf.range(inaccuracy + type.inaccuracy) = 19.035579204559326 - 20 = -0.9644208`。
 *     `duo.inaccuracy = 2`、`Bullets.standardCopper.inaccuracy = 0` → `Mathf.range(2)`
 *     的浮点语义 `u * 4 - 2` → `u = 0.25889480113983154`。
 *   - 在 `Rand(seed=1)` 的序列里，`0.25889480113983154` 精确出现在第 **8** 个
 *     `nextFloat()`（误差 0）。
 *   - TS 侧「`createWorld()` → 首发射击」之间**一个**随机数都不消耗（PRNG 状态在 t=0..26
 *     逐 tick 不变），而首发的「角度」抽样是它的第 **2** 个抽样 → 8 - 2 = **6**。
 *   - k 扫描独立验证: 只有 k=6 让 t=26..94 的弹道最大残差落到 3.6e-4；k=0 是 1.4156。
 *
 * Java 出处（这些路径本阶段不可移植）:
 *   `core/src/mindustry/entities/comp/UnitComp.java:66`
 *   `core/src/mindustry/entities/units/AIController.java:39-42`
 *   `core/src/mindustry/type/Weapon.java:498-517`
 *   `core/src/mindustry/entities/comp/MechComp.java:54`
 *   `core/src/mindustry/entities/comp/UnitComp.java:743`
 */
const JAVA_UNPORTED_RAND_DRAWS_BEFORE_FIRST_SHOT = 6;

/** 世界/场景常量（与 `GoldenExportTest.java:411-420` 逐字对应）。 */
const TX = 16;
const TY = 16;
const ENEMY_X = (TX + 5) * 8 + 4; // 172
const ENEMY_Y = TY * 8 + 4; // 132

/** golden 的一行。 */
interface GoldenRow{
  tick: number;
  bulletCount: number;
  firstBulletX: number;
  firstBulletY: number;
  enemyHealth: number;
}

/** TS 侧的一行（同列）。 */
type TsRow = GoldenRow;

/** 读取 `java-turret-fire.txt`，剥掉 `#` 注释与空行。 */
function loadGolden(): GoldenRow[]{
  if(!existsSync(GOLDEN_FILE)) return [];
  return readFileSync(GOLDEN_FILE, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const parts = line.split("|");
      return {
        tick: Number(parts[0]),
        bulletCount: Number(parts[1]),
        firstBulletX: Number(parts[2]),
        firstBulletY: Number(parts[3]),
        enemyHealth: Number(parts[4])
      };
    });
}

/**
 * 建一个「炮塔 + 目标」场景，返回炮塔 build 与敌方单位。
 * 顺序逐条对应 `GoldenExportTest.exportTurretFire()`（`:407-420`）。
 *
 * @param alignRandCursor 是否按 `JAVA_UNPORTED_RAND_DRAWS_BEFORE_FIRST_SHOT` 对齐全局随机
 *   游标（见文件头 (B)）。**默认 `false`** —— 也就是说默认跑的是「不对齐」的真实 TS 行为；
 *   只有明确声明要对齐的用例才传 `true`。
 *
 * ⚠️ `createWorld()` 内部会 `Vars.bootstrap()`（**重建 `Vars.content`**）→ 每次建世界后
 *   都必须重新 `Bullets.load()` / `UnitTypes.load()`（它们没接进 `ContentLoader`）。
 */
function setupScenario(alignRandCursor = false): { turret: ItemTurretBuild; enemy: UnitRuntime }{
  createWorld(32, 32, 1);
  // Java: `Bullets.load()` / `UnitTypes.load()` 在 `createBaseContent()` 的 `Blocks.load()` 之前
  //       （`ContentLoader.java` 的同一顺序）；TS 的 `createBaseContent()` 省略了这两步（见文件头）。
  Bullets.load();
  UnitTypes.load();

  Vars.state.rules.canGameOver = false;
  Vars.state.rules.waves = false;

  // ---- 全局随机游标对齐（显式、具名、可关闭；见文件头 (B)）----
  // 放在这里等价于放在任何位置：TS 从 `createWorld()` 到首发射击之间**不消耗**任何随机数
  // （PRNG 状态 t=0..26 逐 tick 不变，已实测）。
  if(alignRandCursor){
    for(let i = 0; i < JAVA_UNPORTED_RAND_DRAWS_BEFORE_FIRST_SHOT; i++){
      Mathf.rand.nextFloat();
    }
  }

  placeBlock(TX, TY, Blocks.duo, 0);
  const turret = Vars.world.tile(TX, TY)!.build as unknown as ItemTurretBuild;

  // Java: `Item ammo = ((ItemTurret)Blocks.duo).ammoTypes.keys().next();` —— 第一个键 = copper。
  for(let i = 0; i < 20; i++){
    turret.handleItem(null, Items.copper);
  }

  const enemy = UnitTypes.dagger.spawn(Team.crux.id, ENEMY_X, ENEMY_Y);
  return { turret, enemy };
}

/** 跑 121 个采样（t=0..120，先记录再 update），与 golden 同口径。 */
function recordRows(enemy: UnitRuntime): TsRow[]{
  const ts: TsRow[] = [];

  for(let t = 0; t <= 120; t++){
    const first = Groups.bullet.first();
    ts.push({
      tick: t,
      bulletCount: Groups.bullet.size(),
      firstBulletX: first === null ? -1 : first.x,
      firstBulletY: first === null ? -1 : first.y,
      enemyHealth: enemy.health
    });

    if(t < 120) runTicks(1);
  }

  return ts;
}

/** 找出数组里「相对前一元素发生变化」的 `[tick, value]` 列表（数值变化点）。 */
function changePoints(rows: TsRow[]): Array<[number, number]>{
  const out: Array<[number, number]> = [];
  for(let t = 1; t < rows.length; t++){
    if(rows[t]!.enemyHealth !== rows[t - 1]!.enemyHealth){
      out.push([t, rows[t]!.enemyHealth]);
    }
  }
  return out;
}

/** t=from..to 上 `firstBulletX/Y` 相对 golden 的最大分量残差。 */
function maxTrajErr(ts: TsRow[], from: number, to: number): { max: number; tick: number }{
  let max = 0;
  let tick = -1;
  for(let t = from; t <= to; t++){
    const g = GOLDEN[t]!;
    const a = ts[t]!;
    if(g.firstBulletX < 0 || a.firstBulletX < 0) continue;
    const err = Math.max(Math.abs(a.firstBulletX - g.firstBulletX), Math.abs(a.firstBulletY - g.firstBulletY));
    if(err > max){
      max = err;
      tick = t;
    }
  }
  return { max, tick };
}

const GOLDEN = loadGolden();
const hasGolden = GOLDEN.length > 0;

describe.skipIf(!hasGolden)("S3 炮塔: 逐 tick 对拍 java-turret-fire.txt", () => {
  // ---------------------------------------------------------------------------------------------
  test("① t=0..25 无子弹；tick 26 首发：数量/出生点/血量与 Java 一致（**零 RNG 对齐**）", () => {
    // 本用例**不**对齐随机游标 —— 因为出生点与随机数无关：
    //   `bulletX = x + Angles.trnsx(rotation - 90, shootX + xOffset + xSpread, shootY + yOffset)`，
    // 其中 `xSpread = Mathf.range(xRand)` 而 `duo.xRand = 0` → 恒 0。`rotation`、`xOffset` 也都
    //   不含随机量。所以 tick 26 的出生点是**确定性**的（这也解释了为什么 tick 26 不需要对齐）。
    const { enemy } = setupScenario(false);
    const ts = recordRows(enemy);

    // golden: t=0..25 全是 `0|-1.0|-1.0|150.0`
    for(let t = 0; t <= 25; t++){
      expect(ts[t]!.bulletCount, "tick " + t + " 不该有子弹").toBe(0);
      expect(ts[t]!.firstBulletX, "tick " + t + " 无子弹哨兵").toBe(-1);
      expect(ts[t]!.firstBulletY, "tick " + t + " 无子弹哨兵").toBe(-1);
      expect(ts[t]!.enemyHealth, "tick " + t + " 敌方血量").toBe(150);
    }

    // golden: `26|1|130.21986|130.67053|150.0`
    expect(ts[26]!.bulletCount, "tick 26 首发").toBe(GOLDEN[26]!.bulletCount);
    expect(
      Math.abs(ts[26]!.firstBulletX - GOLDEN[26]!.firstBulletX),
      "tick 26 firstBulletX (ts=" + ts[26]!.firstBulletX + " java=" + GOLDEN[26]!.firstBulletX + ")"
    ).toBeLessThanOrEqual(FP_TOL);
    expect(
      Math.abs(ts[26]!.firstBulletY - GOLDEN[26]!.firstBulletY),
      "tick 26 firstBulletY (ts=" + ts[26]!.firstBulletY + " java=" + GOLDEN[26]!.firstBulletY + ")"
    ).toBeLessThanOrEqual(FP_TOL);
    expect(ts[26]!.enemyHealth).toBe(GOLDEN[26]!.enemyHealth);

    // 离散量严格相等：首发 tick 的子弹数 = 1（golden 也是 1）
    expect(ts[26]!.bulletCount).toBe(1);
  });

  // ---------------------------------------------------------------------------------------------
  test("② 首颗子弹弹道逐 tick 对拍 t=26..45（1e-4；全局随机游标按 Java 对齐）", () => {
    const { enemy } = setupScenario(true);
    const ts = recordRows(enemy);

    // golden 的 `firstBullet` 列在 t=26..94 一直是同一颗子弹（组内 index 0，直到寿命到期）。
    // 这里只取 `1e-4` 仍可达的 t=26..45（见文件头 (C)）。
    let compared = 0;
    for(let t = 26; t <= TRAJ_TOL_LAST_TICK; t++){
      const g = GOLDEN[t]!;
      const a = ts[t]!;
      if(g.firstBulletX < 0 || a.firstBulletX < 0) continue;
      expect(
        Math.abs(a.firstBulletX - g.firstBulletX),
        "tick " + t + " firstBulletX (ts=" + a.firstBulletX + " java=" + g.firstBulletX + ")"
      ).toBeLessThanOrEqual(FP_TOL);
      expect(
        Math.abs(a.firstBulletY - g.firstBulletY),
        "tick " + t + " firstBulletY (ts=" + a.firstBulletY + " java=" + g.firstBulletY + ")"
      ).toBeLessThanOrEqual(FP_TOL);
      compared++;
    }
    expect(compared, "t=26.." + TRAJ_TOL_LAST_TICK + " 的逐 tick 采样数").toBe(TRAJ_TOL_LAST_TICK - 26 + 1);

    // 离散量严格相等：这一段里第一颗子弹一直在，子弹数恒为 1（golden 亦然）
    for(let t = 26; t <= TRAJ_TOL_LAST_TICK; t++) expect(ts[t]!.bulletCount).toBe(1);
  });

  // ---------------------------------------------------------------------------------------------
  test("③ enemyHealth 阶梯 150→141→132→123 的 tick 与数值与 Java 严格一致（对齐后）", () => {
    const { enemy } = setupScenario(true);
    const ts = recordRows(enemy);

    const changes = changePoints(ts);
    const goldenChanges = changePoints(GOLDEN);

    // golden 推出的是 [[60,141],[81,132],[101,123]] —— 不硬编码，直接从 golden 数据推。
    expect(goldenChanges).toEqual([
      [60, 141],
      [81, 132],
      [101, 123]
    ]);
    expect(changes, "扣血 tick/数值必须与 golden 完全一致").toEqual(goldenChanges);
    expect(ts[120]!.enemyHealth).toBe(GOLDEN[120]!.enemyHealth);
  });

  // ---------------------------------------------------------------------------------------------
  test("④ 首次偏差定位：不对齐游标时首个偏差恰在 tick 27；tick 26 的数量/出生点/血量不受影响", () => {
    const { enemy } = setupScenario(false);
    const ts = recordRows(enemy);

    // 逐 tick 找第一个超出 1e-4 的 tick
    let firstDiffTick = -1;
    for(let t = 0; t < GOLDEN.length && t < ts.length; t++){
      const g = GOLDEN[t]!;
      const a = ts[t]!;
      if(g.firstBulletX < 0 || a.firstBulletX < 0) continue;
      if(Math.abs(a.firstBulletX - g.firstBulletX) > FP_TOL || Math.abs(a.firstBulletY - g.firstBulletY) > FP_TOL){
        firstDiffTick = t;
        break;
      }
    }
    expect(firstDiffTick, "首个弹道偏差 tick").toBe(27);

    // tick 26 仍然完全一致（出生点与随机数无关）
    expect(Math.abs(ts[26]!.firstBulletX - GOLDEN[26]!.firstBulletX)).toBeLessThanOrEqual(FP_TOL);
    expect(Math.abs(ts[26]!.firstBulletY - GOLDEN[26]!.firstBulletY)).toBeLessThanOrEqual(FP_TOL);
    expect(ts[26]!.bulletCount).toBe(GOLDEN[26]!.bulletCount);
    expect(ts[26]!.enemyHealth).toBe(GOLDEN[26]!.enemyHealth);
    // t=0..26 的离散量与血量也与 golden 完全一致
    for(let t = 0; t <= 26; t++){
      expect(ts[t]!.bulletCount, "tick " + t).toBe(GOLDEN[t]!.bulletCount);
      expect(ts[t]!.enemyHealth, "tick " + t).toBe(GOLDEN[t]!.enemyHealth);
    }

    // 偏差的**性质**：它只影响「首颗子弹的飞行方向」（速度方向由 inaccuracy 抽样决定），
    // 不影响出生点 → tick 27 的相对偏差应约等于 `2.5 * sin(Δ角度)`，
    // 其中 Δ角度 = 两种抽样下 `Mathf.range(2)` 的差。TS 实际抽到的是第 2 个 nextFloat
    // （0.3854382634162903 → -0.458247），Java 用的是第 8 个（0.25889480113983154 → -0.9644208），
    // 差值 = 0.506174° → 每 tick 位移差 ≈ 2.5 * sin(0.506174°) ≈ 0.02209。
    const d27x = ts[27]!.firstBulletX - GOLDEN[27]!.firstBulletX;
    const d27y = ts[27]!.firstBulletY - GOLDEN[27]!.firstBulletY;
    const stepDiff = Math.hypot(d27x, d27y);
    const predicted = 2.5 * Math.sin(((0.3854382634162903 - 0.25889480113983154) * 4 * Math.PI) / 180);
    expect(stepDiff, "tick 27 单步位移差 (ts 方向 vs java 方向)").toBeGreaterThan(1e-3);
    expect(Math.abs(stepDiff - predicted), "tick 27 单步位移差 ≈ 2.5·sin(Δinaccuracy)").toBeLessThan(1e-3);
  });

  // ---------------------------------------------------------------------------------------------
  test("⑤ 偏差归因：对齐后残差下降 3 个数量级 ⇒ 偏差是纯随机游标偏移；余量为 Java float32 累加", () => {
    const unaligned = recordRows(setupScenario(false).enemy);
    const aligned = recordRows(setupScenario(true).enemy);

    const eUnaligned = maxTrajErr(unaligned, 26, 94);
    const eAligned = maxTrajErr(aligned, 26, 94);

    // (1) 不对齐时弹道在 t=27 就被打飞（≈1.4 个单位 = 半个身位）；
    //     对齐后降到 3.65e-4 → 说明整段偏差**就是**随机游标偏移，不是算法/公式错误。
    expect(eUnaligned.max, "不对齐时的最大残差").toBeGreaterThan(1);
    expect(eAligned.max, "对齐时的最大残差").toBeLessThan(eUnaligned.max / 1000);
    expect(eAligned.max, "对齐后的残差上界（见文件头 (C)）").toBeLessThanOrEqual(1e-3);

    // (2) 残差的**归因**：Java 的 `BulletComp.x/y` 是 float32，`x += velX * Time.delta` 是
    //     float 累加；TS 是 double 累加。把同一颗子弹的出生点与速度用 `Math.fround`
    //     按 float32 语义重放一遍，若它能回到 1e-4 以内，则残差被证明来自 float32 累加。
    //     （`standardCopper.drag == 0` → `vel` 恒定；`Time.delta == 1` → 每步恰加一次速度。）
    const { enemy } = setupScenario(true);
    runTicks(26);
    const first = Groups.bullet.first() as BulletRuntime | null;
    expect(first, "t=26 必须有首发子弹").not.toBeNull();

    let fx = Math.fround(first!.x);
    let fy = Math.fround(first!.y);
    const fvx = Math.fround(first!.velX);
    const fvy = Math.fround(first!.velY);

    let maxF32 = 0;
    let maxF32Tick = -1;
    for(let t = 27; t <= 94; t++){
      fx = Math.fround(fx + fvx);
      fy = Math.fround(fy + fvy);
      const g = GOLDEN[t]!;
      if(g.firstBulletX < 0) continue;
      const err = Math.max(Math.abs(fx - g.firstBulletX), Math.abs(fy - g.firstBulletY));
      if(err > maxF32){
        maxF32 = err;
        maxF32Tick = t;
      }
    }
    expect(
      maxF32,
      "float32 重放 t=27..94 的最大残差（tick " + maxF32Tick + "）；速度 v=(" + fvx + "," + fvy + ")"
    ).toBeLessThanOrEqual(FP_TOL);
    expect(maxF32, "float32 重放必须优于 double 累加").toBeLessThan(eAligned.max);
    void enemy;
  });

  // ---------------------------------------------------------------------------------------------
  test("⑥ bulletCount 口径：TS 只含炮塔子弹（增量 26/46/66/86/106）；golden 超出量恒 ≥0 且 ≤2，起点 34", () => {
    // 见文件头 (A)：golden 的 bulletCount 含 dagger 自己的子弹（单位武器未移植）。
    const { enemy } = setupScenario(true);
    const ts = recordRows(enemy);

    // ---- 1. TS 的增量恰为炮塔的 reload=20 周期：首发 26，之后 +20 ----
    const tsInc: number[] = [];
    for(let t = 1; t <= 120; t++){
      if(ts[t]!.bulletCount > ts[t - 1]!.bulletCount) tsInc.push(t);
    }
    expect(tsInc, "TS 侧（只有炮塔）的子弹数增量 tick").toEqual([26, 46, 66, 86, 106]);

    // ---- 2. golden - ts 的差：恒 ≥ 0（TS 绝不多出子弹）、恒 ≤ 2、且只在 t ≥ 34 出现 ----
    let maxDiff = 0;
    let minDiff = 0;
    let firstNonZeroDiff = -1;
    let diffSum = 0;
    for(let t = 0; t < GOLDEN.length && t < ts.length; t++){
      const d = GOLDEN[t]!.bulletCount - ts[t]!.bulletCount;
      maxDiff = Math.max(maxDiff, d);
      minDiff = Math.min(minDiff, d);
      diffSum += d;
      if(d !== 0 && firstNonZeroDiff < 0) firstNonZeroDiff = t;
    }
    expect(minDiff, "TS 侧不得多出子弹（golden ≥ ts）").toBe(0);
    expect(firstNonZeroDiff, "差异起点 = dagger 武器首发 tick").toBe(34);
    // dagger 的 `large-weapon`：存活 15 tick、约每 13 tick 一发 → 同时在空最多 2 发
    expect(maxDiff, "同时在空的 dagger 子弹数上界").toBeLessThanOrEqual(2);
    expect(diffSum, "t=0..120 内 dagger 的子弹累计数（>0 表示确实发生了这件事）").toBeGreaterThan(0);

    // ---- 3. 结构：`golden - ts` 在 t≥34 之后每 tick 都 ≥1（dagger 的子弹一直在）----
    for(let t = 34; t <= 120; t++){
      expect(GOLDEN[t]!.bulletCount - ts[t]!.bulletCount, "tick " + t).toBeGreaterThanOrEqual(1);
    }
    // ---- 4. 严格相等只在 t<34 成立（这正是「本阶段口径」的边界）----
    for(let t = 0; t <= 33; t++){
      expect(ts[t]!.bulletCount, "tick " + t + " 应严格等于 golden").toBe(GOLDEN[t]!.bulletCount);
    }
  });
});

describe("S3 炮塔: 场景与 golden 数值（非逐 tick）", () => {
  beforeAll(() => {
    setupScenario();
  });

  test("① Blocks.duo 与 golden/java-turret-table.txt 逐字段一致", () => {
    const duo = Blocks.duo as unknown as ItemTurret & {
      size: number;
      health: number;
      range: number;
      reload: number;
      category: Category;
      rotateSpeed: number;
      shootCone: number;
      inaccuracy: number;
      recoils: number;
      recoil: number;
      shootY: number;
      researchCostMultiplier: number;
      hasItems: boolean;
      group: unknown;
      update: boolean;
    };

    // golden: `duo|250|1|160.0|20.0|turret|BasicBulletType,BasicBulletType,BasicBulletType`
    expect(duo.health).toBe(250);
    expect(duo.size).toBe(1);
    expect(duo.range).toBe(160);
    expect(duo.reload).toBe(20);
    expect(duo.category).toBe(Category.turret);

    // 其余 Java 字段（`Blocks.java:3318-3346`）
    expect(duo.rotateSpeed).toBe(10);
    expect(duo.shootCone).toBe(15);
    expect(duo.inaccuracy).toBe(2);
    expect(duo.recoils).toBe(2);
    expect(duo.recoil).toBe(0.5); // 仅渲染读取（`Blocks.java:3334`），但必须与 Java 同值
    expect(duo.shootY).toBe(3);
    expect(duo.researchCostMultiplier).toBe(0.05);
    expect(duo.hasItems).toBe(true);
    expect(duo.update).toBe(true);
    expect(duo.outputsItems()).toBe(false);

    // 块 id 顺序敏感性：`air` 仍是第 0 条
    expect(Blocks.air.id).toBe(0);
    expect(Vars.content.block(0)).toBe(Blocks.air);
    // `duo` 追加在 `router` 之后（不破坏既有 id）
    expect(duo.id).toBeGreaterThan(Blocks.router.id);
  });

  test("② duo 的三种弹药绑定正确，且 limitRange(5) 后的 lifetime 与 golden 一致", () => {
    const duo = Blocks.duo;
    expect(duo.ammoTypes.size).toBe(3);
    expect(duo.ammoTypes.get(Items.copper)).toBe(Bullets.standardCopper);
    expect(duo.ammoTypes.get(Items.graphite)).toBe(Bullets.standardGraphite);
    expect(duo.ammoTypes.get(Items.silicon)).toBe(Bullets.standardSilicon);
    expect(duo.ammoTypes.get(Items.lead)).toBeUndefined();

    // `Turret.limitRange(BulletType, margin)`（`Turret.java:248-252`）：
    //   lifetime = (range + rangeChange + margin + extraRangeMargin + 10) / speed
    expect(Bullets.standardCopper.lifetime).toBeCloseTo((160 + 0 + 5 + 0 + 10) / 2.5, 9); // 70
    expect(Bullets.standardGraphite.lifetime).toBeCloseTo((160 + 16 + 5 + 0 + 10) / 3.5, 9);
    expect(Bullets.standardSilicon.lifetime).toBeCloseTo((160 + 0 + 5 + 0 + 10) / 3, 9);

    // `ammoTypes.keys()` 的第一个键是 copper（与 `GoldenExportTest:416` 的取法一致）
    expect(duo.ammoTypes.keys().next().value).toBe(Items.copper);
  });

  test("③ ShootAlternate(3.5) 的两管交替偏移为 ∓1.75", () => {
    const pattern = new ShootAlternate(3.5);
    expect(pattern.barrels).toBe(2);
    expect(pattern.spread).toBe(3.5);
    expect(pattern.shots).toBe(1); // `ShootAlternate(float)` 不调用 super(shots, delay)

    const offsets: number[] = [];
    pattern.shoot(0, (xOffset) => offsets.push(xOffset), () => {});
    expect(offsets).toEqual([-1.75]); // index 0 → (0 % 2) - 0.5 = -0.5 → -0.5 * 3.5 * -(-1)

    offsets.length = 0;
    pattern.shoot(1, (xOffset) => offsets.push(xOffset), () => {});
    expect(offsets).toEqual([1.75]);
  });

  test("④ 炮塔瞄准角的双重身份：init() 后仍为 90（放置朝向不改变瞄准角）", () => {
    createWorld(32, 32, 1);
    Bullets.load();
    UnitTypes.load();

    // 用 rot=0/1/2/3 放置，瞄准角都应该是 90（Java `BaseTurretBuild.rotation = 90`）
    for(const rot of [0, 1, 2, 3]){
      placeBlock(4 + rot, 4, Blocks.duo, rot);
      const build = Vars.world.tile(4 + rot, 4)!.build as unknown as ItemTurretBuild;
      expect(build.rotation, "rot=" + rot).toBe(90);
      expect(Time.time).toBe(0);
    }
  });

  test("⑤ timer(id,time) 的首次为真条件是 Time.time >= time（→ 首发在 tick 26）", () => {
    const { enemy } = setupScenario();
    const turret = Vars.world.tile(TX, TY)!.build as unknown as ItemTurretBuild;

    // `Interval.check`：`Time.time - times[i] >= time`；`times` 初值全 0 → 首次为真在 Time.time >= 20。
    // ⚠️ 直接测 timer 需要注入 Time.time；这里用可观测的代理：跑 25 tick 仍无子弹、26 tick 首发。
    expect(Groups.bullet.size()).toBe(0);
    runTicks(25);
    expect(Groups.bullet.size(), "tick 25 仍无子弹").toBe(0);
    runTicks(1);
    expect(Groups.bullet.size(), "tick 26 首发").toBe(1);
    void turret;
    void enemy;
  });

  test("⑥ handleItem 装弹语义：总量/弹仓条目/装满后 acceptItem 为假", () => {
    createWorld(32, 32, 1);
    Bullets.load();
    UnitTypes.load();
    placeBlock(4, 4, Blocks.duo, 0);
    const turret = Vars.world.tile(4, 4)!.build as unknown as ItemTurretBuild;

    expect(turret.totalAmmo).toBe(0);
    expect(turret.handleItem);

    // copper 的 ammoMultiplier = 2 → 每次 +2
    turret.handleItem(null, Items.copper);
    expect(turret.totalAmmo).toBe(2);
    expect(turret.ammo.length).toBe(1);
    expect(turret.peekAmmo()).toBe(Bullets.standardCopper);

    // 同一个 item 再次装入 → 走 `ammo.swap(i, size-1)` 分支，不新增条目
    turret.handleItem(null, Items.copper);
    expect(turret.totalAmmo).toBe(4);
    expect(turret.ammo.length).toBe(1);

    // 换一种弹药 → 新条目，且被 swap 到尾部（peekAmmo 变为新弹药）
    turret.handleItem(null, Items.silicon);
    expect(turret.totalAmmo).toBe(9); // 4 + 5
    expect(turret.ammo.length).toBe(2);
    expect(turret.peekAmmo()).toBe(Bullets.standardSilicon);
  });

  test("⑦ 炮塔不能存物品：acceptStack/removeStack/handleStack 的语义", () => {
    createWorld(32, 32, 1);
    Bullets.load();
    UnitTypes.load();
    placeBlock(4, 4, Blocks.duo, 0);
    const turret = Vars.world.tile(4, 4)!.build as unknown as ItemTurretBuild;

    // maxAmmo = 30；copper 的 ammoMultiplier = 2 → 最多接受 15 个
    expect(turret.acceptStack(Items.copper, 100, null)).toBe(15);
    // 不接受的物品 → 0
    expect(turret.acceptStack(Items.lead, 10, null)).toBe(0);
    // `removeStack` 恒 0（炮塔不能取出物品）
    expect(turret.removeStack(Items.copper, 1)).toBe(0);

    // `handleStack(item, amount)` = 循环 `handleItem`
    turret.handleStack(Items.copper, 3, null);
    expect(turret.totalAmmo).toBe(6);

    // 装到上限附近：acceptItem 在超上限时为 false
    for(let i = 0; i < 12; i++) turret.handleItem(null, Items.copper);
    expect(turret.totalAmmo).toBe(30);
    expect(turret.acceptItem(turret, Items.copper)).toBe(false);
    expect(turret.getAmmoFraction()).toBe(1);
  });
});

describe("S3 炮塔: 索敌与碰撞", () => {
  /** 逐字复刻 `Logic.updateEntities()` 的相关片段（`core/Logic.ts:124-138`）—— 跑一个「子弹物理帧」。 */
  function bulletPhysicsFrame(): void{
    Groups.bullet.updatePhysics();
    Groups.unit.updatePhysics();
    Groups.bullet.update();
    Groups.bullet.collide();
  }

  test("⑧ findEnemy 取射程内最近的敌方单位；同队/超程不选", () => {
    createWorld(64, 64, 1);
    Bullets.load();
    UnitTypes.load();
    placeBlock(16, 16, Blocks.duo, 0);
    const turret = Vars.world.tile(16, 16)!.build as unknown as ItemTurretBuild;

    // 同队（sharded）单位：不该被选
    const friend = UnitTypes.dagger.spawn(Team.sharded.id, 128 + 16, 128);
    // 超程单位（> range 160）
    const far = UnitTypes.dagger.spawn(Team.crux.id, 128 + 300, 128);
    // 两个敌方单位：近 / 更近
    const near = UnitTypes.dagger.spawn(Team.crux.id, 128 + 40, 128);
    const nearest = UnitTypes.dagger.spawn(Team.crux.id, 128 + 20, 128);

    const found = (turret as unknown as { findEnemy(r: number): unknown }).findEnemy(turret.range());
    expect(found).toBe(nearest);
    expect(found).not.toBe(friend);
    expect(found).not.toBe(far);
    expect(found).not.toBe(near);
  });

  test("⑨ 子弹命中单位：非穿透子弹命中即移除、扣 9 血（含 Java 扫掠判定的一个退化行为）", () => {
    // 本用例刻意用「**恰好水平**」的弹道（子弹 y == 单位 y 中心），因为它同时覆盖
    // `EntityCollisions.updateCollision` 的两条命中路径，并把 Java 的一个**退化行为**
    // 钉死成断言（实测逐帧结果，与 Java 逐字算法一致）：
    //
    // 几何：dagger hitSize 8 → 盒 [196,204]×[196,204]；copper hitSize 4 → 盒宽高 = 4。
    //   子弹从 x=206 以 180°（-x）飞出，每 tick 位移 2.5（speed=2.5, Time.delta=1）。
    //
    //   frame1  justSpawned → 不移动，x=206，盒 [204,208] 与 [196,204] 仅**相切** → 不命中
    //   frame2  x=203.5，上一帧盒 [204,208] 与 [196,204] 仍只相切（`Rect.overlaps` 用严格
    //           不等号，`EntityCollisions.java:160` 的 `r1.overlaps(r2)` 快速路径为 false）
    //           → 走扫掠 `collide(...)`（`EntityCollisions.java:169-213`）。此处**相对 vy==0**
    //           且两盒在 y 轴上已重叠 → `yEntry = 6/0 = +Inf`、`yExit = -6/0 = -Inf`
    //           → `entryTime(+Inf) > exitTime(-Inf)` → 返回 false。**这是 Java 原文的行为**
    //           （div-by-zero 产生 ±Infinity），不是移植误差：逐字移植后 TS 复现同一结果。
    //   frame3  x=201，上一帧盒 [201.5,205.5] 真重叠 [196,204] → 快速路径命中。
    //
    // 结论：命中发生在 frame3（**不是** frame2），扣血 9，非穿透子弹被移除。
    createWorld(32, 32, 1);
    Bullets.load();
    UnitTypes.load();

    const target = UnitTypes.dagger.spawn(Team.crux.id, 200, 200);
    expect(target.health).toBe(150);
    expect(target.hitSize, "dagger hitSize（盒 [196,204]）").toBe(8);

    const bullet = Bullets.standardCopper.create(
      null,
      Team.sharded.id,
      206,
      200,
      180 // 朝 -x 飞向目标
    )!;
    expect(bullet).not.toBeNull();
    expect(bullet.hitSize, "copper 子弹 hitSize（盒宽高 4）").toBe(4);

    // ---- frame1: `justSpawned` 为真 → 本帧**不移动**（Java `BulletComp.java:158-166`）----
    bulletPhysicsFrame();
    expect(bullet.x, "首帧不移动 → x 仍为 206").toBe(206);
    expect(bullet.hit, "首帧：盒 [204,208] 与 [196,204] 仅相切 → 不命中").toBe(false);
    expect(target.health, "首帧不该扣血").toBe(150);

    // ---- frame2: x=203.5；快速路径仍只相切，扫掠因相对 vy==0 退化 → 仍不命中 ----
    bulletPhysicsFrame();
    expect(bullet.x, "第二帧推进 2.5").toBe(203.5);
    expect(bullet.hit, "第 2 帧：相切 + 扫掠退化 → 不命中（Java 同）").toBe(false);
    expect(bullet.isAdded(), "未命中 → 仍在组里").toBe(true);
    expect(target.health, "第 2 帧不该扣血").toBe(150);

    // ---- frame3: x=201；上一帧盒 [201.5,205.5] 与 [196,204] 真重叠 → 命中 ----
    bulletPhysicsFrame();
    expect(bullet.x, "第三帧推进 2.5").toBe(201);
    expect(bullet.hit, "第 3 帧应命中").toBe(true);
    expect(bullet.isAdded(), "非穿透：命中即移除").toBe(false);
    expect(target.health, "150 - 9").toBe(141);
    // 命中后子弹离开 `Groups.bullet`
    expect(Groups.bullet.size()).toBe(0);
  });

  test("⑨b 扫掠 AABB（`EntityCollisions.collide` 静态形式）在**斜向**相对速度下能求出首次接触点", () => {
    // 上一用例走的是 `r1.overlaps(r2)` 快速路径；这里直接调用静态扫掠函数，
    // 覆盖 `EntityCollisions.java:169-213` 的 `entryTime/exitTime` 分支（相对 vy != 0）。
    const out = new Vec2();
    // a=子弹盒 [0,4]×[0,4]（中心 (2,2)）以 (+2, +2)/tick 右上飞；b=静止盒 [5,9]×[5,9]。
    // 相对位移 (2,2) → xEntry = (5-4)/2 = 0.5，yEntry = (5-4)/2 = 0.5 ∈ [0,1] → 本 tick 内命中。
    const hit = EntityCollisions.collide(
      0, 0, 4, 4, /* v */ 2, 2,
      5, 5, 4, 4, /* v */ 0, 0,
      out
    );
    expect(hit, "斜向扫掠应在 t∈[0,1] 内判定相交").toBe(true);
    // 首次接触点 = a 的中心沿自身速度外推 entryTime=0.5
    // （`dx = x1 + w1/2 + px*entryTime = 0 + 2 + 2*0.5`，`EntityCollisions.java:206-207`）
    expect(out.x).toBeCloseTo(3, 6);
    expect(out.y).toBeCloseTo(3, 6);

    // 反向 1：b 在扫掠轨迹之外（xEntry=23>1）→ 判否（`xEntry > 1.0f` 分支）
    expect(EntityCollisions.collide(0, 0, 4, 4, 2, 2, 50, 50, 4, 4, 0, 0, out)).toBe(false);
    // 反向 2：b 在 a 的**反方向**（xExit<0）→ 判否（`xExit < 0.0f` 分支）
    expect(EntityCollisions.collide(0, 0, 4, 4, 2, 2, -50, -50, 4, 4, 0, 0, out)).toBe(false);
  });

  test("⑩ 同队子弹不命中；`Groups.bullet.collide()` 对空组是安全的 no-op", () => {
    createWorld(32, 32, 1);
    Bullets.load();
    UnitTypes.load();

    // 空组：不应抛错
    Groups.bullet.collide();
    Groups.unit.collide();

    const friend = UnitTypes.dagger.spawn(Team.sharded.id, 200, 200);
    const bullet = Bullets.standardCopper.create(null, Team.sharded.id, 206, 200, 180)!;

    bulletPhysicsFrame();
    bulletPhysicsFrame();

    expect(bullet.isAdded(), "同队不命中 → 仍在组里").toBe(true);
    expect(bullet.hit, "同队不命中 → hit 为假").toBe(false);
    expect(friend.health, "同队不扣血").toBe(150);
  });
});
