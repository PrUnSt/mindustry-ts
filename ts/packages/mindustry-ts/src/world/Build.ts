// 源: core/src/mindustry/world/Build.java (321 行)
//     + core/src/mindustry/world/blocks/ConstructBlock.java（扣费时机 :294-333 / 退款 :335-397）
//
// ⚠️ 本文件是**有意收窄**的「简化但语义正确」建造实现（计划 D14 的「绕开策略」）。
//    它不是 Build.java 的完整移植。下面「丢掉的 Java 判据」是**显式登记**的，
//    不是静默省略 —— 每一项都带 Java 行号。
//
// ───────────────────────── 已拍板不做（D14）─────────────────────────
//   ✗ `BuilderComp` / `Unit` 建造队列 / `buildRange` 距离限制 / `Call.beginPlace` RPC
//     → 玩家建造被建模为「点即建」：一次 `beginPlace` 调用 = 校验 + 扣费 + 落地。
//   ✗ `Placement.java` 的多选拖拽几何规整（它本就不是放置逻辑）。
//   ✗ **渐进建造**（`ConstructBlock` 的 `ConstructBuild` 进度累积 `progress`/`accumulator`/
//     `totalAccumulator`）。因此没有「先入队、慢慢建、完工再扣费」的两阶段；
//     扣费被提前到 `beginPlace` 内一次完成（语义等价于「进度瞬间到 100% 的那个完工瞬间」）。
//
// ────────────────── `beginPlace` 丢掉的 Java 分支（Build.java:71-160）──────────────────
//   · quickRotate 原地旋转分支（:82-92）—— 需要 `tile.build.updateProximity()` / 特效 /
//     `BuildRotateEvent`；S4 不做事件与特效，且「点即建」下重新放置会走 `setBlock` 覆盖。
//   · derelict 修复分支（:95-118）—— 需要 `changeTeam` / `powerGraph` / `allowDerelictRepair`。
//   · 「拆除挡路 prop」（:121-126）—— 需要 `alwaysReplace` prop 的 `breakEffect`。
//   · 渐进建造分支（:136-159 的 `ConstructBlock.get` / `setConstruct` / `prevBuild`）——
//     见上「不做渐进建造」。
//   · `result.beforePlaceBegan` / `placeBegan` / `BlockBuildBeginEvent` / `BlockBuildEndEvent`
//     （:130,:140,:157,:159）—— 事件与方块钩子；S4 的事件集不含建造事件。
//   · `unit` / `placeConfig`（:71）—— 单位与配置（网络层 S6）。
//
// ───────────── `validPlace` 丢掉的 Java 判据（Build.java:183-273）─────────────
//   下面是 `validPlaceIgnoreUnits` 里**每一条**被判据、以及为什么在本阶段安全地丢弃：
//   · :185 `type == null` → 由 TS 类型系统保证（调用点传入 `Block`）。
//   · :185 `!state.rules.editor && (!type.environmentBuildable() || (!type.isPlaceable() && …))`
//        —— 可建造性/可见性/环境适用/波次队伍可见性。需要 `environmentBuildable()`（依赖 `Env`）
//        与 `state.rules.waves`；S4 的测试方块（conveyor/router）恒 `isPlaceable()`，
//        且本 API 面向「已解锁且可放置的方块」，故丢弃。
//   · :189-213 核心半径保护（`polygonCoreProtection` 最近核心 / `anyEnemyCoresWithinBuildRadius`）
//        —— 依赖 `CoreBuild` 与队伍核心列表。丢弃（**不只是**距离检查，是「禁建区」）。
//   · :224-226 `isFloor()` 的地板专用分支 —— 本 API 只处理「方块」放置，不处理地板/覆盖层。
//   · :229 战役黑暗 `world.getDarkness(x,y) >= 3` —— `World.getDarkness` 未移植（S4 无光照）。
//   · :233-235 `requiresWater` / `contactsShallows` / `placeableLiquid` —— 水深可行性。
//       依赖 `Floor.isDeep()`（存在）但 `Build.contactsShallows` 未移植；S4 世界全 air 地板，
//        本阶段丢弃。
//   · :238 `type.isOverPlacementLimit(team)` —— 方块数量上限，依赖 `TeamData.getCount`（已存在）
//        但 `Block.isOverPlacementLimit` 未移植。
//   · 逐格循环（:243-266）里丢弃的子判据：
//       :251 `type.size == 2 && world.getDarkness(...) >= 3`（2×2 黑暗格）
//       :252 `staticFog && fog && !fogControl.isDiscovered(...)`（迷雾）
//       :253 `check.floor().isDeep() && !floating && !requiresWater && !placeableLiquid`（深水）
//       :254 `!derelictRepair && check.team() == Team.derelict && check.build != null`（无主方块）
//       :255 `type == check.block() && … && rotation == check.build.rotation && type.rotate`
//            （同块同朝向的重复放置判定）
//       :256 `!check.interactable(team)`（队伍可交互性）—— **本阶段用「canReplace」近似**：
//            不能交互通常意味着不能替换，`canReplace` 已覆盖绝大多数情形。
//       :257 `!check.floor().placeableOn && !ignoreBuildDarkness`（实体地板不可放）
//       :259 `(!checkVisible && checkCoreRadius && !check.block().alwaysReplace)`（载荷放置 hack）
//       :260-261 `check.build.canBeReplaced(type)` / 同类型 `ConstructBuild` —— 建筑级替换钩子
//            （`Building.canBeReplaced` 未移植；`ConstructBuild` 不做）
//       :262 `type.bounds(...).contains(check.block.bounds(...))`（多块覆盖的矩形包含判定）
//       :263 `requiresWater && check.floor().liquidDrop != Liquids.water`
//   · :268-270 `placeRangeCheck` + `getEnemyOverlap` —— 依赖 `indexer`（未移植）与敌方建筑查询。
//   · `checkNoUnitOverlap`（Build.java:174,:178-180）—— 需要 `Units.anyEntities`（单位未移植）。
//
//   ✅ **本阶段保留的判据**（三者已足够表达「空地/可替换 + 尺寸越界 + 地板许可」）:
//       1. tile 存在，且 size×size 覆盖的**每一格**都存在（越界即 false）；
//       2. 每格为空气，或 `block.canReplace(该格方块)`（见 `Block.canReplace`）；
//       3. `block.canPlaceOn(tile, team, rotation)`（`Block` 默认恒 true）。
//
// ───────────── `breakBlock` 丢掉的 Java 判据 ─────────────
//   · `validBreak`（Build.java:317-320）—— `canBreak` / `breakable` / `allowEnvironmentDeconstruct`
//         / `interactable`。本阶段只要「格子有非空气方块」即可拆。
//   · 渐进拆除（`ConstructBuild.deconstruct` 的 `progress` / `accumulator` / `clampedAmount`）
//        —— 同「不做渐进建造」，退款一次到位。
//   · :369-372 `core.storageCapacity` 容量截断与 `!state.rules.infiniteResources` 判断
//        —— **本阶段不截断**（`ItemModule.add` 无上限，与 Java 的 `add` 相同；槽位上限在
//        `CoreBuild` 层，未移植）。
//   · :368,:389 `requirements[i].item.unlockedNowHost()`（仅退还已解锁物品）—— 未移植。
//   · :382 `state.rules.infiniteResources` 无限资源分支 —— 本阶段按有限资源处理。

