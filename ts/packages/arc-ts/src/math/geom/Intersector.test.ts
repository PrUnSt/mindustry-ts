import {describe, expect, it} from 'vitest';
import {Intersector, Seq} from './Intersector';
import {Vec2} from './Vec2';
import {Circle} from './Circle';
import {Rect} from './Rect';

describe('Intersector.intersectSegments', () => {
    it('finds intersection of crossing segments', () => {
        const out = new Vec2();
        const hit = Intersector.intersectSegments(
            new Vec2(0, 0), new Vec2(10, 10),
            new Vec2(0, 10), new Vec2(10, 0),
            out
        );
        expect(hit).toBe(true);
        expect(out.x).toBeCloseTo(5, 10);
        expect(out.y).toBeCloseTo(5, 10);
    });

    it('accepts numeric overload', () => {
        const out = new Vec2();
        const hit = Intersector.intersectSegments(0, 0, 10, 10, 0, 10, 10, 0, out);
        expect(hit).toBe(true);
        expect(out.x).toBeCloseTo(5, 10);
        expect(out.y).toBeCloseTo(5, 10);
    });

    it('returns false for parallel segments', () => {
        const out = new Vec2();
        const hit = Intersector.intersectSegments(new Vec2(0, 0), new Vec2(10, 0), new Vec2(0, 5), new Vec2(10, 5), out);
        expect(hit).toBe(false);
    });

    it('returns false for non-intersecting segments', () => {
        const out = new Vec2();
        const hit = Intersector.intersectSegments(new Vec2(0, 0), new Vec2(5, 5), new Vec2(10, 0), new Vec2(10, 5), out);
        expect(hit).toBe(false);
    });

    it('returns false when intersection is beyond segment end', () => {
        const out = new Vec2();
        const hit = Intersector.intersectSegments(new Vec2(0, 0), new Vec2(5, 5), new Vec2(0, 10), new Vec2(5, 15), out);
        expect(hit).toBe(false);
    });
});

describe('Intersector.isInPolygon', () => {
    const square = [0, 0, 10, 0, 10, 10, 0, 10];

    it('tests point-in-polygon for number[]', () => {
        expect(Intersector.isInPolygon(square, 0, square.length, 5, 5)).toBe(true);
        expect(Intersector.isInPolygon(square, 0, square.length, 15, 5)).toBe(false);
        expect(Intersector.isInPolygon(square, 0, square.length, 5, 15)).toBe(false);
        expect(Intersector.isInPolygon(square, 0, square.length, -1, 5)).toBe(false);
    });

    it('tests point-in-polygon for triangle', () => {
        const tri = [0, 0, 4, 0, 0, 3];
        expect(Intersector.isInPolygon(tri, 0, tri.length, 1, 1)).toBe(true);
        expect(Intersector.isInPolygon(tri, 0, tri.length, 3, 1)).toBe(false);
    });

    it('tests point-in-polygon for Seq<Vec2>', () => {
        const seq = new Seq<Vec2>();
        seq.add(new Vec2(0, 0));
        seq.add(new Vec2(10, 0));
        seq.add(new Vec2(10, 10));
        seq.add(new Vec2(0, 10));
        expect(Intersector.isInPolygon(seq, new Vec2(5, 5))).toBe(true);
        expect(Intersector.isInPolygon(seq, new Vec2(15, 5))).toBe(false);
    });

    it('isInRegularPolygon', () => {
        // regular hexagon centered at origin, radius 10
        expect(Intersector.isInRegularPolygon(6, 0, 0, 10, 0, 0, 0)).toBe(true);
        expect(Intersector.isInRegularPolygon(6, 0, 0, 10, 0, 20, 0)).toBe(false);
    });
});

