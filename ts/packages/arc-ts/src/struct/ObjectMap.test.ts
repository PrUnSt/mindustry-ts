// 测试: arc-core/src/arc/struct/ObjectMap.java 移植 (src/struct/ObjectMap.ts)
// 覆盖: put/get/remove/containsKey/size/clear、resize/冲突、keys/values 迭代、get 默认值与 Prov、copy/putAll
import { describe, expect, it } from "vitest";
import { ObjectMap } from "./ObjectMap";

describe("ObjectMap 基础 put/get/containsKey/size", () => {
  it("put 返回旧值, 首次 put 返回 null", () => {
    const m = new ObjectMap<string, number>();
    expect(m.put("a", 1)).toBeNull();
    expect(m.put("a", 2)).toBe(1);
    expect(m.get("a")).toBe(2);
    expect(m.get("missing")).toBeNull();
    expect(m.containsKey("a")).toBe(true);
    expect(m.containsKey("missing")).toBe(false);
    expect(m.size).toBe(1);
    expect(m.notEmpty()).toBe(true);
    expect(m.isEmpty()).toBe(false);
  });

  it("get 支持默认值", () => {
    const m = new ObjectMap<string, number>();
    m.put("a", 5);
    expect(m.get("a", 100)).toBe(5);
    expect(m.get("b", 100)).toBe(100);
  });

  it("get(key, Prov) 不存在时创建并放入", () => {
    const m = new ObjectMap<string, number>();
    let created = 0;
    const v = m.get("k", () => { created++; return 99; });
    expect(v).toBe(99);
    expect(created).toBe(1);
    expect(m.get("k")).toBe(99); // 已放入
    m.get("k", () => { created++; return 0; });
    expect(created).toBe(1); // 不再创建
  });

  it("getThrow 不存在时抛出指定异常", () => {
    const m = new ObjectMap<string, number>();
    m.put("a", 1);
    expect(m.getThrow("a", () => new Error("boom"))).toBe(1);
    expect(() => m.getThrow("b", () => new Error("boom"))).toThrow("boom");
  });
});

describe("ObjectMap remove / clear", () => {
  it("remove 返回被移除值, 不存在返回 null", () => {
    const m = new ObjectMap<string, number>();
    m.put("a", 1);
    m.put("b", 2);
    expect(m.remove("a")).toBe(1);
    expect(m.get("a")).toBeNull();
    expect(m.containsKey("a")).toBe(false);
    expect(m.size).toBe(1);
    expect(m.remove("a")).toBeNull();
  });

  it("clear 清空 map", () => {
    const m = new ObjectMap<string, number>();
    m.put("a", 1);
    m.put("b", 2);
    m.clear();
    expect(m.size).toBe(0);
    expect(m.isEmpty()).toBe(true);
    expect(m.get("a")).toBeNull();
  });

  it("set(map) 整体替换内容", () => {
    const m1 = new ObjectMap<string, number>();
    m1.put("a", 1);
    const m2 = new ObjectMap<string, number>();
    m2.put("x", 10);
    m2.put("y", 20);
    m2.set(m1);
    expect(m2.size).toBe(1);
    expect(m2.get("x")).toBeNull();
    expect(m2.get("a")).toBe(1);
  });
});

describe("ObjectMap resize / 冲突", () => {
  it("插入大量键触发 resize 后 get 仍正确", () => {
    const m = new ObjectMap<number, number>();
    for(let i = 0; i < 200; i++) m.put(i, i * 10);
    expect(m.size).toBe(200);
    for(let i = 0; i < 200; i++) expect(m.get(i)).toBe(i * 10);
    for(let i = 0; i < 200; i++) expect(m.containsKey(i)).toBe(true);
  });

  it("相同哈希冲突键 (FB 与 Ea 的 String.hashCode 均为 2236) 共存", () => {
    expect("FB".charCodeAt(0) * 31 + "B".charCodeAt(0)).toBe(2236);
    expect("Ea".charCodeAt(0) * 31 + "a".charCodeAt(0)).toBe(2236);
    const m = new ObjectMap<string, number>();
    m.put("FB", 1);
    m.put("Ea", 2);
    expect(m.size).toBe(2);
    expect(m.get("FB")).toBe(1);
    expect(m.get("Ea")).toBe(2);
    expect(m.containsKey("FB")).toBe(true);
    expect(m.containsKey("Ea")).toBe(true);
    // 移除冲突键之一后另一个仍可取
    expect(m.remove("FB")).toBe(1);
    expect(m.get("Ea")).toBe(2);
  });

  it("冲突后 remove 再 put 同一键", () => {
    const m = new ObjectMap<string, number>();
    m.put("FB", 1);
    m.put("Ea", 2);
    m.remove("Ea");
    expect(m.get("FB")).toBe(1);
    m.put("Ea", 20);
    expect(m.get("Ea")).toBe(20);
    expect(m.get("FB")).toBe(1);
  });
});

