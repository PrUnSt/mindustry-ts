// 测试: arc-core/src/arc/struct/Seq.java 移植 (ts/packages/arc-ts/src/struct/Seq.ts)
// 覆盖: add/addAll、get/set、removeIndex(有序/无序/越界)、remove 重载消解(函数元素/identity/removeIf)、
//       removeValue、contains/indexOf、
//       size/isEmpty/clear、扩容、first/peek(Java last)/pop、shrink/ensureCapacity、random、iterator/for..of、toArray
import { describe, expect, it } from "vitest";
import { Seq } from "./Seq";

describe("Seq<T> 基础 add/get/set/size", () => {
  it("add 追加元素并返回自身, 支持多值", () => {
    const s = new Seq<number>();
    expect(s.size).toBe(0);
    const r = s.add(10).add(20, 30).add(40, 50, 60).add(70, 80, 90, 100);
    expect(r).toBe(s);
    expect(s.size).toBe(10);
    expect(s.get(0)).toBe(10);
    expect(s.get(9)).toBe(100);
  });

  it("set(index, value) 更新元素, 越界抛异常", () => {
    const s = new Seq<number>([1, 2, 3]);
    s.set(1, 99);
    expect(s.get(1)).toBe(99);
    expect(() => s.set(3, 0)).toThrow();
    expect(() => s.get(3)).toThrow();
  });

  it("构造器与 addAll 多种形态", () => {
    const a = new Seq<number>([1, 2, 3]);
    expect(a.toArray()).toEqual([1, 2, 3]);
    const b = new Seq<number>(a); // 复制构造
    expect(b.toArray()).toEqual([1, 2, 3]);
    expect(b.ordered).toBe(true);

    const c = new Seq<number>();
    c.addAll(a);
    c.addAll([4, 5]);
    expect(c.toArray()).toEqual([1, 2, 3, 4, 5]);

    const d = new Seq<number>();
    d.addAll(a.items, 1, 2); // [2, 3]
    expect(d.toArray()).toEqual([2, 3]);

    const e = Seq.with(7, 8, 9);
    expect(e.toArray()).toEqual([7, 8, 9]);
  });

  it("addUnique 仅在不存在时添加", () => {
    const s = new Seq<number>();
    expect(s.addUnique(5)).toBe(true);
    expect(s.addUnique(5)).toBe(false);
    expect(s.toArray()).toEqual([5]);
  });
});

describe("Seq<T> removeIndex (Java remove(int))", () => {
  it("有序序列删除中间元素后前移", () => {
    const s = new Seq<number>([10, 20, 30, 40]);
    expect(s.remove(1)).toBe(20);
    expect(s.toArray()).toEqual([10, 30, 40]);
    expect(s.size).toBe(3);
  });

  it("无序序列删除时最后一个元素移到被删位置", () => {
    const s = new Seq<number>(false);
    s.addAll([10, 20, 30, 40]);
    expect(s.remove(1)).toBe(20);
    // 最后一个元素 (40) 移到索引 1
    expect(s.toArray()).toEqual([10, 40, 30]);
  });

  it("删除末位元素两种模式结果一致", () => {
    const a = new Seq<number>([1, 2, 3]);
    expect(a.remove(2)).toBe(3);
    expect(a.toArray()).toEqual([1, 2]);

    const b = new Seq<number>(false);
    b.addAll([1, 2, 3]);
    expect(b.remove(2)).toBe(3);
    expect(b.toArray()).toEqual([1, 2]);
  });

  it("越界删除抛异常", () => {
    const s = new Seq<number>([1, 2, 3]);
    expect(() => s.remove(3)).toThrow();
    expect(() => s.remove(-1)).toThrow();
  });
});

describe("Seq<T> removeValue / contains / indexOf", () => {
  it("remove(value) 移除第一个匹配值", () => {
    const s = new Seq<string>(["a", "b", "c", "b"]);
    expect(s.remove("b")).toBe(true);
    expect(s.toArray()).toEqual(["a", "c", "b"]);
    expect(s.remove("zzz")).toBe(false);
    expect(s.toArray()).toEqual(["a", "c", "b"]);
  });

  it("contains / indexOf / lastIndexOf", () => {
    const s = new Seq<string>(["x", "y", "z", "y"]);
    expect(s.contains("y")).toBe(true);
    expect(s.contains("w")).toBe(false);
    expect(s.indexOf("z")).toBe(2);
    expect(s.indexOf("w")).toBe(-1);
    expect(s.indexOf("y")).toBe(1);
    expect(s.lastIndexOf("y", false)).toBe(3);
    expect(s.contains("y", true)).toBe(true);
  });

  it("removeAll(谓词) 与 removeAll(序列)", () => {
    const s = new Seq<number>([1, 2, 3, 4, 5]);
    const kept = s.removeAll((v) => v % 2 === 0);
    expect(kept).toBe(s);
    expect(s.toArray()).toEqual([1, 3, 5]);

    const t = new Seq<number>([1, 2, 3, 4]);
    const removed = new Seq<number>([2, 4]);
    expect(t.removeAll(removed)).toBe(true);
    expect(t.toArray()).toEqual([1, 3]);
  });
});

