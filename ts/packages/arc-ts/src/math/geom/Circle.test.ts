import {describe, expect, it} from 'vitest';
import {Circle} from './Circle';
import {Vec2} from './Vec2';
import {Mathf} from '../Mathf';

describe('Circle construction', () => {
    it('constructs in all forms', () => {
        expect(new Circle(1, 2, 3)).toMatchObject({x: 1, y: 2, radius: 3});
        expect(new Circle(new Vec2(1, 2), 3)).toMatchObject({x: 1, y: 2, radius: 3});
        expect(new Circle(new Circle(1, 2, 3))).toMatchObject({x: 1, y: 2, radius: 3});
        // center + edge point: radius is the distance between them
        const c = new Circle(new Vec2(0, 0), new Vec2(3, 4));
        expect(c.radius).toBe(5);
        expect(new Circle().radius).toBe(0);
    });

    it('set / setPosition / setRadius', () => {
        const c = new Circle().set(1, 2, 3);
        expect(c).toMatchObject({x: 1, y: 2, radius: 3});
        c.setPosition(5, 6);
        expect(c.x).toBe(5);
        expect(c.y).toBe(6);
        c.setRadius(9);
        expect(c.radius).toBe(9);
    });
});

describe('Circle contains / overlaps', () => {
    it('contains points', () => {
        const c = new Circle(0, 0, 5);
        expect(c.contains(3, 4)).toBe(true); // exactly on boundary (<=)
        expect(c.contains(0, 0)).toBe(true);
        expect(c.contains(5, 5)).toBe(false);
        expect(c.contains(new Vec2(4, 3))).toBe(true);
    });

    it('contains circles', () => {
        const c = new Circle(0, 0, 10);
        expect(c.contains(new Circle(0, 0, 5))).toBe(true);
        expect(c.contains(new Circle(0, 0, 15))).toBe(false);
        expect(c.contains(new Circle(0, 0, 10))).toBe(true);
    });

    it('overlaps circles', () => {
        expect(new Circle(0, 0, 5).overlaps(new Circle(8, 0, 5))).toBe(true);
        expect(new Circle(0, 0, 5).overlaps(new Circle(11, 0, 5))).toBe(false);
        expect(new Circle(0, 0, 5).overlaps(new Circle(0, 0, 5))).toBe(true);
    });
});

describe('Circle measurements', () => {
    it('circumference / area', () => {
        const c = new Circle(0, 0, 5);
        expect(c.circumference()).toBe(5 * Mathf.PI2);
        expect(c.area()).toBe(5 * 5 * Mathf.PI);
    });

    it('equals', () => {
        expect(new Circle(1, 2, 3).equals(new Circle(1, 2, 3))).toBe(true);
        expect(new Circle(1, 2, 3).equals(new Circle(1, 2, 4))).toBe(false);
    });

    it('toString', () => {
        expect(new Circle(1, 2, 3).toString()).toBe('1,2,3');
    });
});
