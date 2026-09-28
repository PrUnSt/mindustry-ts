// S4 · 波次系统验收测试（防御闭环的最后一块：炮塔 → 子弹 → 单位 → **波次**）。
//
// 核心交付：**逐波对拍** `ts/golden/java-wave.txt`。golden 由
//   `tests/src/test/java/GoldenExportTest.java` 的 `exportWave()`（`:453-508`）导出：
//     world 32x32 all-air, seed=1, `Time.delta=1`, `canGameOver=false`, `waveTimer=false`
//     `rules.spawns` = 1 组：`dagger` ×3（begin=0 / spacing=1 / unitAmount=3 / max=100）
//     spawn 标记：`world.tile(2,2).setOverlay(Blocks.spawn)` → `spawner.reset()`
//     driver：`logic.runWave()` ×3，每次之间 130 次 `logic.update()`
//     记录：`state.wave` | `Groups.unit.size()` | 按类型名聚合（排序）
//
// 对拍约定（与 `golden-parity.test.ts` / `turret.test.ts` 一致）：
//   - 三列全是**离散量**（波号 / 单位数 / 聚合字符串）→ **严格相等**，不放容差。
//   - 不比较 `state.tick`（golden 里没有该列）。
//   - 若对拍不吻合：**不放宽断言**，而是让失败信息带上「第几波 / 期望 / 实际」。
//
// ---------------------------------------------------------------------------------------------
// ⚠️ 与 Java 导出器的**逐点对应**（复刻方式，见交付报告第 9 条）
//
//   Java `GoldenExportTest.java:455`   `createWorld(32, 32, 1)`
//     → TS `createWorld(32, 32, 1)`（`harness.ts`）。Java 侧做 `logic.reset()` +
//       `state.set(playing)` + `Time.clear()` + `Mathf.rand.setSeed(1)` +
//       `world.loadGenerator(w,h, tiles -> tiles.fill())`；TS harness 逐条等价
//       （`Vars.bootstrap()` 重建 `state`（wave 归 1）+ `Time.clear()` + `setInternalTime(0)`
//       + `Mathf.rand.setSeed(seed)` + `loadGenerator`）。
//   Java `:456-458`                    `canGameOver=false; waves=true; waveTimer=false`
//   Java `:461-467`                    `rules.spawns.clear(); new SpawnGroup(dagger)
//                                       begin=0 / spacing=1 / unitAmount=3 / max=100`
//   Java `:469-471`                    `world.tile(2,2).setOverlay(Blocks.spawn); spawner.reset();`
//     → TS 侧 `Blocks.spawn` 未移植（`content/Blocks.ts` 在本阶段禁改）→ 用
//       **同名内容** `new OverlayFloor("spawn")` 作为标记；`Spawner.reset()` 按
//       `Vars.content.block("spawn")` 解析（见 `game/Spawner.ts` 文件头「必要替代」）。
//   Java `:474`                        `state.wavetime = 99999f`（阻止 `update()` 自动 runWave
//                                       干扰手动推进；且 `waveTimer=false` 使递减块整体跳过）
//   Java `:484-505`                    3 次 `logic.runWave()`，每次之间 130 次 `logic.update()`
//   Java `:491-504`                    聚合：收集 `u.type.name` → `sort()` → 连续同值合并 `name:count`
//
// ⚠️ 内容引导：`createWorld()` 会 `Vars.bootstrap()`（`ContentLoader.createBaseContent()` 里
//   **没有** `Bullets.load()` / `UnitTypes.load()` 的调用点）→ 每个用例显式补
//   `Bullets.load(); UnitTypes.load();`（与 Java `ContentLoader` 的 bullet → unit 顺序一致）。
//
// ⚠️ 本文件用**自己的** `new Logic()` 同时驱动 `runWave()` 与 `update()`（`Logic` 无实例状态，
//   全部读写 `Vars.state`）。这样 `Logic.runWave()` 这条接线被真实覆盖（golden 的 driver 就是
//   `logic.runWave()`），而不必绕到 `Vars.spawner.runWave()`。

