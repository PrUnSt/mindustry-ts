import {describe, expect, it} from 'vitest';
import {Mathf} from './Mathf';

const PI = Mathf.PI;
const FLOAT_ERROR = 1e-6;

describe('Mathf constants', () => {
    it('defines float32-accurate constants', () => {
        expect(Mathf.PI).toBe(3.1415927);
        expect(Mathf.PI2).toBeCloseTo(3.1415927 * 2, 12);
        expect(Mathf.halfPi).toBe(Mathf.PI / 2);
        expect(Mathf.E).toBe(2.7182818);
        expect(Mathf.sqrt2).toBe(Math.sqrt(2));
        expect(Mathf.sqrt3).toBe(Math.sqrt(3));
        expect(Mathf.radiansToDegrees).toBeCloseTo(180 / 3.1415927, 9);
        expect(Mathf.degreesToRadians).toBeCloseTo(3.1415927 / 180, 9);
        expect(Mathf.FLOAT_ROUNDING_ERROR).toBe(0.000001);
        expect(Mathf.signs).toEqual([-1, 1]);
        expect(Mathf.zeroOne).toEqual([0, 1]);
        expect(Mathf.booleans).toEqual([true, false]);
    });
});

describe('Mathf.clamp', () => {
    it('clamps to [min, max]', () => {
        expect(Mathf.clamp(5, 0, 10)).toBe(5);
        expect(Mathf.clamp(-5, 0, 10)).toBe(0);
        expect(Mathf.clamp(15, 0, 10)).toBe(10);
        expect(Mathf.clamp(0.5, 0.2, 0.8)).toBe(0.5);
    });
    it('clamps to [0, 1] when only value given', () => {
        expect(Mathf.clamp(0.5)).toBe(0.5);
        expect(Mathf.clamp(-1)).toBe(0);
        expect(Mathf.clamp(2)).toBe(1);
        expect(Mathf.clamp(1)).toBe(1);
        expect(Mathf.clamp(0)).toBe(0);
    });
    it('handles NaN', () => {
        expect(Number.isNaN(Mathf.clamp(NaN, 0, 1))).toBe(true);
    });
});

describe('Mathf.lerp', () => {
    it('linearly interpolates', () => {
        expect(Mathf.lerp(0, 10, 0)).toBe(0);
        expect(Mathf.lerp(0, 10, 0.5)).toBe(5);
        expect(Mathf.lerp(0, 10, 1)).toBe(10);
        expect(Mathf.lerp(10, 0, 0.25)).toBe(7.5);
    });
    it('propagates NaN', () => {
        expect(Number.isNaN(Mathf.lerp(0, 10, NaN))).toBe(true);
    });
});

describe('Mathf.floor / ceil / round', () => {
    it('floors', () => {
        expect(Mathf.floor(2.7)).toBe(2);
        expect(Mathf.floor(-2.1)).toBe(-3);
        expect(Mathf.floor(0)).toBe(0);
        expect(Mathf.floor(-0.5)).toBe(-1);
        expect(Mathf.floorPositive(2.7)).toBe(2);
    });
    it('ceils', () => {
        expect(Mathf.ceil(2.1)).toBe(3);
        expect(Mathf.ceil(-2.7)).toBe(-2);
        expect(Mathf.ceil(0)).toBe(0);
        expect(Mathf.ceil(-0.5)).toBe(0);
        expect(Mathf.ceilPositive(2.1)).toBe(3);
        // 依据 Mathf.java:35 `private static final double CEIL = 0.9999999;`（注意是 double，不是 libGDX 的 float）
        // 与 Mathf.java:492-494 `(int)(value + CEIL)`：2.0 + 0.9999999 = 2.9999999 → (int) == 2。
        // 只有用 float32 常量时 2.0f+0.9999999f 才会进位到 3.0f；Arc 的 Java 基准返回 2。
        expect(Mathf.ceilPositive(2.0)).toBe(2);
    });
    it('rounds', () => {
        expect(Mathf.round(2.5)).toBe(3);
        expect(Mathf.round(2.4)).toBe(2);
        expect(Mathf.round(-2.5)).toBe(-2);
        expect(Mathf.round(-2.6)).toBe(-3);
        expect(Mathf.roundPositive(2.5)).toBe(3);
        expect(Mathf.roundPositive(2.4)).toBe(2);
    });
    it('rounds to step', () => {
        expect(Mathf.round(7, 5)).toBe(5);
        expect(Mathf.round(10, 5)).toBe(10);
        // Mathf.java:504-514：round(value, step) 一律 `(int)(value / step) * step`，即“向零截断到 step 的整数倍”，
        // 没有“就近取整”语义；13 / 5 == 2 → 2 * 5 == 10。
        expect(Mathf.round(13, 5)).toBe(10);
        expect(Mathf.round(3, 2)).toBe(2);
    });
    it('handles NaN', () => {
        expect(Number.isNaN(Mathf.floor(NaN))).toBe(true);
    });
});

