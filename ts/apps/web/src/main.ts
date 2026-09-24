// S3 端到端（web）：用与 headless **共用**的 harness 建世界、放方块、跑 600 tick，
// 把 `snapshot()` 的确定性文本渲染进 `#app`。
//
// 与 `apps/headless/src/index.ts` 使用同一套 API（`createWorld/placeBlock/runTicks/snapshot`），
// 证明「headless 与 web 共用同一份世界模拟」这条接线成立。
import { Blocks, createWorld, placeBlock, runTicks, snapshot } from "@mindustry-ts/game";

const SEED = 123;

createWorld(16, 16, SEED);
placeBlock(2, 2, Blocks.conveyor, 0);
placeBlock(3, 2, Blocks.conveyor, 1);
placeBlock(4, 2, Blocks.router, 0);
placeBlock(6, 6, Blocks.copperWall, 0);
runTicks(600);

const text = snapshot();

const app = document.getElementById("app");
if(app !== null){
  // 快照是多行纯文本，按等宽 + 保留换行渲染。
  app.textContent = text;
  app.style.whiteSpace = "pre";
  app.style.fontFamily = "monospace";
}

console.log(text);
