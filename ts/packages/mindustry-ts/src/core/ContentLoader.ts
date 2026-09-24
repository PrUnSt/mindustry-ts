// 源: core/src/mindustry/core/ContentLoader.java (395 行)
//
// 移植范围: 全部内容注册/查询路径 —— 构造器里的按 ordinal 建表、`handleContent` /
// `handleMappableContent` / `transformName`、`initialize(...)` 的三段式（`init` / `postInit`）、
// `logContent()` 的 id 线性自检、`byName` / `getByName` / `getByID` / `getBy` / `getNamesBy`、
// `remove` / `removeLast` / `each`，以及全部 `blocks()/block(...)` 便捷方法。
//
// ⚠️ 陷阱 #8（计划 §6.2）: `contentMap` / `contentNameMap` 是**按 `ContentType.ordinal()`
//   索引的数组**，不是 Map。这是 Java 的原始设计（`ContentLoader.java:28-29`），也是
//   `ContentType` 顺序「Do not rearrange, ever!」的原因 —— `Content` 的构造器把
//   `getBy(getContentType()).size` 直接当作自己的 `id`（`Content.java:20-23`）。
//   改成 Map 会让 id 语义散落在两处，故此处逐字保留数组。
//
// 相对 Java 的差异（逐条标注，均为「S3 无对应物」）:
//   1. `copy()` / `setTemporaryMapper()` —— 前者服务于 `DataPatcher` 的预演，后者服务于
//      存档版本迁移（`SaveVersion.modContentNameMap`）；两者都属数据补丁/IO（S6）。
//      `getByID` 里的 `temporaryMapper` 分支随之省略（S3 恒为 null → 与 Java 走同一条路径）。
//   2. `LoadedMod currentMod` → `unknown | null`，`transformName` 恒为恒等（S3 无 Mod 加载，
//      `setCurrentMod` 只有基础内容场景下的 null）。**不**把 Mod 分支删掉：`transformName` /
//      `handleMappableContent` 里的判断保留，只是永远走 null 分支（与 Java 完全一致）。
//   3. `initialize(Cons<Content>)` 的「已初始化」判据：Java 用 `ObjectSet<Cons<Content>>`。
//      这里用原生 `Set<Cons<Content>>`（身份语义），并且调用方传的是**模块级常量函数**
//      （`contentInit` / `contentPostInit` / `contentLoadIcon` / `contentLoad`），
//      所以判据是确定性的 —— 比 Java 写 `Content::init` 方法引用（每次求值新对象，
//      判据形同虚设）更严格。语义方向一致（防重复初始化），在此标注为**有意收紧**。
//   4. `Blocks.load()` 里 `new ConstructBlock(i)`（i = 1..maxBlockSize）未移植 ——
//      `ConstructBlock` 属「建造计划」系统（S4+）。它不参与任何 S3 断言；
//      省略后 `ContentType.block` 的 id 序列与 Java **不同**（Java 里 air=0，随后
//      construct 1..16 占用 1..16，stone 才是 17）。⚠️ 这一点必须让读者知道：
//      S3 只保证「air === 0」这条断言，不保证其它方块 id 与 Java 相等。
//      见 `content/Blocks.ts` 顶部同样的说明。

import { Events, Log, ObjectMap, Seq } from "@mindustry-ts/arc";
import type { Cons } from "@mindustry-ts/arc";
import { ContentType } from "../ctype/ContentType.js";
import { Content } from "../ctype/Content.js";
import { MappableContent } from "../ctype/MappableContent.js";
import { ContentInitEvent } from "../game/EventType.js";
import { Items } from "../content/Items.js";
import { Liquids } from "../content/Liquids.js";
import { Blocks } from "../content/Blocks.js";
import type { Block } from "../world/Block.js";
import type { Item } from "../type/Item.js";
import type { Liquid } from "../type/Liquid.js";

/** 已加载 Mod（S3 无 Mod 加载，保留类型占位以对齐 Java 的字段签名）。 */
export interface LoadedMod{
  readonly name: string;
}

