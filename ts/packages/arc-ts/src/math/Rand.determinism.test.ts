// 测试 + 反事实测试: TS-2「非确定 Rand」。
//
// 修复前: struct/Mathf.ts 自带一份用 Math.random 的 Rand, 被 struct/Seq.ts、IntSeq.ts、FloatSeq.ts、
//         LongSeq.ts、ArrayMap.ts 引用 → 同 seed 无法复现。
// 修复后: struct/Mathf.ts 只是 re-export math/Mathf 与 math/Rand, 全库统一走 xorshift128+ 实现。
import { describe, expect, it } from "vitest";
import { Rand } from "./Rand";
import { Mathf } from "./Mathf";
import { Rand as StructRand } from "../struct/Mathf";
import { Mathf as StructMathf } from "../struct/Mathf";
import { Seq } from "../struct/Seq";

/** 用给定 Rand 生成 n 个 long。 */
function longs(rand: Rand, n: number): number[]{
  const out: number[] = [];
  for(let i = 0; i < n; i++) out.push(rand.nextLong());
  return out;
}

describe("Rand 确定性 (TS-2)", () => {
  it("struct/Mathf 导出的就是 math 的实现 (同一构造器 / 同一对象, 不是 Math.random 版)", () => {
    expect(StructRand).toBe(Rand);
    expect(StructMathf).toBe(Mathf);
    expect(new StructRand(1).nextLong()).toBe(new Rand(1).nextLong());
  });

  it("new Rand(42) ×2 各产 100 个 long → 逐元素相等", () => {
    const a = longs(new Rand(42), 100);
    const b = longs(new Rand(42), 100);

    expect(a.length).toBe(100);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBeGreaterThan(50);   // 不是常量序列
  });

  it("前 3 个 long 的精确快照 (seed=42)", () => {
    expect(longs(new Rand(42), 3)).toEqual([
      3553440125194606600,
      -1850319953427251000,
      2944846008281095700
    ]);
  });

  it("不同 seed 产生不同序列; 同 seed 的 nextFloat 也可复现", () => {
    const floats = (seed: number): number[] => {
      const rand = new Rand(seed);
      const out: number[] = [];
      for(let i = 0; i < 32; i++) out.push(rand.nextFloat());
      return out;
    };

    expect(floats(42)).toEqual(floats(42));
    expect(floats(42)).not.toEqual(floats(43));
  });

  it("反事实: struct 库的随机取样由确定性 Rand 驱动 (Math.random 版无法复现)", () => {
    const seq = new Seq<number>();
    for(let i = 0; i < 10; i++) seq.add(i);

    const first = new Rand(99), second = new Rand(99);
    const a: number[] = [], b: number[] = [];
    for(let i = 0; i < 20; i++){
      a.push(seq.random(first)!);
      b.push(seq.random(second)!);
    }

    expect(a).toEqual(b);                          // 同 seed → 同序列
    expect(new Set(a).size).toBeGreaterThan(1);    // 且确实在随机取样 (不是恒定值)
    expect(a.every(v => v >= 0 && v < 10)).toBe(true);
  });
});
