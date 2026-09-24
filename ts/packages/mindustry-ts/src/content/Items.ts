// 源: core/src/mindustry/content/Items.java
//
// ⚠️ 陷阱 #7: Java 的双大括号匿名子类（`new Item("copper", …){{ hardness = 1; }}`）一律
// 展开为「构造 + 逐字段赋值」，顺序与 Java 字段赋值顺序一致（对 Item 无副作用差异，
// 但展开后 `id` 的分配顺序与 Java 完全相同，这是唯一有语义的部分）。
//
// 移植范围: 全部 22 个 Serpulo/Erekir 物品（`Items.java:15-150`）。它们全部是纯数据，
// 移植成本低且 id 与 Java 完全对齐 —— 保留完整列表能让后续阶段的 id 断言直接对照 Java。
// 未移植: `serpuloItems` / `erekirItems` / `erekirOnlyItems` 三个分组 Seq（依赖 `Planet`
// 的资源选择界面，计划 §9）。它们只被客户端 UI 消费，不影响模拟。

import { Seq } from "@mindustry-ts/arc";
import { Color } from "../arc-compat/Color.js";
import { Item } from "../type/Item.js";

/** 对应 `mindustry.content.Items`。 */
export class Items{
  static scrap: Item;
  static copper: Item;
  static lead: Item;
  static graphite: Item;
  static coal: Item;
  static titanium: Item;
  static thorium: Item;
  static silicon: Item;
  static plastanium: Item;
  static phaseFabric: Item;
  static surgeAlloy: Item;
  static sporePod: Item;
  static sand: Item;
  static blastCompound: Item;
  static pyratite: Item;
  static metaglass: Item;
  static beryllium: Item;
  static tungsten: Item;
  static oxide: Item;
  static carbide: Item;
  static fissileMatter: Item;
  static dormantCyst: Item;

  /** 对应 Java `Items.load()`。**创建顺序即 id 顺序**，不可改。 */
  static load(): void{
    Items.copper = new Item("copper", Color.valueOf("d99d73"));
    Items.copper.hardness = 1;
    Items.copper.cost = 0.5;
    Items.copper.alwaysUnlocked = true;

    Items.lead = new Item("lead", Color.valueOf("8c7fa9"));
    Items.lead.hardness = 1;
    Items.lead.cost = 0.7;

    Items.metaglass = new Item("metaglass", Color.valueOf("ebeef5"));
    Items.metaglass.cost = 1.5;

    Items.graphite = new Item("graphite", Color.valueOf("b2c6d2"));
    Items.graphite.cost = 1;

    Items.sand = new Item("sand", Color.valueOf("f7cba4"));
    Items.sand.lowPriority = true;
    Items.sand.buildable = false;
    // 需要出现在需求里
    Items.sand.alwaysUnlocked = true;

    Items.coal = new Item("coal", Color.valueOf("272727"));
    Items.coal.explosiveness = 0.2;
    Items.coal.flammability = 1;
    Items.coal.hardness = 2;
    Items.coal.buildable = false;

    Items.titanium = new Item("titanium", Color.valueOf("8da1e3"));
    Items.titanium.hardness = 3;
    Items.titanium.cost = 1;

    Items.thorium = new Item("thorium", Color.valueOf("f9a3c7"));
    Items.thorium.explosiveness = 0.2;
    Items.thorium.hardness = 4;
    Items.thorium.radioactivity = 1;
    Items.thorium.cost = 1.1;
    Items.thorium.healthScaling = 0.2;

    Items.scrap = new Item("scrap", Color.valueOf("777777"));
    Items.scrap.cost = 0.5;

    Items.silicon = new Item("silicon", Color.valueOf("53565c"));
    Items.silicon.cost = 0.8;

    Items.plastanium = new Item("plastanium", Color.valueOf("cbd97f"));
    Items.plastanium.flammability = 0.1;
    Items.plastanium.explosiveness = 0.2;
    Items.plastanium.cost = 1.3;
    Items.plastanium.healthScaling = 0.1;

    Items.phaseFabric = new Item("phase-fabric", Color.valueOf("f4ba6e"));
    Items.phaseFabric.cost = 1.3;
    Items.phaseFabric.radioactivity = 0.6;
    Items.phaseFabric.healthScaling = 0.25;

    Items.surgeAlloy = new Item("surge-alloy", Color.valueOf("f3e979"));
    Items.surgeAlloy.cost = 1.2;
    Items.surgeAlloy.charge = 0.75;
    Items.surgeAlloy.healthScaling = 0.25;

    Items.sporePod = new Item("spore-pod", Color.valueOf("7457ce"));
    Items.sporePod.flammability = 1.15;
    Items.sporePod.buildable = false;

    Items.blastCompound = new Item("blast-compound", Color.valueOf("ff795e"));
    Items.blastCompound.flammability = 0.4;
    Items.blastCompound.explosiveness = 1.2;
    Items.blastCompound.buildable = false;

    Items.pyratite = new Item("pyratite", Color.valueOf("ffaa5f"));
    Items.pyratite.flammability = 1.4;
    Items.pyratite.explosiveness = 0.4;
    Items.pyratite.buildable = false;

    Items.beryllium = new Item("beryllium", Color.valueOf("3a8f64"));
    Items.beryllium.hardness = 3;
    Items.beryllium.cost = 1.2;
    Items.beryllium.healthScaling = 0.6;

    Items.tungsten = new Item("tungsten", Color.valueOf("768a9a"));
    Items.tungsten.hardness = 5;
    Items.tungsten.cost = 1.5;
    Items.tungsten.healthScaling = 0.8;

    Items.oxide = new Item("oxide", Color.valueOf("e4ffd6"));
    Items.oxide.cost = 1.2;
    Items.oxide.healthScaling = 0.5;

    Items.carbide = new Item("carbide", Color.valueOf("89769a"));
    Items.carbide.cost = 1.4;
    Items.carbide.healthScaling = 1.1;

    Items.fissileMatter = new Item("fissile-matter", Color.valueOf("5e988d"));
    Items.fissileMatter.radioactivity = 1.5;
    Items.fissileMatter.hidden = true;

    Items.dormantCyst = new Item("dormant-cyst", Color.valueOf("df824d"));
    Items.dormantCyst.flammability = 0.1;
    Items.dormantCyst.hidden = true;
  }

  /**
   * 对应 Java `Item.getAllOres()` 的等价物（Java 写在 `Item` 上，这里为避免 `Item → Items`
   * 的直接环依赖放在 `Items` 上）。未移植: 依赖 `OreBlock`。
   * TODO(S4/后续): `OreBlock` 移植后补回，签名保持 `Seq<Item>`。
   */
  static getAllOres(): Seq<Item>{
    return new Seq<Item>();
  }
}
