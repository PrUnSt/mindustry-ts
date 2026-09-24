// 源: core/src/mindustry/content/Liquids.java (97 行)
//
// 移植范围: 全部 11 种液体的**创建顺序与字段**（`Liquids.java:13-95`）。
//   ⚠️ **创建顺序即 id 顺序**，不可改（`Content` 构造器把「本类型当前数量」当作 id）。
//   Java 的创建顺序是:
//     water(0), slag(1), oil(2), cryofluid(3), neoplasm(4), arkycite(5),
//     gallium(6), ozone(7), hydrogen(8), nitrogen(9), cyanogen(10)
//   （注意**声明顺序**里 `arkycite` 在 `neoplasm` 之前，但 `load()` 里 `neoplasm` 先创建 ——
//    id 由 `load()` 的顺序决定，所以这里必须用 load 的顺序。）
//
// 未移植（逐条标注）:
//   - `CellLiquid`（`neoplasm` 在 Java 里是它）—— `spreadTarget` / `colorFrom` / `colorTo`
//     / `capPuddles` 的传播求解属水洼系统（计划 §9）。S4 用普通 `Liquid` 创建它，
//     并把 Java 里能落到基类的字段（`capPuddles` / `moveThroughBlocks` / `incinerable` /
//     `blockReactive` / `canStayOn`）照抄；**丢弃** `spreadTarget` / `colorFrom` / `colorTo`
//     三个只属于 `CellLiquid` 的字段。这是一处**显式偏差**，在此记录。
//   - `Liquid.init()` 的 `canStayOn` 闭包（见 `type/Liquid.ts` 文件头）。
//
// ⚠️ S3 的 `Liquids.load()` 是空的，`Liquids.all` 是可空数组占位 —— S4 把它改成与 Java
//   同形的具名静态字段（Java 的 `Liquids` **没有** `all` 字段），因此删掉了 `all`。

import { Color } from "../arc-compat/Color.js";
import { Liquid } from "../type/Liquid.js";
import { StatusEffects } from "../mocks/StatusEffects.js";

/** 对应 `mindustry.content.Liquids`。 */
export class Liquids{
  static water: Liquid;
  static slag: Liquid;
  static oil: Liquid;
  static cryofluid: Liquid;
  static neoplasm: Liquid;
  static arkycite: Liquid;
  static gallium: Liquid;
  static ozone: Liquid;
  static hydrogen: Liquid;
  static nitrogen: Liquid;
  static cyanogen: Liquid;

  /** 对应 Java `Liquids.load()`。**创建顺序即 id 顺序**，不可改。 */
  static load(): void{
    Liquids.water = new Liquid("water", Color.valueOf("596ab8"));
    Liquids.water.heatCapacity = 0.4;
    Liquids.water.effect = StatusEffects.wet;
    Liquids.water.boilPoint = 0.5;
    Liquids.water.gasColor = Color.grays(0.9);
    Liquids.water.alwaysUnlocked = true;

    Liquids.slag = new Liquid("slag", Color.valueOf("ffa166"));
    Liquids.slag.temperature = 1;
    Liquids.slag.viscosity = 0.7;
    Liquids.slag.effect = StatusEffects.melting;
    // Java: `lightColor = Color.valueOf("f0511d").a(0.4f)` —— 方法 `a(float)` 因陷阱 #16
    // 在 TS 侧改名 `alpha(...)`（见 `arc-compat/Color.ts` 的说明）。
    Liquids.slag.lightColor = Color.valueOf("f0511d").alpha(0.4);

    Liquids.oil = new Liquid("oil", Color.valueOf("313131"));
    Liquids.oil.viscosity = 0.75;
    Liquids.oil.flammability = 1.2;
    Liquids.oil.explosiveness = 1.2;
    Liquids.oil.heatCapacity = 0.7;
    Liquids.oil.barColor = Color.valueOf("6b675f");
    Liquids.oil.effect = StatusEffects.tarred;
    Liquids.oil.boilPoint = 0.65;
    Liquids.oil.gasColor = Color.grays(0.4);
    // Java: `canStayOn.add(water);`
    Liquids.oil.canStayOn.add(Liquids.water);

    Liquids.cryofluid = new Liquid("cryofluid", Color.valueOf("6ecdec"));
    Liquids.cryofluid.heatCapacity = 0.9;
    Liquids.cryofluid.temperature = 0.25;
    Liquids.cryofluid.effect = StatusEffects.freezing;
    Liquids.cryofluid.lightColor = Color.valueOf("0097f5").alpha(0.2);
    Liquids.cryofluid.boilPoint = 0.55;
    Liquids.cryofluid.gasColor = Color.valueOf("c1e8f5");

    // Java: `neoplasm = new CellLiquid("neoplasm", ...){{ ... }}` —— 见文件头「未移植」。
    Liquids.neoplasm = new Liquid("neoplasm", Color.valueOf("c33e2b"));
    Liquids.neoplasm.heatCapacity = 0.4;
    Liquids.neoplasm.temperature = 0.54;
    Liquids.neoplasm.viscosity = 0.85;
    Liquids.neoplasm.flammability = 0;
    Liquids.neoplasm.capPuddles = false;
    Liquids.neoplasm.moveThroughBlocks = true;
    Liquids.neoplasm.incinerable = false;
    Liquids.neoplasm.blockReactive = false;
    // Java: `canStayOn.addAll(water, oil, cryofluid);`
    Liquids.neoplasm.canStayOn.add(Liquids.water);
    Liquids.neoplasm.canStayOn.add(Liquids.oil);
    Liquids.neoplasm.canStayOn.add(Liquids.cryofluid);

    Liquids.arkycite = new Liquid("arkycite", Color.valueOf("84a94b"));
    Liquids.arkycite.flammability = 0.4;
    Liquids.arkycite.viscosity = 0.7;
    // Java: `neoplasm.canStayOn.add(this);`
    Liquids.neoplasm.canStayOn.add(Liquids.arkycite);

    Liquids.gallium = new Liquid("gallium", Color.valueOf("9a9dbf"));
    Liquids.gallium.coolant = false;
    Liquids.gallium.hidden = true;

    Liquids.ozone = new Liquid("ozone", Color.valueOf("fc81dd"));
    Liquids.ozone.gas = true;
    Liquids.ozone.barColor = Color.valueOf("d699f0");
    Liquids.ozone.explosiveness = 1;
    Liquids.ozone.flammability = 1;

    Liquids.hydrogen = new Liquid("hydrogen", Color.valueOf("9eabf7"));
    Liquids.hydrogen.gas = true;
    Liquids.hydrogen.flammability = 1;

    Liquids.nitrogen = new Liquid("nitrogen", Color.valueOf("efe3ff"));
    Liquids.nitrogen.gas = true;

    Liquids.cyanogen = new Liquid("cyanogen", Color.valueOf("89e8b6"));
    Liquids.cyanogen.gas = true;
    Liquids.cyanogen.flammability = 2;
  }
}
