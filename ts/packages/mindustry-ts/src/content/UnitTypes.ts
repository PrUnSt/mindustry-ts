// 源: core/src/mindustry/content/UnitTypes.java (2680 行)
//
// ⚠️ 收窄移植（S2 · 单位子系统）。本文件只移植「防御闭环对拍」所需的最小单位集合：
//   `dagger`（炮塔对拍基准的靶子，见 `ts/golden/java-turret-fire.txt` 的 startHealth=150.0）
//   与 `mace`（地面近战单位，可选但一并移植）。
//   其余 **68 个**单位（`UnitTypes.java` 的 `mace…scatheMissileSurgeSplit`）**有意省略**：
//   它们要么依赖未移植的组件（`Legsc` / `Crawlc` / `WaterMovec` / `Tankc` / `Payloadc` /
//   `Mechc` 的部分字段）、要么依赖未移植的武器/子弹子类（`ArtilleryBulletType` /
//   `MissileBulletType` / `LaserBulletType` / `ContinuousBulletType` …）、要么依赖未移植的
//   特效/音效资产 —— 属后续阶段。
//
// ⚠️ **陷阱**（本项目已知，见 `content/Items.ts` 顶部与 codegen README「输入写法」）:
//   1. **Java 的双大括号匿名子类**（`new UnitType("dagger"){{ … }}`）一律展开为
//      「构造 + 逐字段赋值」。不要照抄成匿名类。
//   2. `UnitTypes.java:34` 在**字段**上标了 `@EntityDef({Unitc.class, Mechc.class})`，
//      注解处理器据此生成 `mindustry.gen.MechUnit` 等合并实体类。**本 TS 文件不照搬注解** ——
//      只声明 `UnitType` **实例**；实体类由手写的 `entities/UnitRuntime.ts` 承担（一个具象单位
//      类顶替所有类型，类型信息由 `UnitType` 实例携带）。见 `type/UnitType.ts` 文件头。
//   3. ⚠️ **调用顺序（重要）**：Java 的 `ContentLoader.createBaseContent()` 按
//      `StatusEffects → Bullets → UnitTypes` 的顺序创建，随后 `ContentLoader.init()` 按类型顺序
//      对全部内容调 `init()`（**bullet 先于 unit**）。TS 侧 `UnitTypes.load()` 不在
//      `ContentLoader.createBaseContent()` 里（该文件不在本阶段允许范围内）→ 由本方法自己完成
//      第二段：**先给每个 `weapon.bullet` 调 `init()`（让 `bullet.range` 就位），再调
//      `unit.init()`**。因此调用方应先 `Bullets.load()`（`Bullets.load()` 内部会 init 自己那批
//      子弹），再 `UnitTypes.load()` —— 与 Java 的顺序一致。见 `__tests__/unit.test.ts`。
//
// 数值来源：`ts/golden/java-unit-table.txt`（`content.units()` 的真实属性）：
//   - `dagger|150.0|0.5|8.0|0.0|false|2|large-weapon,large-weapon`（`UnitTypes.java:100-119`）
//   - `mace|550.0|0.5|10.0|4.0|false|2|flamethrower,flamethrower`（`UnitTypes.java:121-151`）
//   golden 的 `weaponCount=2` 是 `UnitType.init()` **镜像**之后的结果：Java 源码里每个单位只写
//   一把武器，`init()`（`UnitType.java:1037-1058`）为 `mirror` 武器补一份 X 取反的副本，并把
//   两者的 `reload` 翻倍。本文件只写原始的那一把，镜像由 `UnitType.init()` 完成。

import { BulletType } from "../type/BulletType.js";
import { UnitType } from "../type/UnitType.js";
import { Weapon } from "../type/Weapon.js";
import { Fx } from "../mocks/Fx.js";
import { Sounds } from "../mocks/Sounds.js";

/** 对应 `mindustry.content.UnitTypes`（收窄集，见文件头）。 */
export class UnitTypes{
  /** 地面近战机甲「dagger」（`UnitTypes.java:100-119`）。 */
  static dagger: UnitType;
  /** 地面喷火机甲「mace」（`UnitTypes.java:121-151`）。 */
  static mace: UnitType;

