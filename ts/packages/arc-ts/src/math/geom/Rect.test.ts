import {describe, expect, it} from 'vitest';
import {Rect} from './Rect';
import {Circle} from './Circle';
import {Vec2} from './Vec2';

describe('Rect construction', () => {
    it('constructs and exposes fields', () => {
        const r = new Rect(1, 2, 3, 4);
        expect(r.x).toBe(1);
        expect(r.y).toBe(2);
        expect(r.width).toBe(3);
        expect(r.height).toBe(4);
        expect(new Rect().width).toBe(0);
        const c = new Rect(r);
        expect(c).toMatchObject({x: 1, y: 2, width: 3, height: 4});
    });

    it('setCentered / setSize / setPosition', () => {
        const r = new Rect().setCentered(0, 0, 10);
        expect(r).toMatchObject({x: -5, y: -5, width: 10, height: 10});
        const r2 = new Rect().setCentered(5, 10, 10, 20);
        expect(r2).toMatchObject({x: 0, y: 0, width: 10, height: 20});
        expect(new Rect().setSize(5)).toMatchObject({width: 5, height: 5});
        expect(new Rect().setSize(5, 10)).toMatchObject({width: 5, height: 10});
        expect(new Rect().setPosition(3, 4)).toMatchObject({x: 3, y: 4});
    });
});

describe('Rect contains / overlaps', () => {
    const r = new Rect(0, 0, 10, 10);

    it('contains points (inclusive edges)', () => {
        expect(r.contains(5, 5)).toBe(true);
        expect(r.contains(0, 0)).toBe(true);
        expect(r.contains(10, 10)).toBe(true);
        expect(r.contains(11, 5)).toBe(false);
        expect(r.contains(5, -1)).toBe(false);
        expect(r.contains(new Vec2(5, 5))).toBe(true);
    });

    it('contains circle', () => {
        expect(r.contains(new Circle(5, 5, 2))).toBe(true);
        expect(r.contains(new Circle(5, 5, 6))).toBe(false);
        expect(r.contains(new Circle(-1, 5, 1))).toBe(false);
    });

    it('contains rect (strict interior)', () => {
        expect(r.contains(new Rect(2, 2, 4, 4))).toBe(true);
        expect(r.contains(new Rect(0, 0, 10, 10))).toBe(false);
        expect(r.contains(new Rect(-1, -1, 10, 10))).toBe(false);
    });

    it('overlaps (strict, touching edges do not count)', () => {
        expect(r.overlaps(new Rect(5, 5, 10, 10))).toBe(true);
        expect(r.overlaps(new Rect(10, 0, 10, 10))).toBe(false);
        expect(r.overlaps(new Rect(0, 10, 10, 10))).toBe(false);
        expect(r.overlaps(new Rect(20, 20, 10, 10))).toBe(false);
        expect(r.overlaps(5, 5, 10, 10)).toBe(true);
        expect(r.overlaps(11, 0, 10, 10)).toBe(false);
    });

    it('static contains', () => {
        expect(Rect.contains(0, 0, 10, 10, 5, 5)).toBe(true);
        expect(Rect.contains(0, 0, 10, 10, 11, 5)).toBe(false);
    });
});

describe('Rect grow / merge / normalize', () => {
    it('grow expands around center', () => {
        expect(new Rect(0, 0, 10, 10).grow(2)).toMatchObject({x: -1, y: -1, width: 12, height: 12});
        expect(new Rect(0, 0, 10, 10).grow(2, 4)).toMatchObject({x: -1, y: -2, width: 12, height: 14});
    });

    it('merge with rect / point / vec array', () => {
        const m = new Rect(0, 0, 10, 10).merge(new Rect(5, 5, 10, 10));
        expect(m).toMatchObject({x: 0, y: 0, width: 15, height: 15});
        const p = new Rect(0, 0, 10, 10).merge(20, 30);
        expect(p).toMatchObject({x: 0, y: 0, width: 20, height: 30});
        const v = new Rect(0, 0, 10, 10).merge([new Vec2(-5, 2), new Vec2(4, 12)]);
        expect(v).toMatchObject({x: -5, y: 0, width: 15, height: 12});
    });

    it('normalize fixes negative sizes', () => {
        const n = new Rect(10, 10, -5, -3).normalize();
        expect(n).toMatchObject({x: 5, y: 7, width: 5, height: 3});
    });

    it('move / getCenter / setCenter', () => {
        const r = new Rect(0, 0, 10, 10).move(5, 5);
        expect(r).toMatchObject({x: 5, y: 5});
        const c = new Vec2();
        new Rect(0, 0, 10, 10).getCenter(c);
        expect(c).toMatchObject({x: 5, y: 5});
        const s = new Rect(0, 0, 10, 10).setCenter(20, 30);
        expect(s).toMatchObject({x: 15, y: 25, width: 10, height: 10});
    });
});

describe('Rect measurements', () => {
    it('area / perimeter / aspect ratio', () => {
        const r = new Rect(0, 0, 10, 20);
        expect(r.area()).toBe(200);
        expect(r.perimeter()).toBe(60);
        expect(r.getAspectRatio()).toBe(0.5);
        expect(new Rect().getAspectRatio()).toBeNaN();
    });

    it('fitInside / fitOutside maintain aspect', () => {
        const inside = new Rect(0, 0, 200, 100).fitInside(new Rect(0, 0, 100, 100));
        expect(inside.width).toBe(100);
        expect(inside.height).toBe(50);
        const outside = new Rect(0, 0, 100, 100).fitOutside(new Rect(0, 0, 100, 50));
        // Java Rect.java:437-450 fitOutside: ratio = 100/100 = 1, rect.getAspectRatio() = 100/50 = 2;
        // `ratio > rect.getAspectRatio()` (1 > 2) 为 false → setSize(rect.width, rect.width / ratio) = (100, 100),
        // 即用 1:1 的矩形外接 100x50 (原期望 200x50 的宽高比为 4, 与"保持比例"矛盾, Java 下同样不可达)。
        expect(outside.width).toBe(100);
        expect(outside.height).toBe(100);
        // 覆盖 Java Rect.java:440-442 的 `ratio > rect.getAspectRatio()` 分支: ratio=1 > 0.5
        // → setSize(rect.height * ratio, rect.height) = (200, 200)。
        const covering = new Rect(0, 0, 100, 100).fitOutside(new Rect(0, 0, 100, 200));
        expect(covering.width).toBe(200);
        expect(covering.height).toBe(200);
    });

    it('toString / fromString', () => {
        expect(new Rect(1, 2, 3, 4).toString()).toBe('[1,2,3,4]');
        expect(new Rect().fromString('[5,6,7,8]')).toMatchObject({x: 5, y: 6, width: 7, height: 8});
    });
});
