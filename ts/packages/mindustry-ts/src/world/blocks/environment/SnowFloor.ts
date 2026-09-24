// 源: core/src/mindustry/content/Blocks.java:558-561
//   snow = new Floor("snow"){{
//       attributes.set(Attribute.water, 0.2f);
//       albedo = 0.7f;
//   }};
//
// ⚠️ Java 用双大括号匿名子类（陷阱 #7），TS 侧展开为具名子类 + 构造器赋值。

import { Floor } from "./Floor.js";
import { Attribute } from "../../meta/Attribute.js";

/** 对应 Java `Blocks.snow`。 */
export class SnowFloor extends Floor{
  constructor(name: string){
    super(name);
    this.attributes.set(Attribute.water, 0.2);
    this.albedo = 0.7;
  }
}