describe("Seq<T> remove 重载消解 (函数元素 / identity / 谓词)", () => {
  // 反事实锚点: 修复前 remove 会用 `typeof === 'function'` 分派到「按谓词移除」分支,
  // 把函数元素当断言调用。凡被调用即抛错, 使该缺陷无法被静默通过。
  const boom = (): void => { throw new Error("函数元素被当作谓词调用"); };
  const noop = (): void => {};

  it("remove(fn, true) 按引用移除函数元素, 绝不把函数当谓词调用", () => {
    const fnA = boom;
    const fnB = noop;
    const s = new Seq<() => void>([fnA, fnB]);

    expect(s.remove(fnA, true)).toBe(true);      // 修复前: 抛 "函数元素被当作谓词调用"
    expect(s.size).toBe(1);
    expect(s.items[0]).toBe(fnB);                // 留下的是另一个引用 (没有删错)
    expect(s.remove(fnA, true)).toBe(false);     // 已不在: Java 语义返回 false
    expect(s.size).toBe(1);                      // 且不改动序列
    expect(s.items[0]).toBe(fnB);
  });

  it("remove(fn) 单参形式按值/引用移除函数元素, 同样不调用它", () => {
    const fnA = boom;
    const fnB = noop;
    const s = new Seq<() => void>([fnB, fnA]);

    expect(s.remove(fnA)).toBe(true);            // 修复前: 抛 "函数元素被当作谓词调用"
    expect(s.size).toBe(1);
    expect(s.items[0]).toBe(fnB);                // 只删除命中引用的那一个
  });

  it("identity=true 只按引用命中: 引用不同则不移除", () => {
    const inSeq = (): number => 1;
    const notInSeq = (): number => 1;            // 行为相同, 引用不同
    const s = new Seq<() => number>([inSeq]);

    expect(s.remove(notInSeq, true)).toBe(false);
    expect(s.size).toBe(1);
    expect(s.items[0]).toBe(inSeq);

    expect(s.remove(inSeq, true)).toBe(true);
    expect(s.size).toBe(0);
  });

  it("identity=false 走 equals(), identity=true 走引用 — 同一对实例结果相反", () => {
    class Box{
      constructor(readonly v: number){
      }
      equals(o: unknown): boolean{
        return o instanceof Box && o.v === this.v;
      }
    }
    const a = new Box(1);
    const b = new Box(1);                        // 与 a equals, 但引用不同

    const s1 = new Seq<Box>([b]);
    expect(s1.remove(a)).toBe(true);             // equals 命中 -> 删掉 b
    expect(s1.size).toBe(0);

    const s2 = new Seq<Box>([b]);
    expect(s2.remove(a, true)).toBe(false);      // 引用比较: a !== b -> 不删
    expect(s2.size).toBe(1);
    expect(s2.items[0]).toBe(b);

    const s3 = new Seq<Box>([b]);
    expect(s3.remove(a, false)).toBe(true);      // 显式 identity=false 等价于 equals 路径
    expect(s3.size).toBe(0);
  });

  it("remove(value) 只移除第一个匹配项, 重复元素保留其余", () => {
    const s = new Seq<string>(["a", "b", "b", "c", "b"]);
    expect(s.remove("b")).toBe(true);
    expect(s.toArray()).toEqual(["a", "b", "c", "b"]);   // 仅首个 "b" 被删
    expect(s.remove("b")).toBe(true);
    expect(s.toArray()).toEqual(["a", "c", "b"]);
    expect(s.remove("zzz")).toBe(false);                 // 找不到: false
    expect(s.toArray()).toEqual(["a", "c", "b"]);        // 且数组逐元素未变
  });

  it("同一函数引用出现两次时, remove(fn, true) 每次只删一个", () => {
    const fn = (): void => {};
    const s = new Seq<() => void>([fn, fn]);

    expect(s.remove(fn, true)).toBe(true);
    expect(s.size).toBe(1);
    expect(s.items[0]).toBe(fn);
    expect(s.remove(fn, true)).toBe(true);
    expect(s.size).toBe(0);
    expect(s.remove(fn, true)).toBe(false);
  });

  it("removeIf(谓词) 接管 Java remove(Boolf), 只删第一个匹配项", () => {
    const s = new Seq<number>([1, 2, 3, 4]);
    expect(s.removeIf((v) => v % 2 === 0)).toBe(true);
    expect(s.toArray()).toEqual([1, 3, 4]);      // 只删第一个偶数 (2)
    expect(s.removeIf((v) => v > 100)).toBe(false);
    expect(s.toArray()).toEqual([1, 3, 4]);      // 未命中: false 且不改动
  });

  it("数值实参对拍 Java 重载消解: remove(下标) vs removeValue(值)", () => {
    const byIndex = new Seq<number>([10, 20, 30]);
    expect(byIndex.remove(1)).toBe(20);          // remove(int) 优先
    expect(byIndex.toArray()).toEqual([10, 30]);

    const byValue = new Seq<number>([10, 20, 30]);
    expect(byValue.removeValue(20)).toBe(true);  // remove(T, boolean)
    expect(byValue.toArray()).toEqual([10, 30]);

    // 数值重复元素: 按值移除仍只删第一个
    const dup = new Seq<number>([7, 7, 7]);
    expect(dup.removeValue(7)).toBe(true);
    expect(dup.toArray()).toEqual([7, 7]);
  });
});