import { beforeAll, describe, expect, test } from "vitest";
import { Time } from "@mindustry-ts/arc";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Bullets } from "../content/Bullets.js";
import { UnitTypes } from "../content/UnitTypes.js";
import { Logic } from "../core/Logic.js";
import { SpawnGroup } from "../game/Spawner.js";
import { Team } from "../game/Team.js";
import { Groups } from "../gen/Groups.js";
import { OverlayFloor } from "../world/blocks/environment/OverlayFloor.js";
import { createWorld } from "../harness.js";
import type { UnitRuntime } from "../entities/UnitRuntime.js";

/**
 * 内容引导：`Vars.bootstrap()` 必须先于任何 `Content` 构造（构造器读 `Vars.content`）。
 * 与 `unit.test.ts` 同一约定。`createWorld()` 会再次 `bootstrap()`（幂等），无副作用。
 */
beforeAll(() => {
  Vars.bootstrap();
  Bullets.load();
  UnitTypes.load();
});

const here = dirname(fileURLToPath(import.meta.url));
/** `ts/golden/`（`__tests__` → src → mindustry-ts → packages → ts → golden）。 */
const GOLDEN_DIR = join(here, "..", "..", "..", "..", "golden");
const GOLDEN_FILE = join(GOLDEN_DIR, "java-wave.txt");

/** golden 的一行。 */
interface GoldenRow{
  /** `state.wave`。 */
  wave: number;
  /** `Groups.unit.size()`。 */
  unitCount: number;
  /** `name:count,name:count`（按名字排序）。 */
  unitTypes: string;
}

/** 读取 `java-wave.txt`，剥掉 `#` 注释与空行。 */
function loadGolden(): GoldenRow[]{
  if(!existsSync(GOLDEN_FILE)) return [];
  return readFileSync(GOLDEN_FILE, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const parts = line.split("|");
      return {
        wave: Number(parts[0]),
        unitCount: Number(parts[1]),
        unitTypes: parts[2] ?? ""
      };
    });
}

/** 把 `Groups.unit` 按类型名聚合（排序后合并连续同值），与 Java 导出器 `:491-504` 同口径。 */
function aggregateUnitTypes(): string{
  const names: string[] = [];
  for(const u of Groups.unit){
    names.push((u as unknown as UnitRuntime).type!.name);
  }
  // Java `Seq.sort()`（无比较器）= `String.compareTo` 字典序；JS 默认 `Array#sort` 对字符串
  // 也是 UTF-16 code unit 字典序 —— 对 ASCII 内容名完全一致。
  names.sort();

  const out: string[] = [];
  for(let k = 0; k < names.length; ){
    let j = k;
    while(j < names.length && names[j] === names[k]) j++;
    out.push(names[k]! + ":" + String(j - k));
    k = j;
  }
  return out.join(",");
}

/**
 * 建一个与 `GoldenExportTest.exportWave()`（`:453-508`）同形的波次场景。
 *
 * @returns 本次场景的 `Logic` 实例（`runWave()` / `update()` 都由它驱动）。
 */
function setupWaveScenario(options?: { waveTimer?: boolean }): Logic{
  createWorld(32, 32, 1);
  // Java: 内容在 `launchApplication()` 里已全部加载；TS 的 `createBaseContent()` 省略了
  // `Bullets.load()` / `UnitTypes.load()`（见文件头「内容引导」）。
  Bullets.load();
  UnitTypes.load();

  const state = Vars.state;
  state.rules.canGameOver = false;
  state.rules.waves = true;
  state.rules.waveTimer = options?.waveTimer ?? false;

  // 固定刷怪配置：每波 3 个 dagger（`GoldenExportTest.java:461-467`）
  state.rules.spawns.clear();
  const group = new SpawnGroup(UnitTypes.dagger);
  group.begin = 0;
  group.spacing = 1;
  group.unitAmount = 3;
  group.max = 100;
  state.rules.spawns.add(group);

  // 一个出生点（`GoldenExportTest.java:470-471`）。TS 用同名 `OverlayFloor("spawn")` 作为
  // `Blocks.spawn` 的等价物（见文件头）。
  const spawnOverlay = new OverlayFloor("spawn");
  Vars.world.tile(2, 2)!.setOverlay(spawnOverlay);
  Vars.spawner.reset();

  // 阻止 `update()` 里的自动 runWave 干扰手动推进（`GoldenExportTest.java:474`）
  state.wavetime = 99999;

  return new Logic();
}

