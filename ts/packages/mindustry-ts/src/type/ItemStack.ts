// 源: core/src/mindustry/type/ItemStack.java
//
// `with(...)` 在 Java 是 `with(Object... items)` 的变参对（item, amount, item, amount, …）。
// TS 无法表达「类型交替的变参对」，因此提供**同语义的两个签名**：
//   with2(item, amount)  —— 单个
//   withPairs([item, amount], [item, amount], …) —— 多个（数组对）
// `Block.requirements(...)` 的调用点改用这两个（Java 里 90% 的调用只有一个条目）。
// 语义等价（条目顺序、构造出的 ItemStack 数量与内容完全一致）。

import { Seq } from "@mindustry-ts/arc";
import type { Item } from "./Item.js";
import { Items } from "../content/Items.js";
import { Mathf } from "@mindustry-ts/arc";

/** 对应 `mindustry.type.ItemStack`。 */
export class ItemStack implements Comparable2{
  /** 对应 Java `ItemStack.empty`。 */
  static readonly empty: ItemStack[] = [];

  item: Item;
  amount = 0;

  constructor(item: Item | null, amount: number){
    if(item === null) item = Items.copper;
    this.item = item;
    this.amount = amount;
  }

  /** 对应 Java `ItemStack.set(Item, int)`。 */
  set(item: Item, amount: number): ItemStack{
    this.item = item;
    this.amount = amount;
    return this;
  }

  /** 对应 Java `ItemStack.copy()`。 */
  copy(): ItemStack{
    return new ItemStack(this.item, this.amount);
  }

  /** 对应 Java `mult(ItemStack[], float)`。 */
  static mult(stacks: ItemStack[], amount: number): ItemStack[]{
    const copy = new Array<ItemStack>(stacks.length);
    for(let i = 0; i < copy.length; i++){
      copy[i] = new ItemStack(stacks[i]!.item, Mathf.round(stacks[i]!.amount * amount));
    }
    return copy;
  }

  /** 对应 Java `with(Object... items)` 的单条目形式。 */
  static with(item: Item, amount: number): ItemStack[]{
    return [new ItemStack(item, amount)];
  }

  /** 对应 Java `with(Object... items)` 的多条目形式（`[item, amount]` 对）。 */
  static withPairs(...pairs: Array<[Item, number]>): ItemStack[]{
    return pairs.map((pair) => new ItemStack(pair[0], pair[1]));
  }

  /** 对应 Java `list(Object... items)`（返回 `Seq` 而非数组）。 */
  static list(...pairs: Array<[Item, number]>): Seq<ItemStack>{
    const stacks = new Seq<ItemStack>(pairs.length);
    for(const pair of pairs){
      stacks.add(new ItemStack(pair[0], pair[1]));
    }
    return stacks;
  }

  /** 对应 Java `copy(ItemStack[])`。 */
  static copyArray(stacks: ItemStack[]): ItemStack[]{
    const out = new Array<ItemStack>(stacks.length);
    for(let i = 0; i < out.length; i++){
      out[i] = stacks[i]!.copy();
    }
    return out;
  }

  /** 对应 Java `Comparable<ItemStack>.compareTo`（按 item 的 id 升序）。 */
  compareTo(itemStack: ItemStack): number{
    return this.item.compareTo(itemStack.item);
  }

  equals(other: ItemStack | null): boolean{
    return other !== null && other.amount === this.amount && other.item === this.item;
  }

  toString(): string{
    return this.item + ": " + this.amount;
  }
}

/** `Content` 已实现 `compareTo`；这里只做结构化约束，避免 `ItemStack` 直接依赖 `Content`。 */
interface Comparable2{
  compareTo(other: ItemStack): number;
}
