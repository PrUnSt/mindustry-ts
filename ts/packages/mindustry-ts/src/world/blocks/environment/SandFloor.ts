// 源: core/src/mindustry/content/Blocks.java:384-388
//   sand = new Floor("sand-floor"){{
//       itemDrop = Items.sand;
//       playerUnmineable = true;
//       attributes.set(Attribute.oil, 0.7f);
//   }};
//
// ⚠️ 注意名字是 **"sand-floor"** 而不是 "sand" —— "sand" 是**物品**名
//   （`Items.sand`），方块与物品共用 `ContentLoader` 的全局名字表（`nameMap`），
//   重名会被 `handleMappableContent` 直接拒绝。这是 Java 原样，不要"顺手改名"。
//
// ⚠️ Java 用双大括号匿名子类（陷阱 #7），TS 侧展开为具名子类 + 构造器赋值。

import { Floor } from "./Floor.js";
import { Attribute } from "../../meta/Attribute.js";
import { Items } from "../../../content/Items.js";

/** 对应 Java `Blocks.sand`（内部名 `sand-floor`）。 */
export class SandFloor extends Floor{
  constructor(name: string){
    super(name);
    this.itemDrop = Items.sand;
    this.playerUnmineable = true;
    this.attributes.set(Attribute.oil, 0.7);
  }
}