const GOLDEN = loadGolden();
const hasGolden = GOLDEN.length > 0;

describe.skipIf(!hasGolden)("S4 波次: 逐波对拍 java-wave.txt", () => {
  test("① 三轮 runWave 的 wave / unitCount / unitTypes 与 Java 严格一致", () => {
    const logic = setupWaveScenario();
    const state = Vars.state;

    // 起点断言（弄清 golden「第一行 wave=2」的由来，`GoldenExportTest.java:449-451`）：
    // `state.wave` 初值 1，`runWave()` **先** spawnEnemies（用 `state.wave - 1 = 0` 缩放）
    // **后** `state.wave++` → 第一次记录到的 wave 号自然是 2。
    expect(state.wave, "runWave 之前 state.wave 应为 1（GameState.wave 初值）").toBe(1);
    expect(Vars.spawner.countSpawns(), "出生点数量").toBe(1);

    const actual: GoldenRow[] = [];
    for(let i = 0; i < 3; i++){
      logic.runWave();
      for(let t = 0; t < 130; t++){
        logic.update();
      }
      actual.push({
        wave: state.wave,
        unitCount: Groups.unit.size(),
        unitTypes: aggregateUnitTypes()
      });
    }

    // ---- 逐波严格对拍（离散量，无容差）----
    expect(GOLDEN.length, "golden 行数").toBe(3);
    for(let i = 0; i < GOLDEN.length; i++){
      const g = GOLDEN[i]!;
      const a = actual[i]!;
      const label = "第 " + String(i + 1) + " 次记录（期望 wave=" + String(g.wave) + "）";

      expect(a.wave, label + " 的 state.wave").toBe(g.wave);
      expect(
        a.unitCount,
        label + " 的 Groups.unit.size()（期望 " + String(g.unitCount) + "，实际 " + String(a.unitCount) + "）"
      ).toBe(g.unitCount);
      expect(
        a.unitTypes,
        label + " 的类型聚合（期望 '" + g.unitTypes + "'，实际 '" + a.unitTypes + "'）"
      ).toBe(g.unitTypes);
    }

    // ---- 把 golden 的三行值显式钉死（防止「golden 被改宽」而测试悄悄通过）----
    expect(GOLDEN.map((r) => r.wave + "|" + String(r.unitCount) + "|" + r.unitTypes)).toEqual([
      "2|3|dagger:3",
      "3|6|dagger:6",
      "4|9|dagger:9"
    ]);

    // ---- 第一处偏离（若上面失败，这里给出**可读的定位**）----
    let firstDiff = -1;
    for(let i = 0; i < Math.min(GOLDEN.length, actual.length); i++){
      const g = GOLDEN[i]!;
      const a = actual[i]!;
      if(a.wave !== g.wave || a.unitCount !== g.unitCount || a.unitTypes !== g.unitTypes){
        firstDiff = i;
        break;
      }
    }
    expect(
      firstDiff,
      "第一处偏离的记录下标（-1 = 完全吻合）；期望 " +
        JSON.stringify(GOLDEN) +
        " 实际 " +
        JSON.stringify(actual)
    ).toBe(-1);
  });
});

