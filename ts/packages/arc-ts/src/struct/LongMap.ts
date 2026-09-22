// 源: arc-core/src/arc/struct/LongMap.java
// 迁移说明: long 键的无序哈希表. Java long 在 TS 中用 number (float64) 表示; 哈希计算用 BigInt 精确模拟 64 位运算.
// keyTable 用 number[] (0 表示空槽), 键 0 单独用 hasZeroValue/zeroValue 存放.
import {tableSize} from './ObjectSet';
import {hashOf, equalsOf} from './Hash';
import {jsIterator} from './Iterators';
import {Cons} from './Funcs';
import {Seq} from './Seq';
import {LongSeq} from './LongSeq';
import {ObjectMap} from './ObjectMap';

/**
 * 使用 long 键的无序哈希表. 允许 null 值. 除扩容外无分配.
 */
export class LongMap<V>{
    size = 0;

    keyTable: number[];
    valueTable: (V | null)[];

    zeroValue: V | null = null;
    hasZeroValue = false;

    private readonly loadFactor: number;
    private threshold: number;

    protected shift: number;
    protected mask: number;

    private entries1: Entries<V> | null = null;
    private entries2: Entries<V> | null = null;
    private values1: Values<V> | null = null;
    private values2: Values<V> | null = null;
    private keys1: Keys | null = null;
    private keys2: Keys | null = null;

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

