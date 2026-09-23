// 源: arc-core/src/arc/mock/MockSettings.java + arc/Settings.java
//
// 迁移说明:
//  - Java 里 `MockSettings extends Settings` 且只把 load()/forceSave() 覆写为空 —— headless 不落盘。
//    TS 中 MockSettings 是唯一的 Settings 实现, 因此 Settings 需要的内存读写直接落在本类:
//      values        <- Settings.values   (Java HashMap<String, Object>)
//      defaultValues <- Settings.defaults (Java ObjectMap<String, Object>)
//  - 未移植: 设置文件读写 (loadValues/saveValues/getSettingsFile/backup)、UBJson/Json 序列化、
//    压缩、executor 异步备份、OS.getAppDataDirectoryString、errorHandler 回调链。
//    headless 下这些路径都不会被走到 (MockSettings 的 load/forceSave 为空实现即为此意)。
//  - put() 的类型白名单与 Java Settings.put 一致 (Float/Integer/Boolean/Long/String/byte[])。
import type { Cons } from "../util/func/Cons";

/** 内存版设置。对应 arc.Settings (+ headless 的 MockSettings)。 */
export class MockSettings{
  /** 对应 Settings.values。 */
  private readonly values = new Map<string, unknown>();
  /** 对应 Settings.defaults。 */
  private readonly defaultValues = new Map<string, unknown>();
  /** 对应 Settings.loaded: MockSettings.load() 不做事, 但仍视为已加载 (Java load() 末尾即 loaded = true)。 */
  private loaded = true;

  private appName = "app";
  private shouldAutosave = true;
  private isModifiedFlag = false;

  // ---------------- 持久化 (headless 下均为空实现, 对齐 MockSettings) ----------------

  /** 对应 MockSettings.load(): 空实现。 */
  load(): void{
  }

  /** 对应 MockSettings.forceSave(): 空实现。 */
  forceSave(): void{
  }

  /** 对应 Settings.manualSave()。 */
  manualSave(): void{
    if(this.loaded) this.forceSave();
  }

  /** 对应 Settings.autosave()。 */
  autosave(): void{
    if(this.isModifiedFlag && this.shouldAutosave){
      this.forceSave();
      this.isModifiedFlag = false;
    }
  }

  // ---------------- 状态与配置 ----------------

  /** 对应 Settings.getAppName()。 */
  getAppName(): string{
    return this.appName;
  }

  /** 对应 Settings.setAppName(String)。 */
  setAppName(name: string): void{
    this.appName = name;
  }

  /** 对应 Settings.setAutosave(boolean)。 */
  setAutosave(autosave: boolean): void{
    this.shouldAutosave = autosave;
  }

  /** 对应 Settings.setErrorHandler(Cons<Throwable>): 仅记录, 供后续阶段使用。
   *  (TS 无 Throwable, 以 Error 对应。) */
  setErrorHandler(_handler: Cons<Error> | null): void{
  }

  /** 对应 Settings.modified()。 */
  modified(): boolean{
    return this.isModifiedFlag;
  }

  /** 对应 Settings.isModified()。 */
  isModified(): boolean{
    return this.isModifiedFlag;
  }

  // ---------------- 基础存取 ----------------

  /** 对应 Settings.defaults(Object...): name1, default1, name2, default2, ... */
  defaults(...objects: unknown[]): void{
    for(let i = 0; i < objects.length; i += 2){
      this.defaultValues.set(String(objects[i]), objects[i + 1]);
    }
  }

  /** 对应 Settings.clear()。 */
  clear(): void{
    this.values.clear();
  }

  /** 对应 Settings.getDefault(String)。 */
  getDefault(name: string): unknown{
    return this.defaultValues.get(name);
  }

  /** 对应 Settings.has(String)。 */
  has(name: string): boolean{
    return this.values.has(name);
  }

  /** 对应 Settings.get(String, Object)。 */
  get(name: string, def: unknown): unknown{
    return this.values.has(name) ? this.values.get(name) : def;
  }

