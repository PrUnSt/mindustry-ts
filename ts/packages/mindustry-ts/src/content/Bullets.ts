// 源: core/src/mindustry/content/Bullets.java (53 行)
//
// ⚠️ 收窄移植（S1 · 子弹子系统）。Java 的 `Bullets` 只有 6 个成员，但 `fireball` /
//   `spaceLiquid` 分别是 `FireBulletType` / `SpaceLiquidBulletType` 的实例，这两个子类未移植
//   （它们的行为依赖 `Fire` / 水洼系统，属 S4+）→ **有意省略**，并在下面标注。
//   另外，v7 起炮塔弹药不再是 `Bullets.standardXxx` 这样的预设（`Bullets.java` 顶部注释：
//   "Formerly used to define preset bullets for turrets; as of v7, these have been inlined at
//   the source."）—— 它们被**内联**进各炮塔（`duo` 见 `Blocks.java:3276-3349`，`scatter` 见
//   `Blocks.java:3351-3435`）。本文件把 duo/scatter 的弹药**抽出来命名化**，方便后续
//   炮塔/防御闭环阶段直接引用；数值**逐字对齐 `golden/java-bullet-table.txt`**。
//
// ⚠️ 陷阱 #7（同 `content/Items.ts`）：Java 的双大括号匿名子类
//   （`new BasicBulletType(2.5f, 9){{ width = 7f; … }}`）一律展开为「构造 + 逐字段赋值」。
//   `BulletType` 的 id 顺序 = **创建顺序**（`Content` 构造器按 `getBy(type).size` 自增 id），
//   所以下面每个 `new` 的**先后次序不可随意调整**。
//
// 数值来源（golden 表列 `name|speed|damage|lifetime|hitSize|pierce|collidesAir|collidesGround`）:
//   - `placeholder`      ← golden:5  `BasicBulletType|2.5|9.0|60.0|4|false|true|true`
//                             （`Bullets.java:18-23`）
//   - `standardCopper`   ← golden:6  `BasicBulletType|2.5|9.0|70.0|4|false|true|true`
//                             （`Blocks.java:3279` 的 copper 弹药 + `duo.limitRange(5f)`）
//   - `standardGraphite` ← golden:7  `BasicBulletType|3.5|18.0|54.57143|4|false|true|true`
//                             （`Blocks.java:3289`；`rangeChange = 16`）
//   - `standardSilicon`  ← golden:8  `BasicBulletType|3.0|12.0|58.333332|4|false|true|true`
//                             （`Blocks.java:3301`；`homingPower = 0.2`）
//   - `flakScrap`        ← golden:9  `FlakBulletType|4.0|3.0|58.0|4|false|true|false`
//                             （`Blocks.java:3354`）
//   - `flakLead`         ← golden:10 `FlakBulletType|4.2|3.0|55.2381|4|false|true|false`
//                             （`Blocks.java:3369`）
//   - `flakMetaglass`    ← golden:11 `FlakBulletType|4.0|3.0|58.0|4|false|true|false`
//                             （`Blocks.java:3379`）
//
// ⚠️ **lifetime 为什么不是源码里的 60**：`BulletType.java` 里 duo/scatter 的弹药源码写的是
//   `lifetime = 60f`，但 `golden/java-bullet-table.txt` 记录的是**跑过 `Turret.init()` 之后**的
//   值。`Turret.limitRange(BulletType, float margin)`（`Turret.java:248-252`）会重算：
//       lifetime = (range + margin + extraRangeMargin + 10) / speed
//   duo:    margin 5, range 160        → copper 175/2.5 = 70；graphite (160+16+5+10)/3.5 = 54.571…；silicon 175/3 = 58.333…
//   scatter: margin 2, range 220       → 4.0 → 232/4 = 58；4.2 → 232/4.2 = 55.238…
//   这里直接把**炮塔结算后的最终值**写死（本阶段没有炮塔类），并在报告中说明这是
//   「以 golden 为准」的有意取值，而不是源码字面值。

import { BulletType } from "../type/BulletType.js";
import { Color } from "../arc-compat/Color.js";
import { Fx } from "../mocks/Fx.js";
import { StatusEffects } from "../mocks/StatusEffects.js";

/** 对应 `mindustry.content.Bullets`（收窄集，见文件头）。 */
export class Bullets{
  /** 空占位弹药（防止 NPE；Java `Bullets.java:18-23`）。 */
  static placeholder: BulletType;
  /**
   * 闪电专用弹药（`Bullets.java:26-34`）。
   * ⚠️ 两处收窄：① `lifetime = Fx.lightning.lifetime`（`Fx.java:189` 的 `new Effect(10f, …)`
   * → **10**）—— `mocks/Fx.ts` 的 `Effect` 只有身份、无 `lifetime` 字段（只允许追加常量，
   * 不允许改类），故直接写字面量 10；② `status = StatusEffects.shocked` —— mock 未导出
   * `shocked`（见 `type/BulletType.ts` 文件头），故暂用 `StatusEffects.none`（headless
   * 无状态效果消费者，不可观测）。
   */
  static damageLightning: BulletType;
  /** `damageLightning` 的副本，不伤害空中单位（`Bullets.java:37-38`）。 */
  static damageLightningGround: BulletType;
  /** `damageLightning` 的副本，不伤害地面单位/地形（`Bullets.java:40-42`）。 */
  static damageLightningAir: BulletType;

