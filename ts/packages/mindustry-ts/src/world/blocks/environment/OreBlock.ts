// 源: core/src/mindustry/world/blocks/environment/OreBlock.java (91 行)
//
// 用途: 贴在普通地板上的矿石覆盖层。S4 移植它有两个理由：
//   1. 它让 `Tile.setOverlay` / `Tile.drop()` / `Tile.wallDrop()` 的
//      `OverlayFloor` 分支真正被内容覆盖（而不是永远只有 `air`）；
//   2. `content/Items.ts:getAllOres()` 的 TODO 依赖它（`Item.getAllOres` 在 Java 里
//      就是遍历 `Vars.content.blocks()` 里的 `OreBlock`）。
//
// 未移植（渲染路径，计划 §9）:
//   - `createIcons(MultiPacker)` —— 生成阴影贴图（Pixmap/PixmapRegion 全属渲染）
//   - `getDisplayName(Tile)` —— UI
//
// ⚠️ Java 的三个构造器（`(String,Item)` / `(Item)` / `(String)`）在 TS 里用
//   **可选参数 + 运行时判型**合一（TS 无法用同名不同元数表达重载）。语义等价:
//     new OreBlock("ore-copper", Items.copper)  → (String, Item)
//     new OreBlock(Items.copper)                → (Item)  → name = "ore-" + ore.name
//     new OreBlock("ore-x")                     → (String) → 无 itemDrop，由 init() 抛错

import { Core } from "@mindustry-ts/arc";
import { OverlayFloor } from "./OverlayFloor.js";
import type { Item } from "../../../type/Item.js";

/** 对应 `mindustry.world.blocks.environment.OreBlock`。 */
export class OreBlock extends OverlayFloor{
  constructor(nameOrOre: string | Item, ore?: Item){
    const isOre = typeof nameOrOre !== "string";
    // Java `OreBlock(Item ore){ this("ore-" + ore.name, ore); }`
    super(isOre ? "ore-" + nameOrOre.name : nameOrOre);

    // Java `OreBlock(String name)` 分支：useColor = true; variants = 3;
    this.useColor = true;
    this.variants = 3;

    const drop = isOre ? nameOrOre : ore;
    if(drop !== undefined){
      this.localizedName = drop.localizedName;
      this.itemDrop = drop;
      // Java: `mapColor.set(ore.color)`（原地写入；TS 的等价 API 是 `setColor`）
      this.mapColor.setColor(drop.color);
    }
  }

  /**
   * 对应 Java `setup(Item ore)`。
   * ⚠️ `Core.bundle.get("wallore")` 在 headless 下查不到 → 返回 `???wallore???`
   *   （`MockBundle.get` 与 Java `I18NBundle.get(key)` 的缺省行为**完全一致**）。
   *   S4 创建的矿石 `wallOre` 全为 false，因此该分支不可达。
   */
  setup(ore: Item): void{
    this.localizedName = ore.localizedName + (this.wallOre ? " " + Core.bundle.get("wallore") : "");
    this.itemDrop = ore;
    this.mapColor.setColor(ore.color);
  }

  /** 对应 Java `init()`：`itemDrop != null` 时 `setup(itemDrop)`，否则抛错。 */
  override init(): void{
    super.init();

    if(this.itemDrop !== null){
      this.setup(this.itemDrop);
    }else{
      throw new Error(this.name + " must have an item drop!");
    }
  }
}
