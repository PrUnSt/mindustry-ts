import {describe, expect, it} from 'vitest';
import {Vec2} from './Vec2';
import {Rand} from '../Rand';

describe('Vec2 basics', () => {
    it('constructs and exposes x/y', () => {
        const v = new Vec2(3, 4);
        expect(v.x).toBe(3);
        expect(v.y).toBe(4);
        expect(new Vec2().x).toBe(0);
        expect(new Vec2().y).toBe(0);
        const w = new Vec2(v);
        expect(w.x).toBe(3);
        expect(w.y).toBe(4);
    });

    it('len / len2', () => {
        const v = new Vec2(3, 4);
        expect(v.len()).toBe(5);
        expect(v.len2()).toBe(25);
        expect(new Vec2(5, 12).len()).toBe(13);
        expect(new Vec2().len()).toBe(0);
    });

    it('dst / dst2', () => {
        const v = new Vec2(0, 0);
        expect(v.dst(3, 4)).toBe(5);
        expect(v.dst2(3, 4)).toBe(25);
        expect(v.dst(new Vec2(3, 4))).toBe(5);
        expect(v.dst2(new Vec2(3, 4))).toBe(25);
    });

    it('set / setZero', () => {
        const v = new Vec2();
        expect(v.set(1, 2).x).toBe(1);
        expect(v.set(1, 2).y).toBe(2);
        v.set(new Vec2(5, 6));
        expect(v.x).toBe(5);
        expect(v.y).toBe(6);
        expect(v.setZero().x).toBe(0);
        expect(v.setZero().y).toBe(0);
    });

    it('angle() is CCW from x-axis', () => {
        expect(new Vec2(1, 0).angle()).toBeCloseTo(0, 4);
        expect(new Vec2(0, 1).angle()).toBe(90);
        expect(new Vec2(-1, 0).angle()).toBeCloseTo(180, 3);
        expect(new Vec2(0, -1).angle()).toBe(270);
        expect(new Vec2(1, 1).angle()).toBeCloseTo(45, 4);
    });

    it('angle(reference) uses exact atan2 and returns signed [-180, 180]', () => {
        expect(new Vec2(1, 0).angle(new Vec2(1, 0))).toBe(0);
        expect(new Vec2(1, 0).angle(new Vec2(0, 1))).toBe(90);
        expect(new Vec2(0, 1).angle(new Vec2(1, 0))).toBe(-90);
        expect(new Vec2(1, 0).angle(new Vec2(-1, 0))).toBe(180);
    });

    it('angleRad / setAngle / setAngleRad', () => {
        expect(new Vec2(1, 0).angleRad()).toBe(0);
        expect(new Vec2(0, 1).angleRad()).toBeCloseTo(Math.PI / 2, 12);
        const v = new Vec2(10, 0).setAngle(90);
        expect(v.x).toBeCloseTo(0, 8);
        expect(v.y).toBeCloseTo(10, 8);
    });
});

