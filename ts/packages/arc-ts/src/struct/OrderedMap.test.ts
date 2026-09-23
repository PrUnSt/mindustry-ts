import {describe, expect, it} from 'vitest';
import {OrderedMap} from './OrderedMap';

describe('OrderedMap 顺序语义', () => {
    it('put 保持插入顺序, orderedKeys 反映该顺序', () => {
        const m = new OrderedMap<string, number>();
        m.put('c', 3);
        m.put('a', 1);
        m.put('b', 2);
        expect(m.orderedKeys().toArray()).toEqual(['c', 'a', 'b']);
        expect(m.size).toBe(3);
    });

    it('removeIndex 按索引移除并保持剩余顺序', () => {
        const m = new OrderedMap<string, number>();
        m.put('a', 1);
        m.put('b', 2);
        m.put('c', 3);
        expect(m.removeIndex(1)).toBe(2);
        expect(m.orderedKeys().toArray()).toEqual(['a', 'c']);
        expect(m.containsKey('b')).toBe(false);
        expect(m.get('c')).toBe(3);
    });

    it('remove 对数值键按值移除, 不把键当作索引', () => {
        // 回归: Java 的 keys.remove(key, false) 是 remove(T, boolean) 按值重载 (OrderedMap.java:97);
        // TS 侧若写成 Seq.remove(key, false) 会因重载塌缩把 number 当成索引,
        // 从而删掉 keyList[2] (=键 3) 而不是键 2, 导致顺序表与哈希表不一致。
        const m = new OrderedMap<number, string>();
        m.put(1, 'one');
        m.put(2, 'two');
        m.put(3, 'three');
        expect(m.remove(2)).toBe('two');
        expect(m.orderedKeys().toArray()).toEqual([1, 3]);
        expect(m.containsKey(2)).toBe(false);
        expect(m.get(3)).toBe('three');
        expect(m.size).toBe(2);
    });

    it('remove 不存在的键返回 null 且不改动顺序', () => {
        const m = new OrderedMap<number, string>();
        m.put(1, 'one');
        m.put(2, 'two');
        expect(m.remove(9)).toBeNull();
        expect(m.orderedKeys().toArray()).toEqual([1, 2]);
        expect(m.size).toBe(2);
    });

    it('alter 保持位置替换键', () => {
        const m = new OrderedMap<string, number>();
        m.put('a', 1);
        m.put('b', 2);
        expect(m.alter('b', 'z')).toBe(true);
        expect(m.orderedKeys().toArray()).toEqual(['a', 'z']);
        expect(m.get('z')).toBe(2);
        expect(m.containsKey('b')).toBe(false);
    });

    it('clear 后顺序表清空', () => {
        const m = new OrderedMap<string, number>();
        m.put('a', 1);
        m.put('b', 2);
        m.clear();
        expect(m.size).toBe(0);
        expect(m.orderedKeys().size).toBe(0);
    });
});