describe("S4 波次: 规则默认值与 Java 一致", () => {
  test("② Rules 的波次相关字段默认值逐条对齐 Rules.java", () => {
    createWorld(8, 8, 1);
    const r = Vars.state.rules;

    // 默认值来源：core/src/mindustry/game/Rules.java
    expect(r.waves, "waves（`Rules.java:37`）").toBe(false);
    expect(r.waveTimer, "waveTimer（`Rules.java:33`）").toBe(true);
    expect(r.waveSending, "waveSending（`Rules.java:35`）").toBe(true);
    expect(r.waitEnemies, "waitEnemies（`Rules.java:49`）").toBe(false);
    expect(r.attackMode, "attackMode（`Rules.java:51`）").toBe(false);
    // `waveSpacing = 2 * Time.toMinutes`（`Rules.java:153`）+ `Time.toMinutes = 60*60`（`util/Time.ts:31`）
    expect(r.waveSpacing, "waveSpacing（`Rules.java:153`）").toBe(2 * Time.toMinutes);
    expect(r.waveSpacing, "waveSpacing 数值").toBe(7200);
    expect(r.initialWaveSpacing, "initialWaveSpacing（`Rules.java:155`）").toBe(0);
    expect(r.winWave, "winWave（`Rules.java:157`）").toBe(0);
    expect(r.waveTeam, "waveTeam（`Rules.java:217`）").toBe(Team.crux);
    expect(r.waveTeam.id, "waveTeam.id").toBe(2);
    expect(r.spawns.size, "spawns 默认为空（`Rules.java:181`）").toBe(0);
    expect(r.airUseSpawns, "airUseSpawns（`Rules.java:39`）").toBe(false);
    expect(r.wavesSpawnAtCores, "wavesSpawnAtCores（`Rules.java:41`）").toBe(true);
    expect(r.dropZoneRadius, "dropZoneRadius（`Rules.java:151`）").toBe(300);

    // ⚠️ 任务书提到的 `maxWaves` / `waveCountdown` **在 Java `Rules.java` 里不存在**
    //    （已全仓 grep 核实：只有 `SStat.maxWavesSurvived` 与 `Achievement.survive100Waves`）。
    //    本移植**不**发明字段；波次数量上限由 `SpawnGroup.max` 承担（见用例 ⑦）。
    expect("maxWaves" in (r as unknown as Record<string, unknown>), "Rules 不应有 maxWaves").toBe(false);
    expect("waveCountdown" in (r as unknown as Record<string, unknown>), "Rules 不应有 waveCountdown").toBe(false);
  });
});

