// 源: core/src/mindustry/ctype/Content.java
//
// ⚠️ 陷阱 #1 / #11: `Content` 的构造器会**立刻**读 `Vars.content`（`Content.java:20-23`）：
//   id = (short)Vars.content.getBy(getContentType()).size;  Vars.content.handleContent(this);
// 因此 `Vars.content` 必须在**任何** Content 被构造之前存在 —— 这正是 `Vars.init()` 里
// `content(353) → world(356) → … → state(377)` 顺序不可改的原因（逐行照抄 Java）。
//
// 与 Java 的差异: Java 的 `id` 是 `short`，TS 用 number（本项目统一 float64/int 不分）。

import { Vars } from "../Vars.js";
import { ContentType } from "./ContentType.js";

/** 对应 Java `Content.ModContentInfo`。S3 不做 Mod，字段保持 null。 */
export class ModContentInfo{
  /** 加载该内容所属的 Mod；基础游戏内容为 null。 */
  mod: unknown = null;
  /** 该内容的来源文件。 */
  sourceFile: unknown = null;
  /** 加载期间发生的错误；无错误为 null。 */
  error: string | null = null;
  /** 引发错误的底层异常。 */
  baseError: Error | null = null;
  /** 若来自存档，则为关联的内容资产。 */
  asset: unknown = null;
}

/** 对应 `mindustry.ctype.Content`。 */
export abstract class Content{
  /** 该内容在其类型内的自增 id（`Content.java:22`）。 */
  id = 0;
  /** 该内容由哪个 Mod 加载。 */
  minfo = new ModContentInfo();
  /** 是否为已移除的数据补丁内容。 */
  removed = false;

  protected constructor(){
    this.id = Vars.content.getBy(this.getContentType()).size;
    Vars.content.handleContent(this);
  }

  /** @return 该内容的类型；同一类型的所有实例必须返回同一个值。 */
  abstract getContentType(): ContentType;

  /** 数据补丁移除该内容时调用。 */
  removeContent(): void{ }

  /** 全部内容与模块创建完成后调用。**不要**用它加载贴图。 */
  init(): void{ }

  /** `init()` 之后调用。 */
  postInit(): void{ }

  /** 被数据补丁修改后调用。 */
  afterPatch(): void{ }

  /** 全部内容创建完成后调用，仅非 headless。 */
  load(): void{ }

  /** `load()` 之前调用。 */
  loadIcon(): void{ }

  hasErrored(): boolean{
    return this.minfo.error !== null;
  }

  isVanilla(): boolean{
    return this.minfo.mod === null;
  }

  isModded(): boolean{
    return !this.isVanilla();
  }

  /** 对应 Java `Comparable<Content>.compareTo`（按 id 升序）。 */
  compareTo(c: Content): number{
    return this.id < c.id ? -1 : this.id > c.id ? 1 : 0;
  }

  toString(): string{
    return ContentType[this.getContentType()] + "#" + this.id;
  }
}
