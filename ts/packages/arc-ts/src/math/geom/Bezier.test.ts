import {describe, expect, it} from 'vitest';
import {Bezier} from './Bezier';
import {CatmullRomSpline} from './CatmullRomSpline';
import {Vec2} from './Vec2';

const p0 = new Vec2(0, 0);
const p1 = new Vec2(10, 10);
const p2 = new Vec2(20, 10);
const p3 = new Vec2(30, 0);

describe('Bezier static evaluation', () => {
    it('linear', () => {
        const out = new Vec2();
        Bezier.linear(out, 0.5, new Vec2(0, 0), new Vec2(10, 10), new Vec2());
        expect(out).toMatchObject({x: 5, y: 5});
        Bezier.linear(out, 0, new Vec2(0, 0), new Vec2(10, 10), new Vec2());
        expect(out).toMatchObject({x: 0, y: 0});
    });

    it('quadratic', () => {
        const out = new Vec2();
        Bezier.quadratic(out, 0.5, new Vec2(0, 0), new Vec2(10, 0), new Vec2(20, 0), new Vec2());
        expect(out.x).toBe(10);
        expect(out.y).toBe(0);
        Bezier.quadratic(out, 0, new Vec2(0, 0), new Vec2(10, 0), new Vec2(20, 0), new Vec2());
        expect(out.x).toBe(0);
        Bezier.quadratic(out, 1, new Vec2(0, 0), new Vec2(10, 0), new Vec2(20, 0), new Vec2());
        expect(out.x).toBe(20);
    });

    it('cubic', () => {
        const out = new Vec2();
        Bezier.cubic(out, 0.5, p0, p1, p2, p3, new Vec2());
        expect(out.x).toBe(15);
        expect(out.y).toBe(7.5);
        Bezier.cubic(out, 0, p0, p1, p2, p3, new Vec2());
        expect(out).toMatchObject({x: 0, y: 0});
        Bezier.cubic(out, 1, p0, p1, p2, p3, new Vec2());
        expect(out).toMatchObject({x: 30, y: 0});
    });

    it('cubicDerivative', () => {
        const out = new Vec2();
        Bezier.cubicDerivative(out, 0, p0, p1, p2, p3, new Vec2());
        expect(out).toMatchObject({x: 30, y: 30});
        Bezier.cubicDerivative(out, 1, p0, p1, p2, p3, new Vec2());
        expect(out).toMatchObject({x: 30, y: -30});
    });
});

describe('Bezier instance', () => {
    it('valueAt endpoints and midpoint', () => {
        const bez = new Bezier<Vec2>().set([p0, p1, p2, p3]);
        const out = new Vec2();
        bez.valueAt(out, 0);
        expect(out).toMatchObject({x: 0, y: 0});
        bez.valueAt(out, 1);
        expect(out).toMatchObject({x: 30, y: 0});
        bez.valueAt(out, 0.5);
        expect(out).toMatchObject({x: 15, y: 7.5});
    });

    it('derivativeAt endpoints', () => {
        const bez = new Bezier<Vec2>().set([p0, p1, p2, p3]);
        const out = new Vec2();
        bez.derivativeAt(out, 0);
        expect(out).toMatchObject({x: 30, y: 30});
    });

    it('rejects invalid degree', () => {
        expect(() => new Bezier<Vec2>().set([p0])).toThrow();
        expect(() => new Bezier<Vec2>().set([p0, p1, p2, p3, new Vec2()])).toThrow();
    });

    it('supports quadratic instance', () => {
        const bez = new Bezier<Vec2>().set([new Vec2(0, 0), new Vec2(10, 0), new Vec2(20, 0)]);
        const out = new Vec2();
        bez.valueAt(out, 0.5);
        expect(out.x).toBe(10);
    });
});

describe('CatmullRomSpline', () => {
    it('continuous spline starts and wraps at control points', () => {
        const points = [new Vec2(0, 0), new Vec2(10, 0), new Vec2(20, 0), new Vec2(30, 0)];
        const spline = new CatmullRomSpline<Vec2>(points, true);
        const out = new Vec2();
        spline.valueAt(out, 0);
        expect(out.x).toBeCloseTo(0, 8);
        spline.valueAt(out, 1);
        expect(out.x).toBeCloseTo(0, 8); // wraps back to first point
        expect(spline.spanCount).toBe(4);
    });

    it('non-continuous spline has spanCount = n - 3', () => {
        const points = [new Vec2(0, 0), new Vec2(10, 0), new Vec2(20, 0), new Vec2(30, 0)];
        const spline = new CatmullRomSpline<Vec2>(points, false);
        expect(spline.spanCount).toBe(1);
        const out = new Vec2();
        // 非连续时 span 会偏移 +1: CatmullRomSpline.java:123
        //   valueAt(out, span, u) => calculate(out, continuous ? span : (span + 1), u, ...)
        // 且 CatmullRomSpline.java:114-118 的 n = spanCount = 1, t=0/1 都落在 span 0, u 分别为 0/1。
        // 因此该样条实际覆盖控制点 1 -> 2, 即 [10,0] -> [20,0] (不是 [0,0] -> [10,0])。
        spline.valueAt(out, 0);
        expect(out.x).toBeCloseTo(10, 8);
        spline.valueAt(out, 1);
        expect(out.x).toBeCloseTo(20, 8);
    });

    it('static calculate span form', () => {
        const points = [new Vec2(0, 0), new Vec2(10, 0), new Vec2(20, 0), new Vec2(30, 0)];
        const out = new Vec2();
        CatmullRomSpline.calculate(out, 0, 0, points, true, new Vec2());
        expect(out.x).toBeCloseTo(0, 8);
    });

    it('nearest / approximate return in-range spans', () => {
        const points = [new Vec2(0, 0), new Vec2(10, 0), new Vec2(20, 0), new Vec2(30, 0)];
        const spline = new CatmullRomSpline<Vec2>(points, true);
        expect(spline.nearest(new Vec2(5, 0))).toBeGreaterThanOrEqual(0);
        expect(spline.nearest(new Vec2(5, 0))).toBeLessThan(4);
        const t = spline.approximate(new Vec2(5, 0));
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1);
    });

    it('approxLength is positive', () => {
        const points = [new Vec2(0, 0), new Vec2(10, 0), new Vec2(20, 0), new Vec2(30, 0)];
        const spline = new CatmullRomSpline<Vec2>(points, true);
        expect(spline.approxLength(100)).toBeGreaterThan(0);
    });
});
