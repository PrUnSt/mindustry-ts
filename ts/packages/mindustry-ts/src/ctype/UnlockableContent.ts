// 源: core/src/mindustry/ctype/UnlockableContent.java (302 行)
//
// 移植范围: 构造器 + 元数据字段。Java 的科技树（`techNode` / `techNodes` / `TechTree`）、
// 图标加载（`loadIcon` / `createIcons` / `MultiPacker`）、数据库标签渲染都不在 S3 范围
// （计划 §9「渲染不做」「逻辑编辑器不做」）。
//
// ⚠️ 构造器必须保留（`UnlockableContent.java:87-95`）: 它读 `Core.bundle` 与 `Core.settings`。
// 这正是 S1 要求 `MockBundle.get(k, d)` 必须返回 `d` 而不是抛错的原因。
//
// 注意: `Core.bundle.get(key, def)` 的 key 用 `getContentType().name()` 拼（Java 写法）。
// TS 的 enum 反查 `ContentType[t]` 给出同名字符串。构造器里调用 `this.getContentType()`
// 是抽象方法调用 —— 与 Java 完全相同（子类在原型上已有实现，不涉及字段初始化顺序）。

import { Core } from "@mindustry-ts/arc";
import { ContentType } from "./ContentType.js";
import { MappableContent } from "./MappableContent.js";
import { Stats } from "../mocks/Stats.js";

/** 对应 `mindustry.ctype.UnlockableContent`。 */
export abstract class UnlockableContent extends MappableContent{
  /** 统计数据存储（按需初始化）。对应 Java `stats`。 */
  readonly stats = new Stats();
  /** 本地化正式名；找不到时等于内部名。**永不为 null**。 */
  localizedName: string;
  /** 本地化描述；可能为 null。 */
  description: string | null;
  /** 本地化详情；可能为 null。 */
  details: string | null;
  /** 本地化致谢；可能为 null。 */
  credit: string | null;
  /** 是否在科技树里始终解锁。 */
  alwaysUnlocked = false;
  /** 是否在详情里显示描述。 */
  inlineDescription = true;
  /** 是否在自定义游戏里隐藏详情。 */
  hideDetails = true;
  /** 是否从核心数据库隐藏。 */
  hideDatabase = false;
  /** 是否生成图标（false 时 `createIcons` 不被调用）。 */
  generateIcons = true;
  /** 在选择菜单里的显示尺寸。 */
  selectionSize = 24;
  /** 数据库主分类；null/空时回退 `getContentType()` 名字。 */
  databaseCategory: string | null = null;
  /** 数据库次级标签；null/空时回退 `"default"`。 */
  databaseTag: string | null = null;
  /** 解锁状态（构造期从设置读取）。 */
  protected unlocked: boolean;

  protected constructor(name: string){
    super(name);

    const typeName = ContentType[this.getContentType()];
    this.localizedName = Core.bundle.get(typeName + "." + this.name + ".name", this.name);
    this.description = Core.bundle.getOrNull(typeName + "." + this.name + ".description");
    this.details = Core.bundle.getOrNull(typeName + "." + this.name + ".details");
    this.credit = Core.bundle.getOrNull(typeName + "." + this.name + ".credit");
    this.unlocked = Core.settings.getBool(this.name + "-unlocked", false);
  }

  override postInit(): void{
    super.postInit();

    const typeName = ContentType[this.getContentType()];
    if(this.databaseCategory === null || this.databaseCategory.length === 0) this.databaseCategory = typeName;
    if(this.databaseTag === null || this.databaseTag.length === 0) this.databaseTag = "default";
  }

  /** 默认可见；`AirBlock` 等子类会覆写。 */
  isHidden(): boolean{
    return false;
  }

  /** Java `unlockedNow()` 的单机版本（S3 不区分 host/client）。 */
  unlockedNow(): boolean{
    return true;
  }

  /** @return 是否可在核心数据库/选择菜单中被看到。 */
  isVisibleInDatabase(): boolean{
    return !this.isHidden() && !this.hideDatabase;
  }

  abstract override getContentType(): ContentType;
}
