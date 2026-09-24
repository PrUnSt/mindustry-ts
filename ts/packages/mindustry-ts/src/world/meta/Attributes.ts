// 源: core/src/mindustry/world/meta/Attributes.java
//
// 为什么 S3 需要它: `Logic.update()` 每 tick 会做
//   state.envAttrs.clear(); state.envAttrs.add(state.rules.attributes);
// 所以这个容器必须真实可用。
//
// 两处**有意收窄**（都在此标注）:
//   1. 内部容器用原生 `Map<unknown, number>` 而不是 arc 的 `ObjectIntMap`。
//      原因: `ObjectIntMap`（`arc-ts/src/struct/ObjectIntMap.ts`）没有暴露遍历接口
//      （没有 `each` / `keys` / 迭代器），而 `Attributes.add(Attributes)` 与 `toArray()`
//      都需要遍历。容器类型本身不可观测，只有 `get/set/add/clear/isEmpty` 的语义重要，
//      这些语义与 Java 完全一致（特别是「`add` 是累加」）。
//   2. 键类型是 `unknown` —— `Attribute`（`world.meta.Attribute`）在 S3 没有任何**写入**点
//      （所有环境属性都来自未移植的地板/矿石/水泵方块），因此不移植该枚举。
//      TODO(S4/S5): `Attribute` 移植后把键类型收紧为 `Attribute`，并把容器换回 `ObjectIntMap`
//      （或给 `ObjectIntMap` 补 `each`，那属于 arc-ts 的范围）。

/** 对应 `mindustry.world.meta.Attributes`（S3 子集）。 */
export class Attributes{
  /** 键在 Java 里是 `Attribute`；S3 无 `Attribute` 枚举（见文件头）。 */
  private readonly map = new Map<unknown, number>();

  /** 对应 Java `clear()`。 */
  clear(): void{
    this.map.clear();
  }

  /** 对应 Java `add(Attribute, float)`。 */
  add(attr: unknown, value: number): void;
  /** 对应 Java `add(Attributes other)`（把另一张表并入本表）。 */
  add(other: Attributes): void;
  add(attrOrOther: unknown, value?: number): void{
    if(attrOrOther instanceof Attributes){
      for(const [key, val] of attrOrOther.map){
        this.map.set(key, (this.map.get(key) ?? 0) + val);
      }
    }else{
      this.map.set(attrOrOther, (this.map.get(attrOrOther) ?? 0) + (value ?? 0));
    }
  }

  /** 对应 Java `set(Attribute, float)`。 */
  set(attr: unknown, value: number): void{
    this.map.set(attr, value);
  }

  /** 对应 Java `get(Attribute)`。 */
  get(attr: unknown): number{
    return this.map.get(attr) ?? 0;
  }

  /** 对应 Java `isEmpty()`。 */
  isEmpty(): boolean{
    return this.map.size === 0;
  }

  /** 对应 Java `toArray()`：返回 `[attr, value, attr, value, ...]`。 */
  toArray(): unknown[]{
    const out: unknown[] = [];
    for(const [key, value] of this.map){
      out.push(key, value);
    }
    return out;
  }

  /** 供 `Attributes.add(Attributes)` 之外的地方（如调试输出）遍历使用。 */
  forEach(cons: (attr: unknown, value: number) => void): void{
    for(const [key, value] of this.map){
      cons(key, value);
    }
  }
}
