// 源: core/src/mindustry/game/Rules.java
//
// ⚠️ 陷阱 #10（计划 §6.2）: Java 的 `Rules.env = Vars.defaultEnv`（`Rules.java:165`）会形成
//   模块级循环依赖 —— `Rules.ts` 需要 `Vars.defaultEnv`，而 `Vars.ts` 需要 `Vars.state`
//   → `GameState` → `Rules`。ESM 下这会在模块求值期读到未初始化的绑定而抛 TDZ 错。
//   处置: 把 `Vars.defaultEnv` 抽到 `game/defaults.ts`（一个不依赖任何东西的叶子模块），
//   `Rules` 与 `Vars` 都从那里取。数值与 Java 完全一致：
//     Env.terrestrial | Env.spores | Env.groundOil | Env.groundWater | Env.oxygen
//
// 未移植（逐条标注，避免静默丢失语义）:
//   - `TeamRules` / `TeamRule` 及其派生方法（`buildRadius` / `unitBuildSpeed` / `unitCost` /
//     `unitDamage` / `unitHealth` / `unitCrashDamage` / `unitMineSpeed` / `blockHealth` /
//     `blockDamage` / `buildSpeed` / `unitActivationDelay` / `isInfiniteResources`）
//     —— 依赖队伍级规则 UI 与 AI（S5）
//   - `planet`（`Planets.serpulo`）/ `planetBackground`（`PlanetParams`）—— 依赖 `Planet`
//   - `modeName` / `mission` / `tags`（`StringMap`）/ `customBackgroundCallback` /
//     `backgroundTexture` / `backgroundScl` / `backgroundSpeed` / `backgroundOffsetX/Y`
//     —— 全部为 UI/渲染元数据（计划 §9）
//   - `copy()`（`JsonIO.copy`）/ `retainContentFields()`（数据补丁）/ `isBanned(UnitType)`
//     —— 依赖未移植系统
//
// 已移植字段的默认值**逐字对齐** `Rules.java`（这会直接影响 `Block.isVisible` /
// `Block.isPlaceable` / `Team.isAI` / `TeamData.active` 的判断结果，不可随意改）。

import { Color } from "../arc-compat/Color.js";
import { Seq } from "@mindustry-ts/arc";
import { defaultEnv } from "./defaults.js";
import { Gamemode } from "./Gamemode.js";
import { Team } from "./Team.js";
import { Attributes } from "../world/meta/Attributes.js";
import { MapObjectives } from "../mocks/MapObjectives.js";
import type { Block } from "../world/Block.js";
import type { ItemStack } from "../type/ItemStack.js";