describe("ObjectMap keys/values/entries 迭代", () => {
  it("keys() 遍历全部键", () => {
    const m = new ObjectMap<string, number>();
    m.put("a", 1);
    m.put("b", 2);
    m.put("c", 3);
    const ks: string[] = [];
    const it = m.keys();
    while(it.hasNext()) ks.push(it.next());
    expect(ks.slice().sort()).toEqual(["a", "b", "c"]);
    expect(ks.length).toBe(3);
  });

  it("values() 遍历全部值", () => {
    const m = new ObjectMap<string, number>();
    m.put("a", 1);
    m.put("b", 2);
    m.put("c", 3);
    const vs: number[] = [];
    const it = m.values();
    while(it.hasNext()) vs.push(it.next() as number);
    expect(vs.slice().sort((x, y) => x - y)).toEqual([1, 2, 3]);
  });

  it("entries() 遍历键值对", () => {
    const m = new ObjectMap<string, number>();
    m.put("a", 1);
    m.put("b", 2);
    const pairs: string[] = [];
    const it = m.entries();
    while(it.hasNext()){
      const e = it.next();
      pairs.push(e.key + "=" + e.value);
    }
    expect(pairs.sort()).toEqual(["a=1", "b=2"]);
  });

  it("each 遍历所有键值对", () => {
    const m = new ObjectMap<string, number>();
    m.put("a", 1);
    m.put("b", 2);
    let count = 0;
    let sum = 0;
    m.each((k, v) => { count++; sum += v; });
    expect(count).toBe(2);
    expect(sum).toBe(3);
  });
});

describe("ObjectMap copy / putAll / merge", () => {
  it("putAll(map) 与 putAll(k,v,...)", () => {
    const src = new ObjectMap<string, number>();
    src.put("a", 1);
    src.put("b", 2);
    const m = new ObjectMap<string, number>();
    m.putAll(src);
    expect(m.size).toBe(2);
    expect(m.get("b")).toBe(2);

    const m2 = new ObjectMap<string, number>();
    m2.putAll("x", 10, "y", 20);
    expect(m2.size).toBe(2);
    expect(m2.get("x")).toBe(10);
  });

  it("copy() 生成独立副本", () => {
    const m = new ObjectMap<string, number>();
    m.put("a", 1);
    const c = m.copy();
    expect(c.get("a")).toBe(1);
    c.put("b", 2);
    expect(m.size).toBe(1);
    expect(c.size).toBe(2);
  });

  it("merge 返回自身并合并", () => {
    const a = new ObjectMap<string, number>();
    a.put("a", 1);
    const b = new ObjectMap<string, number>();
    b.put("b", 2);
    expect(a.merge(b)).toBe(a);
    expect(a.get("b")).toBe(2);
  });
});

describe("ObjectMap 迭代器 remove", () => {
  it("迭代中按条件移除", () => {
    const m = new ObjectMap<string, number>();
    m.put("a", 1);
    m.put("b", 2);
    m.put("c", 3);
    const it = m.keys();
    while(it.hasNext()){
      const k = it.next();
      if(k === "b") it.remove();
    }
    expect(m.size).toBe(2);
    expect(m.containsKey("b")).toBe(false);
    expect(m.get("a")).toBe(1);
    expect(m.get("c")).toBe(3);
  });
});
