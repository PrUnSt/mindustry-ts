// 源: core/src/mindustry/world/meta/Attribute.java (70 行)
//
// 为什么 S4 需要它: 环境地板（`grass` / `snow` / `sand-floor`）在 Java 里都通过
//   `attributes.set(Attribute.water|oil, v)` 声明环境属性，而 `Block.attributes`
//   是一个真实的 `Attributes` 容器（`Block.java:189`）。S3 的 `Attributes` 把键类型
//   钉成 `unknown`（当时 `Attribute` 枚举没移植，见 `world/meta/Attributes.ts` 文件头）；
//   S4 把 `Attribute` 补上，`Attributes` 的键类型**保持 `unknown`**（收紧它需要改动
//   `Rules.attributes` / `Logic.update()` 两处既有代码，收益仅类型检查 —— 在此标注为
//   后续可做的清理，而不是本轮的范围）。
//
// ⚠️ Java 的 `Attribute` 是**普通类 + 静态工厂**（不是 enum），`all` / `map` 由
//   `add(String)` 在静态字段初始化期自举。TS 侧逐字保持：字段声明顺序 = id 顺序。

/** 对应 `mindustry.world.meta.Attribute`。 */
export class Attribute{
  /** 已注册的全部属性，顺序即 `id`。对应 Java `public static Attribute[] all = {}`。 */
  static all: Attribute[] = [];
  /** 名字 → 属性。对应 Java `public static ObjectMap<String, Attribute> map`（这里用原生 Map）。 */
  static readonly map = new Map<string, Attribute>();

  /** 热值。用于热能发电机产出。 */
  static readonly heat: Attribute = Attribute.add("heat");
  /** 孢子量。用于培养机产出。 */
  static readonly spores: Attribute = Attribute.add("spores");
  /** 水量。用于抽水机产出。 */
  static readonly water: Attribute = Attribute.add("water");
  /** 油量。用于抽油机产出。 */
  static readonly oil: Attribute = Attribute.add("oil");
  /** 光照覆盖。负值降低太阳能板效率。 */
  static readonly light: Attribute = Attribute.add("light");
  /** 用于采砂。 */
  static readonly sand: Attribute = Attribute.add("sand");
  /** 仅用于 Erekir 喷口。 */
  static readonly steam: Attribute = Attribute.add("steam");

  /** 对应 Java `public final int id`。 */
  readonly id: number;
  /** 对应 Java `public final String name`。 */
  readonly name: string;

  private constructor(id: number, name: string){
    this.id = id;
    this.name = name;
  }

  /** 对应 Java `add(String name)`：自举注册并返回新属性。 */
  static add(name: string): Attribute{
    const a = new Attribute(Attribute.all.length, name);
    const prev = Attribute.all;
    Attribute.all = new Array<Attribute>(prev.length + 1);
    for(let i = 0; i < a.id; i++){
      Attribute.all[i] = prev[i]!;
    }
    Attribute.all[a.id] = a;
    Attribute.map.set(name, a);
    return a;
  }

  /** 对应 Java `get(String)`：查不到抛错。 */
  static get(name: string): Attribute{
    const found = Attribute.map.get(name);
    if(found === undefined) throw new Error("Unknown Attribute type: " + name);
    return found;
  }

  /** 对应 Java `getOrNull(String)`。 */
  static getOrNull(name: string): Attribute | null{
    return Attribute.map.get(name) ?? null;
  }

  /** 对应 Java `exists(String)`。 */
  static exists(name: string): boolean{
    return Attribute.map.has(name);
  }

  /** 对应 Java `toString()`。 */
  toString(): string{
    return this.name;
  }
}
