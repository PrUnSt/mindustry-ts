// 源: core/src/mindustry/Vars.java (575 行)
//
// 移植范围: S3 的 tick 闭环实际会读到的全部全局量 —— 常量（`tilesize` / `darkRadius` /
// `maxBlockSize` / `finalWorldBounds` / `defaultEnv`）、模块引用（`content` / `world` /
// `state` / `collisions` / `net` / `indexer` / `player`）、`headless` 标志、`emptyTile`，
// 以及 `init()` 的**顺序**（逐行照抄 `Vars.java:311-394` 的 headless 分支）。
//
// ⚠️ 陷阱 #1（计划 §6.2）: `Vars.init()` 的顺序**不可改**，因为：
//   - `Content` 的构造器立刻读 `Vars.content`（`Content.java:20-23`）→ `content` 必须最先建；
//   - `World` 的构造器注册 `TileChangeEvent` / `TileFloorChangeEvent` / `WorldLoadEvent` 监听；
//   - `state = new GameState()` 必须晚于 `world`（`World.isInMapArea` 读 `state.rules`）；
//   - `Events.on(ContentInitEvent, …)` 必须**早于** `content.init()`（后者 fire 该事件）。
//
// ⚠️ 关于 `state` 的 null 语义（陷阱 #15「null vs undefined」）：
//   Java 的 `public static GameState state;` 在 `init()` 之前是 **null**，且
//   `BuildVisibility` 的若干成员**依赖**这个 null（`Vars.state == null || …`）。
//   本移植在类型上把它声明为**非空** `GameState`（否则 40 处 `Vars.state.rules.xxx` 全要加 `!`），
//   初值用一次显式断言写成 null 并在此标注。需要「尚未初始化」判据的调用点
//   （`world/meta/BuildVisibility.ts`）用局部可空视图读取 —— 语义与 Java 完全一致，
//   只是把「可能为 null」的事实集中在一处声明，而不是散落成 40 个非空断言。
//
// 未移植（逐条标注，避免静默丢失）:
//   - 全部 `Fi` 目录字段（`dataDirectory` / `saveDirectory` / `modDirectory` / …）与
//     `javaPath` / `launchIDFile` / `serverCacheFile` —— 文件系统（S3 headless 不读写盘）
//   - `locales` / `loadLocales` / `loadSettings()` / `loadLogger()` / `loadFileLogger()` /
//     `checkLaunch()` / `finishLaunch()` —— 本地化与启动自检（计划 §9）
//   - `emptyMap`（= `new Map(new StringMap())`）—— `Map` 类未移植
//   - `mods` / `maps` / `schematics` / `becontrol` / `asyncCore` / `bases` / `logicVars` /
//     `editor` / `avoidance` / `unitPhysics` / `assetCache` / `service` / `universe` /
//     `spawner` / `pathfinder` / `controlPath` / `fogControl` / `control` / `logic` /
//     `renderer` / `ui` / `netServer` / `netClient` / `waves` / `tree` / `platform` /
//     `mainExecutor` / `loadedServerCache` / `fetchedServers` / `maxTextureSize` / … ——
//     分别属于 Mod / 地图 / 蓝图 / 后台 / 逻辑 / 渲染 / 网络 / UI（S4+ 或明确不做）
//   - `defaultContentIcons` / `playerColors` / `accessibleIcons` / 全部 URL 常量 /
//     全部 `max*` UI 限制 —— UI 元数据（计划 §9）
//   - `Version.init()`（`Version` 类未移植）/ `CacheLayer.init()`（S3 的 CacheLayer 只有常量）
//
// 相对 Java 的**结构性**偏离（必须知道）:
//   Java 把「设置数据目录 → `Vars.init()` → `content.createBaseContent()` →
//   `content.createModContent()` → `content.init()`」这段序列放在 `server/ServerLauncher.java:42-56`，
//   而不是 `Vars` 里。`server` 模块不在 S3 的移植范围（它是 `apps/headless` 的对应物），
//   但测试与 `apps/headless` 都需要这段序列。因此这里额外提供 `Vars.bootstrap()`，
//   逐行对应 `ServerLauncher.init()` 的 headless 分支（`loadLocales = false; headless = true;`
//   已由字段默认值承担）。`Vars.init()` 本身保持与 Java **逐行一致**，不含内容创建。

import { Events, Log, MockNet } from "@mindustry-ts/arc";
import { Groups } from "./gen/Groups.js";
import { ContentInitEvent } from "./game/EventType.js";
import { defaultEnv } from "./game/defaults.js";
import { ContentLoader } from "./core/ContentLoader.js";
import { EntityCollisions } from "./entities/EntityCollisions.js";
import { GameState } from "./core/GameState.js";
import { World } from "./core/World.js";
import { Tile } from "./world/Tile.js";

/** 对应 `mindustry.Vars`。 */
export class Vars{
  // ---------------------------------------------------------------- 常量

  /** 一格在世界坐标里的尺寸。Java `Vars.java:135`。 */
  static readonly tilesize = 8;
  /** 静态墙黑暗半径。Java `Vars.java:67`。 */
  static readonly darkRadius = 4;
  /** 任意方块的尺寸上限。Java `Vars.java:103`（注释：不确定就别改）。 */
  static readonly maxBlockSize = 16;
  /** 超出此边界的单位会立即死亡。Java `Vars.java:117`。 */
  static readonly finalWorldBounds = 250;
  /**
   * 默认规则环境。Java `Vars.java:65`。
   * ⚠️ 陷阱 #10: `Rules.env` 也读这个值，但两边都从 `game/defaults.ts` 这个叶子模块取，
   * 避免 `Vars ↔ Rules` 的模块级环（见 `game/Rules.ts` 顶部）。
   */
  static readonly defaultEnv = defaultEnv;
  /** 游戏名（`Vars.java:77`）。 */
  static readonly appName = "Mindustry";