describe("Seq<T> size / isEmpty / clear", () => {
  it("clear 清空并保持对象可用", () => {
    const s = new Seq<number>([1, 2, 3]);
    expect(s.size).toBe(3);
    expect(s.isEmpty()).toBe(false);
    expect(s.any()).toBe(true);
    s.clear();
    expect(s.size).toBe(0);
    expect(s.isEmpty()).toBe(true);
    expect(s.any()).toBe(false);
    s.add(42);
    expect(s.get(0)).toBe(42);
  });
});

describe("Seq<T> 扩容", () => {
  it("超过初始容量后自动扩容且值保持正确", () => {
    const s = new Seq<number>(2); // 初始容量 2
    const initialLength = s.items.length;
    expect(initialLength).toBe(2);
    for(let i = 0; i < 40; i++) s.add(i);
    expect(s.size).toBe(40);
    expect(s.items.length).toBeGreaterThanOrEqual(40);
    for(let i = 0; i < 40; i++) expect(s.get(i)).toBe(i);
  });
});

describe("Seq<T> first / peek(Java last) / pop", () => {
  it("first 返回首元素, peek 返回末元素, pop 移除并返回末元素", () => {
    const s = new Seq<number>([1, 2, 3]);
    expect(s.first()).toBe(1);
    expect(s.peek()).toBe(3);
    expect(s.pop()).toBe(3);
    expect(s.toArray()).toEqual([1, 2]);
    expect(s.peek()).toBe(2);
  });

  it("空序列下 first/peek/pop 抛异常, firstOpt 返回 null", () => {
    const s = new Seq<number>();
    expect(() => s.first()).toThrow();
    expect(() => s.peek()).toThrow();
    expect(() => s.pop()).toThrow();
    expect(s.firstOpt()).toBeNull();
  });

  it("pop(constructor) 空序列时返回构造器生成的值", () => {
    const s = new Seq<number>();
    expect(s.pop(() => 999)).toBe(999);
    s.add(1);
    expect(s.pop(() => 999)).toBe(1);
  });
});

describe("Seq<T> shrink / ensureCapacity", () => {
  it("shrink 将底层数组缩到当前 size", () => {
    const s = new Seq<number>(100);
    s.addAll([1, 2, 3]);
    expect(s.items.length).toBe(100);
    const arr = s.shrink();
    expect(arr.length).toBe(3);
    expect(s.items.length).toBe(3);
    expect(s.toArray()).toEqual([1, 2, 3]);
  });

  it("ensureCapacity 扩大底层数组容量", () => {
    const s = new Seq<number>(4);
    s.ensureCapacity(50);
    expect(s.items.length).toBeGreaterThanOrEqual(50); // Java 语义: resize(max(8, size + additional))
  });
});

describe("Seq<T> random", () => {
  it("random 返回序列中的元素, 空序列返回 null", () => {
    const s = new Seq<number>([5, 7, 9]);
    for(let i = 0; i < 50; i++){
      expect([5, 7, 9]).toContain(s.random());
    }
    expect(new Seq<number>().random()).toBeNull();
  });
});

describe("Seq<T> iterator 与 for..of", () => {
  it("iterator().hasNext()/next() 遍历全部元素", () => {
    const s = new Seq<number>([1, 2, 3, 4]);
    const collected: number[] = [];
    const it = s.iterator();
    while(it.hasNext()) collected.push(it.next());
    expect(collected).toEqual([1, 2, 3, 4]);
  });

  it("for..of 遍历全部元素", () => {
    const s = new Seq<string>(["a", "b", "c"]);
    const viaFor: string[] = [];
    for(const v of s) viaFor.push(v);
    expect(viaFor).toEqual(["a", "b", "c"]);
  });

  it("迭代器支持 remove", () => {
    const s = new Seq<number>([1, 2, 3, 4, 5]);
    const it = s.iterator();
    while(it.hasNext()){
      const v = it.next();
      if(v % 2 === 0) it.remove();
    }
    expect(s.toArray()).toEqual([1, 3, 5]);
  });

  it("each / map / select", () => {
    const s = new Seq<number>([1, 2, 3]);
    let sum = 0;
    s.each((v) => { sum += v; });
    expect(sum).toBe(6);
    expect(s.map((v) => v * 10).toArray()).toEqual([10, 20, 30]);
    expect(s.select((v) => v > 1).toArray()).toEqual([2, 3]);
  });
});

describe("Seq<T> toArray", () => {
  it("toArray 返回拷贝", () => {
    const s = new Seq<string>(["a", "b"]);
    const arr = s.toArray();
    expect(arr).toEqual(["a", "b"]);
    expect(arr).not.toBe(s.items);
    arr.push("c");
    expect(s.size).toBe(2);
  });
});
