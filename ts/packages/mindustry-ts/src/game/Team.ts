// 源: core/src/mindustry/game/Team.java
//
// ⚠️ 陷阱 #9（计划 §6.2）: Java 的 `Team` 用 `static{}` 块做两件事：
//   1. `Mathf.rand.setSeed(8)` 并预跑 3 次 `Mathf.random()`（为了「新增队伍不改变随机序列」）；
//   2. 为 id 7..255 创建 249 个占位队伍，每个都要调 `Mathf.rand`（颜色）。
//   最后又 `Mathf.rand.setSeed(new Rand().nextLong())` 把全局随机数器重新随机化。
//   这三步**必须整体保留**，因为：① `Mathf.rand` 是全局共享实例，跳过任何一次调用都会
//   改变后续所有 `Mathf.rand` 消费者看到的序列；② `Team.all[id]` 必须被填满，
//   否则 `Team.get(id)` 返回 undefined（`Team.get` 只做 `((byte)id) & 0xff` 下标）。
//   TS 侧用 `static {}` 块（ES2022）表达，位置与 Java 相同（在具名队伍常量之后）。
//
// 未移植（逐条标注）:
//   - `items()`        —— 依赖 `ItemModule`（S4）
//   - `core()`         —— 依赖 `CoreBuild`（S5）
//   - `isOnlyAI()` / `needsFlowField()` / `activateUnitFactories()` —— 依赖 `TeamRule`
//     （`Rules.teams`）与 `unitActivationDelay`（S5）
//   - `sense()` / `Senseable` —— 逻辑系统（计划 §9）
//   - `rules()`        —— 依赖 `Rules.TeamRules`（S5）；S3 的 `Logic` 不读队伍规则
//   - `hasPalette`/`palette`/`palettei`/`emoji` 保留为字段（渲染/UI 元数据），数值照 Java 写入

import { Color } from "../arc-compat/Color.js";
import { Core } from "@mindustry-ts/arc";
import { Mathf, Rand, Seq } from "@mindustry-ts/arc";
import { Pal } from "../arc-compat/Pal.js";
import { Vars } from "../Vars.js";
import type { Building } from "../gen/Building.js";
import type { TeamData } from "./Teams.js";

/** 对应 `mindustry.game.Team`。 */
export class Team{
  readonly id: number;
  readonly color: Color = new Color();
  readonly palette: Color[] = [new Color(), new Color(), new Color()];
  readonly palettei: number[] = [0, 0, 0];
  ignoreUnitCap = false;
  emoji = "";
  hasPalette = false;
  name: string;

  /** 全部 256 个已注册队伍。 */
  static readonly all: Team[] = new Array<Team>(256);
  /** 编辑器中使用的 6 个基础队伍。 */
  static readonly baseTeams: Team[] = new Array<Team>(6);

  static readonly derelict = new Team(0, "derelict", Color.valueOf("4d4e58"));
  static readonly sharded = new Team(
    1,
    "sharded",
    Pal.accent.cpy(),
    Color.valueOf("ffd37f"),
    Color.valueOf("eab678"),
    Color.valueOf("d4816b")
  );  static readonly crux = new Team(
    2,
    "crux",
    Color.valueOf("f25555"),
    Color.valueOf("fc8e6c"),
    Color.valueOf("f25555"),
    Color.valueOf("a04553")
  );
  static readonly malis = new Team(
    3,
    "malis",
    Color.valueOf("a27ce5"),
    Color.valueOf("c7a4f5"),
    Color.valueOf("896fd6"),
    Color.valueOf("504cba")
  );
  // 这两队暂时没有调色板（Java 注释原样保留）
  static readonly green = new Team(4, "green", Color.valueOf("54d67d"));
  static readonly blue = new Team(5, "blue", Color.valueOf("6c87fd"));
  /** 是的，它看起来和 crux 很像；方块的队伍区域本来就不该用它。 */
  static readonly neoplastic = new Team(6, "neoplastic", Color.valueOf("e05438"));