  // ---------------------------------------------------------------- 标志

  /**
   * 是否运行在 headless（服务器）环境。Java `Vars.java:209`，由 launcher 赋值
   * （`ServerLauncher.java:45` 写 `headless = true`）。
   * S3 唯一存在的 backend 是 `MockApplication`（`type === headless`），故默认 true；
   * 桌面/网页 backend 接入时会由各自 launcher 覆盖。
   */
  static headless = true;
  /** 是否加载本地化。Java `Vars.java:47`。headless 恒为 false（`ServerLauncher.java:44`）。 */
  static loadLocales = false;
  /** 是否启用边界渐隐黑暗。Java `Vars.java:218`。 */
  static enableDarkness = true;
  /** 客户端是否加载完毕。Java `Vars.java:183`。 */
  static clientLoaded = false;

  // ---------------------------------------------------------------- 模块引用

  /** 网络层。S3 是 no-op 存根（`MockNet`），但**必须非空**（`Vars.net.active()` 被广泛调用）。 */
  static net: MockNet = new MockNet();
  /**
   * 内容加载器。⚠️ 陷阱 #1: `Content` 的构造器会立刻读它，因此必须在任何 `Content`
   * 被构造前存在 —— `Vars.init()` 的第一批语句里就创建它。
   */
  static content: ContentLoader;
  /** 全局游戏状态。⚠️ 见文件头关于 null 语义的说明。 */
  static state: GameState = null as unknown as GameState;
  /** 单位/子弹碰撞器。S3 为空实现（`EntityCollisions.ts`），但**必须非空**。 */
  static collisions: EntityCollisions;
  /** 世界。 */
  static world: World;
  /** 当前玩家。S3 是单机 headless，恒为 null（计划 §9）。 */
  static player: unknown | null = null;
  /**
   * 方块索引器。Java `BlockIndexer` 服务于「哪些方块已存在于地图」的查询
   * （`BuildVisibility.coreZoneOnly` 等）。S3 未移植该类；保留字段为 `null` 并标注，
   * 因为 S3 已移植的 `BuildVisibility` 成员都**不**读它。
   * TODO(S4): 移植 `BlockIndexer` 后把类型换成真实类。
   */
  static indexer: unknown | null = null;

  // ---------------------------------------------------------------- 内容

  /**
   * 用于载荷的「空 tile」。Java `Vars.java:252` 声明，`Vars.java:387-389` 注册
   * `ContentInitEvent` 监听器时 `new Tile(Short.MAX_VALUE - 20, Short.MAX_VALUE - 20)`。
   * 在 `content.init()` 之前为 null。
   */
  static emptyTile: Tile | null = null;

  /** 对应 Java `Vars.init()`。**顺序逐行照抄**（见文件头陷阱 #1）。 */
  static init(): void{
    Groups.init();

    // Java: if(loadLocales){ … locales … } —— S3 不做本地化（计划 §9）。
    // Java: Version.init();      —— Version 类未移植。
    // Java: CacheLayer.init();   —— S3 的 CacheLayer 只有常量身份对象，无需初始化。

    if(!Vars.headless){
      Log.info("[Mindustry] Version: @", "S3");
    }

    // Java: dataDirectory = settings.getDataDirectory(); 及其后的一串 Fi 目录 —— S3 不读写盘。
    // Java: emptyMap = new Map(new StringMap());          —— Map 类未移植。

    // ---- 模块创建顺序（`Vars.java:353-377`；未移植的模块原位标注）----
    Vars.content = new ContentLoader();
    // Java: waves = new Waves();                  —— 波次生成器属 S5。
    Vars.collisions = new EntityCollisions();
    Vars.world = new World();
    // Java: universe / becontrol / asyncCore / editor —— S5 / 后台 / 编辑器（计划 §9）。
    // Java: maps / spawner / indexer / pathfinder / controlPath / fogControl /
    //       bases / logicVars / assetCache / javaPath —— 分别属地图 / 波次 / 寻路 /
    //       逻辑 / 资产 / 文件系统（S4+ 或不做）。

    Vars.state = new GameState();

    // Java: mobile / ios / android / becontrol.init() / modDirectory.mkdirs() —— 平台与文件系统。

    // ⚠️ 必须在 `content.init()` 之前注册：`ContentLoader.init()` 末尾会
    // `Events.fire(new ContentInitEvent())`，而本监听器负责给 `emptyTile` 赋值。
    Events.on(ContentInitEvent, () => {
      Vars.emptyTile = new Tile(32767 - 20, 32767 - 20);
    });

    // Java: assetCache.load() / mods.load() / maps.load() —— 资产与地图（S4+ 或不做）。
  }

  /**
   * 对应 `server/ServerLauncher.java:42-56` 的 headless 自举序列（见文件头「结构性偏离」）。
   *
   * ```java
   * loadLocales = false; headless = true;   // 已由字段默认值承担
   * Vars.loadSettings();
   * Vars.init();
   * content.createBaseContent();
   * content.createModContent();             // S3 无 Mod
   * content.init();
   * ```
   *
   * 幂等：重复调用不会重复创建内容（`ContentLoader.initialize` 有「已跑过就跳过」判据），
   * 但会重复 `Vars.init()`（`Groups.init()` 会重建全部 group）。测试与 app 各调一次。
   */
  static bootstrap(): void{
    Vars.init();

    Vars.content.createBaseContent();
    // Java: content.createModContent(); —— S3 无 Mod 加载（计划 §9）。
    Vars.content.init();
  }
}