        this.keyTable = new Array<number>(ts).fill(0);
        this.valueTable = new Array<V | null>(ts);
    }

    /** 创建与指定 map 相同的新 map. */
    constructor(map: LongMap<V>);
    constructor(a?: any, b?: any){
        if(a instanceof LongMap){
            const map = a as LongMap<V>;
            this.loadFactor = map.loadFactor;
            this.keyTable = map.keyTable.slice();
            this.valueTable = map.valueTable.slice();
            this.size = map.size;
            this.zeroValue = map.zeroValue;
            this.hasZeroValue = map.hasZeroValue;
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
        this.keyTable = new Array<number>(ts).fill(0);
        this.valueTable = new Array<V | null>(ts);
    }

    /**
     * 返回指定 item 在 [0, mask] 内的索引. 默认实现使用斐波那契哈希.
     */
    protected place(item: number): number{
        const l = BigInt.asUintN(64, BigInt(item));
        const mixed = BigInt.asIntN(64, BigInt(item)) ^ (l >> 32n);
        const prod = mixed * 0x9e3779b97f4a7c15n;
        const shifted = BigInt.asUintN(64, prod) >> BigInt(this.shift & 63);
        return Number(shifted & 0xffffffffn) | 0;
    }

    /** 若 key 已存在返回其索引, 否则返回下一个空索引的 -(index + 1). */
    private locateKey(key: number): number{
        const keyTable = this.keyTable;
        for(let i = this.place(key); ; i = i + 1 & this.mask){
            const other = keyTable[i];
            if(other === 0) return -(i + 1); // 有空位
            if(other === key) return i; // 找到相同 key
        }
    }

    put(key: number, value: V): V | null{
        if(key === 0){
            const oldValue = this.zeroValue;
            this.zeroValue = value;
            if(!this.hasZeroValue){
                this.hasZeroValue = true;
                this.size++;
            }
            return oldValue;
        }
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

    putMissing(key: number, value: V): V | null{
        if(key === 0){
            const oldValue = this.zeroValue;
            if(!this.hasZeroValue){
                this.zeroValue = value;
                this.hasZeroValue = true;
                this.size++;
            }
            return oldValue;
        }
        let i = this.locateKey(key);
        if(i >= 0) return this.valueTable[i]; // 已有 key
        i = -(i + 1); // 找到空位
        this.keyTable[i] = key;
        this.valueTable[i] = value;
        if(++this.size >= this.threshold) this.resize(this.keyTable.length << 1);
        return null;
    }

    putAll(map: LongMap<V>): void{
        this.ensureCapacity(map.size);
        if(map.hasZeroValue) this.put(0, map.zeroValue as V);
        const keyTable = map.keyTable;
        const valueTable = map.valueTable;
        for(let i = 0, n = keyTable.length; i < n; i++){
            const key = keyTable[i];
            if(key !== 0) this.put(key, valueTable[i] as V);
        }
    }

    /** 跳过已有 key 检查, 不递增 size, 无需处理 key 0. */
    private putResize(key: number, value: V): void{
        const keyTable = this.keyTable;
        for(let i = this.place(key); ; i = (i + 1) & this.mask){
            if(keyTable[i] === 0){
                keyTable[i] = key;
                this.valueTable[i] = value;
                return;
            }
        }
    }

    get(key: number): V | null{
        if(key === 0) return this.hasZeroValue ? this.zeroValue : null;
        const i = this.locateKey(key);
        return i >= 0 ? this.valueTable[i] : null;
    }

    get(key: number, defaultValue: V): V{
        if(key === 0) return this.hasZeroValue ? (this.zeroValue as V) : defaultValue;
        const i = this.locateKey(key);
        return i >= 0 ? (this.valueTable[i] as V) : defaultValue;
    }

    /** @return 被移除 key 的值, 或 null. */
    remove(key: number): V | null{
        if(key === 0){
            if(!this.hasZeroValue) return null;
            this.hasZeroValue = false;
            const oldValue = this.zeroValue;
            this.zeroValue = null;
            this.size--;
            return oldValue;
        }

        let i = this.locateKey(key);
        if(i < 0) return null;
        const keyTable = this.keyTable;
        const valueTable = this.valueTable;
        const oldValue = valueTable[i];
        const mask = this.mask;
        let next = i + 1 & mask;
        let k: number;
        while((k = keyTable[next]) !== 0){
            const placement = this.place(k);
            if((next - placement & mask) > (i - placement & mask)){
                keyTable[i] = k;
                valueTable[i] = valueTable[next];
                i = next;
            }
            next = next + 1 & mask;
        }
        keyTable[i] = 0;
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
     * 将备份数组缩减为指定容量 / loadFactor, 或更小.
     */
    shrink(maximumCapacity: number): void{
        if(maximumCapacity < 0) throw new Error("maximumCapacity must be >= 0: " + maximumCapacity);
        if(this.size > maximumCapacity) maximumCapacity = this.size;
        const ts = tableSize(maximumCapacity, this.loadFactor);
        if(this.keyTable.length > ts) this.resize(ts);
    }

    /** 清空 map 并将备份数组缩减为指定容量 / loadFactor, 若更大. */
    clear(maximumCapacity: number): void{
        const ts = tableSize(maximumCapacity, this.loadFactor);
        if(this.keyTable.length <= ts){
            this.clear();
            return;
        }
        this.size = 0;
        this.hasZeroValue = false;
        this.zeroValue = null;
        this.resize(ts);
    }

    clear(): void{
        if(this.size === 0) return;
        this.size = 0;
        for(let i = 0; i < this.keyTable.length; i++){ this.keyTable[i] = 0; this.valueTable[i] = null; }
        this.zeroValue = null;
        this.hasZeroValue = false;
    }

    eachValue(iterator: Cons<V>): void{
        const valueTable = this.valueTable;
        if(this.hasZeroValue) iterator(this.zeroValue as V);

        for(let i = valueTable.length - 1; i >= 0; i--){
            const value = valueTable[i];
            if(value !== null && value !== undefined) iterator(value);
        }
    }

    /**
     * @return 指定值是否在 map 中.
     */
    containsValue(value: unknown, identity: boolean): boolean{
        const valueTable = this.valueTable;
        if(value === null || value === undefined){
            if(this.hasZeroValue && this.zeroValue === null) return true;
            const keyTable = this.keyTable;
            for(let i = valueTable.length - 1; i >= 0; i--)
                if(keyTable[i] !== 0 && valueTable[i] === null) return true;
        }else if(identity){
            if(value === this.zeroValue) return true;
            for(let i = valueTable.length - 1; i >= 0; i--)
                if(valueTable[i] === value) return true;
        }else{
            if(this.hasZeroValue && equalsOf(value, this.zeroValue)) return true;
            for(let i = valueTable.length - 1; i >= 0; i--)
                if(equalsOf(value, valueTable[i])) return true;
        }
        return false;
    }

    containsKey(key: number): boolean{
        if(key === 0) return this.hasZeroValue;
        return this.locateKey(key) >= 0;
    }

    /**
     * @return 指定值对应的 key, 或 notFound.
     */
    findKey(value: unknown, identity: boolean, notFound: number): number{
        const valueTable = this.valueTable;
        if(value === null || value === undefined){
            if(this.hasZeroValue && this.zeroValue === null) return 0;
            const keyTable = this.keyTable;
            for(let i = valueTable.length - 1; i >= 0; i--)
                if(keyTable[i] !== 0 && valueTable[i] === null) return keyTable[i];
        }else if(identity){
            if(value === this.zeroValue) return 0;
            for(let i = valueTable.length - 1; i >= 0; i--)
                if(valueTable[i] === value) return this.keyTable[i];
        }else{
            if(this.hasZeroValue && equalsOf(value, this.zeroValue)) return 0;
            for(let i = valueTable.length - 1; i >= 0; i--)
                if(equalsOf(value, valueTable[i])) return this.keyTable[i];
        }
        return notFound;
    }

    /**
     * 扩大备份数组以容纳指定数量的额外元素 / loadFactor.
     */
    ensureCapacity(additionalCapacity: number): void{
        const ts = tableSize(this.size + additionalCapacity, this.loadFactor);
        if(this.keyTable.length < ts) this.resize(ts);
    }

    private resize(newSize: number): void{
        const oldCapacity = this.keyTable.length;
        this.threshold = Math.floor(newSize * this.loadFactor);
        this.mask = newSize - 1;
        this.shift = 32 + Math.clz32(this.mask);

        const oldKeyTable = this.keyTable;
        const oldValueTable = this.valueTable;

        this.keyTable = new Array<number>(newSize).fill(0);
        this.valueTable = new Array<V | null>(newSize);

        if(this.size > 0){
            for(let i = 0; i < oldCapacity; i++){
                const key = oldKeyTable[i];
                if(key !== 0) this.putResize(key, oldValueTable[i] as V);
            }
        }
    }

    hashCode(): number{
        let h = this.size;
        if(this.hasZeroValue && this.zeroValue !== null && this.zeroValue !== undefined) h = (h + hashOf(this.zeroValue)) | 0;
        const keyTable = this.keyTable;
        const valueTable = this.valueTable;
        for(let i = 0, n = keyTable.length; i < n; i++){
            const key = keyTable[i];
            if(key !== 0){
                h = (h + key * 31) | 0;
                const value = valueTable[i];
                if(value !== null && value !== undefined) h = (h + hashOf(value)) | 0;
            }
        }
        return h;
    }

    equals(obj: unknown): boolean{
        if(obj === this) return true;
        if(!(obj instanceof LongMap)) return false;
        const other = obj as LongMap<unknown>;
        if(other.size !== this.size) return false;
        if(other.hasZeroValue !== this.hasZeroValue) return false;
        if(this.hasZeroValue){
            if(other.zeroValue === null || other.zeroValue === undefined){
                if(this.zeroValue !== null && this.zeroValue !== undefined) return false;
            }else{
                if(!equalsOf(other.zeroValue, this.zeroValue)) return false;
            }
        }
        const keyTable = this.keyTable;
        const valueTable = this.valueTable;
        for(let i = 0, n = keyTable.length; i < n; i++){
            const key = keyTable[i];
            if(key !== 0){
                const value = valueTable[i];
                if(value === null || value === undefined){
                    if(other.get(key, ObjectMap.dummy as any) != null) return false;
                }else{
                    if(!equalsOf(value, other.get(key))) return false;
                }
            }
        }
        return true;
    }

    /** 对每个值使用 === 比较. */
    equalsIdentity(obj: unknown): boolean{
        if(obj === this) return true;
        if(!(obj instanceof LongMap)) return false;
        const other = obj as LongMap<unknown>;
        if(other.size !== this.size) return false;
        if(other.hasZeroValue !== this.hasZeroValue) return false;
        if(this.hasZeroValue && this.zeroValue !== other.zeroValue) return false;
        const keyTable = this.keyTable;
        const valueTable = this.valueTable;
        for(let i = 0, n = keyTable.length; i < n; i++){
            const key = keyTable[i];
            if(key !== 0 && valueTable[i] !== other.get(key, ObjectMap.dummy as any)) return false;
        }
        return true;
    }

    toString(): string{
        if(this.size === 0) return "[]";
        let buffer = "[";
        const keyTable = this.keyTable;
        const valueTable = this.valueTable;
        let i = keyTable.length;
        if(this.hasZeroValue){
            buffer += "0=";
            buffer += String(this.zeroValue);
        }else{
            while(i-- > 0){
                const key = keyTable[i];
                if(key === 0) continue;
                buffer += String(key);
                buffer += "=";
                buffer += String(valueTable[i]);
                break;
            }
        }
        while(i-- > 0){
            const key = keyTable[i];
            if(key === 0) continue;
            buffer += ", ";
            buffer += String(key);
            buffer += "=";
            buffer += String(valueTable[i]);
        }
        buffer += "]";
        return buffer;
    }

    iterator(): Entries<V>{
        return this.entries();
    }

    /**
     * 返回 entries 迭代器. 支持 remove.
     */
    entries(): Entries<V>{
        if(this.entries1 == null){
            this.entries1 = new Entries<V>(this);
            this.entries2 = new Entries<V>(this);
        }
        if(!this.entries1.valid){
            this.entries1.reset();
            this.entries1.valid = true;
            this.entries2.valid = false;
            return this.entries1;
        }
        this.entries2.reset();
        this.entries2.valid = true;
        this.entries1.valid = false;
        return this.entries2;
    }

    /**
     * 返回 values 迭代器. 支持 remove.
     */
    values(): Values<V>{
        if(this.values1 == null){
            this.values1 = new Values<V>(this);
            this.values2 = new Values<V>(this);
        }
        if(!this.values1.valid){
            this.values1.reset();
            this.values1.valid = true;
            this.values2.valid = false;
            return this.values1;
        }
        this.values2.reset();
        this.values2.valid = true;
        this.values1.valid = false;
        return this.values2;
    }

    /**
     * 返回 keys 迭代器. 支持 remove.
     */
    keys(): Keys{
        if(this.keys1 == null){
            this.keys1 = new Keys(this);
            this.keys2 = new Keys(this);
        }
        if(!this.keys1.valid){
            this.keys1.reset();
            this.keys1.valid = true;
            this.keys2.valid = false;
            return this.keys1;
        }
        this.keys2.reset();
        this.keys2.valid = true;
        this.keys1.valid = false;
        return this.keys2;
    }

    /** JS for..of 支持 (迭代 entries). */
    [Symbol.iterator](){
        return jsIterator(this.entries());
    }
}

export class Entry<V>{
    key = 0;
    value: V | null = null;

    toString(): string{
        return String(this.key) + "=" + String(this.value);
    }
}

const INDEX_ILLEGAL = -2;
const INDEX_ZERO = -1;

export class MapIterator<V>{
    protected hasNextValue = false;

    readonly map: LongMap<V>;
    nextIndex = 0;
    currentIndex = 0;
    valid = true;

    constructor(map: LongMap<V>){
        this.map = map;
        this.reset();
    }

    reset(): void{
        this.currentIndex = INDEX_ILLEGAL;
        this.nextIndex = INDEX_ZERO;
        if(this.map.hasZeroValue)
            this.hasNextValue = true;
        else
            this.findNextIndex();
    }

    protected findNextIndex(): void{
        const keyTable = this.map.keyTable;
        for(let n = keyTable.length; ++this.nextIndex < n; ){
            if(keyTable[this.nextIndex] !== 0){
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
        if(i === INDEX_ZERO && this.map.hasZeroValue){
            this.map.hasZeroValue = false;
            this.map.zeroValue = null;
        }else if(i < 0){
            throw new Error("next must be called before remove.");
        }else{
            const keyTable = this.map.keyTable;
            const valueTable = this.map.valueTable;
            const mask = this.map.mask;
            let next = i + 1 & mask;
            let key: number;
            while((key = keyTable[next]) !== 0){
                const placement = this.map.place(key);
                if((next - placement & mask) > (i - placement & mask)){
                    keyTable[i] = key;
                    valueTable[i] = valueTable[next];
                    i = next;
                }
                next = next + 1 & mask;
            }
            keyTable[i] = 0;
            valueTable[i] = null;
            if(i !== this.currentIndex) --this.nextIndex;
        }
        this.currentIndex = INDEX_ILLEGAL;
        this.map.size--;
    }
}

export class Entries<V> extends MapIterator<V>{
    private readonly entry = new Entry<V>();

    constructor(map: LongMap<V>){
        super(map);
    }

    /** 注意: 每次调用此方法都返回同一个 entry 实例. */
    next(): Entry<V>{
        if(!this.hasNextValue) throw new Error("NoSuchElementException");
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        const keyTable = this.map.keyTable;
        if(this.nextIndex === INDEX_ZERO){
            this.entry.key = 0;
            this.entry.value = this.map.zeroValue;
        }else{
            this.entry.key = keyTable[this.nextIndex];
            this.entry.value = this.map.valueTable[this.nextIndex];
        }
        this.currentIndex = this.nextIndex;
        this.findNextIndex();
        return this.entry;
    }

    iterator(): this{
        return this;
    }
}

export class Values<V> extends MapIterator<V>{
    constructor(map: LongMap<V>){
        super(map);
    }

    next(): V | null{
        if(!this.hasNextValue) throw new Error("NoSuchElementException");
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        let value: V | null;
        if(this.nextIndex === INDEX_ZERO)
            value = this.map.zeroValue;
        else
            value = this.map.valueTable[this.nextIndex];
        this.currentIndex = this.nextIndex;
        this.findNextIndex();
        return value;
    }

    iterator(): this{
        return this;
    }

    /** @return 包含剩余值的新数组. */
    toSeq(): Seq<V>{
        const array = new Seq<V>(true, this.map.size);
        while(this.hasNextValue)
            array.add(this.next() as V);
        return array;
    }
}

export class Keys extends MapIterator<unknown>{
    constructor(map: LongMap<unknown>){
        super(map);
    }

    next(): number{
        if(!this.hasNextValue) throw new Error("NoSuchElementException");
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        const key = this.nextIndex === INDEX_ZERO ? 0 : this.map.keyTable[this.nextIndex];
        this.currentIndex = this.nextIndex;
        this.findNextIndex();
        return key;
    }

    /** @return 包含剩余 key 的新数组. */
    toSeq(): LongSeq{
        const array = new LongSeq(true, this.map.size);
        while(this.hasNextValue)
            array.add(this.next());
        return array;
    }

    /** 将剩余 key 添加到指定数组. */
    toSeq(array: LongSeq): LongSeq{
        while(this.hasNextValue)
            array.add(this.next());
        return array;
    }
}
