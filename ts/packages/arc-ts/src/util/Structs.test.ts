// 测试: arc-core/src/arc/util/Structs.java 移植
import { describe, expect, it } from "vitest";
import { Structs } from "./Structs";

class Point{
  constructor(public x: number, public y: number){
  }

  equals(other: Point): boolean{
    return this.x === other.x && this.y === other.y;
  }
}

describe("Structs", () => {
  it("eq uses ==/equals semantics", () => {
    expect(Structs.eq(null, null)).toBe(true);
    expect(Structs.eq(1, 1)).toBe(true);
    expect(Structs.eq("a", "a")).toBe(true);
    expect(Structs.eq(new Point(1, 2), new Point(1, 2))).toBe(true);
    expect(Structs.eq(new Point(1, 2), new Point(3, 4))).toBe(false);
  });

  it("arr/swap/add/remove", () => {
    const arr = Structs.arr(1, 2, 3);
    expect(arr).toEqual([1, 2, 3]);
    Structs.swap(arr, 0, 2);
    expect(arr).toEqual([3, 2, 1]);
    expect(Structs.add(arr, 9)).toEqual([3, 2, 1, 9]);
    expect(Structs.remove(arr, 1)).toEqual([3, 1]);
    expect(Structs.remove(arr, 99)).toEqual(arr);
  });

  it("find/contains/count/indexOf", () => {
    const arr = [1, 2, 3, 4];
    expect(Structs.find(arr, (v) => v > 2)).toBe(3);
    expect(Structs.find(arr, (v) => v > 99)).toBeNull();
    expect(Structs.contains(arr, 3)).toBe(true);
    expect(Structs.contains(arr, 99)).toBe(false);
    expect(Structs.contains(arr, (v) => v % 2 === 0)).toBe(true);
    expect(Structs.count(arr, (v) => v % 2 === 0)).toBe(2);
    expect(Structs.indexOf(arr, 3)).toBe(2);
    expect(Structs.indexOf(arr, 99)).toBe(-1);
    expect(Structs.indexOf(arr, (v) => v === 4)).toBe(3);
    expect(Structs.indexOf(arr, (v) => v === 40)).toBe(-1);
  });

  it("filter mutates in place", () => {
    const arr = [1, 2, 3, 4, 5];
    Structs.filter(arr, (v) => v % 2 === 0);
    expect(arr).toEqual([1, 3, 5]);
  });

  it("each/forEach", () => {
    const out: number[] = [];
    Structs.each((v: number) => out.push(v), 1, 2, 3);
    expect(out).toEqual([1, 2, 3]);
    out.length = 0;
    Structs.forEach([4, 5], (v) => out.push(v));
    expect(out).toEqual([4, 5]);
  });

  it("findMin with comparator and float extractor", () => {
    expect(Structs.findMin([3, 1, 2], (a, b) => a - b)).toBe(1);
    expect(Structs.findMin(["bb", "a", "ccc"], (a, b) => a.length - b.length)).toBe("a");
    const byDist = Structs.findMin([new Point(5, 5), new Point(1, 1), new Point(2, 2)], (p) => p.x * p.x + p.y * p.y);
    expect(byDist!.x).toBe(1);
  });

  it("comparing/comps/comparingFloat/comparingInt/comparingBool", () => {
    const byX = Structs.comparing((p: Point) => p.x);
    const pts = [new Point(3, 1), new Point(1, 2), new Point(2, 3)];
    expect(pts.sort(byX).map(p => p.x)).toEqual([1, 2, 3]);

    const byYThenX = Structs.comps(Structs.comparing((p: Point) => p.y), byX);
    expect(byYThenX(new Point(1, 2), new Point(5, 2))).toBeLessThan(0);

    const byFloat = Structs.comparingFloat((s: string) => s.length);
    expect(byFloat("aaa", "b")).toBeGreaterThan(0);

    const byInt = Structs.comparingInt((s: string) => s.length);
    expect(byInt("a", "bbb")).toBeLessThan(0);

    const byBool = Structs.comparingBool((s: string) => s.startsWith("x"));
    expect(byBool("x1", "y1")).toBeGreaterThan(0);
    expect(byBool("y1", "x1")).toBeLessThan(0);
  });

  it("inBounds overloads", () => {
    expect(Structs.inBounds(1, 1, 5, 5)).toBe(true);
    expect(Structs.inBounds(-1, 1, 5, 5)).toBe(false);
    expect(Structs.inBounds(0, 0, 0, 3, 0)).toBe(true); // z=0 inside size=3 cube
    expect(Structs.inBounds(0, 0, 1, 1, 0)).toBe(false); // z=1 is outside the size=1 cube
    expect(Structs.inBounds(0, 0, 0, 3, 1)).toBe(false);
    const grid = [[1, 2], [3, 4]];
    expect(Structs.inBounds(1, 0, grid)).toBe(true);
    expect(Structs.inBounds(2, 0, grid)).toBe(false);
  });
});

