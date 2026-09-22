// 测试: arc-core/src/arc/struct/OrderedSet.java 移植 (src/struct/OrderedSet.ts)
import { describe, expect, it } from "vitest";
import { OrderedSet } from "./OrderedSet";

describe("OrderedSet 保持插入顺序", () => {
  it("orderedItems 按插入顺序", () => {
    const s = new OrderedSet<string>();
    s.add("a");
    s.add("b");
    s.add("c");
    expect(s.orderedItems().toArray()).toEqual(["a", "b", "c"]);
    expect(s.first()).toBe("a");
  });

  it("重复 add 返回 false 且不改变顺序", () => {
    const s = new OrderedSet<string>();
    s.add("a");
    s.add("b");
    expect(s.add("a")).toBe(false);
    expect(s.size).toBe(2);
    expect(s.orderedItems().toArray()).toEqual(["a", "b"]);
  });

  it("add(key, index) 插入到指定位置", () => {
    const s = new OrderedSet<string>();
    s.add("a");
    s.add("c");
    s.add("b", 1);
    expect(s.orderedItems().toArray()).toEqual(["a", "b", "c"]);
  });
});

describe("OrderedSet remove/removeIndex/clear", () => {
  it("remove 保持顺序", () => {
    const s = new OrderedSet<number>();
    s.add(1);
    s.add(2);
    s.add(3);
    expect(s.remove(2)).toBe(true);
    expect(s.contains(2)).toBe(false);
    expect(s.orderedItems().toArray()).toEqual([1, 3]);
  });

  it("removeIndex 移除指定位置", () => {
    const s = new OrderedSet<number>();
    s.add(1);
    s.add(2);
    s.add(3);
    expect(s.removeIndex(1)).toBe(2);
    expect(s.contains(2)).toBe(false);
    expect(s.orderedItems().toArray()).toEqual([1, 3]);
    expect(s.size).toBe(2);
  });

  it("clear 清空顺序与集合", () => {
    const s = new OrderedSet<number>();
    s.add(1);
    s.add(2);
    s.clear();
    expect(s.size).toBe(0);
    expect(s.isEmpty()).toBe(true);
    expect(s.orderedItems().size).toBe(0);
  });
});

describe("OrderedSet 迭代与扩容", () => {
  it("迭代器与 for..of 按插入顺序", () => {
    const s = new OrderedSet<string>();
    s.add("x");
    s.add("y");
    s.add("z");
    const c1: string[] = [];
    const it = s.iterator();
    while(it.hasNext()) c1.push(it.next());
    expect(c1).toEqual(["x", "y", "z"]);

    const c2: string[] = [];
    for(const v of s) c2.push(v);
    expect(c2).toEqual(["x", "y", "z"]);
  });

  it("大量元素触发 resize 后顺序与 contains 正确", () => {
    const s = new OrderedSet<number>();
    for(let i = 0; i < 120; i++) s.add(i);
    expect(s.size).toBe(120);
    expect(s.orderedItems().get(119)).toBe(119);
    for(let i = 0; i < 120; i++) expect(s.contains(i)).toBe(true);
  });

  it("alter 改变键值不改变位置", () => {
    const s = new OrderedSet<string>();
    s.add("a");
    s.add("b");
    s.add("c");
    expect(s.alter("b", "B")).toBe(true);
    expect(s.orderedItems().toArray()).toEqual(["a", "B", "c"]);
    expect(s.contains("b")).toBe(false);
    expect(s.contains("B")).toBe(true);
  });
});
