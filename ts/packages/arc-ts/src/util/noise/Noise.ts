// 源: arc-core/src/arc/util/noise/Noise.java
// 移植: Perlin 噪声；固定种子 100，与 Java 原版逐字对齐（含 java.util.Random 的确定性序列）

import { JRandom } from "./Random";

/** Perlin noise implementation. */
export class Noise{
  private static seed = 100;

  private static readonly P = 8;
  private static readonly B = 1 << 8;
  private static readonly M = 255;
  private static readonly NP = 8;
  private static readonly N = 1 << 8;

  private static p = new Array<number>(256 + 256 + 2).fill(0);
  private static g2: number[][] = Array.from({ length: 256 + 256 + 2 }, () => [0, 0]);
  private static g1 = new Array<number>(256 + 256 + 2).fill(0);
  private static points: number[][] = Array.from({ length: 32 }, () => [0, 0, 0]);

  static{
    Noise.init();
  }

  private static lerp(t: number, a: number, b: number): number{
    return a + t * (b - a);
  }

  private static s_curve(t: number): number{
    return t * t * (3 - t - t);
  }

  static rawNoise(x: number): number;
  static rawNoise(x: number, y: number): number;
  static rawNoise(x: number, y: number, z: number): number;
  static rawNoise(x: number, y?: number, z?: number): number{
    if(y === undefined) return Noise.rawNoise1(x);
    if(z === undefined) return Noise.rawNoise2(x, y);
    return Noise.rawNoise3(x, y, z);
  }

  private static rawNoise1(x: number): number{
    let bx0: number, bx1: number;
    let rx0: number, rx1: number, sx: number, t: number, u: number, v: number;
    t = x + Noise.N;
    bx0 = Math.trunc(t) & Noise.M;
    bx1 = (bx0 + 1) & Noise.M;
    rx0 = t - Math.trunc(t);
    rx1 = rx0 - 1;

    sx = Noise.s_curve(rx0);
    u = rx0 * Noise.g1[Noise.p[bx0]];
    v = rx1 * Noise.g1[Noise.p[bx1]];

    return Noise.lerp(sx, u, v);
  }

  static snoise(x: number, y: number, scale: number, mag: number, exp: number): number;
  static snoise(x: number, y: number, scale: number, mag: number): number;
  static snoise(x: number, y: number, scale: number, mag: number, exp?: number): number{
    if(exp === undefined) return Noise.rawNoise(x / scale, y / scale) * mag;
    return Math.pow(Noise.rawNoise(x / scale, y / scale) * mag, exp);
  }

  static snoise3(x: number, y: number, z: number, scale: number, mag: number): number{
    return Noise.rawNoise(x / scale, y / scale, z / scale) * mag;
  }

  static nnoise(x: number, y: number, scale: number, mag: number): number{
    return (Noise.snoise(x, y, scale, mag) + mag) / 2.0;
  }

  static noise(x: number, y: number, scale: number, mag: number): number;
  static noise(x: number, y: number, scale: number, mag: number, xp: number): number;
  static noise(x: number, y: number, scale: number, mag: number, xp?: number): number{
    if(xp === undefined) return Noise.snoise(x, y, scale, mag) / 2.0;
    return Noise.snoise(x, y, scale, mag, xp) / 2.0;
  }

  static fnoise(x: number, y: number, scale: number, mag: number): number{
    return Noise.rawNoise(x / scale, y / scale) * mag;
  }

  private static rawNoise2(x: number, y: number): number{
    let bx0: number, bx1: number, by0: number, by1: number, b00: number, b10: number, b01: number, b11: number;
    let rx0: number;
    let rx1: number;
    let ry0: number;
    let ry1: number;
    let sx: number;
    let sy: number;
    let a: number;
    let b: number;
    let t: number;
    let u: number;
    let v: number;
    let q: number[];
    let i: number, j: number;

    t = x + Noise.N;
    bx0 = Math.trunc(t) & Noise.M;
    bx1 = (bx0 + 1) & Noise.M;
    rx0 = t - Math.trunc(t);
    rx1 = rx0 - 1;

    t = y + Noise.N;
    by0 = Math.trunc(t) & Noise.M;
    by1 = (by0 + 1) & Noise.M;
    ry0 = t - Math.trunc(t);
    ry1 = ry0 - 1;

    i = Noise.p[bx0];
    j = Noise.p[bx1];

    b00 = Noise.p[i + by0];
    b10 = Noise.p[j + by0];
    b01 = Noise.p[i + by1];
    b11 = Noise.p[j + by1];

    sx = Noise.s_curve(rx0);
    sy = Noise.s_curve(ry0);

    q = Noise.g2[b00];
    u = rx0 * q[0] + ry0 * q[1];
    q = Noise.g2[b10];
    v = rx1 * q[0] + ry0 * q[1];
    a = Noise.lerp(sx, u, v);

    q = Noise.g2[b01];
    u = rx0 * q[0] + ry1 * q[1];
    q = Noise.g2[b11];
    v = rx1 * q[0] + ry1 * q[1];
    b = Noise.lerp(sx, u, v);

    return Noise.lerp(sy, a, b);
  }