describe("S4 波次: SpawnGroup.getSpawned 公式", () => {
  test("③ begin / end / spacing / unitScaling / max 的逐条公式（对照 SpawnGroup.java:67-73）", () => {
    // 基准：与 golden 同配置
    const base = new SpawnGroup(UnitTypes.dagger);
    base.begin = 0;
    base.spacing = 1;
    base.unitAmount = 3;
    base.max = 100;

    // `end = never`（Integer.MAX_VALUE）→ 永不结束
    expect(base.end).toBe(SpawnGroup.never);
    expect(base.unitScaling).toBe(SpawnGroup.never);

    // spacing=1：任何 wave ≥ begin 都给 unitAmount（因为 `(wave-begin)/spacing/never` → 0）
    expect(base.getSpawned(0), "wave 0").toBe(3);
    expect(base.getSpawned(1), "wave 1（= 第一次 runWave 用的缩放）").toBe(3);
    expect(base.getSpawned(2), "wave 2").toBe(3);
    expect(base.getSpawned(999), "wave 999").toBe(3);

    // `wave < begin` → 0
    const late = new SpawnGroup(UnitTypes.dagger);
    late.begin = 2;
    late.unitAmount = 3;
    expect(late.getSpawned(0), "begin=2, wave 0").toBe(0);
    expect(late.getSpawned(1), "begin=2, wave 1").toBe(0);
    expect(late.getSpawned(2), "begin=2, wave 2").toBe(3);
    expect(late.getSpawned(3), "begin=2, wave 3").toBe(3);

    // `wave > end` → 0
    const early = new SpawnGroup(UnitTypes.dagger);
    early.begin = 0;
    early.end = 3;
    early.unitAmount = 3;
    expect(early.getSpawned(3), "end=3, wave 3").toBe(3);
    expect(early.getSpawned(4), "end=3, wave 4").toBe(0);

    // spacing=2：（wave - begin) % 2 != 0 → 0
    const everyOther = new SpawnGroup(UnitTypes.dagger);
    everyOther.begin = 0;
    everyOther.spacing = 2;
    everyOther.unitAmount = 3;
    expect([0, 1, 2, 3, 4].map((w) => everyOther.getSpawned(w))).toEqual([3, 0, 3, 0, 3]);

    // ⚠️ 两条除法语义（`SpawnGroup.java:69,72`）：
    //  1. 门禁：`(wave - begin) % spacing != 0` → 直接 0（**先于**数量计算）。
    //  2. 数量：`(wave - begin) / spacing` 是 int/int 整数除法，再 `/ unitScaling`（float），
    //     最后 `(int)` 截断。⚠️ 当 `spacing > 1` 时，门禁保证 `(wave-begin)` 必为 `spacing`
    //     的整数倍 → 这一步除法**必然整除**，int/float 语义不可区分；可区分的是 `unitScaling` 那步。
    const gated = new SpawnGroup(UnitTypes.dagger);
    gated.begin = 0;
    gated.spacing = 3;
    gated.unitAmount = 10;
    gated.unitScaling = 1;
    gated.max = 1000;
    expect(gated.getSpawned(0), "spacing=3,wave=0").toBe(10);
    expect(gated.getSpawned(3), "spacing=3,wave=3").toBe(11);
    expect(gated.getSpawned(6), "spacing=3,wave=6").toBe(12);
    expect(gated.getSpawned(7), "spacing=3,wave=7 → 7%3!=0 → 门禁返回 0").toBe(0);
    expect(gated.getSpawned(9), "spacing=3,wave=9").toBe(13);

    // `unitScaling` 那一步的 `(int)` 截断：unitScaling=2, spacing=1 →
    //   数量 = unitAmount + trunc(wave / 2)（wave=3 仍是 +1，不是 +1.5）
    const scaled = new SpawnGroup(UnitTypes.dagger);
    scaled.begin = 0;
    scaled.spacing = 1;
    scaled.unitAmount = 1;
    scaled.unitScaling = 2;
    scaled.max = 1000;
    expect([0, 1, 2, 3, 4, 5].map((w) => scaled.getSpawned(w))).toEqual([1, 1, 2, 2, 3, 3]);

    // `spacing == 0` 会被就地改成 1（`SpawnGroup.java:68`）
    const zeroSpacing = new SpawnGroup(UnitTypes.dagger);
    zeroSpacing.begin = 0;
    zeroSpacing.spacing = 0;
    zeroSpacing.unitAmount = 3;
    expect(zeroSpacing.getSpawned(1)).toBe(3);
    expect(zeroSpacing.spacing, "spacing 被改写为 1").toBe(1);

    // `max` 截断
    const capped = new SpawnGroup(UnitTypes.dagger);
    capped.begin = 0;
    capped.unitAmount = 5;
    capped.unitScaling = 1;
    capped.max = 7;
    expect(capped.getSpawned(0), "5 + 0").toBe(5);
    expect(capped.getSpawned(2), "5 + 2 = 7（正好到顶）").toBe(7);
    expect(capped.getSpawned(5), "5 + 5 = 10 → 截断为 max=7").toBe(7);
  });

  test("④ getShield 公式（对照 SpawnGroup.java:76-78）与 canSpawn（:62-64）", () => {
    const group = new SpawnGroup(UnitTypes.dagger);
    group.begin = 2;
    group.shields = 10;
    group.shieldScaling = 5;
    expect(group.getShield(2), "begin 波").toBe(10);
    expect(group.getShield(4), "10 + 5*2").toBe(20);
    // 早于 begin → 负增量被 max(…, 0) 夹到 0
    expect(group.getShield(0), "10 + 5*(-2) = 0").toBe(0);

    // `canSpawn`：spawn === -1 → 任何位置；否则按打包坐标匹配
    expect(group.spawn).toBe(-1);
    expect(group.canSpawn(0)).toBe(true);
    expect(group.canSpawn(12345)).toBe(true);
    group.spawn = 100;
    expect(group.canSpawn(100)).toBe(true);
    expect(group.canSpawn(101)).toBe(false);
  });
});