describe('Mathf.sin / cos lookup table', () => {
    it('has exact values at quadrant boundaries', () => {
        expect(Mathf.sin(0)).toBe(0);
        expect(Mathf.sin(PI / 2)).toBe(1);
        expect(Mathf.sin(PI)).toBe(0);
        expect(Mathf.sin(3 * PI / 2)).toBe(-1);
        expect(Mathf.cos(0)).toBe(1);
        expect(Mathf.cos(PI / 2)).toBe(0);
        expect(Mathf.cos(PI)).toBe(-1);
        expect(Mathf.cos(2 * PI)).toBe(1);
    });
    it('looks up approximate values elsewhere (quantized table)', () => {
        expect(Mathf.sin(1.0)).toBeCloseTo(0.8414513933660354, 12);
        expect(Mathf.cos(1.0)).toBeCloseTo(0.5403327969884086, 12);
        expect(Mathf.sin(0.5)).toBeCloseTo(0.4793254881255305, 12);
    });
    it('sinDeg / cosDeg wrap at quadrant boundaries', () => {
        expect(Mathf.sinDeg(0)).toBe(0);
        expect(Mathf.sinDeg(90)).toBe(1);
        expect(Mathf.sinDeg(180)).toBe(0);
        expect(Mathf.sinDeg(270)).toBe(-1);
        expect(Mathf.cosDeg(0)).toBe(1);
        expect(Mathf.cosDeg(90)).toBe(0);
        expect(Mathf.cosDeg(180)).toBe(-1);
        expect(Mathf.cosDeg(270)).toBe(0);
        expect(Mathf.cosDeg(360)).toBe(1);
    });
    it('sinDeg gives table-quantized values (not exact math)', () => {
        expect(Mathf.sinDeg(30)).toBeCloseTo(0.5000553584417606, 10);
        expect(Mathf.sinDeg(45)).toBeCloseTo(0.7072423624184069, 10);
        expect(Mathf.cosDeg(45)).toBeCloseTo(0.7069711575416135, 10);
    });
});

describe('Mathf.atan2 approximation', () => {
    it('returns exact values on axes', () => {
        // Mathf.java:140-141 自述该 atan2 近似 "Average error is 1.057E-6 radians; maximum error is 1.922E-6"；
        // Mathf.java:129-138 的 atn(0) 返回 ≈1.6634e-6 而非精确 0，故 5e-7 容差对本实现（对 Java 亦然）不可达。
        expect(Mathf.atan2(1, 0)).toBeCloseTo(0, 5);
        expect(Mathf.atan2(0, 1)).toBeCloseTo(PI / 2, 6);
        expect(Mathf.atan2(-1, 0)).toBeCloseTo(PI, 4);
        expect(Mathf.atan2(0, -1)).toBeCloseTo(-PI / 2, 6);
    });
    it('approximates atan2 in all quadrants', () => {
        expect(Mathf.atan2(1, 1)).toBeCloseTo(PI / 4, 6);
        expect(Mathf.atan2(10, 10)).toBeCloseTo(PI / 4, 6);
        expect(Mathf.atan2(3, 4)).toBeCloseTo(0.9272936855215095, 8);
        expect(Mathf.atan2(-3, -4)).toBeCloseTo(-2.2142990144784904, 8);
    });
    it('handles degenerate inputs', () => {
        expect(Mathf.atan2(0, 0)).toBe(0);
        expect(Number.isNaN(Mathf.atan2(NaN, 5))).toBe(true);
    });
});