/** 对应 `mindustry.game.Rules`。 */
export class Rules{
  /** 允许在游戏内编辑规则（相当于作弊开关）。 */
  allowEditRules = false;
  /** 沙盒模式：无限资源、建造范围与建造速度。 */
  infiniteResources = false;
  /** 允许在任意位置建造/拆除核心，并显示换队 UI。 */
  coreBuildAndConfig = false;
  /** 波次是否按计时器自动到来。 */
  waveTimer = true;
  /** 波次是否可手动召唤。 */
  waveSending = true;
  /** 是否可生成波次。 */
  waves = false;
  /** 空中单位是否在出生点而非地图边缘生成。 */
  airUseSpawns = false;
  /** 攻击模式下单位是否在敌方核心生成。 */
  wavesSpawnAtCores = true;
  /** 目标是否为 PvP。 */
  pvp = false;
  /** PvP 中是否等待玩家。 */
  pvpAutoPause = true;
  /** 单人游戏是否禁用暂停。 */
  pauseDisabled = false;
  /** 是否在敌人被清空前暂停波次计时。 */
  waitEnemies = false;
  /** 是否为攻击模式。 */
  attackMode = false;
  /** 是否为编辑器模式。 */
  editor = false;
  /** 是否可点击修复无主方块。 */
  derelictRepair = true;
  /** 是否允许游戏结束。 */
  canGameOver = true;
  /** 核心被摧毁时是否换队。 */
  coreCapture = false;
  /** 反应堆是否能爆炸并伤害其它方块。 */
  reactorExplosions = true;
  /** 是否允许手动控制单位。 */
  possessionAllowed = true;
  /** 是否允许蓝图。 */
  schematicsAllowed = true;
  /** 友方爆炸是否能点燃/伤害其它方块。 */
  damageExplosions = true;
  /** 是否启用火焰（与 neoplasm 蔓延）。 */
  fire = true;
  /** 空中与地面单位是否每波随机选择目标。 */
  randomWaveAI = false;
  /** 实验性：方块是否在单位内更新并共享电力。 */
  unitPayloadUpdate = false;
  /** 单位被摧毁时其载荷是否被 destroy。 */
  unitPayloadsExplode = false;
  /** 核心是否增加单位上限。 */
  unitCapVariable = true;
  /** 是否隐藏出生点。 */
  hideSpawns = true;
  /** 太阳能板输出倍率。 */
  solarMultiplier = 1;
  /** 单位工厂建造速度倍率。 */
  unitBuildSpeedMultiplier = 1;
  /** 单位建造资源成本倍率。 */
  unitCostMultiplier = 1;
  /** 单位伤害倍率。 */
  unitDamageMultiplier = 1;
  /** 单位初始血量倍率。 */
  unitHealthMultiplier = 1;
  /** 单位撞击伤害倍率。 */
  unitCrashDamageMultiplier = 1;
  /** 单位挖掘速度倍率。 */
  unitMineSpeedMultiplier = 1;
  /** 单位工厂激活延迟（全局）。 */
  unitFactoryActivationDelay = 0;
  /** 摧毁后是否留下幽灵方块（供建造单位重建）。 */
  ghostBlocks = true;
  /** 是否显示其它队伍的标记。 */
  showOtherTeamPings = false;
  /** 是否允许逻辑控制单位。 */
  logicUnitControl = true;
  /** 是否允许单位用逻辑建造。 */
  logicUnitBuild = true;
  /** 是否允许单位用逻辑拆除。 */
  logicUnitDeconstruct = false;
  /** 世界处理器是否可链接玩家建筑。 */
  worldProcessorPlayerLink = true;
  /** 是否可编辑并放置世界处理器。 */
  allowEditWorldProcessors = false;
  /** 世界处理器是否停止更新。 */
  disableWorldProcessors = false;
  /** 方块初始血量倍率。 */
  blockHealthMultiplier = 1;
  /** 方块（炮塔）伤害倍率。 */
  blockDamageMultiplier = 1;
  /** 建筑资源成本倍率。 */
  buildCostMultiplier = 1;
  /** 建造速度倍率。 */
  buildSpeedMultiplier = 1;
  /** 拆除时返还材料比例。 */
  deconstructRefundMultiplier = 0.5;
  /** 计时器目标的时间倍率。 */
  objectiveTimerMultiplier = 1;
  /** 敌方核心周围的禁建半径。 */
  enemyCoreBuildRadius = 400;
  /** 禁建区是否按最近核心计算（多边形保护）。 */
  polygonCoreProtection = false;
  /** 是否禁止在敌方方块附近放置。 */
  placeRangeCheck = false;
  /** PvP 中死亡队伍是否自动转为 derelict。 */
  cleanupDeadTeams = true;
  /** 物品是否只能存入核心。 */
  onlyDepositCore = false;
  /** Serpulo 卸货器是否可从核心取物。 */
  allowCoreUnloaders = true;
  /** 玩家投放物品的冷却（秒）。 */
  itemDepositCooldown = 0.5;
  /** 敌方核心半径内的方块是否在死亡时被摧毁。 */
  coreDestroyClear = false;
  /** 禁用的方块是否从建造菜单隐藏。 */
  hideBannedBlocks = false;
  /** 是否可拆除绝大多数方块（含环境墙）。仅内部/沙盒地图使用。 */
  allowEnvironmentDeconstruct = false;
  /** 是否立即建造且不限速（高度实验性）。 */
  instantBuild = false;
  /** `bannedBlocks` 是否变为白名单。 */
  blockWhitelist = false;
  /** `bannedUnits` 是否变为白名单。 */
  unitWhitelist = false;
  /** 敌方波次投放区半径。 */
  dropZoneRadius = 300;
  /** 波次间隔（tick）。Java 是 `2 * Time.toMinutes` = 2 * 3600。 */
  waveSpacing = 2 * (60 * 60);
  /** 起始波次间隔；<= 0 时使用 `waveSpacing * 2`。 */
  initialWaveSpacing = 0;
  /** 多少波后玩家「获胜」；<= 0 表示禁用。 */
  winWave = 0;
  /** 基础单位上限，可被方块提升。 */
  unitCap = 0;
  /** 是否禁用单位上限。 */
  disableUnitCap = false;
  /** 环境阻力倍率。 */
  dragMultiplier = 1;
  /** 环境标志位，决定视觉与方块能否工作。对应 Java `Vars.defaultEnv`（见陷阱 #10）。 */
  env = defaultEnv;
  /** 环境属性。 */
  attributes = new Attributes();
  /** 有 sector 的存档。`Sector` 未移植（S5），故为 `unknown | null`。 */
  sector: unknown | null = null;
  /** 是否覆盖游戏设置、始终播放环境音乐。 */
  alwaysPlayMusic = false;
  /** 是否禁用自动音乐。 */
  disableMusic = false;
  /** 音乐音量倍率（最大 1）。 */
  musicVolume = 1;
  /** 出生布局（`SpawnGroup` 未移植，S5）。 */
  spawns = new Seq<unknown>();
  /** 核心初始物品。 */
  loadout = new Seq<ItemStack>();
  /** 天气事件（`WeatherEntry` 未移植，S5）。 */
  weather = new Seq<unknown>();
  /** 按方块类型的放置上限。 */
  blockLimits = new Map<Block, number>();
  /** 不可放置的方块。 */
  bannedBlocks = new Set<Block>();
  /** 不可建造的单位（`UnitType` 未移植）。 */
  bannedUnits = new Set<unknown>();
  /** 无视建造可见性而揭示的方块。 */
  revealedBlocks = new Set<Block>();
  /** 已解锁内容名。 */
  researched = new Set<unknown>();
  /** 地图内目标执行器。 */
  objectives = new MapObjectives();
  /** 目标设置的标记。 */
  objectiveFlags = new Set<string>();
  /** 是否启用战争迷雾。 */
  fog = false;
  /** `fog = true` 时是否启用静态（黑色）迷雾。 */
  staticFog = true;
  /** 静态未探索迷雾的颜色。 */
  staticColor = new Color(0, 0, 0, 1);
  /** 已探索但未被监视区域的颜色。 */
  dynamicColor = new Color(0, 0, 0, 0.5);
  /** 是否启用环境光照。 */
  lighting = false;
  /** 环境光颜色。 */
  ambientLight = new Color(0.01, 0.01, 0.04, 0.99);
  /** 光照启用时单位是否发光。 */
  unitLight = true;
  /** 玩家默认队伍。 */
  defaultTeam: Team = Team.sharded;
  /** 波次/扇区中敌方的队伍。 */
  waveTeam: Team = Team.crux;
  /** 玩家降落时显示的云颜色。 */
  cloudColor = new Color(0, 0, 0, 0);
  /** 核心满时是否焚化物品（同战役）。 */
  coreIncinerates = true;
  /** 为 false 时边界渐隐成黑暗。仅与自定义背景同用。 */
  borderDarkness = true;
  /** 是否按下面的矩形裁剪可玩区域。 */
  limitMapArea = false;
  /** 地图区域限制矩形。 */
  limitX = 0;
  limitY = 0;
  limitWidth = 1;
  limitHeight = 1;
  /** 区域外的方块是否被禁用。 */
  disableOutsideArea = true;
  /** 是否允许世界处理器使用 `data` 指令。 */
  allowLogicData = false;

  /** @return 最贴合当前规则的玩法模式。对应 Java `mode()`。 */
  mode(): Gamemode{
    if(this.pvp){
      return Gamemode.pvp;
    }else if(this.editor){
      return Gamemode.editor;
    }else if(this.attackMode){
      return Gamemode.attack;
    }else if(this.infiniteResources){
      return Gamemode.sandbox;
    }else{
      return Gamemode.survival;
    }
  }

  /** 对应 Java `hasEnv(int)`。 */
  hasEnv(env: number): boolean{
    return (this.env & env) !== 0;
  }

  /** 对应 Java `isBanned(Block)`。注意是 `!=`（异或语义），不是 `&&`。 */
  isBanned(block: Block): boolean{
    return this.blockWhitelist !== this.bannedBlocks.has(block);
  }
}