  /** 对应 Settings.put(String, Object): 非白名单类型抛错 (同 Java)。 */
  put(name: string, object: unknown): void{
    if(typeof object === "number" || typeof object === "boolean" || typeof object === "string" || object instanceof Uint8Array){
      this.values.set(name, object);
      this.isModifiedFlag = true;
    }else{
      throw new Error("Invalid object stored: " + (object === null ? "null" : typeof object) + ".");
    }
  }

  /** 对应 Settings.remove(String)。 */
  remove(name: string): void{
    this.values.delete(name);
    this.isModifiedFlag = true;
  }

  /** 对应 Settings.keys()。 */
  keys(): Iterable<string>{
    return this.values.keys();
  }

  /** 对应 Settings.keySize()。 */
  keySize(): number{
    return this.values.size;
  }

  /** 对应 Settings.toggle(String)。 */
  toggle(name: string): void{
    this.put(name, !this.getBool(name));
  }

  /** 对应 Settings.putInt(String, int)。 */
  putInt(name: string, value: number): void{
    this.put(name, value);
  }

  /** 对应 Settings.putFloat(String, float)。 */
  putFloat(name: string, value: number): void{
    this.put(name, value);
  }

  // ---------------- 类型化读取 ----------------
  // 注意: Java 的 getInt(String)/getInt(String,int) 是两个重载, TS 不能写两个带实现的方法体,
  //       故统一为「第二个参数可选」的单一实现 (省略时默认值取自 defaults, 与 Java 重载一致)。

  /** 对应 Settings.getInt(String[, int]): Java 为 `(int)get(...)` 强转。 */
  getInt(name: string, def?: number): number{
    const fallback = def === undefined ? this.numberDefault(name, 0) : def;
    const value = this.get(name, fallback);
    return typeof value === "number" ? Math.trunc(value) : fallback;
  }

  /** 对应 Settings.getFloat(String[, float])。 */
  getFloat(name: string, def?: number): number{
    const fallback = def === undefined ? this.numberDefault(name, 0) : def;
    const value = this.get(name, fallback);
    return typeof value === "number" ? value : fallback;
  }

  /** 对应 Settings.getLong(String[, long])。TS 中 long 与 int 同为 number。 */
  getLong(name: string, def?: number): number{
    return this.getFloat(name, def);
  }

  /** 对应 Settings.getBool(String[, boolean]): 仅当存的是 Boolean 才返回它。 */
  getBool(name: string, def?: boolean): boolean{
    const fallback = def === undefined ? this.booleanDefault(name, false) : def;
    const value = this.get(name, fallback);
    return typeof value === "boolean" ? value : fallback;
  }

  /** 对应 Settings.getString(String[, String])。 */
  getString(name: string, def?: string | null): string | null{
    const fallback = def === undefined ? this.stringDefault(name) : def;
    const value = this.get(name, fallback);
    return typeof value === "string" ? value : fallback;
  }

  /** 对应 Settings.getBytes(String[, byte[]])。 */
  getBytes(name: string, def?: Uint8Array | null): Uint8Array | null{
    const fallback = def === undefined ? this.bytesDefault(name) : def;
    const value = this.get(name, fallback);
    return value instanceof Uint8Array ? value : fallback;
  }

  /** 对应 Settings.getBoolOnce(String): 首次返回 true, 并把该 key 记为 true。 */
  getBoolOnce(name: string): boolean;
  /** 对应 Settings.getBoolOnce(String, Runnable): 仅首次执行 run。 */
  getBoolOnce(name: string, run: () => void): void;
  getBoolOnce(name: string, run?: () => void): boolean | void{
    const value = this.getBool(name, false);
    if(run === undefined){
      this.put(name, true);
      return !value;
    }
    if(!value){
      run();
      this.put(name, true);
    }
  }

  private numberDefault(name: string, def: number): number{
    const value = this.defaultValues.get(name);
    return typeof value === "number" ? value : def;
  }

  private booleanDefault(name: string, def: boolean): boolean{
    const value = this.defaultValues.get(name);
    return typeof value === "boolean" ? value : def;
  }

  private stringDefault(name: string): string | null{
    const value = this.defaultValues.get(name);
    return typeof value === "string" ? value : null;
  }

  private bytesDefault(name: string): Uint8Array | null{
    const value = this.defaultValues.get(name);
    return value instanceof Uint8Array ? value : null;
  }
}