  static {
    Mathf.rand.setSeed(8);
    // 修正「新增队伍导致的随机种子偏移」
    for(let i = 0; i < 3; i++){
      Mathf.random();
    }
    // 创建全部 256 个占位队伍
    for(let i = 7; i < Team.all.length; i++){
      new Team(
        i,
        "team#" + i,
        Color.HSVtoRGB(
          360 * Mathf.random(),
          100 * Mathf.random(0.4, 1),
          100 * Mathf.random(0.6, 1),
          1
        )
      );
    }
    Mathf.rand.setSeed(new Rand().nextLong());

    Team.neoplastic.ignoreUnitCap = true;
  }

  /** 对应 Java `Team.get(int id)`：`all[((byte)id) & 0xff]`。 */
  static get(id: number): Team{
    // Java 的 `(byte)id` 截断到 8 位有符号，再 `& 0xff` 得到 0..255
    const b = ((id << 24) >> 24) & 0xff;
    return Team.all[b]!;
  }

  /**
   * 对应 Java 的两个构造器（3 参与 6 参）。TS 用可选参数合并：
   * 不传 `pal1..pal3` ⇔ Java 3 参构造器；传齐 ⇔ Java 6 参构造器。
   * ⚠️ 6 参版本的最后一步是 `this.color.set(color)`（覆盖 `setPalette` 写入的 `pal1`），不可省略。
   */
  protected constructor(id: number, name: string, color: Color, pal1?: Color, pal2?: Color, pal3?: Color){
    this.name = name;
    this.color.setColor(color);
    this.id = id;

    if(id < 6) Team.baseTeams[id] = this;
    Team.all[id] = this;

    if(pal1 !== undefined && pal2 !== undefined && pal3 !== undefined){
      this.setPalette(pal1, pal2, pal3);
      this.color.setColor(color);
    }else{
      this.setPaletteSingle(color);
    }
  }

  /** 对应 Java `Team.data()`。 */
  data(): TeamData{
    return Vars.state.teams.get(this);
  }

  /** @return 该队伍是否有任何建筑；波次模式下敌方队伍恒为 true。对应 Java `active()`。 */
  active(): boolean{
    return Vars.state.teams.isActive(this);
  }

  /** @return 该队伍是否有存活的核心。注意与 `active()` 不同。对应 Java `isAlive()`。 */
  isAlive(): boolean{
    return this.data().isAlive();
  }

  /** @return 该队伍是否应由 AI 控制。对应 Java `isAI()`。 */
  isAI(): boolean{
    return (
      (Vars.state.rules.waves || Vars.state.rules.attackMode || Vars.state.isCampaign()) &&
      this !== Vars.state.rules.defaultTeam &&
      !Vars.state.rules.pvp
    );
  }

  /**
   * 对应 Java `cores()`。
   * 返回类型 Java 是 `Seq<CoreBuild>`；`CoreBuild` 属 S5（核心方块），这里用生成的 `Building`
   * 代替并在此标注（S3 中该列表恒为空，因为没有任何方块往 `TeamData.cores` 里写）。
   */
  cores(): Seq<Building>{
    return Vars.state.teams.cores(this);
  }

  /** 对应 Java `localized()`。 */
  localized(): string{
    return Core.bundle.get("team." + this.name + ".name", this.name);
  }

  /** 对应 Java `coloredName()`。 */
  coloredName(): string{
    return this.emoji + "[#" + this.color.toString() + "]" + this.localized() + "[]";
  }

  /** 对应 Java `setPalette(Color)`：单色队伍。**注意末尾把 `hasPalette` 置回 false**。 */
  setPaletteSingle(color: Color): void{
    this.setPalette(color, color.cpy().mul(0.75), color.cpy().mul(0.5));
    this.hasPalette = false;
  }

  /** 对应 Java `setPalette(Color, Color, Color)`。 */
  setPalette(pal1: Color, pal2: Color, pal3: Color): void{
    this.color.setColor(pal1);
    this.palette[0]!.setColor(pal1);
    this.palette[1]!.setColor(pal2);
    this.palette[2]!.setColor(pal3);
    for(let i = 0; i < 3; i++){
      this.palettei[i] = this.palette[i]!.rgba();
    }
    this.hasPalette = true;
  }

  /** 对应 Java `Comparable<Team>.compareTo`。 */
  compareTo(team: Team): number{
    return this.id < team.id ? -1 : this.id > team.id ? 1 : 0;
  }

  toString(): string{
    return this.name;
  }
}
