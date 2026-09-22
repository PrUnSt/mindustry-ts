// 测试: arc-core/src/arc/struct/LongMap.java 移植 (src/struct/LongMap.ts)
import { describe, expect, it } from "vitest";
import { LongMap } from "./LongMap";

describe("LongMap put/get/containsKey", () => {
  it("put 返回旧值, get 缺失返回 null", () => {
    const m = new LongMap<string>();
    expect(m.put(10000000001, "a")).toBeNull();
    expect(m.put(10000000001, "b")).toBe("a");
    expect(m.get(10000000001)).toBe("b");
    expect(m.get(999)).toBeNull();
    expect(m.containsKey(10000000001)).toBe(true);
    expect(m.size).toBe(1);
  });

  it("键 0 使用独立 zero 槽位", () => {
    const m = new LongMap<number>();
    expect(m.get(0)).toBeNull();
    m.put(0, 42);
    expect(m.get(0)).toBe(42);
    expect(m.containsKey(0)).toBe(true);
    m.put(0, 43);
    expect(m.get(0)).toBe(43);
    expect(m.size).toBe(1);
  });

  it("get 支持默认值", () => {
    const m = new LongMap<number>();
    expect(m.get(123, 7)).toBe(7);
    m.put(123, 5);
    expect(m.get(123, 7)).toBe(5);
  });
});

describe("LongMap remove/clear", () => {
  it("remove 返回被移除值", () => {
    const m = new LongMap<string>();
    m.put(111, "x");
    expect(m.remove(111)).toBe("x");
    expect(m.get(111)).toBeNull();
    expect(m.remove(111)).toBeNull();
  });

  it("clear 清空", () => {
    const m = new LongMap<number>();
    m.put(1, 10);
    m.put(0, 0);
    m.clear();
    expect(m.size).toBe(0);
    expect(m.isEmpty()).toBe(true);
  });
});

describe("LongMap resize / 迭代", () => {
  it("大量大键触发 resize 后 get 正确", () => {
    const m = new LongMap<number>(2);
    const base = 1000000000000;
    for(let i = 1; i <= 200; i++) m.put(base + i, i);
    expect(m.size).toBe(200);
    for(let i = 1; i <= 200; i++) expect(m.get(base + i)).toBe(i);
  });

  it("keys()/values()/entries() 遍历全部", () => {
    const m = new LongMap<string>();
    m.put(5, "a");
    m.put(6, "b");
    const ks: number[] = [];
    const kit = m.keys();
    while(kit.hasNext()) ks.push(kit.next());
    expect(ks.slice().sort((x, y) => x - y)).toEqual([5, 6]);

    const vs: (string | null)[] = [];
    const vit = m.values();
    while(vit.hasNext()) vs.push(vit.next());
    expect(vs.slice().sort()).toEqual(["a", "b"]);

    const es: string[] = [];
    const eit = m.entries();
    while(eit.hasNext()){
      const e = eit.next();
      es.push(e.key + "=" + e.value);
    }
    expect(es.sort()).toEqual(["5=a", "6=b"]);
  });

  it("keys() 支持 toSeq", () => {
    const m = new LongMap<number>();
    m.put(1, 100);
    m.put(2, 200);
    const seq = m.keys().toSeq();
    expect(seq.size).toBe(2);
  });
});
