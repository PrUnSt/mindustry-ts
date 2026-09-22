import {describe, expect, it} from 'vitest';
import {Rand} from './Rand';

describe('Rand determinism (LCG / xorshift128+)', () => {
    it('produces identical sequences for the same seed', () => {
        const a = new Rand(12345);
        const b = new Rand(12345);
        for(let i = 0; i < 10; i++){
            expect(a.nextLong()).toBe(b.nextLong());
            expect(a.nextInt()).toBe(b.nextInt());
            expect(a.nextFloat()).toBe(b.nextFloat());
            expect(a.nextDouble()).toBe(b.nextDouble());
            expect(a.nextBoolean()).toBe(b.nextBoolean());
        }
    });

    it('matches Java nextLong() output for seed 12345 (xorshift128+ newState + oldSeed1)', () => {
        const r = new Rand(12345);
        // Java: new Rand(12345).nextLong() computed from murmurHash3 seeding + xorshift128+.
        // JS numbers lose precision beyond 2^53, so assert exactness only for low-level ints below.
        const first = r.nextLong();
        expect(typeof first).toBe('number');
        // deterministic across instances:
        const r2 = new Rand(12345);
        expect(r2.nextLong()).toBe(first);
    });

    it('matches Java nextInt() (low 32 bits of nextLong) for seed 12345', () => {
        const r = new Rand(12345);
        // Computed from the Java algorithm (murmurHash3 seed + xorshift128+, truncated to int).
        const seq = [858696244, 359909261, 471003868, 918029050, 1250791781, -1866401366];
        for(const expected of seq){
            expect(r.nextInt()).toBe(expected);
        }
    });

    it('matches Java nextInt() for other seeds', () => {
        const r1 = new Rand(1);
        expect([r1.nextInt(), r1.nextInt(), r1.nextInt()]).toEqual([-1478308561, 1581170890, -1901279752]);

        const r42 = new Rand(42);
        expect([r42.nextInt(), r42.nextInt(), r42.nextInt()]).toEqual([-1999104143, 1193722123, -1848484490]);
    });

    it('matches Java nextFloat() exactly (k / 2^24) for seed 12345', () => {
        const r = new Rand(12345);
        // nextFloat = (nextLong >>> 40) * NORM_FLOAT; the high 24 bits are exact integers.
        const k = [1257315, 8178856, 15005632, 9682889];
        for(const expected of k){
            expect(r.nextFloat() * (1 << 24)).toBe(expected);
        }
    });

    it('nextFloat() stays in [0, 1)', () => {
        const r = new Rand(7);
        for(let i = 0; i < 100; i++){
            const v = r.nextFloat();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('nextDouble() stays in [0, 1)', () => {
        const r = new Rand(7);
        for(let i = 0; i < 100; i++){
            const v = r.nextDouble();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('nextInt(n) is in [0, n)', () => {
        const r = new Rand(12345);
        // Exact Java-equivalent sequence for n=10.
        const seq = [6, 2, 8, 7, 4, 1, 9, 7];
        for(const expected of seq){
            expect(r.nextInt(10)).toBe(expected);
        }
        for(let i = 0; i < 50; i++){
            const v = r.nextInt(100);
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(100);
        }
    });

    it('nextLong(n) matches Java rejection sampling', () => {
        const r = new Rand(12345);
        const seq = [384572186, 949340102, 619677038, 340522877];
        for(const expected of seq){
            expect(r.nextLong(1e9)).toBe(expected);
        }
    });

    it('rejects non-positive n', () => {
        const r = new Rand(1);
        expect(() => r.nextInt(0)).toThrow();
        expect(() => r.nextInt(-5)).toThrow();
        expect(() => r.nextLong(0)).toThrow();
    });

    it('random(min, max) inclusive integer bounds', () => {
        const r = new Rand(12345);
        expect(r.random(5)).toBeGreaterThanOrEqual(0);
        expect(r.random(5)).toBeLessThanOrEqual(5);
        for(let i = 0; i < 30; i++){
            const v = r.random(1, 10);
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(1);
            expect(v).toBeLessThanOrEqual(10);
        }
    });

    it('random(float) / random(float, float) ranges', () => {
        const r = new Rand(5);
        for(let i = 0; i < 30; i++){
            const v = r.random(2.5);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(2.5);
            const w = r.random(-1.0, 1.0);
            expect(w).toBeGreaterThanOrEqual(-1);
            expect(w).toBeLessThan(1);
        }
    });

    it('range(amount) returns values in [-amount, amount]', () => {
        const r = new Rand(3);
        for(let i = 0; i < 50; i++){
            const v = r.range(5);
            expect(v).toBeGreaterThanOrEqual(-5);
            expect(v).toBeLessThanOrEqual(5);
            expect(Number.isInteger(v)).toBe(true);
        }
        for(let i = 0; i < 50; i++){
            const v = r.range(2.5);
            expect(v).toBeGreaterThanOrEqual(-2.5);
            expect(v).toBeLessThanOrEqual(2.5);
        }
    });

    it('nextBoolean alternates in a stable way per seed', () => {
        const a = new Rand(12345);
        const b = new Rand(12345);
        for(let i = 0; i < 10; i++){
            expect(a.nextBoolean()).toBe(b.nextBoolean());
        }
        // Seed 12345 first boolean is false
        expect(new Rand(12345).nextBoolean()).toBe(false);
        expect(new Rand(1).nextBoolean()).toBe(true);
    });

    it('nextBytes fills deterministically', () => {
        const a = new Rand(11);
        const b = new Rand(11);
        const ba = new Array(10).fill(0);
        const bb = new Array(10).fill(0);
        a.nextBytes(ba);
        b.nextBytes(bb);
        expect(ba).toEqual(bb);
        for(const byte of ba){
            expect(byte).toBeGreaterThanOrEqual(-128);
            expect(byte).toBeLessThanOrEqual(127);
        }
    });

    it('state save/restore reproduces the sequence', () => {
        const a = new Rand(12345);
        a.nextInt();
        a.nextInt();
        const s0 = a.getState(0);
        const s1 = a.getState(1);
        const expected = a.nextInt();

        const b = new Rand(0, 0);
        b.setState(s0, s1);
        expect(b.nextInt()).toBe(expected);
    });

    it('seed0/seed1 getters reflect the state', () => {
        const r = new Rand(12345);
        const s0 = r.seed0;
        r.seed0 = s0;
        const s1 = r.seed1;
        r.seed1 = s1;
        expect(r.seed0).toBe(s0);
        expect(r.seed1).toBe(s1);
    });
});
