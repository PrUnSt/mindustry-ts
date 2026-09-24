// S3 端到端：headless 世界模拟 + §1 的 6 条硬断言逐条打印。
//
// 输出**完全确定性**（同种子 → 逐字节相同的 stdout）：不含任何时间/地址/迭代顺序。
// 全部通过时退出码 0，否则 1。
//
// 断言清单（§1，其中 #4 已按 §6.7 勘误修正：wall 用 conveyor 代表，copper-wall 作反事实半边）:
//   #1 Blocks.air.id === 0
//   #2 new Tiles(8,8).fill(); tiles.get(3,4).block() === Blocks.air
//   #3 world.loadGenerator(8,8,fn) → width()===8 && height()===8 && geti(63)!=null
//   #4 setBlock(conveyor) → Groups.build.size()===1；setBlock(copper-wall) → build!=null 且 size===0
//   #5 跑 600 tick → state.tick===600 && Time.time===600 && 所有 tile 数值有限 && tick 严格递增
//   #6 两次全新建图（同种子同 tick）→ snapshot() 字符串完全相等

import { Mathf, Time } from "@mindustry-ts/arc";
import {
  Blocks,
  Groups,
  Tiles,
  Vars,
  createWorld,
  placeBlock,
  runTicks,
  snapshot,
  Team
} from "@mindustry-ts/game";

const SEED = 123;
const lines: string[] = [];
let failures = 0;

/** 打印一条断言：`[#] PASS/FAIL <详情>  (<判据>)`。 */
function check(index: number, pass: boolean, detail: string, criterion: string): void{
  if(!pass) failures++;
  lines.push("[" + index + "] " + (pass ? "PASS" : "FAIL") + " " + detail + "  <" + criterion + ">");
}

lines.push("=== Mindustry TS · S3 tick 闭环 · 六条硬断言 ===");
lines.push("seed=" + SEED + "  deltaTime=" + String(1 / 60) + "  headless=" + String(Vars.headless));

// ---- 引导（并建一张 8×8 世界供 #3/#4/#5 使用）----
createWorld(8, 8, SEED);

// ---- #1 Blocks.air.id === 0 ----
{
  const pass = Blocks.air.id === 0 && Vars.content.block(0) === Blocks.air;
  check(1, pass, "air.id=" + Blocks.air.id + " content.block(0)=" + Vars.content.block(0)!.name, "Blocks.air.id === 0");
}

// ---- #2 new Tiles(8,8).fill(); get(3,4).block() === Blocks.air ----
{
  const tiles = new Tiles(8, 8);
  tiles.fill();
  const t = tiles.get(3, 4)!;
  const lastTile = tiles.geti(63) as unknown;
  const pass = t.block() === Blocks.air && lastTile !== undefined;
  check(2, pass, "Tiles(8x8).get(3,4).block=" + t.block().name + " geti(63)!=null=" + String(lastTile !== undefined), "=== Blocks.air");
}

// ---- #3 world.loadGenerator(8,8,fn) —— width/height/geti(63) ----
{
  Vars.world.loadGenerator(8, 8, (tiles) => {
    tiles.fill();
  });
  const last = Vars.world.tiles.geti(63) as unknown as { x: number; y: number } | undefined;
  const pass = Vars.world.width() === 8 && Vars.world.height() === 8 && last !== undefined && last !== null;
  check(
    3,
    pass,
    "width=" + Vars.world.width() + " height=" + Vars.world.height() + " geti(63)=" + (last ? "Tile(" + last.x + "," + last.y + ")" : "null"),
    "World.java:234 → endMapLoad"
  );
}

// ---- #4 conveyor 入组 / copper-wall 不入组（§6.7 修正后）----
{
  const before = Groups.build.size();
  placeBlock(2, 2, Blocks.conveyor, 0);
  const afterConveyor = Groups.build.size();
  const convBuild = Vars.world.tile(2, 2)!.build;

  placeBlock(5, 5, Blocks.copperWall, 0);
  const afterWall = Groups.build.size();
  const wallBuild = Vars.world.tile(5, 5)!.build;

  const pass =
    before === 0 &&
    afterConveyor === 1 &&
    convBuild !== null &&
    convBuild!.block === Blocks.conveyor &&
    afterWall === 1 && // 仍是 1：copper-wall 不入组
    wallBuild !== null &&
    wallBuild!.block === Blocks.copperWall;

  check(
    4,
    pass,
    "conveyor build=" + (convBuild ? convBuild.block.name : "null") + " groupSize " + before + "→" + afterConveyor +
      " added=" + String(convBuild ? convBuild.isAdded() : false) +
      " | copper-wall build=" + (wallBuild ? wallBuild.block.name : "null") + " groupSize=" + afterWall +
      " (unchanged) added=" + String(wallBuild ? wallBuild.isAdded() : false),
    "conveyor→size 1；copper-wall→build!=null 且 size 0"
  );
}

// ---- #5 600 tick ----
{
  createWorld(8, 8, SEED);
  placeBlock(3, 3, Blocks.conveyor, 0);

  const tickSeq: number[] = [];
  for(let i = 0; i < 600; i++){
    runTicks(1);
    tickSeq.push(Vars.state.tick);
  }

  let allFinite = true;
  for(const tile of Vars.world.tiles){
    if(
      !Number.isFinite(tile.x) ||
      !Number.isFinite(tile.y) ||
      !Number.isFinite(tile.data) ||
      !Number.isFinite(tile.block().id) ||
      !Number.isFinite(tile.floor().id) ||
      (tile.build !== null && !Number.isFinite(tile.build.health))
    ){
      allFinite = false;
      break;
    }
  }

  let monotonic = true;
  for(let i = 1; i < tickSeq.length; i++){
    if(!(tickSeq[i]! > tickSeq[i - 1]!)) monotonic = false;
  }

  const pass =
    Vars.state.tick === 600 && Time.time === 600 && allFinite && monotonic && tickSeq.length === 600;

  check(
    5,
    pass,
    "tick=" + Vars.state.tick + " time=" + Time.time + " tiles=" + Vars.world.tiles.array.length +
      " allFinite=" + String(allFinite) + " monotonic=" + String(monotonic),
    "tick===600 && Time.time===600 && 数值有限 && 严格递增"
  );
}

// ---- #6 两次全新建图 → 快照相等 ----
{
  function runFresh(): string{
    createWorld(16, 16, SEED);
    placeBlock(2, 2, Blocks.conveyor, 0);
    placeBlock(3, 2, Blocks.conveyor, 1);
    placeBlock(4, 2, Blocks.router, 0);
    placeBlock(6, 6, Blocks.copperWall, 0);
    runTicks(600);
    return snapshot();
  }

  const a = runFresh();
  const b = runFresh();
  const pass = a === b && a.includes("tick=600") && a.includes("build=3");
  check(
    6,
    pass,
    "run1===run2=" + String(a === b) + " snapshotLen=" + a.length + " (含 tick=600=" + String(a.includes("tick=600")) + ")",
    "同种子同 tick → snapshot() 完全相等"
  );
}

lines.push("---");
lines.push("RESULT: " + (6 - failures) + "/6 PASS" + (failures === 0 ? "" : " (" + failures + " FAIL)"));
lines.push("rand=" + Mathf.rand.seed0 + ":" + Mathf.rand.seed1 + " team=" + Team.sharded.name);

console.log(lines.join("\n"));

if(failures > 0){
  process.exitCode = 1;
}
