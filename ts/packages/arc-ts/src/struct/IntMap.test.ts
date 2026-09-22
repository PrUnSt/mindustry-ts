// 测试: arc-core/src/arc/struct/IntMap.java 移植 (src/struct/IntMap.ts)
import { describe, expect, it } from "vitest";
import { IntMap } from "./IntMap";

describe("IntMap put/get/containsKey", () => {
  it("put 返回旧值, get 缺失返回 null", () => {
    const m = new IntMap<string>();
    expect(m.put(1, "a")).toBeNull();
    expect(m.put(1, "b")).toBe("a");
    expect(m.get(1)).toBe("b");
    expect(m.get(99)).toBeNull();
    expect(m.containsKey(1)).toBe(true);
    expect(m.containsKey(99)).toBe(false);
    expect(m.size).toBe(1);
  });

  it("键 0 使用独立 zero 槽位", () => {
    const m = new IntMap<string>();
    expect(m.get(0)).toBeNull();
    m.put(0, "zero");
    expect(m.get(0)).toBe("zero");
    expect(m.containsKey(0)).toBe(true);
    expect(m.size).toBe(1);
    m.put(0, "Z");
    expect(m.get(0)).toBe("Z");
    expect(m.size).toBe(1);
  });

  it("get 支持默认值与 Prov", () => {
    const m = new IntMap<number>();
    expect(m.get(5, 100)).toBe(100);
    let n = 0;
    const v = m.get(5, () => { n++; return 7; });
    expect(v).toBe(7);
    expect(n).toBe(1);
    expect(m.get(5)).toBe(7); // 已放入
  });
});

describe("IntMap remove/clear", () => {
  it("remove 返回被移除值", () => {
    const m = new IntMap<number>();
    m.put(5, 50);
    m.put(0, 0);
    expect(m.remove(5)).toBe(50);
    expect(m.get(5)).toBeNull();
    expect(m.remove(5)).toBeNull();
    expect(m.remove(0)).toBe(0);
    expect(m.get(0)).toBeNull();
  });

  it("clear 清空", () => {
    const m = new IntMap<number>();
    m.put(1, 10);
    m.put(2, 20);
    m.clear();
    expect(m.size).toBe(0);
    expect(m.isEmpty()).toBe(true);
    expect(m.get(1)).toBeNull();
  });
});

describe("IntMap resize / 冲突", () => {
  it("小容量下大量键触发多次 resize 后 get 正确", () => {
    const m = new IntMap<number>(2); // 极小初始表, 必发生冲突与扩容
    for(let i = 1; i <= 300; i++) m.put(i, i * 3);
    expect(m.size).toBe(300);
    for(let i = 1; i <= 300; i++) expect(m.get(i)).toBe(i * 3);
    expect(m.get(0)).toBeNull();
  });

  it("remove 后仍能正确 put 同一键", () => {
    const m = new IntMap<string>(2);
    m.put(7, "x");
    m.put(8, "y");
    m.remove(7);
    expect(m.get(8)).toBe("y");
    m.put(7, "z");
    expect(m.get(7)).toBe("z");
    expect(m.get(8)).toBe("y");
  });
});

describe("IntMap keys/values/entries 迭代", () => {
  it("keys() 遍历全部键", () => {
    const m = new IntMap<string>();
    m.put(10, "a");
    m.put(20, "b");
    m.put(30, "c");
    const ks: number[] = [];
    const it = m.keys();
    while(it.hasNext()) ks.push(it.next());
    expect(ks.slice().sort((x, y) => x - y)).toEqual([10, 20, 30]);
  });

  it("values() 遍历全部值", () => {
    const m = new IntMap<string>();
    m.put(1, "a");
    m.put(2, "b");
    const seq = m.values().toArray(); // Seq<string>
    expect(seq.size).toBe(2);
  });

  it("entries() 遍历键值对", () => {
    const m = new IntMap<string>();
    m.put(1, "a");
    m.put(2, "b");
    const pairs: string[] = [];
    const it = m.entries();
    while(it.hasNext()){
      const e = it.next();
      pairs.push(e.key + "=" + e.value);
    }
    expect(pairs.sort()).toEqual(["1=a", "2=b"]);
  });
});
