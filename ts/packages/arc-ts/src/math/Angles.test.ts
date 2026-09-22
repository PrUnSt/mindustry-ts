import {describe, expect, it} from 'vitest';
import {Angles} from './Angles';
import {Vec2} from './geom/Vec2';

describe('Angles.angle', () => {
    it('computes angles of vectors (approx atan2)', () => {
        expect(Angles.angle(1, 0)).toBeCloseTo(0, 4);
        expect(Angles.angle(0, 1)).toBe(90);
        expect(Angles.angle(-1, 0)).toBeCloseTo(180, 3);
        expect(Angles.angle(0, -1)).toBe(270);
        expect(Angles.angle(1, 1)).toBeCloseTo(45, 4);
    });

    it('computes angle between two points', () => {
        expect(Angles.angle(0, 0, 0, 1)).toBe(90);
        expect(Angles.angle(0, 0, 1, 0)).toBeCloseTo(0, 4);
        expect(Angles.angle(5, 5, 5, 6)).toBe(90);
        expect(Angles.angle(5, 5, 6, 5)).toBeCloseTo(0, 4);
    });

    it('angleRad returns radians', () => {
        expect(Angles.angleRad(0, 0, 0, 1)).toBeCloseTo(Math.PI / 2, 5);
        expect(Angles.angleRad(0, 0, 1, 0)).toBeCloseTo(0, 5);
    });
});

describe('Angles.angleDist (wraparound)', () => {
    it('is symmetric and wraps', () => {
        expect(Angles.angleDist(0, 90)).toBe(90);
        expect(Angles.angleDist(350, 10)).toBe(20);
        expect(Angles.angleDist(10, 350)).toBe(20);
        expect(Angles.angleDist(0, 180)).toBe(180);
        expect(Angles.angleDist(90, 270)).toBe(180);
        expect(Angles.angleDist(45, 45)).toBe(0);
        expect(Angles.angleDist(0, 360)).toBe(0);
        expect(Angles.angleDist(-90, 0)).toBe(90);
    });
});

describe('Angles.moveToward / clampRange', () => {
    it('moves toward target at constant speed', () => {
        expect(Angles.moveToward(0, 90, 30)).toBe(30);
        expect(Angles.moveToward(90, 0, 30)).toBe(60);
        expect(Angles.moveToward(270, 0, 45)).toBe(315);
        expect(Angles.moveToward(0, 180, 45)).toBe(45);
        expect(Angles.moveToward(180, 0, 45)).toBe(135);
    });

    it('snaps to target when close enough', () => {
        expect(Angles.moveToward(350, 10, 30)).toBe(10);
        expect(Angles.moveToward(270, 0, 100)).toBe(0);
        expect(Angles.moveToward(10, 350, 30)).toBe(350);
    });

    it('clampRange clamps within range', () => {
        expect(Angles.clampRange(10, 0, 20)).toBe(10);
        expect(Angles.clampRange(10, 0, 5)).toBe(5);
        expect(Angles.clampRange(350, 0, 5)).toBe(355);
        expect(Angles.clampRange(0, 0, 0)).toBe(0);
    });
});

describe('Angles.forward/backward distance', () => {
    it('computes both distances', () => {
        expect(Angles.forwardDistance(10, 30)).toBe(20);
        expect(Angles.backwardDistance(10, 30)).toBe(340);
        expect(Angles.forwardDistance(350, 10)).toBe(340);
        expect(Angles.backwardDistance(350, 10)).toBe(20);
        expect(Angles.forwardDistance(0, 0)).toBe(0);
        expect(Angles.backwardDistance(0, 0)).toBe(360);
    });
});

describe('Angles.within / near', () => {
    it('checks proximity with wraparound', () => {
        expect(Angles.within(0, 10, 15)).toBe(true);
        expect(Angles.within(0, 30, 15)).toBe(false);
        expect(Angles.within(350, 10, 25)).toBe(true);
        expect(Angles.near(0, 10, 15)).toBe(true);
        expect(Angles.near(0, 10, 10)).toBe(false);
        expect(Angles.near(0, 0, 0.1)).toBe(true);
    });
});

describe('Angles.trnsx / trnsy', () => {
    it('computes polar projections exactly at quadrant angles', () => {
        expect(Angles.trnsx(0, 10)).toBe(10);
        expect(Angles.trnsy(0, 10)).toBe(0);
        expect(Angles.trnsx(90, 10)).toBe(0);
        expect(Angles.trnsy(90, 10)).toBe(10);
        expect(Angles.trnsx(180, 10)).toBe(-10);
        expect(Angles.trnsy(180, 10)).toBe(0);
        expect(Angles.trnsx(270, 10)).toBe(0);
        expect(Angles.trnsy(270, 10)).toBe(-10);
    });

    it('approximates at other angles via lookup table', () => {
        expect(Angles.trnsx(30, 10)).toBeCloseTo(8.659934286101654, 10);
        expect(Angles.trnsy(30, 10)).toBeCloseTo(5.000553584417606, 10);
        expect(Angles.trnsx(45, 10)).toBeCloseTo(7.069711575416136, 10);
        expect(Angles.trnsy(45, 10)).toBeCloseTo(7.072423624184069, 10);
    });

    it('trnsx/trnsy with x,y rotate the vector', () => {
        // trnsx(90, 1, 0) rotates (1,0) by 90 degrees -> (0,1)
        expect(Angles.trnsx(90, 1, 0)).toBeCloseTo(0, 10);
        expect(Angles.trnsy(90, 1, 0)).toBeCloseTo(1, 10);
        // trnsx(180, 1, 0) -> (-1, 0)
        expect(Angles.trnsx(180, 1, 0)).toBeCloseTo(-1, 10);
        expect(Angles.trnsy(180, 1, 0)).toBeCloseTo(0, 10);
    });
});

describe('Angles.randVectors', () => {
    it('produces deterministic vectors of fixed length', () => {
        const points: Vec2[] = [];
        Angles.randVectors(12345, 4, 10, { get: (x, y) => { points.push(new Vec2(x, y)); } });
        expect(points.length).toBe(4);
        for(const p of points){
            expect(p.len()).toBeCloseTo(10, 5);
        }
        // deterministic
        const points2: Vec2[] = [];
        Angles.randVectors(12345, 4, 10, { get: (x, y) => { points2.push(new Vec2(x, y)); } });
        for(let i = 0; i < points.length; i++){
            expect(points[i].x).toBe(points2[i].x);
            expect(points[i].y).toBe(points2[i].y);
        }
    });
});

describe('Angles.circleVectors', () => {
    it('distributes points around a circle', () => {
        const points: Vec2[] = [];
        Angles.circleVectors(4, 10, { get: (x, y) => { points.push(new Vec2(x, y)); } });
        expect(points.length).toBe(4);
        for(const p of points){
            expect(p.len()).toBeCloseTo(10, 5);
        }
        // 4 points around circle at 0/90/180/270
        expect(points[0].x).toBeCloseTo(10, 6);
        expect(points[0].y).toBeCloseTo(0, 6);
        expect(points[1].x).toBeCloseTo(0, 6);
        expect(points[1].y).toBeCloseTo(10, 6);
    });
});