describe('Intersector.overlaps', () => {
    it('circle vs rect', () => {
        expect(Intersector.overlaps(new Circle(5, 5, 5), new Rect(0, 0, 10, 10))).toBe(true);
        expect(Intersector.overlaps(new Circle(20, 20, 2), new Rect(0, 0, 10, 10))).toBe(false);
        expect(Intersector.overlaps(new Circle(10, 10, 5), new Rect(0, 0, 10, 10))).toBe(true);
    });

    it('circle vs circle', () => {
        expect(Intersector.overlaps(new Circle(0, 0, 5), new Circle(8, 0, 5))).toBe(true);
        expect(Intersector.overlaps(new Circle(0, 0, 5), new Circle(11, 0, 5))).toBe(false);
    });

    it('rect vs rect', () => {
        expect(Intersector.overlaps(new Rect(0, 0, 10, 10), new Rect(5, 5, 10, 10))).toBe(true);
        expect(Intersector.overlaps(new Rect(0, 0, 10, 10), new Rect(11, 11, 10, 10))).toBe(false);
    });
});

describe('Intersector.segment helpers', () => {
    it('nearestSegmentPoint', () => {
        const out = new Vec2();
        Intersector.nearestSegmentPoint(new Vec2(0, 0), new Vec2(10, 0), new Vec2(5, 3), out);
        expect(out.x).toBe(5);
        expect(out.y).toBe(0);
        Intersector.nearestSegmentPoint(new Vec2(0, 0), new Vec2(10, 0), new Vec2(-1, 2), out);
        expect(out.x).toBe(0);
        expect(out.y).toBe(0);
        Intersector.nearestSegmentPoint(new Vec2(0, 0), new Vec2(10, 0), new Vec2(20, 2), out);
        expect(out.x).toBe(10);
        expect(out.y).toBe(0);
    });

    it('distanceSegmentPoint', () => {
        expect(Intersector.distanceSegmentPoint(0, 0, 10, 0, 5, 3)).toBe(3);
        expect(Intersector.distanceSegmentPoint(0, 0, 10, 0, 0, 5)).toBe(5);
        expect(Intersector.distanceSegmentPoint(new Vec2(0, 0), new Vec2(10, 0), new Vec2(5, 4))).toBe(4);
    });

    it('intersectSegmentCircle', () => {
        expect(Intersector.intersectSegmentCircle(new Vec2(0, 0), new Vec2(10, 0), new Vec2(5, 3), 16)).toBe(true);
        expect(Intersector.intersectSegmentCircle(new Vec2(0, 0), new Vec2(10, 0), new Vec2(5, 10), 16)).toBe(false);
        // 依据 Intersector.java:313-331: 第 4 参数是 squareRadius(平方半径), 16 即半径 4。
        // center=(12,0) 时 u >= l 走 Intersector.java:320-321 -> 最近点取 end=(10,0);
        // x=2, y=0, x*x+y*y=4 <= 16 -> 返回 true, 故不能期望 false。
        expect(Intersector.intersectSegmentCircle(new Vec2(0, 0), new Vec2(10, 0), new Vec2(12, 0), 16)).toBe(true);
        // 真正的 "圆心在段外且不相交" 用例: center=(20,0) -> 最近点仍为 end=(10,0), x=10 -> 100 > 16 -> false
        expect(Intersector.intersectSegmentCircle(new Vec2(0, 0), new Vec2(10, 0), new Vec2(20, 0), 16)).toBe(false);
    });

    it('distanceLinePoint', () => {
        expect(Intersector.distanceLinePoint(new Vec2(0, 0), new Vec2(10, 0), new Vec2(5, 3))).toBe(3);
        expect(Intersector.distanceLinePoint(new Vec2(0, 0), new Vec2(10, 0), new Vec2(5, -3))).toBe(3);
    });

    it('pointLineSide', () => {
        // line (0,0)-(10,0); point above -> left or right depending on orientation
        expect(Intersector.pointLineSide(new Vec2(0, 0), new Vec2(10, 0), new Vec2(5, 1))).toBe(1);
        expect(Intersector.pointLineSide(new Vec2(0, 0), new Vec2(10, 0), new Vec2(5, -1))).toBe(-1);
        expect(Intersector.pointLineSide(new Vec2(0, 0), new Vec2(10, 0), new Vec2(5, 0))).toBe(0);
    });
});

describe('Intersector.intersectSegmentRectangle', () => {
    it('detects crossing and miss', () => {
        expect(Intersector.intersectSegmentRectangle(0, 0, 20, 20, 5, 5, 10, 10)).toBe(true);
        expect(Intersector.intersectSegmentRectangle(0, 0, 2, 2, 10, 10, 5, 5)).toBe(false);
    });
});