/** 对应 `mindustry.core.ContentLoader`。 */
export class ContentLoader{
  /** 按 `ContentType.ordinal()` 索引的内容表。**顺序即 id 语义**（陷阱 #8）。 */
  private readonly contentMap: Seq<Content>[] = new Array<Seq<Content>>(ContentType.all.length);
  /** 按 `ContentType.ordinal()` 索引的「名字 → 内容」表。 */
  private readonly contentNameMap: ObjectMap<string, MappableContent>[] = new Array<
    ObjectMap<string, MappableContent>
  >(ContentType.all.length);
  /** 全局名字表（跨类型，`byName` 用）。 */
  private readonly nameMap = new ObjectMap<string, MappableContent>();
  /** 当前加载中的 Mod；基础内容下恒为 null。 */
  private currentMod: LoadedMod | null = null;
  /** 最近注册的内容（错误诊断用）。 */
  private lastAdded: Content | null = null;
  /** 已跑过初始化的回调集合（身份语义，见文件头第 3 条）。 */
  private readonly initialization = new Set<Cons<Content>>();

  constructor(){
    for(const type of ContentType.all){
      this.contentMap[type] = new Seq<Content>();
      this.contentNameMap[type] = new ObjectMap<string, MappableContent>();
    }
  }

  /** 对应 Java `getLastAdded()`。 */
  getLastAdded(): Content | null{
    return this.lastAdded;
  }

  /** 对应 Java `removeLast()`。 */
  removeLast(): void{
    const added = this.lastAdded;
    if(added === null) return;

    const list = this.contentMap[added.getContentType()]!;
    if(list.size > 0 && list.peek() === added){
      list.pop();
      if(added instanceof MappableContent){
        this.contentNameMap[added.getContentType()]!.remove(added.name);
      }
    }
  }

  /** 对应 Java `handleContent(Content)`。 */
  handleContent(content: Content): void{
    this.lastAdded = content;
    this.contentMap[content.getContentType()]!.add(content);
  }

  /** 对应 Java `setCurrentMod(LoadedMod)`。 */
  setCurrentMod(mod: LoadedMod | null): void{
    this.currentMod = mod;
  }

  /** 对应 Java `transformName(String)`。S3 无 Mod，故恒为恒等映射。 */
  transformName(name: string): string{
    return this.currentMod === null ? name : this.currentMod.name + "-" + name;
  }

  /** 对应 Java `handleMappableContent(MappableContent)`。 */
  handleMappableContent(content: MappableContent): void{
    const type = content.getContentType();
    const names = this.contentNameMap[type]!;

    if(names.containsKey(content.name)){
      const list = this.contentMap[type]!;

      // 本方法只在注册内容时被调用，且总是在 handleContent 之后。
      // 若这是最后注册的内容且非法，把它从列表里摘掉，避免非法内容被注册。
      if(list.size > 0 && list.peek() === content){
        list.pop();
      }
      throw new Error("Two content objects defined with the same name: '" + content.name + "'");
    }

    if(this.currentMod !== null){
      content.minfo.mod = this.currentMod;
      if(content.minfo.sourceFile === null){
        // Java: `new Fi(content.name)` —— S3 无 Fi，保留 null 并标注。
      }
    }

    names.put(content.name, content);
    this.nameMap.put(content.name, content);
  }

  /** 对应 Java `byName(String)`。 */
  byName(name: string): MappableContent | null{
    return this.nameMap.get(name);
  }

  /** 对应 Java `getContentMap()`。 */
  getContentMap(): Seq<Content>[]{
    return this.contentMap;
  }

  /** 对应 Java `each(Cons<Content>)`。 */
  each(cons: Cons<Content>): void{
    for(const seq of this.contentMap){
      seq.each(cons);
    }
  }

