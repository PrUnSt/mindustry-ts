// 测试: arc-core/src/arc/struct/IntSet.java 移植 (src/struct/IntSet.ts)
import { describe, expect, it } from "vitest";
import { IntSet } from "./IntSet";

describe("IntSet add/contains/remove", () => {
  it("add 去重, contains/remove 语义", () => {
    const s = new IntSet();
    expect(s.add(5)).toBe(true);
    expect(s.add(5)).toBe(false);
    expect(s.contains(5)).toBe(true);
    expect(s.contains(6)).toBe(false);
    expect(s.remove(5)).toBe(true);
    expect(s.remove(5)).toBe(false);
    expect(s.contains(5)).toBe(false);
  });

  it("键 0 特殊处理", () => {
    const s = new IntSet();
    expect(s.add(0)).toBe(true);
    expect(s.add(0)).toBe(false);
    expect(s.contains(0)).toBe(true);
    expect(s.first()).toBe(0);
    expect(s.remove(0)).toBe(true);
    expect(s.contains(0)).toBe(false);
  });
});

describe("IntSet size/isEmpty/clear", () => {
  it("size 与 isEmpty", () => {
    const s = IntSet.with(1, 2, 3);
    expect(s.size).toBe(3);
    expect(s.isEmpty()).toBe(false);
    expect(s.notEmpty()).toBe(true);
    s.clear();
    expect(s.size).toBe(0);
    expect(s.isEmpty()).toBe(true);
    expect(s.notEmpty()).toBe(false);
  });

  it("clear 后可继续使用", () => {
    const s = IntSet.with(1, 2);
    s.clear();
    s.add(9);
    expect(s.contains(9)).toBe(true);
    expect(s.size).toBe(1);
  });
});

describe("IntSet resize/迭代", () => {
  it("大量键触发 resize 后 contains 正确", () => {
    const s = new IntSet();
    for(let i = 0; i < 200; i++) s.add(i);
    expect(s.size).toBe(200);
    for(let i = 0; i < 200; i++) expect(s.contains(i)).toBe(true);
    expect(s.contains(500)).toBe(false);
  });

  it("迭代器与 for..of 覆盖全部键", () => {
    const s = IntSet.with(1, 2, 3, 4, 5);
    const c1: number[] = [];
    const it = s.iterator();
    while(it.hasNext()) c1.push(it.next());
    expect(c1.slice().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);

    const c2: number[] = [];
    for(const v of s) c2.push(v);
    expect(c2.slice().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("迭代中 remove", () => {
    const s = IntSet.with(1, 2, 3, 4);
    const it = s.iterator();
    while(it.hasNext()){
      const v = it.next();
      if(v % 2 === 0) it.remove();
    }
    expect(s.size).toBe(2);
    expect(s.contains(1)).toBe(true);
    expect(s.contains(2)).toBe(false);
    expect(s.contains(4)).toBe(false);
  });

  it("first 返回一个元素, 空集合抛异常", () => {
    const s = IntSet.with(7, 8);
    expect([7, 8]).toContain(s.first());
    expect(() => new IntSet().first()).toThrow();
  });

  it("addAll 合并多个来源", () => {
    const s = new IntSet();
    s.addAll([1, 2, 3]);
    const other = new IntSet();
    other.addAll([3, 4, 5]);
    s.addAll(other);
    expect(s.size).toBe(5);
    for(let i = 1; i <= 5; i++) expect(s.contains(i)).toBe(true);
  });
});

