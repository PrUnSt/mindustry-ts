// 源: arc-core/src/arc/struct/ObjectMap.java
// 迁移说明: 无序哈希表 (cuckoo hashing 3 哈希, 随机游走, 小 stash). Null key 不允许, null value 允许.
// 键的哈希/相等使用 Hash.ts 的 hashOf/equalsOf; place() 用 BigInt 精确模拟 Java 的 64 位斐波那契哈希.
import {tableSize} from './ObjectSet';
import {hashOf, equalsOf} from './Hash';
import {jsIterator} from './Iterators';
import {Cons2, Prov} from './Funcs';
import {Seq} from './Seq';

/**
 * 无序哈希表. 基于 3 哈希 cuckoo 哈希 + 随机游走 + 小 stash.
 * 查询/containsKey/remove 通常 O(1), 最坏 O(log(n)); put 可能稍慢.
 */
export class ObjectMap<K, V>{
    /** equals() 中用于区分 "值为 null" 与 "键不存在" 的哨兵对象. */
    static readonly dummy = new Object();

    size = 0;

    /** Java 中为包私有. */
    keyTable: (K | null)[];
    /** Java 中为包私有. */
    valueTable: (V | null)[];

    protected loadFactor: number;
    protected threshold: number;

    /** Java 中为 protected. */
    shift: number;
    /** Java 中为 protected. */
    mask: number;

    protected entries1: Entries<K, V> | null = null;
    protected entries2: Entries<K, V> | null = null;
    protected values1: Values<V> | null = null;
    protected values2: Values<V> | null = null;
    protected keys1: Keys<K> | null = null;
    protected keys2: Keys<K> | null = null;

    static of<K, V>(...values: unknown[]): ObjectMap<K, V>{
        const map = new ObjectMap<K, V>();
        for(let i = 0; i < values.length / 2; i++){
            map.put(values[i * 2] as K, values[i * 2 + 1] as V);
        }
        return map;
    }

    /** 创建初始容量 51、负载因子 0.8 的新 map. */
    constructor();
    constructor(initialCapacity: number);
    constructor(initialCapacity: number, loadFactor: number);
    constructor(initialCapacity: number = 51, loadFactor: number = 0.8){
        if(loadFactor <= 0 || loadFactor >= 1)
            throw new Error("loadFactor must be > 0 and < 1: " + loadFactor);
        this.loadFactor = loadFactor;

        const ts = tableSize(initialCapacity, loadFactor);
        this.threshold = Math.floor(ts * loadFactor);
        this.mask = ts - 1;
        this.shift = 32 + Math.clz32(this.mask);

        this.keyTable = new Array<K | null>(ts);
        this.valueTable = new Array<V | null>(ts);
    }

    /** 创建与指定 map 相同的新 map. */
    constructor(map: ObjectMap<K, V>);
    constructor(a?: any, b?: any){
        if(a instanceof ObjectMap){
            const map = a as ObjectMap<K, V>;
            this.loadFactor = map.loadFactor;
            const ts = Math.floor(map.keyTable.length * map.loadFactor);
            this.loadFactor = map.loadFactor;
            this.threshold = Math.floor(ts * map.loadFactor);
            this.mask = ts - 1;
            this.shift = 32 + Math.clz32(this.mask);
            this.keyTable = map.keyTable.slice();
            this.valueTable = map.valueTable.slice();
            this.size = map.size;
            return;
        }
        const initialCapacity = a === undefined ? 51 : (a as number);
        const loadFactor = b === undefined ? 0.8 : (b as number);
        if(loadFactor <= 0 || loadFactor >= 1)
            throw new Error("loadFactor must be > 0 and < 1: " + loadFactor);
        this.loadFactor = loadFactor;
        const ts = tableSize(initialCapacity, loadFactor);
        this.threshold = Math.floor(ts * loadFactor);
        this.mask = ts - 1;
        this.shift = 32 + Math.clz32(this.mask);
        this.keyTable = new Array<K | null>(ts);
        this.valueTable = new Array<V | null>(ts);
    }