  /** 对应 Java `getByName(ContentType, String)`。 */
  getByName<T extends MappableContent>(type: ContentType, name: string): T | null{
    if(name === null) return null;
    const map = this.contentNameMap[type];
    if(map === null) return null;

    // Java 在此有 `type == ContentType.block` 时的 SaveVersion 回退表（数据补丁/IO，S6）。
    // S3 无该表，故 name 原样查表 —— 与 Java 在「无回退项」时的行为一致。
    return (map.get(name) as T | null) ?? null;
  }

  /** 对应 Java `getByID(ContentType, int)`。 */
  getByID<T extends Content>(type: ContentType, id: number): T | null{
    // Java 在这里先查 `temporaryMapper`（存档版本迁移，S6）；S3 恒为 null，故直接走下面的分支。
    const list = this.contentMap[type]!;
    if(id >= list.size || id < 0){
      return null;
    }
    return (list.get(id) as T | undefined) ?? null;
  }

  /** 对应 Java `getBy(ContentType)`。 */
  getBy<T extends Content>(type: ContentType): Seq<T>{
    return this.contentMap[type] as unknown as Seq<T>;
  }

  /** 对应 Java `getNamesBy(ContentType)`。 */
  getNamesBy<T extends MappableContent>(type: ContentType): ObjectMap<string, T>{
    return this.contentNameMap[type] as unknown as ObjectMap<string, T>;
  }

  /** 仅用于数据补丁/Mod 内容。对应 Java `remove(Content)`。 */
  remove(content: Content | null): void{
    if(content === null) return;
    const type = content.getContentType();
    this.getBy(type).remove(content);
    if(content instanceof MappableContent){
      this.getNamesBy(type).remove(content.name);
      if(this.nameMap.get(content.name) === content) this.nameMap.remove(content.name);
    }
    content.removeContent();
  }

  /**
   * 对应 Java `createBaseContent()`：按 Java 的**同一顺序**创建基础内容。
   * Java 原文会依次调用 17 个 `loadAll()/load()`；S3 只有 `Items` / `Liquids` / `Blocks`
   * 三个模块存在，其余（`UnitCommand` / `TeamEntries` / `UnitStance` / `StatusEffects` /
   * `Bullets` / `UnitTypes` / `Loadouts` / `Weathers` / `Planets` / `SectorPresets` /
   * `SerpuloTechTree` / `ErekirTechTree`）属 S4+/S5，在此原位标注而不是静默省略。
   *
   * ⚠️ `Blocks.load()` 必须保留在 `Items.load()` 之后：Java 的 `Blocks.load()` 在
   * `Items.load()`（第 61 行）与 `UnitStance.loadAll()`（第 62 行）之后（第 67 行），
   * 因为方块的 `requirements(...)` 会读 `Items.*`。
   */
  createBaseContent(): void{
    // Java: UnitCommand.loadAll();
    // Java: TeamEntries.load();
    Items.load();
    // Java: UnitStance.loadAll();   // needs to access items
    // Java: StatusEffects.load();
    Liquids.load();
    // Java: Bullets.load();
    // Java: UnitTypes.load();
    Blocks.load();
    // Java: Loadouts.load();
    // Java: Weathers.load();
    // Java: Planets.load();
    // Java: SectorPresets.load();
    // Java: SerpuloTechTree.load();
    // Java: ErekirTechTree.load();
  }

  /**
   * 对应 Java `logContent()`：逐类型校验 id 线性（`id === 下标`），然后打印各类型数量。
   * ⚠️ 这个自检是**硬校验**（Java 抛 `IllegalArgumentException`），不是日志。
   * ⚠️ Java 里**没有任何调用点**（`ServerLauncher` / `ClientLauncher` 都不调它），
   * 所以本移植也不自动调用 —— 由 `bootstrap` 测试显式调用来验证 id 不变量。
   */
  logContent(): void{
    for(const arr of this.contentMap){
      for(let i = 0; i < arr.size; i++){
        const id = arr.get(i)!.id;
        if(id !== i){
          throw new Error(
            "Out-of-order IDs for content '" + String(arr.get(i)) + "' (expected " + i + " but got " + id + ")"
          );
        }
      }
    }

    Log.debug("--- CONTENT INFO ---");
    for(let k = 0; k < this.contentMap.length; k++){
      Log.debug("[@]: loaded @", ContentType[k], this.contentMap[k]!.size);
    }
    let total = 0;
    for(const type of ContentType.all){
      total += this.contentMap[type]!.size;
    }
    Log.debug("Total content loaded: @", total);
    Log.debug("-------------------");
  }