describe("S4 波次: Spawner 的出生点记账", () => {
  test("⑤ reset() 扫描 spawn 覆盖层；且 spawns 列表为空时不会生成（等价 Java「地图无 spawn 标记」）", () => {
    createWorld(16, 16, 1);
    Vars.state.rules.waves = true;

    // 未注册 `spawn` 内容 → `spawnOverlay()` 为 null → 出生点为空
    Vars.spawner.reset();
    expect(Vars.spawner.spawnOverlay(), "未注册 spawn 内容时返回 null").toBeNull();
    expect(Vars.spawner.countSpawns()).toBe(0);
    expect(Vars.spawner.countGroundSpawns()).toBe(0);

    // 注册同名覆盖层并放一个标记
    const overlay = new OverlayFloor("spawn");
    expect(Vars.spawner.spawnOverlay(), "注册后可解析").toBe(overlay);
    Vars.world.tile(2, 2)!.setOverlay(overlay);
    Vars.spawner.reset();
    expect(Vars.spawner.countSpawns(), "一个 spawn 标记").toBe(1);
    expect(Vars.spawner.getSpawns().first()!.pos(), "打包坐标").toBe(Vars.world.tile(2, 2)!.pos());

    // ⚠️ `eachGroundSpawn` 的门禁是 `state.hasSpawns()`（`WaveSpawner.java:126`）：
    //    `rules.waves && ((waveTeam.cores>0 && attackMode) || rules.spawns.size > 0)`。
    //    此刻 `rules.spawns` 为空 → `countGroundSpawns()` 为 0，**尽管出生点列表有 1 项**。
    //    这是 Java 的真实行为（「有 spawn 标记但没配刷怪组 → 不刷」）。
    expect(Vars.spawner.countGroundSpawns(), "rules.spawns 为空 → hasSpawns() 为假 → 0").toBe(0);

    // 配一个刷怪组后门禁打开
    Vars.state.rules.spawns.add(new SpawnGroup(UnitTypes.dagger));
    expect(Vars.spawner.countGroundSpawns(), "配组后 = 出生点数").toBe(1);
    expect(Vars.spawner.getFirstSpawn(), "第一个出生点 tile").toBe(Vars.world.tile(2, 2));
    expect(Vars.spawner.countFlyerSpawns(), "飞行出生点同样 1 个").toBe(1);

    // ⚠️ `reset()` 之前设置 overlay 时，`TileOverlayChangeEvent` 监听器也会记账（Java `:34-37`）；
    //    `reset()` 先 clear 再重扫 → 不重复计数。
    expect(Vars.spawner.getSpawns().size, "不应有重复项").toBe(1);

    // 第二个出生点
    Vars.world.tile(5, 5)!.setOverlay(overlay);
    Vars.spawner.reset();
    expect(Vars.spawner.countSpawns(), "两个 spawn 标记").toBe(2);
    expect(Vars.spawner.countGroundSpawns()).toBe(2);

    // 移除一个：overlay 改回 air → 监听器 remove + reset 重扫
    Vars.world.tile(5, 5)!.setOverlay(Blocks.air);
    Vars.spawner.reset();
    expect(Vars.spawner.countSpawns(), "移除一个后").toBe(1);
  });
});