  /**
   * 对应 Java `UnitTypes.load()`（`UnitTypes.java:97-…`）+ `ContentLoader.init()` 对 unit 类型的
   * 遍历（见文件头第 3 条）。
   */
  static load(): void{
    // ---- dagger（`UnitTypes.java:100-119`）----

    UnitTypes.dagger = new UnitType("dagger");
    UnitTypes.dagger.researchCostMultiplier = 0.5;
    UnitTypes.dagger.speed = 0.5;
    UnitTypes.dagger.hitSize = 8;
    UnitTypes.dagger.health = 150;
    UnitTypes.dagger.stepSoundVolume = 0.4;

    // Java: `new Weapon("large-weapon"){{ … bullet = new BasicBulletType(2.5f, 9){{ width = 7f;
    //   height = 9f; lifetime = 60f; }} }}`（`:107-118`）。
    // ⚠️ `BasicBulletType` 的 `width` / `height` 是**渲染尺寸**（其类未移植）→ 省略，
    //    与 golden `java-bullet-table.txt` 的 `BasicBulletType|2.5|9.0|60.0` 对齐的是
    //    speed / damage / lifetime 三项。
    const daggerWeapon = new Weapon("large-weapon");
    daggerWeapon.reload = 13;
    daggerWeapon.x = 4;
    daggerWeapon.y = 2;
    daggerWeapon.top = false;
    daggerWeapon.ejectEffect = Fx.casing1;
    daggerWeapon.bullet = new BulletType(2.5, 9);
    daggerWeapon.bullet.lifetime = 60;
    UnitTypes.dagger.weapons = [daggerWeapon];

    // ---- mace（`UnitTypes.java:121-151`）----

    UnitTypes.mace = new UnitType("mace");
    UnitTypes.mace.speed = 0.5;
    UnitTypes.mace.hitSize = 10;
    UnitTypes.mace.health = 550;
    UnitTypes.mace.armor = 4;
    // Java `:126` `immunities.add(StatusEffects.burning);` —— `UnitType.immunities` 本阶段
    // 未移植（`Ability`/`ObjectSet` 系统，见 `type/UnitType.ts` 文件头）→ 省略。

    // Java: `new Weapon("flamethrower"){{ top = false; shootSound = Sounds.shootFlame;
    //   shootY = 2f; reload = 22f; recoil = 1f; ejectEffect = Fx.none;
    //   bullet = new BulletType(4.2f, 37f*2f){{ … }} }}`（`:128-150`）。
    const maceWeapon = new Weapon("flamethrower");
    maceWeapon.top = false;
    maceWeapon.shootSound = Sounds.shootFlame;
    maceWeapon.shootY = 2;
    maceWeapon.reload = 22;
    maceWeapon.recoil = 1;
    maceWeapon.ejectEffect = Fx.none;

    const maceBullet = new BulletType(4.2, 37 * 2);
    maceBullet.ammoMultiplier = 3;
    maceBullet.hitSize = 7;
    maceBullet.lifetime = 13;
    maceBullet.pierce = true;
    maceBullet.pierceBuilding = true;
    maceBullet.pierceCap = 2;
    maceBullet.statusDuration = 60 * 5;
    maceBullet.shootEffect = Fx.shootSmallFlame;
    maceBullet.hitEffect = Fx.hitFlameSmall;
    maceBullet.despawnEffect = Fx.none;
    // Java `:146` `status = StatusEffects.burning;` —— ⚠️ `mocks/StatusEffects.ts` **不在本阶段
    // 允许修改的文件范围内**（只读），且未导出 `burning` → 该赋值省略。headless 下状态效果
    // 无消费者，不可观测（与 `content/Bullets.ts` 里 `shocked` 的同一处置）。
    maceBullet.keepVelocity = false;
    maceBullet.hittable = false;
    maceWeapon.bullet = maceBullet;
    UnitTypes.mace.weapons = [maceWeapon];

    // ---- 第二段：等价 `ContentLoader.init()` 对 bullet → unit 的遍历次序（见文件头第 3 条）----
    const units = [UnitTypes.dagger, UnitTypes.mace];

    // 先 init 各武器子弹（`bullet.range` 由 `BulletType.init()` 计算，unit 的 range 依赖它）。
    for(const unit of units){
      for(const weapon of unit.weapons){
        if(weapon.bullet !== null) weapon.bullet.init();
      }
    }

    // 再 init 单位本身（`Weapon.init()` / 镜像 / range / dpsEstimate 都在这里完成）。
    for(const unit of units){
      unit.init();
    }
  }
}
