// 源: core/src/mindustry/game/Rules.java 的 `Vars.defaultEnv` 依赖（陷阱 #10）
//
// 为什么单独一个模块: 见 `game/Rules.ts` 顶部的陷阱 #10 说明 ——
// `Rules.env` 的默认值来自 `Vars.defaultEnv`，而 `Vars` 又依赖 `Rules`（经 `GameState`），
// 形成模块级环。抽到叶子模块后两边都从这里取，数值与 `Vars.java:64` 逐字一致。

import { Env } from "../world/meta/Env.js";

/**
 * 对应 Java `Vars.defaultEnv`：
 * `Env.terrestrial | Env.spores | Env.groundOil | Env.groundWater | Env.oxygen`
 */
export const defaultEnv =
  Env.terrestrial | Env.spores | Env.groundOil | Env.groundWater | Env.oxygen;
