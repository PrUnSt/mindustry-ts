// 测试: arc-core/src/arc/util/noise/Simplex.java + Noise.java 移植（确定性/固定种子）
import { describe, expect, it } from "vitest";
import { Simplex } from "./Simplex";
import { Noise } from "./Noise";

describe("Simplex", () => {
  it("noise2d is deterministic for the same seed", () => {
    const a = Simplex.noise2d(42, 4, 0.5, 0.05, 12.34, -5.67);
    const b = Simplex.noise2d(42, 4, 0.5, 0.05, 12.34, -5.67);
    expect(a).toBe(b);
  });

  it("noise2d differs across seeds", () => {
    const a = Simplex.noise2d(1, 4, 0.5, 0.05, 12.34, -5.67);
    const b = Simplex.noise2d(2, 4, 0.5, 0.05, 12.34, -5.67);
    expect(a).not.toBe(b);
  });

  it("raw2d returns values in [-1, 1]", () => {
    for(let x = 0; x < 100; x++){
      for(let y = 0; y < 5; y++){
        const v = Simplex.raw2d(7, x * 0.37, y * 0.37);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("noise3d is deterministic for the same seed", () => {
    const a = Simplex.noise3d(99, 3, 0.6, 0.1, 1.5, -2.5, 3.5);
    const b = Simplex.noise3d(99, 3, 0.6, 0.1, 1.5, -2.5, 3.5);
    expect(a).toBe(b);
  });

  it("raw3d is deterministic", () => {
    expect(Simplex.raw3d(5, 1.1, 2.2, 3.3)).toBe(Simplex.raw3d(5, 1.1, 2.2, 3.3));
  });

  it("noise4d/raw4d/rawTiled are deterministic", () => {
    expect(Simplex.noise4d(3, 0.5, 0.1, 1, 2, 3, 4)).toBe(Simplex.noise4d(3, 0.5, 0.1, 1, 2, 3, 4));
    expect(Simplex.raw4d(1.5, 2.5, 3.5, 4.5)).toBe(Simplex.raw4d(1.5, 2.5, 3.5, 4.5));
    expect(Simplex.rawTiled(0.5, 0.5, 0, 0, 10, 10, 1)).toBe(Simplex.rawTiled(0.5, 0.5, 0, 0, 10, 10, 1));
  });

  it("perm/perm2 hash is deterministic", () => {
    expect(Simplex.perm(123, 45)).toBe(Simplex.perm(123, 45));
  });
});

describe("Noise", () => {
  it("default seed 100 produces stable output across calls", () => {
    const a = Noise.rawNoise(0.25, 0.75);
    const b = Noise.rawNoise(0.25, 0.75);
    expect(a).toBe(b);
  });

  it("setSeed makes the generator deterministic", () => {
    Noise.setSeed(2024);
    const a = Noise.rawNoise(0.1, 0.2);
    const b = Noise.rawNoise(0.3, 0.4);
    Noise.setSeed(2024);
    expect(Noise.rawNoise(0.1, 0.2)).toBe(a);
    expect(Noise.rawNoise(0.3, 0.4)).toBe(b);
  });

  it("different seeds give different output", () => {
    Noise.setSeed(1);
    const a = Noise.rawNoise(0.5, 0.5);
    Noise.setSeed(2);
    const b = Noise.rawNoise(0.5, 0.5);
    expect(a).not.toBe(b);
  });

  it("1D and 3D noise are deterministic", () => {
    expect(Noise.rawNoise(0.42)).toBe(Noise.rawNoise(0.42));
    expect(Noise.rawNoise(0.1, 0.2, 0.3)).toBe(Noise.rawNoise(0.1, 0.2, 0.3));
    expect(Noise.snoise(1, 2, 10, 5)).toBe(Noise.snoise(1, 2, 10, 5));
    expect(Noise.noise(1, 2, 10, 5)).toBe(Noise.noise(1, 2, 10, 5));
  });
});