  // ---- duo 的三种弹药（`Blocks.java:3279/3289/3301`，lifetime 已按 `Turret.limitRange` 结算）----

  /** `duo` 的铜弹药（golden:6）。 */
  static standardCopper: BulletType;
  /** `duo` 的石墨弹药（golden:7）。 */
  static standardGraphite: BulletType;
  /** `duo` 的硅弹药（golden:8，带 `homingPower = 0.2`）。 */
  static standardSilicon: BulletType;

  // ---- scatter 的三种弹药 + 玻璃破片（`Blocks.java:3354/3369/3379/3394`）----

  /** `scatter` 的废料弹药（golden:9）。 */
  static flakScrap: BulletType;
  /** `scatter` 的铅弹药（golden:10）。 */
  static flakLead: BulletType;
  /** `scatter` 的玻璃弹药（golden:11，带 6 枚破片）。 */
  static flakMetaglass: BulletType;
  /** `flakMetaglass` 的破片（`Blocks.java:3394-3403`）。 */
  static glassFrag: BulletType;

  /**
   * 对应 Java `Bullets.load()`。
   *
   * ⚠️ 相对 Java 的**结构性差异（必须知道）**：Java 把「创建」与「`Content.init()`」分成两段
   * （`Bullets.load()` 只创建，`ContentLoader.init()` 事后统一调 `init()`）。TS 侧
   * `class ContentLoader.createBaseContent()`（`Core/ContentLoader.ts:208-224`）**没有**调用
   * `Bullets.load()`（该文件不在本阶段允许范围内），因此没人替这些子弹跑 `init()`。
   * → 本方法在创建完全部子弹后，**自己再跑一遍 `init()`**（顺序与 `ContentLoader.init()` 一致：
   * 逐条 `init()`），让 `pierce` / `despawnHit` / `lightningType` / `range` 等派生字段就位。
   * 语义与 Java 的两段式等价，只是把第二段收进同一个入口。
   */
  static load(): void{
    // ---- 创建（顺序 = Java `Bullets.load()` 的顺序，id 因此对齐 Java 的前 4 项）----

    Bullets.placeholder = new BulletType(2.5, 9);
    Bullets.placeholder.lifetime = 60;
    Bullets.placeholder.ammoMultiplier = 2;

    Bullets.damageLightning = new BulletType(0.0001, 0);
    Bullets.damageLightning.lifetime = 10; // Java: `Fx.lightning.lifetime`（Fx.java:189）
    Bullets.damageLightning.hitEffect = Fx.hitLancer;
    Bullets.damageLightning.despawnEffect = Fx.none;
    Bullets.damageLightning.status = StatusEffects.none; // Java: StatusEffects.shocked（见字段说明）
    Bullets.damageLightning.statusDuration = 10;
    Bullets.damageLightning.hittable = false;
    Bullets.damageLightning.lightColor = Color.white;

    Bullets.damageLightningGround = Bullets.damageLightning.copy();
    Bullets.damageLightningGround.collidesAir = false;

    Bullets.damageLightningAir = Bullets.damageLightning.copy();
    Bullets.damageLightningAir.collidesGround = false;
    Bullets.damageLightningAir.collidesTiles = false;

    // Java: fireball = new FireBulletType(1f, 4){{ hittable = false; }} —— 子类未移植，省略。
    // Java: spaceLiquid = new SpaceLiquidBulletType(){{ knockback = 0.7f; drag = 0.01f; }} —— 同上。

    // ---- duo 弹药（`Blocks.java:3279-3315` + `duo.limitRange(5f)`，`Blocks.java:3348`）----

    Bullets.standardCopper = new BulletType(2.5, 9);
    Bullets.standardCopper.lifetime = 70; // (160 + 5 + 0 + 10) / 2.5
    Bullets.standardCopper.ammoMultiplier = 2;
    // Java: hitEffect = despawnEffect = Fx.hitBulletColor; hitColor = backColor = trailColor = Pal.copperAmmoBack;
    //       frontColor = Pal.copperAmmoFront;  —— 渲染字段（`backColor`/`frontColor` 属 BasicBulletType），
    //       未移植对应 Pal 常量（headless 不渲染），见文件头。
    Bullets.standardCopper.hitEffect = Fx.hitBulletColor;
    Bullets.standardCopper.despawnEffect = Fx.hitBulletColor;

    Bullets.standardGraphite = new BulletType(3.5, 18);
    Bullets.standardGraphite.lifetime = (160 + 16 + 5 + 10) / 3.5; // 54.57142857142857
    Bullets.standardGraphite.ammoMultiplier = 4;
    Bullets.standardGraphite.reloadMultiplier = 0.8;
    Bullets.standardGraphite.rangeChange = 16;
    Bullets.standardGraphite.hitEffect = Fx.hitBulletColor;
    Bullets.standardGraphite.despawnEffect = Fx.hitBulletColor;

    Bullets.standardSilicon = new BulletType(3.0, 12);
    Bullets.standardSilicon.lifetime = (160 + 5 + 0 + 10) / 3.0; // 58.333333333333336
    Bullets.standardSilicon.homingPower = 0.2;
    Bullets.standardSilicon.reloadMultiplier = 1.5;
    Bullets.standardSilicon.ammoMultiplier = 5;
    Bullets.standardSilicon.trailLength = 5; // 渲染
    Bullets.standardSilicon.trailWidth = 1.5; // 渲染
    Bullets.standardSilicon.hitEffect = Fx.hitBulletColor;
    Bullets.standardSilicon.despawnEffect = Fx.hitBulletColor;

    // ---- scatter 弹药（`Blocks.java:3354-3404` + `scatter.limitRange(2)`，`Blocks.java:3434`）----
    // ⚠️ `FlakBulletType` 的构造器把 `collidesGround` 置 false（`FlakBulletType.java:18`），
    //    这里按 golden 表逐条写死（本阶段没有 FlakBulletType 子类）。

    Bullets.flakScrap = new BulletType(4.0, 3);
    Bullets.flakScrap.lifetime = (220 + 2 + 0 + 10) / 4.0; // 58
    Bullets.flakScrap.ammoMultiplier = 5;
    Bullets.flakScrap.shootEffect = Fx.shootSmall;
    Bullets.flakScrap.reloadMultiplier = 0.5;
    Bullets.flakScrap.collidesGround = false;
    Bullets.flakScrap.hitEffect = Fx.flakExplosion;
    Bullets.flakScrap.splashDamage = 22 * 1.5;
    Bullets.flakScrap.splashDamageRadius = 24;
    Bullets.flakScrap.despawnEffect = Fx.hitBulletColor;

    Bullets.flakLead = new BulletType(4.2, 3);
    Bullets.flakLead.lifetime = (220 + 2 + 0 + 10) / 4.2; // 55.23809523809524
    Bullets.flakLead.ammoMultiplier = 4;
    Bullets.flakLead.shootEffect = Fx.shootSmall;
    Bullets.flakLead.collidesGround = false;
    Bullets.flakLead.hitEffect = Fx.flakExplosion;
    Bullets.flakLead.splashDamage = 27 * 1.5;
    Bullets.flakLead.splashDamageRadius = 15;

    // 玻璃弹药引用它自己的破片 → 先建破片（Java 里是在匿名子类的字段初始化里 `new` 的，
    // 顺序上同样「先于」外层对象的 `init()`）。
    Bullets.glassFrag = new BulletType(3.0, 5);
    Bullets.glassFrag.lifetime = 20;
    Bullets.glassFrag.collidesGround = false;
    Bullets.glassFrag.despawnEffect = Fx.none;

    Bullets.flakMetaglass = new BulletType(4.0, 3);
    Bullets.flakMetaglass.lifetime = (220 + 2 + 0 + 10) / 4.0; // 58
    Bullets.flakMetaglass.ammoMultiplier = 5;
    Bullets.flakMetaglass.shootEffect = Fx.shootSmall;
    Bullets.flakMetaglass.reloadMultiplier = 0.8;
    Bullets.flakMetaglass.collidesGround = false;
    Bullets.flakMetaglass.hitEffect = Fx.flakExplosion;
    Bullets.flakMetaglass.splashDamage = 30 * 1.5;
    Bullets.flakMetaglass.splashDamageRadius = 20;
    Bullets.flakMetaglass.fragBullets = 6;
    Bullets.flakMetaglass.fragBullet = Bullets.glassFrag;

    // ---- 第二段：等价 `ContentLoader.init()` 对 bullet 类型的遍历（见方法注释）----
    for(const bullet of [
      Bullets.placeholder,
      Bullets.damageLightning,
      Bullets.damageLightningGround,
      Bullets.damageLightningAir,
      Bullets.standardCopper,
      Bullets.standardGraphite,
      Bullets.standardSilicon,
      Bullets.flakScrap,
      Bullets.flakLead,
      Bullets.flakMetaglass,
      Bullets.glassFrag
    ]){
      bullet.init();
    }
  }
}
