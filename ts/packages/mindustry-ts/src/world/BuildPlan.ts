// 源: core/src/mindustry/entities/units/BuildPlan.java (201 行)
//
// 移植范围（**只做数据部分**，对齐计划 D14 的「绕开策略」）:
//   字段 `x` / `y` / `rotation` / `block` / `breaking`，以及放置/拆除计划都能用到的
//   纯数据判定：`placeable` / `isRotation` / `isDerelictRepair` / `samePos` / `isDone` / `tile`。
//
// 未移植（逐条标注，避免静默丢失语义）:
//   - `config`（Java `public Object config`）—— 方块配置值（如分类器/传送带过滤器）。
//     S4 的方块集合里没有任何 `configurable` 方块，且配置 RPC（`ConfigureEvent`）属网络层（S6）；
//     故整字段省略。**注意**：`BeginPlace` 的构造器 `(x,y,rotation,block,config)` 的 config 参数
//     也随之省略（见下方构造器注释）。
//   - `progress`（Java `public float progress`）—— **渐进建造**的累计进度。计划 D14 明确
//     「不移植渐进建造」（`ConstructBlock` 的进度累积），建造是「点即建」一次性完成，
//     因此没有任何进度需要跟踪。**这不是**渲染字段，而是真实状态字段，属于有意的范围收窄。
//   - `initialized` / `stuck` / `cachedValid`（Java :28）—— `BuilderComp` 的建造队列内部状态
//     （是否开始建、是否卡住、上次校验缓存）。计划 D14 不移植 `BuilderComp` / 单位建造队列。
//   - `worldContext`（Java :30）—— 「本计划在世界里还是在蓝图里渲染」。纯渲染/蓝图概念。
//   - `animScale`（Java :33）—— 纯渲染缩放动画。
//   - `pointConfig(Block, Object, Cons<Point2>)` / `pointConfig(Cons<Point2>)`（Java :88-109）——
//     配置坐标变换，依赖未移植的 `config` 与 `Cons`。
//   - `copy()`（Java :111-123）—— 深拷贝。S4 无建造队列，没有拷贝需求；且它会连带拷贝
//     未移植的 `config`/`progress`/`initialized`/`animScale`。
//   - `bounds(Rect)` / `drawx()` / `drawy()` / `hitbox(Rect)` / `getX()` / `getY()`
//     （Java :125-186）—— 渲染/几何表达（`Rect`、屏幕绘制坐标、`QuadTree.Hitboxc`）。
//     计划 §9「渲染不做」。`drawx/drawy` 仅是「世界坐标 + 方块偏移」，无任何建造语义。
//   - `set(...)`（Java :133-140）—— 复用对象的重设入口，仅 `BuilderComp` 队列用它做对象池。
//
// ⚠️ 相对 Java 的一处**必须知道**的差异: Java 构造器会调 `block.planRotation(rotation)`
//   把点击朝向规整到该方块「计划允许的朝向」。TS 的 `Block` **未移植** `planRotation`
//   （该方法在 `Block.java`，默认实现就是返回入参 rotation；只有极少数方块覆写它，
//   S4 的方块集合里没有）。因此这里直接 `this.rotation = rotation`，语义等价于
//   `planRotation` 的默认实现。

import type { Block } from "./Block.js";
import { Vars } from "../Vars.js";
import { Team } from "../game/Team.js";
import { Build } from "./Build.js";
import type { Tile } from "./Tile.js";

/** 对应 `mindustry.entities.units.BuildPlan`（数据部分）。 */
export class BuildPlan{
  /** 计划的位置（tile 坐标）。对应 Java `public int x, y`。 */
  x: number;
  y: number;
  /** 放置朝向（0-3）；拆除计划的值为 -1。对应 Java `public int rotation`。 */
  rotation: number;
  /** 要放置的方块；为 null 时表示这是一个拆除计划。对应 Java `public @Nullable Block block`。 */
  block: Block | null;
  /** 是否为拆除计划。对应 Java `public boolean breaking`。 */
  breaking: boolean;

  /** 对应 Java `BuildPlan(int x, int y, int rotation, Block block)`（放置计划）。 */
  constructor(x: number, y: number, rotation: number, block: Block);
  /** 对应 Java `BuildPlan(int x, int y)`（拆除计划）。 */
  constructor(x: number, y: number);
  /**
   * ⚠️ `block.planRotation(rotation)` 未移植 —— 放置计划直接采用入参 `rotation`（见文件头）。
   * 拆除计划用 `world.tile(x, y).block()` 捕获「当前要拆的方块」（同 Java）。
   */
  constructor(x: number, y: number, rotation?: number, block?: Block){
    this.x = x;
    this.y = y;
    if(block === undefined){
      // Java 原文: `world.tile(x, y).block()`（越界会 NPE）；这里用可选链退化为 null。
      this.rotation = -1;
      this.block = Vars.world.tile(x, y)?.block() ?? null;
      this.breaking = true;
    }else{
      this.rotation = rotation!;
      this.block = block;
      this.breaking = false;
    }
  }

  /** @return 该放置计划在该队伍下是否合法。对应 Java `placeable(Team)`。 */
  placeable(team: Team): boolean{
    // Java 直接读字段 `block`（可能为 null，但 placeable 只在放置计划上调用）
    return Build.validPlace(this.x, this.y, this.block!, team, this.rotation);
  }

  /**
   * @return 本计划是否只是对**已存在的同类方块**重新定向（而非新建）。
   * 对应 Java `isRotation(Team)`（Java `BuildPlan.java:71-75`）。
   */
  isRotation(team: Team): boolean{
    if(this.breaking) return false;
    const tile = this.tile();
    return (
      tile !== null &&
      tile.team() === team &&
      tile.block() === this.block &&
      tile.build !== null &&
      tile.build.rotation !== this.rotation
    );
  }

  /** @return 本计划是否是修复「无主（derelict）同类方块」。对应 Java `isDerelictRepair()`。 */
  isDerelictRepair(): boolean{
    if(this.breaking || !Vars.state.rules.derelictRepair) return false;
    const tile = this.tile();
    return tile !== null && tile.team() === Team.derelict && tile.block() === this.block && tile.build !== null;
  }

  /** @return 两个计划是否在同一格。对应 Java `samePos(BuildPlan)`。 */
  samePos(other: BuildPlan): boolean{
    return this.x === other.x && this.y === other.y;
  }

  /**
   * @return 本计划的目标是否已达成。对应 Java `isDone()`（`BuildPlan.java:150-159`）。
   * 拆：目标格已是空气或只剩地板；建：目标格已是该方块（且朝向一致或无建筑）。
   */
  isDone(): boolean{
    const tile = this.tile();
    if(tile === null) return true;
    const tblock = tile.block();
    if(this.breaking){
      return tblock.isAir() || tblock === tile.floor();
    }
    return tblock === this.block && (tile.build === null || tile.build.rotation === this.rotation);
  }

  /** @return 本计划所在 tile（可能越界为 null）。对应 Java `tile()`。 */
  tile(): Tile | null{
    return Vars.world.tile(this.x, this.y);
  }

  /** 对应 Java `toString()`（去掉未移植字段后的子集）。 */
  toString(): string{
    return (
      "BuildPlan{" +
      "x=" + String(this.x) +
      ", y=" + String(this.y) +
      ", rotation=" + String(this.rotation) +
      ", block=" + String(this.block) +
      ", breaking=" + String(this.breaking) +
      "}"
    );
  }
}