  private static rawNoise3(x: number, y: number, z: number): number{
    let bx: number, by: number, bz: number, b0: number, b1: number, b00: number, b10: number, b01: number, b11: number;
    let rx0: number;
    let rx1: number;
    let ry0: number;
    let ry1: number;
    let rz: number;
    let sx: number;
    let sy: number;
    let sz: number;
    let a: number;
    let b: number;
    let c: number;
    let d: number;
    let u: number;
    let v: number;
    let q: number[];

    bx = Math.trunc(Math.floor(x) % Noise.B);
    if(bx < 0){
      bx += Noise.B;
    }
    rx0 = x - Math.floor(x);
    rx1 = rx0 - 1;

    by = Math.trunc(Math.floor(y) % Noise.B);
    if(by < 0){
      by += Noise.B;
    }
    ry0 = y - Math.floor(y);
    ry1 = ry0 - 1;

    bz = Math.trunc(Math.floor(z) % Noise.B);
    if(bz < 0){
      bz += Noise.B;
    }
    rz = z - Math.floor(z);

    b0 = Noise.p[bx];

    bx++;

    b1 = Noise.p[bx];

    b00 = Noise.p[b0 + by];
    b10 = Noise.p[b1 + by];

    by++;

    b01 = Noise.p[b0 + by];
    b11 = Noise.p[b1 + by];

    sx = Noise.s_curve(rx0);
    sy = Noise.s_curve(ry0);
    sz = Noise.s_curve(rz);

    q = Noise.G(b00 + bz);
    u = rx0 * q[0] + ry0 * q[1] + rz * q[2];
    q = Noise.G(b10 + bz);
    v = rx1 * q[0] + ry0 * q[1] + rz * q[2];
    a = Noise.lerp(sx, u, v);
    q = Noise.G(b01 + bz);
    u = rx0 * q[0] + ry1 * q[1] + rz * q[2];
    q = Noise.G(b11 + bz);
    v = rx1 * q[0] + ry1 * q[1] + rz * q[2];
    b = Noise.lerp(sx, u, v);
    c = Noise.lerp(sy, a, b);
    bz++;
    rz--;
    q = Noise.G(b00 + bz);
    u = rx0 * q[0] + ry0 * q[1] + rz * q[2];
    q = Noise.G(b10 + bz);
    v = rx1 * q[0] + ry0 * q[1] + rz * q[2];
    a = Noise.lerp(sx, u, v);
    q = Noise.G(b01 + bz);
    u = rx0 * q[0] + ry1 * q[1] + rz * q[2];
    q = Noise.G(b11 + bz);
    v = rx1 * q[0] + ry1 * q[1] + rz * q[2];
    b = Noise.lerp(sx, u, v);
    d = Noise.lerp(sy, a, b);

    return Noise.lerp(sz, c, d);
  }

  private static G(i: number): number[]{
    return Noise.points[i % 32];
  }

  static setSeed(s: number): void{
    Noise.seed = s;
    Noise.init();
  }

  private static init(): void{
    let i: number, j: number, k: number;
    let u: number, v: number, w: number, U: number, V: number, W: number, Hi: number, Lo: number;
    const r = new JRandom(Noise.seed);
    for(i = 0; i < Noise.B; i++){
      Noise.p[i] = i;
      Noise.g1[i] = 2 * r.nextDouble() - 1;

      do{
        u = 2 * r.nextDouble() - 1;
        v = 2 * r.nextDouble() - 1;
      }while(u * u + v * v > 1 ||
        Math.abs(u) > 2.5 * Math.abs(v) ||
        Math.abs(v) > 2.5 * Math.abs(u) ||
        Math.abs(Math.abs(u) - Math.abs(v)) < .4);
      Noise.g2[i][0] = u;
      Noise.g2[i][1] = v;
      Noise.normalize2(Noise.g2[i]);

      do{
        u = 2 * r.nextDouble() - 1;
        v = 2 * r.nextDouble() - 1;
        w = 2 * r.nextDouble() - 1;
        U = Math.abs(u);
        V = Math.abs(v);
        W = Math.abs(w);
        Lo = Math.min(U, Math.min(V, W));
        Hi = Math.max(U, Math.max(V, W));
      }while(u * u + v * v + w * w > 1 || Hi > 4 * Lo ||
        Math.min(Math.abs(U - V), Math.min(Math.abs(U - W), Math.abs(V - W))) < .2);
    }

    while(--i > 0){
      k = Noise.p[i];
      // Java: j = (int)(r.nextLong() & M); 低 8 位与 nextInt() & M 等价
      j = r.nextInt() & Noise.M;
      Noise.p[i] = Noise.p[j];
      Noise.p[j] = k;
    }
    for(i = 0; i < Noise.B + 2; i++){
      Noise.p[Noise.B + i] = Noise.p[i];
      Noise.g1[Noise.B + i] = Noise.g1[i];
      for(j = 0; j < 2; j++){
        Noise.g2[Noise.B + i][j] = Noise.g2[i][j];
      }
    }

    Noise.points[3][0] = Noise.points[3][1] = Noise.points[3][2] = Math.sqrt(1. / 3);
    const r2 = Math.sqrt(1. / 2);
    const s = Math.sqrt(2 + r2 + r2);

    for(i = 0; i < 3; i++){
      for(j = 0; j < 3; j++){
        Noise.points[i][j] = (i === j ? 1 + r2 + r2 : r2) / s;
      }
    }
    for(i = 0; i <= 1; i++){
      for(j = 0; j <= 1; j++){
        for(k = 0; k <= 1; k++){
          const n = i + j * 2 + k * 4;
          if(n > 0){
            for(let m = 0; m < 4; m++){
              Noise.points[4 * n + m][0] = (i === 0 ? 1 : -1) * Noise.points[m][0];
              Noise.points[4 * n + m][1] = (j === 0 ? 1 : -1) * Noise.points[m][1];
              Noise.points[4 * n + m][2] = (k === 0 ? 1 : -1) * Noise.points[m][2];
            }
          }
        }
      }
    }
  }

  private static normalize2(v: number[]): void{
    let s: number;
    s = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
    v[0] = v[0] / s;
    v[1] = v[1] / s;
  }
}

