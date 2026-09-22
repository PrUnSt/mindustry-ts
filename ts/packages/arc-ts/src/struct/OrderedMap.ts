// 源: arc-core/src/arc/struct/OrderedMap.java
// 迁移说明: 在 ObjectMap 基础上额外用 Seq 按插入顺序保存 key. 迭代 (entries/keys/values) 有序.
// 注意: Java 中包私有的 final Seq<K> keys 字段与 keys() 方法同名, TS 无法同名字段+方法, 故字段命名为 keyList.
import {ObjectMap, Entries, Values, Keys, Entry} from './ObjectMap';
import {Seq} from './Seq';

/**
 * 同时按插入顺序在 {@link Seq} 中保存 key 的 {@link ObjectMap}.
 */
export class OrderedMap<K, V> extends ObjectMap<K, V>{
    readonly keyList: Seq<K>;

    static of<K, V>(...values: unknown[]): OrderedMap<K, V>{
        const map = new OrderedMap<K, V>();
        for(let i = 0; i < values.length / 2; i++){
            map.put(values[i * 2] as K, values[i * 2 + 1] as V);
        }
        return map;
    }

    /** 创建初始容量 51、负载因子 0.8 的新 map. */
    constructor();
    constructor(initialCapacity: number);
    constructor(initialCapacity: number, loadFactor: number);
    constructor(map: OrderedMap<K, V>);
    constructor(a?: any, b?: any){
        if(a instanceof OrderedMap){
            super(a as OrderedMap<K, V>);
            this.keyList = new Seq<K>((a as OrderedMap<K, V>).keyList);
            return;
        }
        if(b !== undefined){
            super(a as number, b as number);
            this.keyList = new Seq<K>(a as number);
            return;
        }
        if(a !== undefined){
            super(a as number);
            this.keyList = new Seq<K>(a as number);
            return;
        }
        super();
        this.keyList = new Seq<K>();
    }

    put(key: K, value: V): V | null{
        let i = this.locateKey(key);
        if(i >= 0){ // 已有 key
            const oldValue = this.valueTable[i];
            this.valueTable[i] = value;
            return oldValue;
        }
        i = -(i + 1); // 找到空位
        this.keyTable[i] = key;
        this.valueTable[i] = value;
        this.keyList.add(key);
        if(++this.size >= this.threshold) this.resize(this.keyTable.length << 1);
        return null;
    }

    putMissing(key: K, value: V): V | null{
        let i = this.locateKey(key);
        if(i >= 0) return this.valueTable[i]; // 已有 key
        i = -(i + 1); // 找到空位
        this.keyTable[i] = key;
        this.valueTable[i] = value;
        this.keyList.add(key);
        if(++this.size >= this.threshold) this.resize(this.keyTable.length << 1);
        return null;
    }

    putAll(...values: unknown[]): void;
    putAll(map: OrderedMap<K, V>): void;
    putAll(...args: any[]): void{
        if(args.length === 1 && args[0] instanceof OrderedMap){
            const map = args[0] as OrderedMap<K, V>;
            this.ensureCapacity(map.size);
            const keys = map.keyList.items;
            for(let i = 0, n = map.keyList.size; i < n; i++){
                const key = keys[i];
                this.put(key, map.get(key) as V);
            }
            return;
        }
        (super.putAll as (...a: any[]) => void)(...args);
    }

    remove(key: K): V | null{
        this.keyList.remove(key, false);
        return super.remove(key);
    }

    removeIndex(index: number): V | null{
        return super.remove(this.keyList.remove(index));
    }

    /**
     * 将键 {@code before} 改为 {@code after}, 不改变其顺序位置或值. 若 {@code after} 已存在或 {@code before} 不存在返回 false.
     */
    alter(before: K, after: K): boolean{
        if(this.containsKey(after)) return false;
        const index = this.keyList.indexOf(before, false);
        if(index === -1) return false;
        super.put(after, super.remove(before) as V);
        this.keyList.set(index, after);
        return true;
    }

    /**
     * 将顺序中给定 {@code index} 处的键改为 {@code after}, 不改变其他条目顺序或任何值. 常量时间.
     */
    alterIndex(index: number, after: K): boolean{
        if(index < 0 || index >= this.size || this.containsKey(after)) return false;
        super.put(after, super.remove(this.keyList.get(index)) as V);
        this.keyList.set(index, after);
        return true;
    }

    clear(maximumCapacity: number): void;
    clear(): void;
    clear(maximumCapacity?: number): void{
        if(maximumCapacity !== undefined){
            this.keyList.clear();
            super.clear(maximumCapacity);
            return;
        }
        this.keyList.clear();
        super.clear();
    }

    orderedKeys(): Seq<K>{
        return this.keyList;
    }

    iterator(): Entries<K, V>{
        return this.entries();
    }

    /**
     * 返回 entries 迭代器. 支持 remove. 嵌套或多线程迭代请用 OrderedMapEntries 构造器.
     */
    entries(): Entries<K, V>{
        if(this.entries1 == null){
            this.entries1 = new OrderedMapEntries<K, V>(this);
            this.entries2 = new OrderedMapEntries<K, V>(this);
        }
        const entries1 = this.entries1!;
        const entries2 = this.entries2!;
        if(!entries1.valid){
            entries1.reset();
            entries1.valid = true;
            entries2.valid = false;
            return entries1;
        }
        entries2.reset();
        entries2.valid = true;
        entries1.valid = false;
        return entries2;
    }