    /**
     * 返回指定 item 在 [0, mask] 内的索引. 默认实现使用斐波那契哈希.
     */
    /** Java 中为 protected. */
    place(item: K): number{
        const h = BigInt.asIntN(64, BigInt(hashOf(item) | 0));
        const prod = h * 0x9e3779b97f4a7c15n;
        const shifted = BigInt.asUintN(64, prod) >> BigInt(this.shift & 63);
        return Number(shifted & 0xffffffffn) | 0;
    }

    /**
     * 若 key 已存在返回其索引, 否则返回下一个空索引的 -(index + 1).
     */
    /** Java 中为包私有. */
    locateKey(key: K): number{
        if(key === null || key === undefined) throw new Error("key cannot be null.");
        const keyTable = this.keyTable;
        for(let i = this.place(key); ; i = i + 1 & this.mask){
            const other = keyTable[i];
            if(other === null) return -(i + 1); // 有空位
            if(equalsOf(other, key)) return i; // 找到相同 key
        }
    }

    /** @return 与指定 key 关联的旧值, 或 null. */
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
        if(++this.size >= this.threshold) this.resize(this.keyTable.length << 1);
        return null;
    }

    putMissing(key: K, value: V): V | null{
        let i = this.locateKey(key);
        if(i >= 0) return this.valueTable[i]; // 已有 key
        i = -(i + 1); // 找到空位
        this.keyTable[i] = key;
        this.valueTable[i] = value;
        if(++this.size >= this.threshold) this.resize(this.keyTable.length << 1);
        return null;
    }

    putAll(...values: unknown[]): void;
    putAll(map: ObjectMap<K, V>): void;
    putAll(...args: any[]): void{
        if(args.length === 1 && args[0] instanceof ObjectMap){
            const map = args[0] as ObjectMap<K, V>;
            this.ensureCapacity(map.size);
            const keyTable = map.keyTable;
            const valueTable = map.valueTable;
            for(let i = 0, n = keyTable.length; i < n; i++){
                const key = keyTable[i];
                if(key !== null) this.put(key, valueTable[i] as V);
            }
            return;
        }
        for(let i = 0; i < args.length / 2; i++){
            this.put(args[i * 2] as K, args[i * 2 + 1] as V);
        }
    }

    /** 将另一 map 的所有键放入此 map, 并返回此 map 以便链式调用. */
    merge(map: ObjectMap<K, V>): ObjectMap<K, V>{
        this.putAll(map);
        return this;
    }

    /** 遍历键值对. */
    each(cons: Cons2<K, V>): void{
        const it = this.entries();
        while(it.hasNext()){
            const entry = it.next();
            cons(entry.key, entry.value);
        }
    }

    copy(): ObjectMap<K, V>{
        return new ObjectMap<K, V>(this);
    }

    set(value: ObjectMap<K, V>): void{
        this.clear();
        this.putAll(value);
    }

    /** 跳过已有 key 检查, 不递增 size. */
    private putResize(key: K, value: V): void{
        const keyTable = this.keyTable;
        for(let i = this.place(key); ; i = (i + 1) & this.mask){
            if(keyTable[i] === null){
                keyTable[i] = key;
                this.valueTable[i] = value;
                return;
            }
        }
    }

    getThrow(key: K, error: () => Error): V{
        if(!this.containsKey(key)){
            throw error();
        }
        return this.get(key) as V;
    }

    /** 尝试获取值; 若不存在, 用 supplier 创建新实例放入并返回. */
    get(key: K, supplier: Prov<V>): V;
    /** @return 与指定 key 关联的值, 或 null. */
    get(key: K): V | null;
    /** @return 与指定 key 关联的值, 或默认值. */
    get(key: K, defaultValue: V): V;
    get(key: K, defaultValueOrSupplier?: any): any{
        if(arguments.length >= 2 && typeof defaultValueOrSupplier === 'function'){
            // get(key, Prov)
            let val = this.get(key);
            if(val === null || val === undefined){
                val = defaultValueOrSupplier();
                this.put(key, val);
            }
            return val;
        }
        if(arguments.length >= 2){
            // get(key, defaultValue)
            if(key === null || key === undefined) return defaultValueOrSupplier;
            const i = this.locateKey(key);
            return i < 0 ? defaultValueOrSupplier : (this.valueTable[i] as V);
        }
        const i = this.locateKey(key);
        return i < 0 ? null : this.valueTable[i];
    }

    /** @return 被移除 key 的值, 或 null. */
    remove(key: K): V | null{
        let i = this.locateKey(key);
        if(i < 0) return null;
        const keyTable = this.keyTable;
        const valueTable = this.valueTable;
        const oldValue = valueTable[i];
        const mask = this.mask;
        let next = i + 1 & mask;
        let k: K | null;
        while((k = keyTable[next]) !== null){
            const placement = this.place(k);
            if((next - placement & mask) > (i - placement & mask)){
                keyTable[i] = k;
                valueTable[i] = valueTable[next];
                i = next;
            }
            next = next + 1 & mask;
        }
        keyTable[i] = null;
        valueTable[i] = null;
        this.size--;
        return oldValue;
    }

    /** @return map 是否有一个或多个元素. */
    notEmpty(): boolean{
        return this.size > 0;
    }

    /** @return map 是否为空. */
    isEmpty(): boolean{
        return this.size === 0;
    }

    /**
     * 将备份数组缩减为指定容量 / loadFactor, 或更小. 若容量已更小则不处理.
     */
    shrink(maximumCapacity: number): void{
        if(maximumCapacity < 0) throw new Error("maximumCapacity must be >= 0: " + maximumCapacity);
        if(this.size > maximumCapacity) maximumCapacity = this.size;
        const ts = tableSize(maximumCapacity, this.loadFactor);
        if(this.keyTable.length > ts) this.resize(ts);
    }

    /** 清空 map 并将备份数组缩减为指定容量 / loadFactor, 若更大. */
    clear(maximumCapacity: number): void;
    clear(): void;
    clear(maximumCapacity?: number): void{
        if(maximumCapacity === undefined){
            if(this.size === 0) return;
            this.size = 0;
            for(let i = 0; i < this.keyTable.length; i++){ this.keyTable[i] = null; this.valueTable[i] = null; }
            return;
        }
        const ts = tableSize(maximumCapacity, this.loadFactor);
        if(this.keyTable.length <= ts){
            this.clear();
            return;
        }
        this.size = 0;
        this.resize(ts);
    }

    /**
     * @return 指定值是否在 map 中. 遍历整个 map 比较每个值.
     * @param identity true 时用 === 比较, false 时用 equals.
     */
    containsValue(value: unknown, identity: boolean): boolean{
        const valueTable = this.valueTable;
        if(value === null || value === undefined){
            const keyTable = this.keyTable;
            for(let i = valueTable.length - 1; i >= 0; i--)
                if(keyTable[i] !== null && valueTable[i] === null) return true;
        }else if(identity){
            for(let i = valueTable.length - 1; i >= 0; i--)
                if(valueTable[i] === value) return true;
        }else{
            for(let i = valueTable.length - 1; i >= 0; i--)
                if(equalsOf(value, valueTable[i])) return true;
        }
        return false;
    }

    containsKey(key: K): boolean{
        return this.locateKey(key) >= 0;
    }

    /**
     * @return 指定值对应的 key, 或 null.
     */
    findKey(value: unknown, identity: boolean): K | null{
        const valueTable = this.valueTable;
        if(value === null || value === undefined){
            const keyTable = this.keyTable;
            for(let i = valueTable.length - 1; i >= 0; i--)
                if(keyTable[i] !== null && valueTable[i] === null) return keyTable[i];
        }else if(identity){
            for(let i = valueTable.length - 1; i >= 0; i--)
                if(valueTable[i] === value) return this.keyTable[i];
        }else{
            for(let i = valueTable.length - 1; i >= 0; i--)
                if(equalsOf(value, valueTable[i])) return this.keyTable[i];
        }
        return null;
    }

    /**
     * 扩大备份数组以容纳指定数量的额外元素 / loadFactor.
     */
    ensureCapacity(additionalCapacity: number): void{
        const ts = tableSize(this.size + additionalCapacity, this.loadFactor);
        if(this.keyTable.length < ts) this.resize(ts);
    }

    protected resize(newSize: number): void{
        const oldCapacity = this.keyTable.length;
        this.threshold = Math.floor(newSize * this.loadFactor);
        this.mask = newSize - 1;
        this.shift = 32 + Math.clz32(this.mask);

        const oldKeyTable = this.keyTable;
        const oldValueTable = this.valueTable;

        this.keyTable = new Array<K | null>(newSize);
        this.valueTable = new Array<V | null>(newSize);

        if(this.size > 0){
            for(let i = 0; i < oldCapacity; i++){
                const key = oldKeyTable[i];
                if(key !== null) this.putResize(key, oldValueTable[i] as V);
            }
        }
    }

    hashCode(): number{
        let h = this.size;
        const keyTable = this.keyTable;
        const valueTable = this.valueTable;
        for(let i = 0, n = keyTable.length; i < n; i++){
            const key = keyTable[i];
            if(key !== null){
                h = (h + hashOf(key)) | 0;
                const value = valueTable[i];
                if(value !== null && value !== undefined) h = (h + hashOf(value)) | 0;
            }
        }
        return h;
    }

    equals(obj: unknown): boolean{
        if(obj === this) return true;
        if(!(obj instanceof ObjectMap)) return false;
        const other = obj as ObjectMap<unknown, unknown>;
        if(other.size !== this.size) return false;
        const keyTable = this.keyTable;
        const valueTable = this.valueTable;
        for(let i = 0, n = keyTable.length; i < n; i++){
            const key = keyTable[i];
            if(key !== null){
                const value = valueTable[i];
                if(value === null || value === undefined){
                    if(other.get(key as any, ObjectMap.dummy as any) != null) return false;
                }else{
                    if(!equalsOf(value, other.get(key as any))) return false;
                }
            }
        }
        return true;
    }

    toString(separator: string): string;
    toString(): string;
    toString(separator: string, braces: boolean): string;
    toString(separator?: string, braces?: boolean): string{
        if(separator === undefined) return this.toString(", ", true);
        if(braces === undefined) return this.toString(separator, false);
        if(this.size === 0) return braces ? "{}" : "";
        let buffer = braces ? "{" : "";
        const keyTable = this.keyTable;
        const valueTable = this.valueTable;
        let i = keyTable.length;
        while(i-- > 0){
            const key = keyTable[i];
            if(key === null) continue;
            buffer += String(key === this ? "(this)" : key);
            buffer += "=";
            const value = valueTable[i];
            buffer += String(value === this ? "(this)" : value);
            break;
        }
        while(i-- > 0){
            const key = keyTable[i];
            if(key === null) continue;
            buffer += separator;
            buffer += String(key === this ? "(this)" : key);
            buffer += "=";
            const value = valueTable[i];
            buffer += String(value === this ? "(this)" : value);
        }
        if(braces) buffer += "}";
        return buffer;
    }

    iterator(): Entries<K, V>{
        return this.entries();
    }

    /**
     * 返回 entries 迭代器. 支持 remove. 嵌套或多线程迭代请用 Entries 构造器.
     */
    entries(): Entries<K, V>{
        let e1 = this.entries1;
        if(e1 == null){
            e1 = new Entries<K, V>(this);
            this.entries1 = e1;
            this.entries2 = new Entries<K, V>(this);
        }
        if(!e1.valid){
            e1.reset();
            e1.valid = true;
            (this.entries2 as Entries<K, V>).valid = false;
            return e1;
        }
        const e2 = this.entries2 as Entries<K, V>;
        e2.reset();
        e2.valid = true;
        e1.valid = false;
        return e2;
    }

    /**
     * 返回 values 迭代器. 支持 remove.
     */
    values(): Values<V>{
        let v1 = this.values1;
        if(v1 == null){
            v1 = new Values<V>(this);
            this.values1 = v1;
            this.values2 = new Values<V>(this);
        }
        if(!v1.valid){
            v1.reset();
            v1.valid = true;
            (this.values2 as Values<V>).valid = false;
            return v1;
        }
        const v2 = this.values2 as Values<V>;
        v2.reset();
        v2.valid = true;
        v1.valid = false;
        return v2;
    }

    /**
     * 返回 keys 迭代器. 支持 remove.
     */
    keys(): Keys<K>{
        let k1 = this.keys1;
        if(k1 == null){
            k1 = new Keys<K>(this);
            this.keys1 = k1;
            this.keys2 = new Keys<K>(this);
        }
        if(!k1.valid){
            k1.reset();
            k1.valid = true;
            (this.keys2 as Keys<K>).valid = false;
            return k1;
        }
        const k2 = this.keys2 as Keys<K>;
        k2.reset();
        k2.valid = true;
        k1.valid = false;
        return k2;
    }

    /** JS for..of 支持 (迭代 entries). */
    [Symbol.iterator](){
        return jsIterator(this.entries());
    }
}

