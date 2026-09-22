// 测试: arc-core/src/arc/struct/ObjectSet.java 移植 (src/struct/ObjectSet.ts)
import { describe, expect, it } from "vitest";
import { ObjectSet } from "./ObjectSet";

describe("ObjectSet add/contains/remove", () => {
  it("add 去重, contains/remove 语义", () => {
    const s = new ObjectSet<string>();
    expect(s.add("a")).toBe(true);
    expect(s.add("a")).toBe(false);
    expect(s.contains("a")).toBe(true);
    expect(s.contains("b")).toBe(false);
    expect(s.remove("a")).toBe(true);
    expect(s.remove("a")).toBe(false);
    expect(s.contains("a")).toBe(false);
  });

  it("get(key) 返回键本身", () => {
    const s = new ObjectSet<string>();
    s.add("hello");
    expect(s.get("hello")).toBe("hello");
    expect(s.get("nope")).toBeNull();
  });
});

describe("ObjectSet size/clear/first", () => {
  it("size 与 clear", () => {
    const s = ObjectSet.with("x", "y", "z");
    expect(s.size).toBe(3);
    expect(s.isEmpty()).toBe(false);
    s.clear();
    expect(s.size).toBe(0);
    expect(s.isEmpty()).toBe(true);
  });

  it("first 返回元素, 空集合抛异常", () => {
    const s = ObjectSet.with("q");
    expect(s.first()).toBe("q");
    expect(() => new ObjectSet().first()).toThrow();
  });

  it("toSeq 收集全部", () => {
    const s = ObjectSet.with("a", "b");
    const seq = s.toSeq();
    expect(seq.size).toBe(2);
  });
});

describe("ObjectSet resize/迭代", () => {
  it("大量键触发 resize 后 contains 正确", () => {
    const s = new ObjectSet<number>();
    for(let i = 0; i < 300; i++) s.add(i);
    expect(s.size).toBe(300);
    for(let i = 0; i < 300; i++) expect(s.contains(i)).toBe(true);
  });

  it("for..of 覆盖全部键", () => {
    const s = ObjectSet.with("a", "b", "c");
    const seen = new Set<string>();
    for(const v of s) seen.add(v);
    expect(seen.size).toBe(3);
    expect(seen.has("a")).toBe(true);
    expect(seen.has("b")).toBe(true);
    expect(seen.has("c")).toBe(true);
  });

  it("迭代器 remove 支持", () => {
    const s = ObjectSet.with("a", "b", "c", "d");
    const it = s.iterator();
    while(it.hasNext()){
      const v = it.next();
      if(v === "a" || v === "c") it.remove();
    }
    expect(s.size).toBe(2);
    expect(s.contains("a")).toBe(false);
    expect(s.contains("b")).toBe(true);
  });

  it("copy 独立副本", () => {
    const s = ObjectSet.with("a", "b");
    const c = s.copy();
    c.add("c");
    expect(s.size).toBe(2);
    expect(c.size).toBe(3);
  });
});