describe('Mathf.angle helpers', () => {
    it('angle wraps to [0, 360)', () => {
        // angle() 在 Mathf.java:98-102 里把 atan2 结果直接乘 radDeg，把 atan2 的 ≈1.6634e-6 rad 固有误差
        // 放大成 ≈9.53e-5 度（误差上界见 Mathf.java:140-141），故 0 附近容差必须放宽到 5e-4。
        expect(Mathf.angle(1, 0)).toBeCloseTo(0, 3);
        expect(Mathf.angle(0, 1)).toBe(90);
        expect(Mathf.angle(-1, 0)).toBeCloseTo(180, 3);
        expect(Mathf.angle(0, -1)).toBe(270);
        expect(Mathf.angle(0, 0)).toBe(0);
    });
    it('angleExact uses real atan2', () => {
        // Mathf.java:104-108 用真 atan2，但 radDeg 基于被截断的常量 PI=3.1415927：float64 下
        // 90 * (π / 3.1415927) ≈ 89.99999867、180 * (π / 3.1415927) ≈ 179.99999734。
        // Java 里 `(float)Math.atan2(...)` 截断到 float32 后恰好进位回 90/180；TS 按项目约定保留
        // float64（更接近真值，不追求字节级一致），故此处放宽为 5 位精度。
        expect(Mathf.angleExact(0, 1)).toBeCloseTo(90, 5);
        expect(Mathf.angleExact(1, 0)).toBe(0);
        expect(Mathf.angleExact(-1, 0)).toBeCloseTo(180, 5);
    });
    it('wrapAngleAroundZero maps to [-PI, PI]', () => {
        expect(Mathf.wrapAngleAroundZero(0)).toBe(0);
        expect(Mathf.wrapAngleAroundZero(PI)).toBe(PI);
        expect(Mathf.wrapAngleAroundZero(-PI)).toBe(-PI);
        expect(Mathf.wrapAngleAroundZero(3 * PI / 2)).toBeCloseTo(-PI / 2, 8);
        expect(Mathf.wrapAngleAroundZero(5 * PI / 2)).toBeCloseTo(PI / 2, 8);
    });
});

describe('Mathf.random', () => {
    it('random() returns [0, 1)', () => {
        Mathf.rand.setSeed(12345);
        const v = Mathf.random();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
    });
    it('random(int) returns inclusive integer [0, range]', () => {
        Mathf.rand.setSeed(42);
        const v = Mathf.random(5);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(5);
    });
    it('random(float) returns [0, range)', () => {
        Mathf.rand.setSeed(42);
        const v = Mathf.random(2.5);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(2.5);
    });
    it('random(int, int) returns inclusive integer in range', () => {
        Mathf.rand.setSeed(7);
        for(let i = 0; i < 20; i++){
            const v = Mathf.random(1, 10);
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(1);
            expect(v).toBeLessThanOrEqual(10);
        }
    });
    it('random(float, float) returns value in [start, end)', () => {
        Mathf.rand.setSeed(9);
        const v = Mathf.random(1.5, 2.5);
        expect(v).toBeGreaterThanOrEqual(1.5);
        expect(v).toBeLessThan(2.5);
    });
    it('is deterministic for a fixed Mathf.rand seed', () => {
        Mathf.rand.setSeed(12345);
        const a = Mathf.random();
        Mathf.rand.setSeed(12345);
        const b = Mathf.random();
        expect(a).toBe(b);
    });
    it('randomBoolean / randomSign behave', () => {
        Mathf.rand.setSeed(3);
        const b = Mathf.randomBoolean();
        expect(typeof b).toBe('boolean');
        const s = Mathf.randomSign();
        expect(s === -1 || s === 1).toBe(true);
        expect(Mathf.randomBoolean(1)).toBe(true);
        expect(Mathf.randomBoolean(0)).toBe(false);
    });
});

