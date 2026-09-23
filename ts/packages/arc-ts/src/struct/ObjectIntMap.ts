// 源: arc-core/src/arc/struct/ObjectIntMap.java
// 迁移说明: 值为 int 的无序哈希表. Null key 不允许. valueTable 用 number[].
import {tableSize} from './ObjectSet';
import {hashOf, equalsOf} from './Hash';
import {jsIterator} from './Iterators';
import {Seq} from './Seq';
import {IntSeq} from './IntSeq';

/**
 * 值为 int 的无序哈希表. Null key 不允许. 除扩容外无分配.
 */
export class ObjectIntMap<K>{
    size = 0;

    keyTable: (K | null)[];
    valueTable: number[];

    loadFactor: number;
    threshold: number;

    protected shift: number;
    mask: number;

    private entries1: Entries<K> | null = null;
    private entries2: Entries<K> | null = null;
    private values1: Values | null = null;
    private values2: Values | null = null;
    private keys1: Keys<K> | null = null;
    private keys2: Keys<K> | null = null;

    /** 创建初始容量 51、负载因子 0.8 的新 map. */
    constructor();
    constructor(initialCapacity: number);
    constructor(initialCapacity: number, loadFactor: number);
    /** 创建与指定 map 相同的新 map. */
    constructor(map: ObjectIntMap<K>);
    constructor(a?: any, b?: any){
        if(a instanceof ObjectIntMap){
            const map = a as ObjectIntMap<K>;
            this.loadFactor = map.loadFactor;
            this.keyTable = map.keyTable.slice();
            this.valueTable = map.valueTable.slice();
            this.size = map.size;
            const ts = this.keyTable.length;
            this.threshold = Math.floor(ts * map.loadFactor);
            this.mask = ts - 1;
            this.shift = 32 + Math.clz32(this.mask);
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
        this.keyTable = new Array<K | null>(ts).fill(null);
        this.valueTable = new Array<number>(ts).fill(0);
    }

    /**
     * 返回指定 item 在 [0, mask] 内的索引. 默认实现使用斐波那契哈希.
     */
    place(item: K): number{
        const h = BigInt.asIntN(64, BigInt(hashOf(item) | 0));
        const prod = h * 0x9e3779b97f4a7c15n;
        const shifted = BigInt.asUintN(64, prod) >> BigInt(this.shift & 63);
        return (Number(shifted & 0xffffffffn) | 0) & this.mask;
    }

    /** 若 key 已存在返回其索引, 否则返回下一个空索引的 -(index + 1). */
    protected locateKey(key: K): number{
        if(key === null || key === undefined) throw new Error("key cannot be null.");
        const keyTable = this.keyTable;
        for(let i = this.place(key); ; i = (i + 1) & this.mask){
            const other = keyTable[i];
            if(other === null) return -(i + 1); // 有空位
            if(equalsOf(other, key)) return i; // 找到相同 key
        }
    }

    put(key: K, value: number): void;
    put(key: K, value: number, defaultValue: number): number;
    put(key: K, value: number, defaultValue?: number): any{
        let i = this.locateKey(key);
        if(i >= 0){ // 已有 key
            const oldValue = this.valueTable[i];
            this.valueTable[i] = value;
            return defaultValue === undefined ? undefined : oldValue;
        }
        i = -(i + 1); // 找到空位
        this.keyTable[i] = key;
        this.valueTable[i] = value;
        if(++this.size >= this.threshold) this.resize(this.keyTable.length << 1);
        return defaultValue;
    }

    putMissing(key: K, value: number): void;
    putMissing(key: K, value: number, defaultValue: number): number;
    putMissing(key: K, value: number, defaultValue?: number): any{
        let i = this.locateKey(key);
        if(i >= 0) return defaultValue === undefined ? undefined : this.valueTable[i]; // 已有 key
        i = -(i + 1); // 找到空位
        this.keyTable[i] = key;
        this.valueTable[i] = value;
        if(++this.size >= this.threshold) this.resize(this.keyTable.length << 1);
        return defaultValue;
    }

    putAll(map: ObjectIntMap<K>): void;
    putAll(...values: unknown[]): void;
    putAll(...args: any[]): void{
        if(args.length === 1 && args[0] instanceof ObjectIntMap){
            const map = args[0] as ObjectIntMap<K>;
            this.ensureCapacity(map.size);
            const keyTable = map.keyTable;
            const valueTable = map.valueTable;
            for(let i = 0, n = keyTable.length; i < n; i++){
                const key = keyTable[i];
                if(key !== null) this.put(key, valueTable[i]);
            }
            return;
        }
        for(let i = 0; i < args.length / 2; i++){
            this.put(args[i * 2] as K, args[i * 2 + 1] as number);
        }
    }

    copy(): ObjectIntMap<K>{
        return new ObjectIntMap<K>(this);
    }

    set(value: ObjectIntMap<K>): void{
        this.clear();
        this.putAll(value);
    }

    /** 跳过已有 key 检查, 不递增 size. */
    private putResize(key: K, value: number): void{
        const keyTable = this.keyTable;
        for(let i = this.place(key); ; i = (i + 1) & this.mask){
            if(keyTable[i] === null){
                keyTable[i] = key;
                this.valueTable[i] = value;
                return;
            }
        }
    }

    get(key: K): number;
    get(key: K, defaultValue: number): number;
    get(key: K, defaultValue: number = 0): number{
        if(key === null || key === undefined) return defaultValue;
        const i = this.locateKey(key);
        return i < 0 ? defaultValue : this.valueTable[i];
    }

    increment(key: K): number;
    increment(key: K, increment: number): number;
    increment(key: K, defaultValue: number, increment: number): number;
    increment(key: K, defaultValue?: number, increment?: number): number{
        let def = 0;
        let inc = 1;
        if(arguments.length === 2){
            inc = arguments[1] as number;
        }else if(arguments.length === 3){
            def = defaultValue!;
            inc = increment!;
        }
        let i = this.locateKey(key);
        if(i >= 0){ // 已有 key
            const oldValue = this.valueTable[i];
            this.valueTable[i] += inc;
            return oldValue;
        }
        i = -(i + 1); // 找到空位
        this.keyTable[i] = key;
        this.valueTable[i] = def + inc;
        if(++this.size >= this.threshold) this.resize(this.keyTable.length << 1);
        return def;
    }

    remove(key: K): number;
    remove(key: K, defaultValue: number): number;
    remove(key: K, defaultValue: number = 0): number{
        let i = this.locateKey(key);
        if(i < 0) return defaultValue;
        const keyTable = this.keyTable;
        const valueTable = this.valueTable;
        const oldValue = valueTable[i];
        const mask = this.mask;
        let next = (i + 1) & mask;
        let k: K | null;
        while((k = keyTable[next]) !== null){
            const placement = this.place(k);
            if((next - placement & mask) > (i - placement & mask)){
                keyTable[i] = k;
                valueTable[i] = valueTable[next];
                i = next;
            }
            next = (next + 1) & mask;
        }
        keyTable[i] = null;
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
     * 将备份数组缩减为指定容量 / loadFactor, 或更小.
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
        if(maximumCapacity !== undefined){
            const ts = tableSize(maximumCapacity, this.loadFactor);
            if(this.keyTable.length <= ts){
                this.clear();
                return;
            }
            this.size = 0;
            this.resize(ts);
            return;
        }
        if(this.size === 0) return;
        this.size = 0;
        for(let i = 0; i < this.keyTable.length; i++) this.keyTable[i] = null;
    }
    /** @return 指定值是否在 map 中. */
    containsValue(value: number): boolean{
        const keyTable = this.keyTable;
        const valueTable = this.valueTable;
        for(let i = valueTable.length - 1; i >= 0; i--)
            if(keyTable[i] !== null && valueTable[i] === value) return true;
        return false;
    }

    containsKey(key: K): boolean{
        return this.locateKey(key) >= 0;
    }

    /** @return 指定值对应的 key, 或 null. */
    findKey(value: number): K | null{
        const keyTable = this.keyTable;
        const valueTable = this.valueTable;
        for(let i = valueTable.length - 1; i >= 0; i--){
            const key = keyTable[i];
            if(key !== null && valueTable[i] === value) return key;
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

        this.keyTable = new Array<K | null>(newSize).fill(null);
        this.valueTable = new Array<number>(newSize).fill(0);

        if(this.size > 0){
            for(let i = 0; i < oldCapacity; i++){
                const key = oldKeyTable[i];
                if(key !== null) this.putResize(key, oldValueTable[i]);
            }
        }
    }

    hashCode(): number{
        let h = this.size;
        const keyTable = this.keyTable;
        const valueTable = this.valueTable;
        for(let i = 0, n = keyTable.length; i < n; i++){
            const key = keyTable[i];
            if(key !== null) h = (h + hashOf(key) + valueTable[i]) | 0;
        }
        return h;
    }

    equals(obj: unknown): boolean{
        if(obj === this) return true;
        if(!(obj instanceof ObjectIntMap)) return false;
        const other = obj as ObjectIntMap<unknown>;
        if(other.size !== this.size) return false;
        const keyTable = this.keyTable;
        const valueTable = this.valueTable;
        for(let i = 0, n = keyTable.length; i < n; i++){
            const key = keyTable[i];
            if(key !== null){
                const otherValue = other.get(key as any, 0);
                if(otherValue === 0 && !other.containsKey(key as any)) return false;
                if(otherValue !== valueTable[i]) return false;
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
            buffer += String(key);
            buffer += "=";
            buffer += String(valueTable[i]);
            break;
        }
        while(i-- > 0){
            const key = keyTable[i];
            if(key === null) continue;
            buffer += separator;
            buffer += String(key);
            buffer += "=";
            buffer += String(valueTable[i]);
        }
        if(braces) buffer += "}";
        return buffer;
    }

    iterator(): Entries<K>{
        return this.entries();
    }

    /**
     * 返回 entries 迭代器. 支持 remove.
     */
    entries(): Entries<K>{
        if(this.entries1 == null){
            this.entries1 = new Entries<K>(this);
            this.entries2 = new Entries<K>(this);
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
    values(): Values{
        if(this.values1 == null){
            this.values1 = new Values(this);
            this.values2 = new Values(this);
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
            this.keys1 = new Keys<K>(this);
            this.keys2 = new Keys<K>(this);
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

    /** JS for..of 支持 (迭代 entries). */
    [Symbol.iterator](){
        return jsIterator(this.entries());
    }
}
export class Entry<K>{
    key!: K;
    value = 0;

    toString(): string{
        return String(this.key) + "=" + String(this.value);
    }
}

export class MapIterator<K>{
    protected hasNextValue = false;

    readonly map: ObjectIntMap<K>;
    nextIndex = 0;
    currentIndex = 0;
    valid = true;

    constructor(map: ObjectIntMap<K>){
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
        let next = (i + 1) & mask;
        let key: K | null;
        while((key = keyTable[next]) !== null){
            const placement = this.map.place(key);
            if((next - placement & mask) > (i - placement & mask)){
                keyTable[i] = key;
                valueTable[i] = valueTable[next];
                i = next;
            }
            next = (next + 1) & mask;
        }
        keyTable[i] = null;
        this.map.size--;
        if(i !== this.currentIndex) --this.nextIndex;
        this.currentIndex = -1;
    }
}

export class Entries<K> extends MapIterator<K>{
    entry = new Entry<K>();

    constructor(map: ObjectIntMap<K>){
        super(map);
    }

    /** 注意: 每次调用此方法都返回同一个 entry 实例. */
    next(): Entry<K>{
        if(!this.hasNextValue) throw new Error("NoSuchElementException");
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        const keyTable = this.map.keyTable;
        this.entry.key = keyTable[this.nextIndex] as K;
        this.entry.value = this.map.valueTable[this.nextIndex];
        this.currentIndex = this.nextIndex;
        this.findNextIndex();
        return this.entry;
    }

    iterator(): this{
        return this;
    }

    toArray(): Seq<Entry<K>>{
        const out = new Seq<Entry<K>>(this.map.size);
        while(this.hasNext()){
            const entry = this.next();
            const e = new Entry<K>();
            e.key = entry.key;
            e.value = entry.value;
            out.add(e);
        }
        return out;
    }
}

export class Values extends MapIterator<unknown>{
    constructor(map: ObjectIntMap<unknown>){
        super(map);
    }

    next(): number{
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
    toSeq(): IntSeq;
    toSeq(array: IntSeq): IntSeq;
    toSeq(array?: IntSeq): IntSeq{
        if(array === undefined){
            array = new IntSeq(true, this.map.size);
        }
        while(this.hasNextValue)
            array.add(this.next());
        return array;
    }
}

export class Keys<K> extends MapIterator<K>{
    constructor(map: ObjectIntMap<K>){
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
    toSeq(): Seq<K>;
    toSeq(array: Seq<K>): Seq<K>;
    toSeq(array?: Seq<K>): Seq<K>{
        if(array === undefined){
            array = new Seq<K>(true, this.map.size);
        }
        while(this.hasNextValue)
            array.add(this.next());
        return array;
    }
}
