import {describe, expect, it} from 'vitest';
import {Polygon} from './Polygon';
import {Vec2} from './Vec2';

describe('Polygon construction', () => {
    it('requires at least 3 points', () => {
        expect(() => new Polygon([0, 0, 1, 0])).toThrow();
        expect(() => new Polygon().setVertices([0, 0, 1, 0])).toThrow();
        const p = new Polygon([0, 0, 4, 0, 0, 3]);
        expect(p.getVertices()).toEqual([0, 0, 4, 0, 0, 3]);
    });
});

describe('Polygon area / bounds / contains', () => {
    it('area via shoelace', () => {
        expect(new Polygon([0, 0, 4, 0, 0, 3]).area()).toBe(6);
        expect(new Polygon([0, 0, 2, 0, 2, 2, 0, 2]).area()).toBe(4);
    });

    it('getBoundingRectangle', () => {
        const b = new Polygon([0, 0, 4, 0, 0, 3]).getBoundingRectangle();
        expect(b).toMatchObject({x: 0, y: 0, width: 4, height: 3});
    });

    it('contains points', () => {
        const tri = new Polygon([0, 0, 4, 0, 0, 3]);
        expect(tri.contains(1, 1)).toBe(true);
        expect(tri.contains(3, 1)).toBe(false);
        expect(tri.contains(new Vec2(0.5, 0.5))).toBe(true);
        const square = new Polygon([0, 0, 10, 0, 10, 10, 0, 10]);
        expect(square.contains(5, 5)).toBe(true);
        expect(square.contains(11, 5)).toBe(false);
    });
});

describe('Polygon transforms', () => {
    it('setPosition / translate affect transformed vertices', () => {
        const p = new Polygon([0, 0, 4, 0, 0, 3]);
        p.setPosition(10, 20);
        expect(p.getTransformedVertices()).toEqual([10, 20, 14, 20, 10, 23]);
        p.translate(1, 1);
        expect(p.getTransformedVertices()).toEqual([11, 21, 15, 21, 11, 24]);
    });

    it('rotate changes transformed vertices', () => {
        const p = new Polygon([0, 0, 1, 0, 0, 1]);
        p.rotate(90);
        const v = p.getTransformedVertices();
        // (1,0) rotated 90 deg -> (0,1); (0,1) -> (-1,0)
        expect(v[2]).toBeCloseTo(0, 8);
        expect(v[3]).toBeCloseTo(1, 8);
        expect(v[4]).toBeCloseTo(-1, 8);
        expect(v[5]).toBeCloseTo(0, 8);
    });

    it('setScale scales transformed vertices', () => {
        const p = new Polygon([0, 0, 4, 0, 0, 3]);
        p.setScale(2, 3);
        expect(p.getTransformedVertices()).toEqual([0, 0, 8, 0, 0, 9]);
    });

    it('setOrigin rotates around origin', () => {
        const p = new Polygon([0, 0, 2, 0, 0, 2]);
        p.setOrigin(1, 0);
        p.rotate(90);
        const v = p.getTransformedVertices();
        // vertex (2,0) about origin (1,0): (2-1,0)->rotate90->(0,1)+origin->(1,1)
        expect(v[2]).toBeCloseTo(1, 8);
        expect(v[3]).toBeCloseTo(1, 8);
    });

    it('caches transformed vertices until dirty', () => {
        const p = new Polygon([0, 0, 4, 0, 0, 3]);
        const first = p.getTransformedVertices();
        p.setPosition(100, 100);
        p.dirty();
        const second = p.getTransformedVertices();
        expect(second[0]).toBe(100);
        // 依据 Polygon.java:54-94: getTransformedVertices() 只有在 dirty 为 true 时重算,
        // 重算时复用内部 field worldVertices (Polygon.java:59-60 仅在长度变化时才 new),
        // 因此两次调用返回同一个数组引用是 Java 的设计语义 —— 断言应为同一引用。
        expect(first).toBe(second);
        expect(first[0]).toBe(100);
    });
});