    /**
     * 返回 values 迭代器. 支持 remove.
     */
    values(): Values<V>{
        if(this.values1 == null){
            this.values1 = new OrderedMapValues<V>(this);
            this.values2 = new OrderedMapValues<V>(this);
        }
        const values1 = this.values1!;
        const values2 = this.values2!;
        if(!values1.valid){
            values1.reset();
            values1.valid = true;
            values2.valid = false;
            return values1;
        }
        values2.reset();
        values2.valid = true;
        values1.valid = false;
        return values2;
    }

    /**
     * 返回 keys 迭代器. 支持 remove.
     */
    keys(): Keys<K>{
        if(this.keys1 == null){
            this.keys1 = new OrderedMapKeys<K>(this);
            this.keys2 = new OrderedMapKeys<K>(this);
        }
        const keys1 = this.keys1!;
        const keys2 = this.keys2!;
        if(!keys1.valid){
            keys1.reset();
            keys1.valid = true;
            keys2.valid = false;
            return keys1;
        }
        keys2.reset();
        keys2.valid = true;
        keys1.valid = false;
        return keys2;
    }

    toString(separator: string): string;
    toString(): string;
    toString(separator: string, braces: boolean): string;
    toString(separator?: string, braces?: boolean): string{
        if(separator === undefined) return this.toString(", ", true);
        if(braces === undefined) return this.toString(separator, false);
        if(this.size === 0) return braces ? "{}" : "";
        let buffer = braces ? "{" : "";
        const keys = this.keyList;
        for(let i = 0, n = keys.size; i < n; i++){
            const key = keys.get(i);
            if(i > 0) buffer += separator;
            buffer += String(key === (this as any) ? "(this)" : key);
            buffer += "=";
            const value = this.get(key);
            buffer += String(value === (this as any) ? "(this)" : value);
        }
        if(braces) buffer += "}";
        return buffer;
    }
}

export class OrderedMapEntries<K, V> extends Entries<K, V>{
    private readonly keys: Seq<K>;

    constructor(map: OrderedMap<K, V>){
        super(map);
        this.keys = map.keyList;
    }

    reset(): void{
        this.currentIndex = -1;
        this.nextIndex = 0;
        this.hasNextValue = this.map.size > 0;
    }

    next(): Entry<K, V>{
        if(!this.hasNextValue) throw new Error("NoSuchElementException");
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        this.currentIndex = this.nextIndex;
        this.entry.key = this.keys.get(this.nextIndex);
        this.entry.value = this.map.get(this.entry.key) as V;
        this.nextIndex++;
        this.hasNextValue = this.nextIndex < this.map.size;
        return this.entry;
    }

    remove(): void{
        if(this.currentIndex < 0) throw new Error("next must be called before remove.");
        this.map.remove(this.entry.key);
        this.nextIndex--;
        this.currentIndex = -1;
    }
}

export class OrderedMapKeys<K> extends Keys<K>{
    private readonly keys: Seq<K>;

    constructor(map: OrderedMap<K, unknown>){
        super(map as ObjectMap<K, unknown>);
        this.keys = map.keyList;
    }

    reset(): void{
        this.currentIndex = -1;
        this.nextIndex = 0;
        this.hasNextValue = this.map.size > 0;
    }

    next(): K{
        if(!this.hasNextValue) throw new Error("NoSuchElementException");
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        const key = this.keys.get(this.nextIndex);
        this.currentIndex = this.nextIndex;
        this.nextIndex++;
        this.hasNextValue = this.nextIndex < this.map.size;
        return key;
    }

    remove(): void{
        if(this.currentIndex < 0) throw new Error("next must be called before remove.");
        (this.map as unknown as OrderedMap<K, unknown>).removeIndex(this.currentIndex);
        this.nextIndex = this.currentIndex;
        this.currentIndex = -1;
    }

    toSeq(array: Seq<K>): Seq<K>;
    toSeq(): Seq<K>;
    toSeq(array?: Seq<K>): Seq<K>{
        if(array === undefined){
            array = new Seq<K>(true, this.keys.size - this.nextIndex);
        }
        array.addAll(this.keys, this.nextIndex, this.keys.size - this.nextIndex);
        this.nextIndex = this.keys.size;
        this.hasNextValue = false;
        return array;
    }
}

export class OrderedMapValues<V> extends Values<V>{
    private readonly keys: Seq<unknown>;

    constructor(map: OrderedMap<unknown, V>){
        super(map as ObjectMap<unknown, V>);
        this.keys = map.keyList;
    }

    reset(): void{
        this.currentIndex = -1;
        this.nextIndex = 0;
        this.hasNextValue = this.map.size > 0;
    }

    next(): V | null{
        if(!this.hasNextValue) throw new Error("NoSuchElementException");
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        const value = this.map.get(this.keys.get(this.nextIndex) as any);
        this.currentIndex = this.nextIndex;
        this.nextIndex++;
        this.hasNextValue = this.nextIndex < this.map.size;
        return value;
    }

    remove(): void{
        if(this.currentIndex < 0) throw new Error("next must be called before remove.");
        (this.map as unknown as OrderedMap<unknown, V>).removeIndex(this.currentIndex);
        this.nextIndex = this.currentIndex;
        this.currentIndex = -1;
    }

    toSeq(array: Seq<V>): Seq<V>;
    toSeq(): Seq<V>;
    toSeq(array?: Seq<V>): Seq<V>{
        if(array === undefined){
            array = new Seq<V>(true, this.keys.size - this.nextIndex);
        }
        const n = this.keys.size;
        array.ensureCapacity(n - this.nextIndex);
        const keys = this.keys.items;
        for(let i = this.nextIndex; i < n; i++)
            array.add(this.map.get(keys[i] as any) as V);
        this.currentIndex = n - 1;
        this.nextIndex = n;
        this.hasNextValue = false;
        return array;
    }
}