describe('Vec2 arithmetic', () => {
    it('add', () => {
        expect(new Vec2(3, 4).add(1, 2)).toMatchObject({x: 4, y: 6});
        expect(new Vec2(3, 4).add(new Vec2(1, 2))).toMatchObject({x: 4, y: 6});
    });

    it('sub', () => {
        expect(new Vec2(3, 4).sub(1, 2)).toMatchObject({x: 2, y: 2});
        expect(new Vec2(3, 4).sub(new Vec2(1, 2))).toMatchObject({x: 2, y: 2});
    });

    it('scl', () => {
        expect(new Vec2(3, 4).scl(2)).toMatchObject({x: 6, y: 8});
        expect(new Vec2(3, 4).scl(2, 3)).toMatchObject({x: 6, y: 12});
        expect(new Vec2(3, 4).scl(new Vec2(2, 3))).toMatchObject({x: 6, y: 12});
    });

    it('dot / crs', () => {
        expect(new Vec2(1, 2).dot(3, 4)).toBe(11);
        expect(new Vec2(1, 2).dot(new Vec2(3, 4))).toBe(11);
        expect(new Vec2(1, 2).crs(3, 4)).toBe(-2);
        expect(new Vec2(1, 2).crs(new Vec2(3, 4))).toBe(-2);
        expect(new Vec2(1, 0).crs(new Vec2(0, 1))).toBe(1);
    });

    it('nor normalizes', () => {
        const v = new Vec2(3, 4).nor();
        expect(v.x).toBeCloseTo(0.6, 12);
        expect(v.y).toBeCloseTo(0.8, 12);
        expect(v.len()).toBeCloseTo(1, 12);
        const z = new Vec2().nor();
        expect(z.x).toBe(0);
        expect(z.y).toBe(0);
    });

    it('limit caps length', () => {
        const v = new Vec2(6, 8).limit(5);
        expect(v.x).toBe(3);
        expect(v.y).toBe(4);
        const w = new Vec2(3, 4).limit(10);
        expect(w.x).toBe(3);
        expect(w.y).toBe(4);
    });

    it('setLength / clamp length', () => {
        const v = new Vec2(3, 4).setLength(10);
        expect(v.x).toBe(6);
        expect(v.y).toBe(8);
        const c = new Vec2(10, 0).clamp(1, 5);
        expect(c.x).toBe(5);
        expect(c.y).toBe(0);
        const c2 = new Vec2(0.5, 0).clamp(1, 5);
        expect(c2.x).toBe(1);
    });

    it('lerp', () => {
        const v = new Vec2(0, 0).lerp(new Vec2(10, 10), 0.5);
        expect(v.x).toBe(5);
        expect(v.y).toBe(5);
        const w = new Vec2(0, 0).lerp(10, 20, 0.25);
        expect(w.x).toBe(2.5);
        expect(w.y).toBe(5);
    });

    it('rotate by 90/180 quadrant multiples is exact', () => {
        expect(new Vec2(1, 0).rotate(90)).toMatchObject({x: 0, y: 1});
        expect(new Vec2(1, 0).rotate(180)).toMatchObject({x: -1, y: 0});
        expect(new Vec2(3, 4).rotate(90)).toMatchObject({x: -4, y: 3});
        expect(new Vec2(1, 0).rotate(-90)).toMatchObject({x: 0, y: -1});
    });

    it('rotate by 45 matches lookup table', () => {
        const v = new Vec2(1, 0).rotate(45);
        expect(v.x).toBeCloseTo(0.7069711575416135, 12);
        expect(v.y).toBeCloseTo(0.7072423624184069, 12);
    });

    it('rotateRad / rotateRadExact', () => {
        const a = new Vec2(1, 0).rotateRad(Math.PI / 2);
        expect(a.x).toBeCloseTo(0, 8);
        expect(a.y).toBeCloseTo(1, 8);
        const b = new Vec2(1, 0).rotateRadExact(Math.PI / 2);
        expect(b.x).toBeCloseTo(0, 12);
        expect(b.y).toBeCloseTo(1, 12);
    });

    it('rotate90 / rotateAround', () => {
        expect(new Vec2(1, 0).rotate90(1)).toMatchObject({x: 0, y: 1});
        expect(new Vec2(1, 0).rotate90(-1)).toMatchObject({x: 0, y: -1});
        const v = new Vec2(2, 0).rotateAround(new Vec2(1, 0), 90);
        expect(v.x).toBeCloseTo(1, 8);
        expect(v.y).toBeCloseTo(1, 8);
    });
});

describe('Vec2 helpers', () => {
    it('trns', () => {
        const v = new Vec2().trns(90, 10);
        expect(v.x).toBeCloseTo(0, 8);
        expect(v.y).toBeCloseTo(10, 8);
        const w = new Vec2().trns(45, 10);
        expect(w.x).toBeCloseTo(7.069711575416136, 10);
        expect(w.y).toBeCloseTo(7.072423624184069, 10);
    });

    it('isUnit / isZero / isNaN / isInfinite', () => {
        expect(new Vec2(1, 0).isUnit()).toBe(true);
        expect(new Vec2(0.6, 0.8).isUnit()).toBe(true);
        expect(new Vec2(3, 4).isUnit()).toBe(false);
        expect(new Vec2(0, 0).isZero()).toBe(true);
        expect(new Vec2(0, 1).isZero()).toBe(false);
        expect(new Vec2(NaN, 0).isNaN()).toBe(true);
        expect(new Vec2(Infinity, 0).isInfinite()).toBe(true);
    });

    it('epsilonEquals', () => {
        expect(new Vec2(1, 2).epsilonEquals(1.0000001, 2, 0.001)).toBe(true);
        expect(new Vec2(1, 2).epsilonEquals(new Vec2(1.0000001, 2.0000001), 0.001)).toBe(true);
        expect(new Vec2(1, 2).epsilonEquals(1.1, 2, 0.001)).toBe(false);
    });

    it('isOnLine / isCollinear / isPerpendicular', () => {
        expect(new Vec2(2, 4).isOnLine(new Vec2(1, 2))).toBe(true);
        expect(new Vec2(1, 0).isPerpendicular(new Vec2(0, 1))).toBe(true);
        expect(new Vec2(2, 0).isCollinear(new Vec2(1, 0))).toBe(true);
        expect(new Vec2(-2, 0).isCollinearOpposite(new Vec2(1, 0))).toBe(true);
    });

    it('setToRandomDirection is deterministic with a seed', () => {
        const r1 = new Rand(99);
        const r2 = new Rand(99);
        const a = new Vec2().setToRandomDirection(r1);
        const b = new Vec2().setToRandomDirection(r2);
        expect(a.x).toBe(b.x);
        expect(a.y).toBe(b.y);
        expect(a.len()).toBeCloseTo(1, 10);
    });

    it('cpy / toString / fromString', () => {
        const v = new Vec2(1, 2);
        const c = v.cpy();
        expect(c).not.toBe(v);
        expect(c.x).toBe(1);
        expect(c.y).toBe(2);
        expect(v.toString()).toBe('(1,2)');
        expect(new Vec2().fromString('(3,4)')).toMatchObject({x: 3, y: 4});
    });
});