import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import type { Team } from "../game/Team.js";
import type { Block } from "./Block.js";
import type { ItemModule } from "./modules/ItemModule.js";

/** 对应 `mindustry.world.Build`（简化子集）。 */
export class Build{
  /**
   * 对应 Java `Build.validPlace(Block, Team, int, int, int)` 的**简化子集**
   * （= `validPlaceIgnoreUnits` + `checkNoUnitOverlap` 的裁剪版）。
   *
   * 保留的三条判据与丢弃的完整清单见文件头。参数顺序按本项目拍板（Java 是
   * `(Block, Team, x, y, rotation)`）。
   */
  static validPlace(x: number, y: number, block: Block, team: Team, rotation: number): boolean{
    // 局部变量声明为可空类型，以便做 Java 那样的 `type == null` 运行时兜底
    // （TS 直接 `block === null` 会因类型无交集被 TS2367 拒绝）。
    const type: Block | null = block;
    if(type === null) return false;

    const tile = Vars.world.tile(x, y);
    if(tile === null) return false;

    // :219 `!type.canPlaceOn(tile, team, rotation)`
    if(!type.canPlaceOn(tile, team, rotation)) return false;

    // :240-241 多块结构的偏移，逐字复刻 Java 的**整除**语义：
    //   Java `int offsetx = -(type.size - 1) / 2;`（一元负号先于除法，向零截断）
    //   例：size=2 → -(1)/2 = 0；size=3 → -2/2 = -1；size=4 → -3/2 = -1。
    // TS 的 `/` 是浮点：`-((2-1)/2) = -0.5` 会把 tile 坐标变成小数 → `Tiles.get`
    // 用 `array[y*width + 0.5]` 取到 `undefined`（**不是** null）。因此必须 `Math.trunc`。
    // ⚠️ 注意：`Block.sizeOffset`（`Block.ts:688`）**未做**这个截断，偶数尺寸下是小数；
    //    这里不用它，避免把该问题带进建造校验。
    const offset = Math.trunc(-(type.size - 1) / 2);

    for(let dx = 0; dx < type.size; dx++){
      for(let dy = 0; dy < type.size; dy++){
        const wx = dx + offset + tile.x;
        const wy = dy + offset + tile.y;

        // :247-250a 每格必须存在（越界即 false）
        const check = Vars.world.tile(wx, wy);
        if(check === null) return false;

        // :260 替换判据的裁剪版：空气可直接放；否则必须 `canReplace`。
        const old = check.block();
        if(old !== Blocks.air && !type.canReplace(old)) return false;
      }
    }

    return true;
  }