export class Entry<K, V>{
    key!: K;
    value!: V;

    toString(): string{
        return String(this.key) + "=" + String(this.value);
    }
}

export class MapIterator<K, V>{
    protected hasNextValue = false;

    readonly map: ObjectMap<K, V>;
    nextIndex = 0;
    currentIndex = 0;
    valid = true;

    constructor(map: ObjectMap<K, V>){
        this.map = map;
        this.reset();
    }

    reset(): void{
        this.currentIndex = -1;
        this.nextIndex = -1;
        this.findNextIndex();
    }

    protected findNextIndex(): void{
        const keyTable = this.map.keyTable;
        for(let n = keyTable.length; ++this.nextIndex < n; ){
            if(keyTable[this.nextIndex] !== null){
                this.hasNextValue = true;
                return;
            }
        }
        this.hasNextValue = false;
    }

    hasNext(): boolean{
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        return this.hasNextValue;
    }

    remove(): void{
        let i = this.currentIndex;
        if(i < 0) throw new Error("next must be called before remove.");
        const keyTable = this.map.keyTable;
        const valueTable = this.map.valueTable;
        const mask = this.map.mask;
        let next = i + 1 & mask;
        let key: K | null;
        while((key = keyTable[next]) !== null){
            const placement = this.map.place(key);
            if((next - placement & mask) > (i - placement & mask)){
                keyTable[i] = key;
                valueTable[i] = valueTable[next];
                i = next;
            }
            next = next + 1 & mask;
        }
        keyTable[i] = null;
        valueTable[i] = null;
        this.map.size--;
        if(i !== this.currentIndex) --this.nextIndex;
        this.currentIndex = -1;
    }
}

