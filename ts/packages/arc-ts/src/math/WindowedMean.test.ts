import {describe, expect, it} from 'vitest';
import {WindowedMean} from './WindowedMean';

describe('WindowedMean basics', () => {
    it('reports no data before the window fills', () => {
        const m = new WindowedMean(3);
        expect(m.hasEnoughData()).toBe(false);
        expect(m.getCount()).toBe(0);
        expect(m.getWindowSize()).toBe(3);
        expect(m.mean()).toBe(0);
        expect(m.rawMean()).toBe(0);
    });

    it('returns 0 mean until enough samples', () => {
        const m = new WindowedMean(3);
        m.add(10);
        expect(m.hasEnoughData()).toBe(false);
        expect(m.mean()).toBe(0);
        expect(m.rawMean()).toBe(10);
        m.add(20);
        expect(m.rawMean()).toBe(15);
        expect(m.mean()).toBe(0);
    });

    it('averages a full window', () => {
        const m = new WindowedMean(3);
        m.add(1);
        m.add(2);
        m.add(3);
        expect(m.hasEnoughData()).toBe(true);
        expect(m.mean()).toBe(2);
        expect(m.rawMean()).toBe(2);
    });

    it('slides the window replacing oldest values', () => {
        const m = new WindowedMean(3);
        [1, 2, 3].forEach(v => m.add(v));
        m.add(4); // window becomes [2,3,4]
        expect(m.mean()).toBe(3);
        m.add(5); // window becomes [3,4,5]
        expect(m.mean()).toBe(4);
        m.add(100);
        expect(m.mean()).toBeCloseTo((4 + 5 + 100) / 3, 12);
    });
});

describe('WindowedMean window access', () => {
    it('oldest / latest', () => {
        const m = new WindowedMean(3);
        m.add(1);
        m.add(2);
        m.add(3);
        expect(m.oldest()).toBe(1);
        expect(m.latest()).toBe(3);
        m.add(4);
        expect(m.oldest()).toBe(2);
        expect(m.latest()).toBe(4);
    });

    it('lowest / highest', () => {
        const m = new WindowedMean(3);
        m.add(5);
        m.add(2);
        m.add(8);
        expect(m.lowest()).toBe(2);
        expect(m.highest()).toBe(8);
    });

    it('getWindowValues returns oldest-to-newest', () => {
        const m = new WindowedMean(3);
        m.add(1);
        m.add(2);
        m.add(3);
        m.add(4); // window [2,3,4]
        expect(m.getWindowValues()).toEqual([2, 3, 4]);
    });

    it('get(index) reads by offset', () => {
        const m = new WindowedMean(3);
        m.add(1);
        m.add(2);
        m.add(3);
        m.add(4); // values = [4,2,3], lastValue = 1
        // 依据 WindowedMean.java:33-35: get(index) = values[Mathf.mod(index + lastValue, values.length)]。
        // lastValue = 1 时 get(0)=values[1]=2, get(1)=values[2]=3, get(2)=values[0]=4,
        // 与 getWindowValues() 的 oldest->latest 顺序 [2,3,4] 一致 (不是 [3,4,2])。
        expect(m.get(0)).toBe(2);
        expect(m.get(1)).toBe(3);
        expect(m.get(2)).toBe(4);
    });
});

describe('WindowedMean standard deviation', () => {
    it('computes population stddev', () => {
        const m = new WindowedMean(3);
        m.add(1);
        m.add(2);
        m.add(3);
        expect(m.standardDeviation()).toBeCloseTo(Math.sqrt(2 / 3), 12);
    });

    it('returns 0 without enough data', () => {
        const m = new WindowedMean(3);
        m.add(5);
        expect(m.standardDeviation()).toBe(0);
    });
});

describe('WindowedMean reset / clear / fill', () => {
    it('reset clears samples', () => {
        const m = new WindowedMean(3);
        m.add(1);
        m.add(2);
        m.add(3);
        m.reset();
        expect(m.getCount()).toBe(0);
        expect(m.hasEnoughData()).toBe(false);
        expect(m.mean()).toBe(0);
    });

    it('clear zeroes the window', () => {
        const m = new WindowedMean(3);
        m.add(1);
        m.add(2);
        m.add(3);
        m.clear();
        expect(m.hasEnoughData()).toBe(false);
        expect(m.getCount()).toBe(0);
        expect(m.mean()).toBe(0);
    });

    it('fill sets every slot', () => {
        const m = new WindowedMean(3);
        m.fill(7);
        expect(m.hasEnoughData()).toBe(true);
        expect(m.getCount()).toBe(3);
        expect(m.mean()).toBe(7);
        expect(m.getWindowValues()).toEqual([7, 7, 7]);
    });
});