  /**
   * 对应 Java `Build.beginPlace`（:71-160）**与** `ConstructBlock.construct` 的
   * **完工瞬间**（:294-333）的合并语义。
   *
   * 顺序（与 Java 完工瞬间一致）:
   *   1. `validPlace` 校验；
   *   2. `instantBuild === true`（未显式传入时回落到 `block.instantBuild`，对齐 `Build.java:129`）
   *      → 不扣资源（`Block.java:375` 注释：地板/静态墙等 `instantBuild` 不消耗）；
   *   3. 否则取核心：`Vars.state.teams.get(team).core()`；为 null → 拒绝；
   *      `block.requirements` 为空 → 跳过扣费；
   *   4. `core.items.hasStacksMultiplied(requirements, mult)`（`mult = state.rules.buildCostMultiplier`）
   *      不足 → 拒绝且库存不变；
   *   5. 逐条 `core.items.remove(item, Math.round(amount * mult))`；
   *   6. `tile.setBlock(block, team, rotation)`。
   *
   * ⚠️ 与 Java 的一处**有意的差异**：Java 在 `requirements` 为空时即使无核心也能完工
   *   （`construct` 的 for 循环零次迭代，`canFinish` 保持 true）。本实现按拍板顺序
   *   在「非 instant 且无核心」时一律拒绝（步骤 3 先于「requirements 为空」判断）。
   *   对本阶段所有带需求的方块（conveyor/router）与 Java 完全一致。
   */
  static beginPlace(
    x: number,
    y: number,
    block: Block,
    team: Team,
    rotation: number,
    instantBuild?: boolean
  ): boolean{
    // 1. 校验
    if(!Build.validPlace(x, y, block, team, rotation)) return false;

    const tile = Vars.world.tile(x, y);
    if(tile === null) return false;

    // 2. instant：未显式传入时回落到方块自身标志（`Build.java:129` 的 `result.instantBuild`）
    const instant = instantBuild ?? block.instantBuild;

    if(!instant && block.requirements.length > 0){
      // 3. 核心
      const core = Vars.state.teams.get(team).core();
      if(core === null) return false;

      const items = core.items as ItemModule | null;
      const mult = Vars.state.rules.buildCostMultiplier;

      // 4. 足量检查（`ItemModule.hasStacksMultiplied` 用的是同一个 `Math.round(amount*mult)`）
      if(items === null || !items.hasStacksMultiplied(block.requirements, mult)) return false;

      // 5. 扣费（对应 ConstructBlock.java:315-316 的 `core.items.remove(item, itemsLeft[i])`，
      //    此处 `itemsLeft[i]` 因为「进度瞬间到 100%」而等于 `Math.round(amount*mult)`）
      for(const stack of block.requirements){
        items.remove(stack.item, Math.round(stack.amount * mult));
      }
    }

    // 6. 落地（`ConstructBlock.constructFinish` 的实体化步骤）
    tile.setBlock(block, team, rotation);
    return true;
  }

  /**
   * 拆除 + 资源退还。对应 Java `ConstructBlock.deconstruct`（:335-397）的**完工瞬间**。
   *
   * 退款额（对应 `ConstructBlock.java:386` 的 `Mathf.round` 语义，正数下等价 `Math.round`）:
   *   `Math.round(stack.amount * state.rules.buildCostMultiplier * state.rules.deconstructRefundMultiplier)`
   * 然后 `tile.setBlock(Blocks.air)`。
   *
   * ✅ `Rules.deconstructRefundMultiplier` **已存在**（`src/game/Rules.ts:133`，默认 0.5），
   *    因此**不需要**退化为硬编码 0.5 —— 直接读规则字段。
   */
  static breakBlock(x: number, y: number, team: Team): boolean{
    const tile = Vars.world.tile(x, y);
    if(tile === null) return false;

    const block = tile.block();
    if(block === Blocks.air) return false;

    const requirements = block.requirements;
    if(requirements.length > 0){
      const core = Vars.state.teams.get(team).core();
      if(core !== null){
        const items = core.items as ItemModule | null;
        if(items !== null){
          const mult = Vars.state.rules.buildCostMultiplier;
          const refund = Vars.state.rules.deconstructRefundMultiplier;

          for(const stack of requirements){
            // :386 `Mathf.round(requirements[i].amount * buildCostMultiplier * deconstructRefundMultiplier)`
            items.add(stack.item, Math.round(stack.amount * mult * refund));
          }
        }
      }
    }

    // `Call.deconstructFinish` 的实体化步骤（`ConstructBlock.deconstructFinish` → `tile.remove()`）
    tile.setBlock(Blocks.air);
    return true;
  }
}
