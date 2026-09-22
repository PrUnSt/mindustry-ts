import {describe, expect, it} from 'vitest';
import {Vec3} from './Vec3';
import {Rand} from '../Rand';

describe('Vec3 basics', () => {
    it('constructs and exposes x/y/z', () => {
        const v = new Vec3(1, 2, 3);
        expect(v.x).toBe(1);
        expect(v.y).toBe(2);
        expect(v.z).toBe(3);
        expect(new Vec3().z).toBe(0);
        expect(new Vec3([1, 2, 3]).z).toBe(3);
        expect(new Vec3(new Vec3(4, 5, 6)).x).toBe(4);
    });

    it('len / len2', () => {
        expect(new Vec3(1, 2, 2).len()).toBe(3);
        expect(new Vec3(1, 2, 2).len2()).toBe(9);
        expect(Vec3.len(1, 2, 2)).toBe(3);
        expect(Vec3.len2(1, 2, 2)).toBe(9);
    });

    it('static dst / dst2 / dot', () => {
        expect(Vec3.dst(0, 0, 0, 3, 4, 0)).toBe(5);
        expect(Vec3.dst2(0, 0, 0, 3, 4, 0)).toBe(25);
        expect(Vec3.dot(1, 2, 3, 4, 5, 6)).toBe(32);
    });
});

describe('Vec3 arithmetic', () => {
    it('add / sub / scl', () => {
        expect(new Vec3(1, 2, 3).add(1, 1, 1)).toMatchObject({x: 2, y: 3, z: 4});
        expect(new Vec3(1, 2, 3).add(new Vec3(1, 1, 1))).toMatchObject({x: 2, y: 3, z: 4});
        expect(new Vec3(1, 2, 3).sub(1, 1, 1)).toMatchObject({x: 0, y: 1, z: 2});
        expect(new Vec3(1, 2, 3).scl(2)).toMatchObject({x: 2, y: 4, z: 6});
        expect(new Vec3(1, 2, 3).scl(1, 2, 3)).toMatchObject({x: 1, y: 4, z: 9});
    });

    it('add vector with scale', () => {
        expect(new Vec3(1, 1, 1).add(new Vec3(1, 2, 3), 2)).toMatchObject({x: 3, y: 5, z: 7});
    });

    it('dot / crs', () => {
        expect(new Vec3(1, 2, 3).dot(4, 5, 6)).toBe(32);
        expect(new Vec3(1, 2, 3).dot(new Vec3(4, 5, 6))).toBe(32);
        expect(new Vec3(1, 0, 0).crs(new Vec3(0, 1, 0))).toMatchObject({x: 0, y: 0, z: 1});
        expect(new Vec3(1, 2, 3).crs(4, 5, 6)).toMatchObject({x: -3, y: 6, z: -3});
    });

    it('dst / dst2 / within', () => {
        const v = new Vec3(0, 0, 0);
        expect(v.dst(3, 4, 0)).toBe(5);
        expect(v.dst2(3, 4, 0)).toBe(25);
        expect(v.dst(new Vec3(3, 4, 0))).toBe(5);
        expect(v.within(new Vec3(3, 4, 0), 5)).toBe(false); // strict <
        expect(v.within(new Vec3(3, 4, 0), 6)).toBe(true);
    });

    it('nor normalizes', () => {
        const v = new Vec3(3, 4, 0).nor();
        expect(v.x).toBeCloseTo(0.6, 12);
        expect(v.y).toBeCloseTo(0.8, 12);
        expect(v.len()).toBeCloseTo(1, 12);
        expect(new Vec3().nor()).toMatchObject({x: 0, y: 0, z: 0});
    });

    it('setFromSpherical', () => {
        const v = new Vec3().setFromSpherical(0, 0);
        expect(v.x).toBeCloseTo(0, 8);
        expect(v.y).toBeCloseTo(0, 8);
        expect(v.z).toBeCloseTo(1, 8);
    });

    it('angle between vectors', () => {
        expect(new Vec3(1, 0, 0).angle(new Vec3(0, 1, 0))).toBeCloseTo(90, 8);
        expect(new Vec3(1, 0, 0).angleRad(new Vec3(1, 0, 0))).toBeCloseTo(0, 8);
    });

    it('idt / cpy', () => {
        const v = new Vec3(1, 2, 3);
        expect(v.idt(new Vec3(1, 2, 3))).toBe(true);
        expect(v.idt(new Vec3(1, 2, 4))).toBe(false);
        const c = v.cpy();
        expect(c).not.toBe(v);
        expect(c.idt(v)).toBe(true);
    });

    it('setToRandomDirection is deterministic with a seed', () => {
        const a = new Vec3().setToRandomDirection(new Rand(7));
        const b = new Vec3().setToRandomDirection(new Rand(7));
        expect(a.x).toBe(b.x);
        expect(a.len()).toBeCloseTo(1, 10);
    });
});
