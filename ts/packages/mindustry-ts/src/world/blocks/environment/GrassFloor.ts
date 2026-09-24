// 源: core/src/mindustry/content/Blocks.java:547-550
//   grass = new Floor("grass"){{ attributes.set(Attribute.water, 0.1f); }};
//
// ⚠️ Java 用**双大括号匿名子类**（陷阱 #7）。TS 侧一律展开为「具名子类 + 构造器里逐字段赋值」
//   （与 `content/Items.ts` / `content/Blocks.ts` 的既有处置一致）。这里的展开**更贴近 Java**：
//   匿名子类在 Java 里也是独立 `subclass`（`canReplace` 的同类替换分支会区分它与 `stone`）。

import { Floor } from "./Floor.js";
import { Attribute } from "../../meta/Attribute.js";

/** 对应 Java `Blocks.grass`。 */
export class GrassFloor extends Floor{
  constructor(name: string){
    super(name);
    this.attributes.set(Attribute.water, 0.1);
  }
}
