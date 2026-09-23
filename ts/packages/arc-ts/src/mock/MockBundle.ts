// 源: arc-core/src/arc/util/I18NBundle.java (headless 下由 Core.bundle 的空 bundle 承担)
//
// 迁移说明:
//  - Java 的 `Core.bundle` 默认是 `I18NBundle.createEmptyBundle()`; headless 不加载语言文件,
//    因此所有 key 都查不到, 这正是本类的行为。
//  - 关键约束: `get(key, def)` 必须返回 def, **绝不抛错**。原因是
//    core/src/mindustry/ctype/UnlockableContent.java:87-92 的构造器直接读
//    `Core.bundle.get(type + "." + name + ".name", name)` 与 `getOrNull(...)`;
//    如果抛错, 所有 content 的静态初始化都会失败。
//  - 仅移植 headless 需要的查询面 (get/getOrNull/getNotNull/has/format/getKeys/getProperties);
//    语言文件加载 (createBundle/PropertiesUtils/Locale/TextFormatter 复数规则) 未移植。
import { Strings } from "../util/Strings";

/** 语言包。对应 arc.util.I18NBundle 的空实现。 */
export class MockBundle{
  private properties = new Map<string, string>();
  private parent: MockBundle | null = null;

  /** 对应 I18NBundle.createEmptyBundle()。 */
  static createEmptyBundle(): MockBundle{
    return new MockBundle();
  }

  /** @return key 对应的字符串; 查不到时返回 "???key???" (对齐 Java I18NBundle.get(String))。 */
  get(key: string): string;
  /** @return key 对应的字符串, 查不到时返回 def。 */
  get(key: string, def: string): string;
  get(key: string, def?: string): string{
    const value = this.getOrNull(key);
    if(value !== null) return value;
    if(def !== undefined) return def;
    return "???" + key + "???";
  }

  /** @return key 对应的字符串, 查不到时返回 null。对应 I18NBundle.getOrNull。 */
  getOrNull(key: string): string | null{
    const value = this.properties.get(key);
    if(value !== undefined) return value;
    if(this.parent !== null) return this.parent.getOrNull(key);
    return null;
  }

  /** @return key 对应的字符串, 查不到时抛错。对应 I18NBundle.getNotNull。 */
  getNotNull(key: string): string{
    const value = this.getOrNull(key);
    if(value === null){
      throw new Error("No key with name \"" + key + "\" found!");
    }
    return value;
  }

  /** @return 本包或其父包是否包含该 key。对应 I18NBundle.has。 */
  has(key: string): boolean{
    if(this.properties.has(key)) return true;
    return this.parent !== null && this.parent.has(key);
  }

  /** 先用 key 取模板再格式化。对应 I18NBundle.format(String, Object...)。 */
  format(key: string, ...args: unknown[]): string{
    return Strings.format(this.get(key), ...args);
  }

  /** 直接格式化给定字符串。对应 I18NBundle.formatString(String, Object...)。 */
  formatString(string: string, ...args: unknown[]): string{
    return Strings.format(string, ...args);
  }

  /** 按固定小数位格式化。对应 I18NBundle.formatFloat(String, float, int)。 */
  formatFloat(key: string, value: number, places: number): string{
    return Strings.format(this.get(key), Strings.fixed(value, places));
  }

  /** 对应 I18NBundle.getKeys(): 不查父包。 */
  getKeys(): Iterable<string>{
    return this.properties.keys();
  }

  /** 对应 I18NBundle.getProperties(): 返回内部 map, 可修改。 */
  getProperties(): Map<string, string>{
    return this.properties;
  }

  /** 对应 I18NBundle.setProperties。 */
  setProperties(properties: Map<string, string>): void{
    this.properties = properties;
  }

  /** 对应 I18NBundle.getParent / setParent。 */
  getParent(): MockBundle | null{
    return this.parent;
  }

  setParent(parent: MockBundle | null): void{
    this.parent = parent;
  }
}
