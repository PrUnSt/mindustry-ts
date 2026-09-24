// 源: core/src/mindustry/ctype/MappableContent.java

import { Vars } from "../Vars.js";
import { Content } from "./Content.js";

/** 对应 `mindustry.ctype.MappableContent`：有名字、可在名字表里查到的内容。 */
export abstract class MappableContent extends Content{
  /** 内容名（架构命名后的最终名字）。对应 Java `MappableContent.name`。 */
  readonly name: string;

  protected constructor(name: string){
    super();
    this.name = Vars.content.transformName(name);
    Vars.content.handleMappableContent(this);
  }

  toString(): string{
    return this.name;
  }
}