  /** 对应 Java `initialize(Cons<Content>)`（含「已跑过就跳过」的判据与 mod 错误分支）。 */
  private initialize(callable: Cons<Content>): void{
    if(this.initialization.has(callable)) return;

    for(const type of ContentType.all){
      for(const content of this.contentMap[type]!){
        try{
          callable(content);
        }catch(e){
          // Java: mod 内容 → Log.err + mods.handleContentError；基础内容 → 包成 RuntimeException 抛出。
          // S3 无 Mod，因此 mod 分支不可达；这里保留同样的形状（`minfo.mod !== null`）。
          const error = e instanceof Error ? e : new Error(String(e));
          if(content.minfo.mod !== null){
            Log.err(error);
            throw error;
          }else{
            throw error;
          }
        }
      }
    }

    this.initialization.add(callable);
  }

  /** 对应 Java `init()`：先 `init()` 再 `postInit()`，最后 fire `ContentInitEvent`。 */
  init(): void{
    this.initialize(ContentLoader.contentInit);
    this.initialize(ContentLoader.contentPostInit);
    // Java: `if(logicVars != null) logicVars.init();` —— 逻辑系统不在 S3 范围（计划 §9）。
    Events.fire(new ContentInitEvent());
  }

  /** 对应 Java `load()`：`loadIcon()` + `load()`（仅非 headless 客户端路径会实际用到）。 */
  load(): void{
    this.initialize(ContentLoader.contentLoadIcon);
    this.initialize(ContentLoader.contentLoad);
  }

  // Java 用方法引用 `Content::init` 等；TS 侧改为**模块级常量函数**，让 `initialization`
  // 的判据确定性成立（见文件头第 3 条）。这三/四个函数的等价性由 `initialize` 的内部实现保证。
  private static readonly contentInit: Cons<Content> = (c) => c.init();
  private static readonly contentPostInit: Cons<Content> = (c) => c.postInit();
  private static readonly contentLoadIcon: Cons<Content> = (c) => c.loadIcon();
  private static readonly contentLoad: Cons<Content> = (c) => c.load();

  // ---------------------------------------------------------------- 便捷方法

  /** 对应 Java `blocks()`。 */
  blocks(): Seq<Block>{
    return this.getBy<Block>(ContentType.block);
  }

  /** 对应 Java `block(int)`。 */
  block(id: number): Block | null;
  /** 对应 Java `block(String)`。 */
  block(name: string): Block | null;
  block(idOrName: number | string): Block | null{
    return typeof idOrName === "number"
      ? this.getByID<Block>(ContentType.block, idOrName)
      : this.getByName<Block>(ContentType.block, idOrName);
  }

  /** 对应 Java `items()`。 */
  items(): Seq<Item>{
    return this.getBy<Item>(ContentType.item);
  }

  /** 对应 Java `item(int)` / `item(String)`。 */
  item(idOrName: number | string): Item | null{
    return typeof idOrName === "number"
      ? this.getByID<Item>(ContentType.item, idOrName)
      : this.getByName<Item>(ContentType.item, idOrName);
  }

  /** 对应 Java `liquids()`。（S3 为空，S4 起有 11 种 —— 见 `content/Liquids.ts`。） */
  liquids(): Seq<Liquid>{
    return this.getBy<Liquid>(ContentType.liquid);
  }

  /** 对应 Java `liquid(int)` / `liquid(String)`。 */
  liquid(idOrName: number | string): Liquid | null{
    return typeof idOrName === "number"
      ? this.getByID<Liquid>(ContentType.liquid, idOrName)
      : this.getByName<Liquid>(ContentType.liquid, idOrName);
  }
}