export class Entries<K, V> extends MapIterator<K, V>{
    entry = new Entry<K, V>();

    constructor(map: ObjectMap<K, V>){
        super(map);
    }

    /** 注意: 每次调用此方法都返回同一个 entry 实例. */
    next(): Entry<K, V>{
        if(!this.hasNextValue) throw new Error("NoSuchElementException");
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        const keyTable = this.map.keyTable;
        this.entry.key = keyTable[this.nextIndex] as K;
        this.entry.value = this.map.valueTable[this.nextIndex] as V;
        this.currentIndex = this.nextIndex;
        this.findNextIndex();
        return this.entry;
    }

    iterator(): this{
        return this;
    }
}

export class Values<V> extends MapIterator<unknown, V>{
    constructor(map: ObjectMap<unknown, V>){
        super(map);
    }

    next(): V | null{
        if(!this.hasNextValue) throw new Error("NoSuchElementException");
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        const value = this.map.valueTable[this.nextIndex];
        this.currentIndex = this.nextIndex;
        this.findNextIndex();
        return value;
    }

    iterator(): this{
        return this;
    }

    /** @return 包含剩余值的新数组. */
    toSeq(): Seq<V>{
        return this.toSeq(new Seq<V>(true, this.map.size));
    }

    /** 将剩余值添加到指定数组. */
    toSeq(array: Seq<V>): Seq<V>{
        while(this.hasNextValue)
            array.add(this.next() as V);
        return array;
    }
}

export class Keys<K> extends MapIterator<K, unknown>{
    constructor(map: ObjectMap<K, unknown>){
        super(map);
    }

    next(): K{
        if(!this.hasNextValue) throw new Error("NoSuchElementException");
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        const key = this.map.keyTable[this.nextIndex] as K;
        this.currentIndex = this.nextIndex;
        this.findNextIndex();
        return key;
    }

    iterator(): this{
        return this;
    }

    /** @return 包含剩余 key 的新数组. */
    toSeq(): Seq<K>{
        return this.toSeq(new Seq<K>(true, this.map.size));
    }

    /** 将剩余 key 添加到数组. */
    toSeq(array: Seq<K>): Seq<K>{
        while(this.hasNextValue)
            array.add(this.next());
        return array;
    }
}