describe('Mathf.dst / len', () => {
    it('computes 2D distances', () => {
        expect(Mathf.dst(3, 4)).toBe(5);
        expect(Mathf.dst(0, 0, 3, 4)).toBe(5);
        expect(Mathf.dst2(3, 4)).toBe(25);
        expect(Mathf.dst2(0, 0, 3, 4)).toBe(25);
        expect(Mathf.dst(6, 8)).toBe(10);
    });
    it('computes lengths', () => {
        expect(Mathf.len(3, 4)).toBe(5);
        expect(Mathf.len2(3, 4)).toBe(25);
        expect(Mathf.len(5, 12)).toBe(13);
    });
    it('manhattan distance', () => {
        expect(Mathf.dstm(0, 0, 3, 4)).toBe(7);
        expect(Mathf.dstm(3, 4, 0, 0)).toBe(7);
    });
    it('within', () => {
        expect(Mathf.within(3, 4, 10)).toBe(true);
        expect(Mathf.within(3, 4, 4)).toBe(false);
        expect(Mathf.within(0, 0, 1, 1, 3)).toBe(true);
        expect(Mathf.within(0, 0, 3, 3, 3)).toBe(false);
    });
});

describe('Mathf.map / curve', () => {
    it('maps across ranges', () => {
        expect(Mathf.map(0.5, 0, 1, 0, 100)).toBe(50);
        expect(Mathf.map(5, 0, 10, 0, 100)).toBe(50);
        expect(Mathf.map(0.5, 0, 1, -10, 10)).toBe(0);
        expect(Mathf.map(0.25, 0, 1, 0, 1)).toBe(0.25);
        // 3-arg form maps from [0,1]
        expect(Mathf.map(0.5, 0, 100)).toBe(50);
    });
    it('curve single-offset form', () => {
        expect(Mathf.curve(0.5, 0.5)).toBe(0);
        expect(Mathf.curve(0.75, 0.5)).toBe(0.5);
        expect(Mathf.curve(1, 0.5)).toBe(1);
        expect(Mathf.curve(0.25, 0.5)).toBe(0);
    });
    it('curve two-bound form', () => {
        expect(Mathf.curve(0.5, 0.5, 1)).toBe(0);
        expect(Mathf.curve(0.75, 0.5, 1)).toBe(0.5);
        expect(Mathf.curve(0.25, 0.5, 1)).toBe(0);
        expect(Mathf.curve(1, 0.5, 1)).toBe(1);
        expect(Mathf.curve(2, 0.5, 1)).toBe(1);
    });
    it('curveMargin plateau', () => {
        expect(Mathf.curveMargin(0.5, 0.25)).toBe(0.5);
        expect(Mathf.curveMargin(0.125, 0.25)).toBe(0.25);
        expect(Mathf.curveMargin(0.875, 0.25)).toBe(0.75);
        expect(Mathf.curveMargin(0, 0.25)).toBe(0);
        expect(Mathf.curveMargin(1, 0.25)).toBe(1);
    });
});

