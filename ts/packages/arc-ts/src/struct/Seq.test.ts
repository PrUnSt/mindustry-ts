// 测试: arc-core/src/arc/struct/Seq.java 移植 (ts/packages/arc-ts/src/struct/Seq.ts)
// 覆盖: add/addAll、get/set、removeIndex(有序/无序/越界)、removeValue、contains/indexOf、
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
