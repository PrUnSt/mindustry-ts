import {describe, expect, it} from 'vitest';
import {Scaling} from './Scaling';

function xy(s: Scaling, sw: number, sh: number, tw: number, th: number): [number, number]{
    const v = s.apply(sw, sh, tw, th);
    return [v.x, v.y];
}

describe('Scaling', () => {
    it('fit keeps aspect ratio, fitting inside', () => {
        // landscape source into square target: scale by width
        const [x1, y1] = xy(Scaling.fit, 100, 50, 50, 50);
        expect(x1).toBe(50);
        expect(y1).toBe(25);
        // portrait source into square target: scale by height
        const [x2, y2] = xy(Scaling.fit, 50, 100, 100, 100);
        expect(x2).toBe(50);
        expect(y2).toBe(100);
        // exact fit
        const [x3, y3] = xy(Scaling.fit, 100, 50, 100, 50);
        expect(x3).toBe(100);
        expect(y3).toBe(50);
    });

    it('fill covers the target', () => {
        const [x1, y1] = xy(Scaling.fill, 100, 50, 50, 50);
        expect(x1).toBe(100);
        expect(y1).toBe(50);
        const [x2, y2] = xy(Scaling.fill, 50, 100, 100, 100);
        expect(x2).toBe(100);
        expect(y2).toBe(200);
    });

    it('stretch distorts to target size', () => {
        const [x, y] = xy(Scaling.stretch, 100, 50, 50, 75);
        expect(x).toBe(50);
        expect(y).toBe(75);
    });

    it('stretchX / stretchY', () => {
        const [x1, y1] = xy(Scaling.stretchX, 100, 50, 50, 75);
        expect(x1).toBe(50);
        expect(y1).toBe(50);
        const [x2, y2] = xy(Scaling.stretchY, 100, 50, 50, 75);
        expect(x2).toBe(100);
        expect(y2).toBe(75);
    });

    it('fillX / fillY', () => {
        const [x1, y1] = xy(Scaling.fillX, 100, 50, 50, 50);
        expect(x1).toBe(50);
        expect(y1).toBe(25);
        const [x2, y2] = xy(Scaling.fillY, 100, 50, 100, 200);
        expect(x2).toBe(400);
        expect(y2).toBe(200);
    });

    it('bounded scales down only when needed', () => {
        const [x1, y1] = xy(Scaling.bounded, 200, 200, 100, 100);
        expect(x1).toBe(100);
        expect(y1).toBe(100);
        const [x2, y2] = xy(Scaling.bounded, 50, 50, 100, 100);
        expect(x2).toBe(50);
        expect(y2).toBe(50);
    });

    it('none leaves source size', () => {
        const [x, y] = xy(Scaling.none, 50, 25, 100, 100);
        expect(x).toBe(50);
        expect(y).toBe(25);
    });
});