describe("S4 波次: runWave / update 接线", () => {
  test("⑥ runWave() 推进 state.wave 并重置 state.wavetime = rules.waveSpacing", () => {
    const logic = setupWaveScenario();
    const state = Vars.state;

    // 手动把 wavetime 归零 → runWave 后应被重置为 waveSpacing（Java `Logic.java:322`）
    state.wavetime = 0;
    expect(state.wave).toBe(1);

    logic.runWave();
    expect(state.wave, "wave 1 → 2").toBe(2);
    expect(state.wavetime, "wavetime 被重置为 waveSpacing").toBe(state.rules.waveSpacing);
    expect(state.wavetime).toBe(7200);

    // 手动 runWave **不受** wavetime 影响（Java 也不检查）
    state.wavetime = 12345;
    logic.runWave();
    expect(state.wave, "wave 2 → 3").toBe(3);
    expect(state.wavetime, "再次重置为 waveSpacing").toBe(7200);
  });

  test("⑦ 生成单位确实进入 Groups.unit，且队伍 === rules.waveTeam", () => {
    const logic = setupWaveScenario();
    const state = Vars.state;

    expect(Groups.unit.size(), "起点为空").toBe(0);
    logic.runWave();
    expect(Groups.unit.size(), "第一波立即生成 3 个（spawnEnemies 同步执行）").toBe(3);

    for(const u of Groups.unit){
      const unit = u as unknown as UnitRuntime;
      expect(unit.team, "队伍 id = rules.waveTeam.id").toBe(state.rules.waveTeam.id);
      expect(unit.team).toBe(Team.crux.id);
      expect(unit.type, "类型 = SpawnGroup.type").toBe(UnitTypes.dagger);
      expect(unit.health, "满血").toBe(150);
      expect(unit.isAdded(), "已入组").toBe(true);
      expect(unit.elevation, "dagger 是地面单位").toBe(0);
    }

    // 出生点周围（(2,2) 世界坐标 (16,16)，散布 tilesize*2 = 16）
    for(const u of Groups.unit){
      const unit = u as unknown as UnitRuntime;
      expect(Math.abs(unit.x - 16), "x 在出生点 16 半径内").toBeLessThanOrEqual(16);
      expect(Math.abs(unit.y - 16), "y 在出生点 16 半径内").toBeLessThanOrEqual(16);
    }
  });

  test("⑧ 波次缩放口径：`spawnEnemies` 用 `state.wave - 1`（不是 `state.wave`）", () => {
    // ⚠️ 这是 golden 文件头第 5 行「spawns scaled by (state.wave - 1)」的**可区分**版本。
    //    golden 用的配置（spacing=1 + unitScaling=never）下 `getSpawned(w-1) === getSpawned(w)`，
    //    所以那个场景**无法**区分这个偏移量；本用例用 `begin = 1` 把它变成可观测的：
    //      runWave#1: state.wave = 1 → getSpawned(0) → 0 < begin(=1) → 不生成
    //      runWave#2: state.wave = 2 → getSpawned(1) → 3
    //      runWave#3: state.wave = 3 → getSpawned(2) → 3
    //    若把 `state.wave - 1` 错写成 `state.wave`，结果会变成 3/6/9。
    const logic = setupWaveScenario();
    const state = Vars.state;

    state.rules.spawns.clear();
    const group = new SpawnGroup(UnitTypes.dagger);
    group.begin = 1;
    group.spacing = 1;
    group.unitAmount = 3;
    group.max = 100;
    state.rules.spawns.add(group);

    const waveBeforeFirst = state.wave; // = 1
    logic.runWave();
    expect(state.wave, "runWave#1 后 wave").toBe(2);
    expect(
      group.getSpawned(waveBeforeFirst - 1),
      "第 1 次 runWave 用的是 getSpawned(0)（不是 getSpawned(1)）"
    ).toBe(0);
    expect(Groups.unit.size(), "begin=1 → 第一波不生成").toBe(0);

    logic.runWave();
    expect(state.wave).toBe(3);
    expect(Groups.unit.size(), "第二波开始生成 3 个").toBe(3);

    logic.runWave();
    expect(state.wave).toBe(4);
    expect(Groups.unit.size(), "第三波累计 6 个").toBe(6);
  });

  test("⑨ state.enemies 与 Groups.unit 的敌方计数一致（Logic.update 的接线）", () => {
    const logic = setupWaveScenario();
    const state = Vars.state;

    expect(state.enemies, "起点").toBe(0);
    logic.runWave(); // wave 1 → 2，生成 3 个
    logic.update();
    expect(state.enemies, "update 后 enemies = 3").toBe(3);

    logic.runWave(); // wave 2 → 3，再生成 3 个
    logic.update();
    expect(state.enemies, "enemies = 6").toBe(6);

    const enemyCount = Groups.unit.count((u) => u.team === state.rules.waveTeam.id);
    expect(state.enemies, "与 Groups.unit 直接计数一致").toBe(enemyCount);
    expect(state.enemies, "本场景全部单位都是敌方").toBe(Groups.unit.size());
  });

  test("⑩ SpawnGroup.max 端到端封顶（波次数量上限由 max 承担，Java 无 Rules.maxWaves）", () => {
    const logic = setupWaveScenario();
    const state = Vars.state;

    // 单组：unitAmount=200，max=5 → 一波最多 5 个
    state.rules.spawns.clear();
    const group = new SpawnGroup(UnitTypes.dagger);
    group.begin = 0;
    group.spacing = 1;
    group.unitAmount = 200;
    group.max = 5;
    state.rules.spawns.add(group);

    logic.runWave();
    expect(Groups.unit.size(), "被 max=5 截断").toBe(5);

    // 再一波：再生成 5 → 累计 10（`max` 是「每组每波数量上限」，不是场上总量上限）
    logic.runWave();
    expect(Groups.unit.size(), "累计 10").toBe(10);
  });

  test("⑪ rules.waves = false 时 update() 不推进波次（S3 headless 的不可达分支）", () => {
    const logic = setupWaveScenario();
    const state = Vars.state;

    state.rules.waves = false;
    state.rules.waveTimer = true; // 即使计时器开着，递减块也要求 waves
    state.wavetime = 0;

    for(let t = 0; t < 10; t++){
      logic.update();
    }

    expect(state.wave, "波次未推进").toBe(1);
    expect(state.enemies).toBe(0);
    expect(Groups.unit.size(), "没有生成任何单位").toBe(0);
    expect(state.wavetime, "wavetime 未被递减（waves=false 时整块跳过）").toBe(0);
  });

  test("⑫ waveTimer + wavetime 归零 → Logic.update() 自动 runWave（S4 新接线的核心）", () => {
    const logic = setupWaveScenario({ waveTimer: true });
    const state = Vars.state;

    // 顺序（Java `Logic.java:593-601`）：先递减 wavetime，**再**判 `<= 0` 才 runWave。
    state.wavetime = 3;

    logic.update(); // 3 → 2
    expect(state.wave, "第 1 帧").toBe(1);
    expect(state.wavetime).toBe(2);
    expect(Groups.unit.size()).toBe(0);

    logic.update(); // 2 → 1
    expect(state.wave).toBe(1);
    expect(state.wavetime).toBe(1);

    logic.update(); // 1 → 0，随后 `wavetime <= 0 && waves` → runWave()
    expect(state.wave, "第 3 帧自动推进到 2").toBe(2);
    expect(state.wavetime, "runWave 重置计时").toBe(state.rules.waveSpacing);
    expect(Groups.unit.size(), "自动波次生成 3 个单位").toBe(3);

    // 再次自动推进：wavetime 从 7200 递减需要 7200 帧；用 7199 帧验证不推进
    // ⚠️ 这 7199 帧会驱动一次 `Time.run(121)` 的收尾（见用例 ⑬），此处只关心波次。
    for(let t = 0; t < 7199; t++) logic.update();
    expect(state.wave, "7199 帧后仍未到下一波").toBe(2);
  });

  test("⑬ isWaitingWave() 与 Spawner.isSpawning() 的计时语义", () => {
    const logic = setupWaveScenario();
    const state = Vars.state;

    // `isWaitingWave()`（Java `Logic.java:624-625`）：
    //   (waitEnemies || (wave >= winWave && winWave > 0)) && enemies > 0
    state.rules.waitEnemies = false;
    state.rules.winWave = 0;
    state.enemies = 5;
    expect(logic.isWaitingWave(), "waitEnemies=false 且 winWave=0 → 不等待").toBe(false);

    state.rules.waitEnemies = true;
    expect(logic.isWaitingWave(), "waitEnemies=true 且 enemies>0 → 等待").toBe(true);
    state.enemies = 0;
    expect(logic.isWaitingWave(), "enemies=0 → 不等待").toBe(false);

    // winWave 分支
    state.rules.waitEnemies = false;
    state.rules.winWave = 5;
    state.wave = 5;
    state.enemies = 2;
    expect(logic.isWaitingWave(), "wave >= winWave > 0 且 enemies>0 → 等待").toBe(true);
    state.wave = 4;
    expect(logic.isWaitingWave(), "wave < winWave → 不等待").toBe(false);

    // `Spawner.isSpawning()`（Java `WaveSpawner.java:213-215`）：`Time.run(121f, …)` 收尾
    state.rules.waitEnemies = false;
    state.rules.winWave = 0;
    state.wave = 1;
    state.wavetime = 99999;
    expect(Groups.unit.size(), "此时场上仍为空").toBe(0);

    expect(Vars.spawner.isSpawning(), "初始为 false").toBe(false);
    logic.runWave();
    expect(Vars.spawner.isSpawning(), "runWave 后 = true（Java `:63`）").toBe(true);

    for(let t = 0; t < 120; t++) logic.update();
    expect(Vars.spawner.isSpawning(), "120 帧后仍未收尾").toBe(true);

    logic.update(); // 第 121 帧 → `Time.run(121f)` 触发
    expect(Vars.spawner.isSpawning(), "121 帧后收尾（Java `:108`）").toBe(false);
  });
});