describe('Mathf.misc', () => {
    it('slope', () => {
        expect(Mathf.slope(0.5)).toBe(1);
        expect(Mathf.slope(0)).toBe(0);
        expect(Mathf.slope(1)).toBe(0);
        expect(Mathf.slope(0.25)).toBe(0.5);
    });
    it('maxZero / sign / num', () => {
        expect(Mathf.maxZero(5)).toBe(5);
        expect(Mathf.maxZero(-5)).toBe(0);
        expect(Mathf.sign(-3)).toBe(-1);
        expect(Mathf.sign(3)).toBe(1);
        expect(Mathf.sign(0)).toBe(1);
        expect(Mathf.sign(true)).toBe(1);
        expect(Mathf.sign(false)).toBe(-1);
        expect(Mathf.num(true)).toBe(1);
        expect(Mathf.num(false)).toBe(0);
    });
    it('sqrt / sqr / pow', () => {
        expect(Mathf.sqrt(9)).toBe(3);
        expect(Mathf.sqrt(2)).toBeCloseTo(Math.sqrt(2), 12);
        expect(Mathf.sqr(4)).toBe(16);
        expect(Mathf.sqr(-4)).toBe(16);
        expect(Mathf.pow(2, 3)).toBe(8);
        expect(Mathf.pow(2.5, 2)).toBeCloseTo(6.25, 12);
        expect(Mathf.pow(2, 0.5)).toBeCloseTo(Math.sqrt(2), 12);
    });
    it('mod works for negatives', () => {
        expect(Mathf.mod(7, 4)).toBe(3);
        expect(Mathf.mod(-7, 4)).toBe(1);
        expect(Mathf.mod(10, 360)).toBe(10);
        expect(Mathf.mod(-10, 360)).toBe(350);
    });
    it('approach', () => {
        expect(Mathf.approach(0, 10, 3)).toBe(3);
        expect(Mathf.approach(0, 10, 100)).toBe(10);
        expect(Mathf.approach(10, 0, 3)).toBe(7);
        expect(Mathf.approach(10, 0, 100)).toBe(0);
    });
    it('slerp takes shortest path', () => {
        expect(Mathf.slerp(0, 90, 0.5)).toBe(45);
        expect(Mathf.slerp(10, 350, 0.5)).toBe(0);
        expect(Mathf.slerp(350, 10, 0.5)).toBe(0);
        expect(Mathf.slerp(10, 350, 0)).toBe(10);
        expect(Mathf.slerp(10, 350, 1)).toBe(350);
        // Mathf.java:455-458：delta = ((180 - 0 + 360 + 180) % 360) - 180 = -180，
        // 结果 = (0 + (-180) * 0.5 + 360) % 360 == 270。0↔180 两个方向等长，Java 取负向 delta。
        expect(Mathf.slerp(0, 180, 0.5)).toBe(270);
    });
    it('power of two helpers', () => {
        expect(Mathf.nextPowerOfTwo(0)).toBe(1);
        expect(Mathf.nextPowerOfTwo(1)).toBe(1);
        expect(Mathf.nextPowerOfTwo(3)).toBe(4);
        expect(Mathf.nextPowerOfTwo(4)).toBe(4);
        expect(Mathf.nextPowerOfTwo(5)).toBe(8);
        expect(Mathf.isPowerOfTwo(1)).toBe(true);
        expect(Mathf.isPowerOfTwo(4)).toBe(true);
        expect(Mathf.isPowerOfTwo(6)).toBe(false);
        expect(Mathf.isPowerOfTwo(0)).toBe(false);
    });
    it('log2 / digits / sample', () => {
        expect(Mathf.log2(8)).toBe(3);
        expect(Mathf.log2(1)).toBe(0);
        expect(Mathf.log2(0)).toBe(0);
        expect(Mathf.log2(16)).toBe(4);
        expect(Mathf.digits(7)).toBe(1);
        expect(Mathf.digits(12345)).toBe(5);
        expect(Mathf.digits(100000)).toBe(6);
        expect(Mathf.digits(0)).toBe(1);
        expect(Mathf.sample([0, 100], 0.5)).toBe(50);
        expect(Mathf.sample([0, 100], 0)).toBe(0);
        expect(Mathf.sample([0, 100], 1)).toBe(100);
        expect(Mathf.sample([0, 100, 200], 0.25)).toBe(50);
    });
    it('zero / equal tolerance', () => {
        expect(Mathf.zero(0)).toBe(true);
        expect(Mathf.zero(0.0000005)).toBe(true);
        expect(Mathf.zero(0.001)).toBe(false);
        expect(Mathf.zero(0.001, 0.01)).toBe(true);
        expect(Mathf.equal(1, 1.0000005)).toBe(true);
        expect(Mathf.equal(1, 1.001)).toBe(false);
        expect(Mathf.equal(1, 1.001, 0.01)).toBe(true);
    });
});
