// 测试: arc-core/src/arc/struct/ObjectIntMap.java 移植 (src/struct/ObjectIntMap.ts)
import { describe, expect, it } from "vitest";
import { ObjectIntMap } from "./ObjectIntMap";

describe("ObjectIntMap put/get", () => {
  it("put/get 基本语义, 缺失默认 0", () => {
    const m = new ObjectIntMap<string>();
    m.put("a", 5);
    expect(m.get("a")).toBe(5);
    expect(m.get("missing")).toBe(0);
    expect(m.get("missing", 42)).toBe(42);
    expect(m.size).toBe(1);
  });

  it("put 三参形式返回旧值", () => {
    const m = new ObjectIntMap<string>();
    expect(m.put("a", 5, 999)).toBe(999); // 新键返回 defaultValue
    expect(m.put("a", 10, 999)).toBe(5);  // 已有键返回旧值
    expect(m.get("a")).toBe(10);
  });

  it("increment 自增", () => {
    const m = new ObjectIntMap<string>();
    expect(m.increment("count")).toBe(0);
    expect(m.get("count")).toBe(1);
    expect(m.increment("count", 5)).toBe(1); // 返回旧值
    expect(m.get("count")).toBe(6);
    expect(m.increment("k", 10, 3)).toBe(10); // 返回默认值
    expect(m.get("k")).toBe(13);
  });
});

describe("ObjectIntMap remove / containsKey / clear", () => {
  it("remove 返回被移除值, 缺失返回默认", () => {
    const m = new ObjectIntMap<string>();
    m.put("a", 3);
    expect(m.remove("a")).toBe(3);
    expect(m.remove("a")).toBe(0);
    expect(m.remove("b", 99)).toBe(99);
  });

  it("containsKey / notEmpty / isEmpty / clear", () => {
    const m = new ObjectIntMap<string>();
    m.put("a", 1);
    m.put("b", 2);
    expect(m.containsKey("a")).toBe(true);
    expect(m.containsKey("c")).toBe(false);
    expect(m.size).toBe(2);
    expect(m.notEmpty()).toBe(true);
    m.clear();
    expect(m.size).toBe(0);
    expect(m.isEmpty()).toBe(true);
    expect(m.get("a")).toBe(0);
  });
});

describe("ObjectIntMap resize / 冲突 / 迭代", () => {
  it("大量键触发 resize 后 get 正确", () => {
    const m = new ObjectIntMap<number>();
    for(let i = 0; i < 300; i++) m.put(i, i * 2);
    expect(m.size).toBe(300);
    expect(m.get(0)).toBe(0);
    expect(m.get(299)).toBe(598);
    expect(m.containsKey(150)).toBe(true);
  });

  it("哈希冲突键 (FB/Ea) 共存", () => {
    const m = new ObjectIntMap<string>();
    m.put("FB", 1);
    m.put("Ea", 2);
    expect(m.size).toBe(2);
    expect(m.get("FB")).toBe(1);
    expect(m.get("Ea")).toBe(2);
  });

  it("keys/values 迭代覆盖全部", () => {
    const m = new ObjectIntMap<string>();
    m.put("a", 1);
    m.put("b", 2);
    m.put("c", 3);
    const ks: string[] = [];
    const kit = m.keys();
    while(kit.hasNext()) ks.push(kit.next());
    expect(ks.slice().sort()).toEqual(["a", "b", "c"]);

    const vs: number[] = [];
    const vit = m.values();
    while(vit.hasNext()) vs.push(vit.next());
    expect(vs.slice().sort((x, y) => x - y)).toEqual([1, 2, 3]);
  });
});
