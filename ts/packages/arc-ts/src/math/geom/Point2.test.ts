import {describe, expect, it} from 'vitest';
import {Point2} from './Point2';

describe('Point2 pack / unpack', () => {
    it('round-trips positive coords', () => {
        const p = Point2.unpack(Point2.pack(5, 10));
        expect(p.x).toBe(5);
        expect(p.y).toBe(10);
        expect(new Point2(5, 10).pack()).toBe(Point2.pack(5, 10));
    });

    it('packs shorts (negative coords wrap to shorts)', () => {
        const p = Point2.unpack(Point2.pack(-1, 2));
        expect(p.x).toBe(-1);
        expect(p.y).toBe(2);
        const q = Point2.unpack(Point2.pack(300, -5));
        expect(q.x).toBe(300);
        expect(q.y).toBe(-5);
    });

    it('static x / y extractors', () => {
        const packed = Point2.pack(7, -3);
        expect(Point2.x(packed)).toBe(7);
        expect(Point2.y(packed)).toBe(-3);
    });
});

describe('Point2 operations', () => {
    it('set / add / sub / cpy', () => {
        const p = new Point2(1, 2);
        expect(p.set(3, 4)).toMatchObject({x: 3, y: 4});
        expect(new Point2(1, 2).add(1, 1)).toMatchObject({x: 2, y: 3});
        expect(new Point2(1, 2).sub(1, 1)).toMatchObject({x: 0, y: 1});
        const c = new Point2(1, 2).cpy();
        expect(c).not.toBe(new Point2(1, 2));
        expect(c).toMatchObject({x: 1, y: 2});
    });

    it('dst / dst2', () => {
        expect(new Point2(0, 0).dst(3, 4)).toBe(5);
        expect(new Point2(0, 0).dst2(3, 4)).toBe(25);
        expect(new Point2(0, 0).dst(new Point2(3, 4))).toBe(5);
    });

    it('rotate in 90-degree steps', () => {
        // 旋转会产生 -0 (x=-y 且 y=0); toMatchObject 用 Object.is 比较, Object.is(-0, +0) 为 false,
        // 故改用不依赖 Object.is 的数值断言 (JS 中 -0 === 0 为 true)。
        const p1 = new Point2(1, 0).rotate(1);
        expect(p1.x).toBeCloseTo(0, 10);
        expect(p1.y).toBe(1);
        const p2 = new Point2(1, 0).rotate(2);
        expect(p2.x).toBe(-1);
        expect(p2.y).toBeCloseTo(0, 10);
        expect(new Point2(1, 0).rotate(4)).toMatchObject({x: 1, y: 0});
        expect(new Point2(1, 0).rotate(-1)).toMatchObject({x: 0, y: -1});
    });

    it('equals / static equals', () => {
        expect(new Point2(1, 2).equals(1, 2)).toBe(true);
        expect(new Point2(1, 2).equals(new Point2(1, 2))).toBe(true);
        expect(new Point2(1, 2).equals(new Point2(2, 1))).toBe(false);
        expect(Point2.equals(1, 2, 1, 2)).toBe(true);
        expect(Point2.equals(1, 2, 1, 3)).toBe(false);
    });
});
