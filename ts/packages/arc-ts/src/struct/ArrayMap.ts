// 源: arc-core/src/arc/struct/ArrayMap.java
// 迁移说明: 有序/无序的对象 map, 用数组存 key 和 value. 与 Seq 类似, 无序时 remove 避免内存拷贝.
import {Mathf} from './Mathf';
import {hashOf, equalsOf} from './Hash';
import {jsIterator} from './Iterators';
import {Seq} from './Seq';
import {Entry} from './ObjectMap';

/**
 * 有序或无序的对象 map. 用数组存储 key/value, 因此 get 需要对每个 key 做比较.
 * 与 {@link Seq} 类似, 若 ordered 为 false, 移除元素时会把最后一个元素移到被删位置.
 */
export class ArrayMap<K, V>{
    keys: K[];
    values: V[];
    size = 0;
    ordered: boolean;

    private entries1: Entries<K, V> | null = null;
    private entries2: Entries<K, V> | null = null;
    private valuesIter1: Values<V> | null = null;
    private valuesIter2: Values<V> | null = null;
    private keysIter1: Keys<K> | null = null;
    private keysIter2: Keys<K> | null = null;

    /** 创建容量为 16 的有序 map. */
    constructor();
    constructor(capacity: number);
    constructor(ordered: boolean, capacity: number);
    /** keyArrayType/valueArrayType 在 TS 中无实际作用, 仅为签名兼容. */
    constructor(ordered: boolean, capacity: number, keyArrayType: unknown, valueArrayType: unknown);
    constructor(keyArrayType: unknown, valueArrayType: unknown);
    constructor(array: ArrayMap<K, V>);
    constructor(a?: any, b?: any, c?: any, d?: any){
        if(a instanceof ArrayMap){
            const array = a as ArrayMap<K, V>;
            this.ordered = array.ordered;
            this.keys = array.keys.slice(0, array.size);
            this.values = array.values.slice(0, array.size);
            this.size = array.size;
            return;
        }
        if(typeof a === 'boolean'){
            this.ordered = a;
            this.keys = new Array<K>(b === undefined ? 16 : (b as number));
            this.values = new Array<V>(b === undefined ? 16 : (b as number));
        }else if(typeof a === 'number'){
            this.ordered = true;
            this.keys = new Array<K>(a);
            this.values = new Array<V>(a);
        }else{
            // ArrayMap(Class, Class) -> Java 源码为 this(false, 16, ...)
            this.ordered = false;
            this.keys = new Array<K>(16);
            this.values = new Array<V>(16);
        }
    }

    put(key: K, value: V): number{
        let index = this.indexOfKey(key);
        if(index === -1){
            if(this.size === this.keys.length) this.resize(Math.max(8, Math.floor(this.size * 1.75)));
            index = this.size++;
        }
        this.keys[index] = key;
        this.values[index] = value;
        return index;
    }

    put(key: K, value: V, index: number): number{
        const existingIndex = this.indexOfKey(key);
        if(existingIndex !== -1)
            this.removeIndex(existingIndex);
        else if(this.size === this.keys.length)
            this.resize(Math.max(8, Math.floor(this.size * 1.75)));
        for(let i = this.size; i > index; i--){
            this.keys[i] = this.keys[i - 1];
            this.values[i] = this.values[i - 1];
        }
        this.keys[index] = key;
        this.values[index] = value;
        this.size++;
        return index;
    }

    putAll(map: ArrayMap<K, V>): void;
    putAll(map: ArrayMap<K, V>, offset: number, length: number): void;
    putAll(map: ArrayMap<K, V>, offset: number = 0, length: number = map.size): void{
        if(offset + length > map.size)
            throw new Error("offset + length must be <= size: " + offset + " + " + length + " <= " + map.size);
        const sizeNeeded = this.size + length - offset;
        if(sizeNeeded >= this.keys.length) this.resize(Math.max(8, Math.floor(sizeNeeded * 1.75)));
        for(let i = 0; i < length; i++){
            this.keys[this.size + i] = map.keys[offset + i];
            this.values[this.size + i] = map.values[offset + i];
        }
        this.size += length;
    }

    /**
     * @return 指定 key 的值. 注意: 逆序对每个 key 做 .equals() 比较.
     */
    get(key: K): V | null{
        const keys = this.keys;
        let i = this.size - 1;
        if(key === null || key === undefined){
            for(; i >= 0; i--)
                if(keys[i] === key) return this.values[i];
        }else{
            for(; i >= 0; i--)
                if(equalsOf(key, keys[i])) return this.values[i];
        }
        return null;
    }

    /**
     * @return 指定值对应的 key. 逆序比较每个值.
     * @param identity true 时用 === 比较, false 时用 .equals() 比较.
     */
    getKey(value: V, identity: boolean): K | null{
        const values = this.values;
        let i = this.size - 1;
        if(identity || value === null || value === undefined){
            for(; i >= 0; i--)
                if(values[i] === value) return this.keys[i];
        }else{
            for(; i >= 0; i--)
                if(equalsOf(value, values[i])) return this.keys[i];
        }
        return null;
    }

    getKeyAt(index: number): K{
        if(index >= this.size) throw new Error(String(index));
        return this.keys[index];
    }

    getValueAt(index: number): V{
        if(index >= this.size) throw new Error(String(index));
        return this.values[index];
    }

    firstKey(): K{
        if(this.size === 0) throw new Error("Map is empty.");
        return this.keys[0];
    }

    firstValue(): V{
        if(this.size === 0) throw new Error("Map is empty.");
        return this.values[0];
    }

    setKey(index: number, key: K): void{
        if(index >= this.size) throw new Error(String(index));
        this.keys[index] = key;
    }

    setValue(index: number, value: V): void{
        if(index >= this.size) throw new Error(String(index));
        this.values[index] = value;
    }

    insert(index: number, key: K, value: V): void{
        if(index > this.size) throw new Error(String(index));
        if(this.size === this.keys.length) this.resize(Math.max(8, Math.floor(this.size * 1.75)));
        if(this.ordered){
            for(let i = this.size; i > index; i--){
                this.keys[i] = this.keys[i - 1];
                this.values[i] = this.values[i - 1];
            }
        }else{
            this.keys[this.size] = this.keys[index];
            this.values[this.size] = this.values[index];
        }
        this.size++;
        this.keys[index] = key;
        this.values[index] = value;
    }

    containsKey(key: K): boolean{
        const keys = this.keys;
        let i = this.size - 1;
        if(key === null || key === undefined){
            while(i >= 0)
                if(keys[i--] === key) return true;
        }else{
            while(i >= 0)
                if(equalsOf(key, keys[i--])) return true;
        }
        return false;
    }

    /** @param identity true 时用 === 比较, false 时用 .equals() 比较. */
    containsValue(value: V, identity: boolean): boolean{
        const values = this.values;
        let i = this.size - 1;
        if(identity || value === null || value === undefined){
            while(i >= 0)
                if(values[i--] === value) return true;
        }else{
            while(i >= 0)
                if(equalsOf(value, values[i--])) return true;
        }
        return false;
    }

    indexOfKey(key: K): number{
        const keys = this.keys;
        if(key === null || key === undefined){
            for(let i = 0, n = this.size; i < n; i++)
                if(keys[i] === key) return i;
        }else{
            for(let i = 0, n = this.size; i < n; i++)
                if(equalsOf(key, keys[i])) return i;
        }
        return -1;
    }

    indexOfValue(value: V, identity: boolean): number{
        const values = this.values;
        if(identity || value === null || value === undefined){
            for(let i = 0, n = this.size; i < n; i++)
                if(values[i] === value) return i;
        }else{
            for(let i = 0, n = this.size; i < n; i++)
                if(equalsOf(value, values[i])) return i;
        }
        return -1;
    }

    removeKey(key: K): V | null{
        const keys = this.keys;
        if(key === null || key === undefined){
            for(let i = 0, n = this.size; i < n; i++){
                if(keys[i] === key){
                    const value = this.values[i];
                    this.removeIndex(i);
                    return value;
                }
            }
        }else{
            for(let i = 0, n = this.size; i < n; i++){
                if(equalsOf(key, keys[i])){
                    const value = this.values[i];
                    this.removeIndex(i);
                    return value;
                }
            }
        }
        return null;
    }

    removeValue(value: V, identity: boolean): boolean{
        const values = this.values;
        if(identity || value === null || value === undefined){
            for(let i = 0, n = this.size; i < n; i++){
                if(values[i] === value){
                    this.removeIndex(i);
                    return true;
                }
            }
        }else{
            for(let i = 0, n = this.size; i < n; i++){
                if(equalsOf(value, values[i])){
                    this.removeIndex(i);
                    return true;
                }
            }
        }
        return false;
    }

    /** 移除指定索引处的键值对. */
    removeIndex(index: number): void{
        if(index >= this.size) throw new Error(String(index));
        const keys = this.keys;
        this.size--;
        if(this.ordered){
            for(let i = index; i < this.size; i++){
                keys[i] = keys[i + 1];
                this.values[i] = this.values[i + 1];
            }
        }else{
            keys[index] = keys[this.size];
            this.values[index] = this.values[this.size];
        }
        (keys[this.size] as any) = null;
        (this.values[this.size] as any) = null;
    }

    /** @return map 是否为空. */
    isEmpty(): boolean{
        return this.size === 0;
    }

    /** @return 最后一个 key. */
    peekKey(): K{
        return this.keys[this.size - 1];
    }

    /** @return 最后一个 value. */
    peekValue(): V{
        return this.values[this.size - 1];
    }

    /** 清空 map, 若备份数组更大则缩减为指定容量. */
    clear(maximumCapacity: number): void{
        if(this.keys.length <= maximumCapacity){
            this.clear();
            return;
        }
        this.size = 0;
        this.resize(maximumCapacity);
    }

    clear(): void{
        const keys = this.keys;
        const values = this.values;
        for(let i = 0, n = this.size; i < n; i++){
            (keys[i] as any) = null;
            (values[i] as any) = null;
        }
        this.size = 0;
    }

    /**
     * 将备份数组缩减到实际条目数.
     */
    shrink(): void{
        if(this.keys.length === this.size) return;
        this.resize(this.size);
    }

    /**
     * 扩大备份数组以容纳指定数量的额外条目.
     */
    ensureCapacity(additionalCapacity: number): void{
        if(additionalCapacity < 0)
            throw new Error("additionalCapacity must be >= 0: " + additionalCapacity);
        const sizeNeeded = this.size + additionalCapacity;
        if(sizeNeeded >= this.keys.length) this.resize(Math.max(8, sizeNeeded));
    }

    protected resize(newSize: number): void{
        const newKeys = new Array<K>(newSize);
        for(let i = 0; i < Math.min(this.size, newKeys.length); i++) newKeys[i] = this.keys[i];
        this.keys = newKeys;

        const newValues = new Array<V>(newSize);
        for(let i = 0; i < Math.min(this.size, newValues.length); i++) newValues[i] = this.values[i];
        this.values = newValues;
    }

    reverse(): void{
        for(let i = 0, lastIndex = this.size - 1, n = this.size / 2; i < n; i++){
            const ii = lastIndex - i;
            const tempKey = this.keys[i];
            this.keys[i] = this.keys[ii];
            this.keys[ii] = tempKey;

            const tempValue = this.values[i];
            this.values[i] = this.values[ii];
            this.values[ii] = tempValue;
        }
    }

    shuffle(): void{
        for(let i = this.size - 1; i >= 0; i--){
            const ii = Mathf.random(i);
            const tempKey = this.keys[i];
            this.keys[i] = this.keys[ii];
            this.keys[ii] = tempKey;

            const tempValue = this.values[i];
            this.values[i] = this.values[ii];
            this.values[ii] = tempValue;
        }
    }

    /**
     * 将数组缩减到指定大小. 若数组已经更小则不做任何事.
     */
    truncate(newSize: number): void{
        if(this.size <= newSize) return;
        for(let i = newSize; i < this.size; i++){
            (this.keys[i] as any) = null;
            (this.values[i] as any) = null;
        }
        this.size = newSize;
    }

    hashCode(): number{
        const keys = this.keys;
        const values = this.values;
        let h = 0;
        for(let i = 0, n = this.size; i < n; i++){
            const key = keys[i];
            const value = values[i];
            if(key !== null && key !== undefined) h = (h + Math.imul(hashOf(key), 31)) | 0;
            if(value !== null && value !== undefined) h = (h + hashOf(value)) | 0;
        }
        return h;
    }

    equals(obj: unknown): boolean{
        if(obj === this) return true;
        if(!(obj instanceof ArrayMap)) return false;
        const other = obj as ArrayMap<unknown, unknown>;
        if(other.size !== this.size) return false;
        const keys = this.keys;
        const values = this.values;
        for(let i = 0, n = this.size; i < n; i++){
            const key = keys[i];
            const value = values[i];
            if(value === null || value === undefined){
                if(!other.containsKey(key as any) || other.get(key as any) != null) return false;
            }else{
                if(!equalsOf(value, other.get(key as any))) return false;
            }
        }
        return true;
    }

    toString(): string{
        if(this.size === 0) return "{}";
        const keys = this.keys;
        const values = this.values;
        let buffer = "{";
        buffer += String(keys[0]);
        buffer += "=";
        buffer += String(values[0]);
        for(let i = 1; i < this.size; i++){
            buffer += ", ";
            buffer += String(keys[i]);
            buffer += "=";
            buffer += String(values[i]);
        }
        buffer += "}";
        return buffer;
    }

    iterator(): Entries<K, V>{
        return this.entries();
    }

    /**
     * 返回 entries 迭代器. 支持 remove. 注意: 每次调用此方法都返回同一个迭代器实例.
     */
    entries(): Entries<K, V>{
        if(this.entries1 == null){
            this.entries1 = new Entries<K, V>(this);
            this.entries2 = new Entries<K, V>(this);
        }
        if(!this.entries1.valid){
            this.entries1.index = 0;
            this.entries1.valid = true;
            this.entries2.valid = false;
            return this.entries1;
        }
        this.entries2.index = 0;
        this.entries2.valid = true;
        this.entries1.valid = false;
        return this.entries2;
    }

    /**
     * 返回 values 迭代器. 支持 remove.
     */
    values(): Values<V>{
        if(this.valuesIter1 == null){
            this.valuesIter1 = new Values<V>(this);
            this.valuesIter2 = new Values<V>(this);
        }
        if(!this.valuesIter1.valid){
            this.valuesIter1.index = 0;
            this.valuesIter1.valid = true;
            this.valuesIter2.valid = false;
            return this.valuesIter1;
        }
        this.valuesIter2.index = 0;
        this.valuesIter2.valid = true;
        this.valuesIter1.valid = false;
        return this.valuesIter2;
    }

    /**
     * 返回 keys 迭代器. 支持 remove.
     */
    keys(): Keys<K>{
        if(this.keysIter1 == null){
            this.keysIter1 = new Keys<K>(this);
            this.keysIter2 = new Keys<K>(this);
        }
        if(!this.keysIter1.valid){
            this.keysIter1.index = 0;
            this.keysIter1.valid = true;
            this.keysIter2.valid = false;
            return this.keysIter1;
        }
        this.keysIter2.index = 0;
        this.keysIter2.valid = true;
        this.keysIter1.valid = false;
        return this.keysIter2;
    }

    /** JS for..of 支持 (迭代 entries). */
    [Symbol.iterator](){
        return jsIterator(this.entries());
    }
}

export class Entries<K, V>{
    private readonly map: ArrayMap<K, V>;
    entry = new Entry<K, V>();
    index = 0;
    valid = true;

    constructor(map: ArrayMap<K, V>){
        this.map = map;
    }

    hasNext(): boolean{
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        return this.index < this.map.size;
    }

    iterator(): this{
        return this;
    }

    /** 注意: 每次调用此方法都返回同一个 entry 实例. */
    next(): Entry<K, V>{
        if(this.index >= this.map.size) throw new Error(String(this.index));
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        this.entry.key = this.map.keys[this.index];
        this.entry.value = this.map.values[this.index++];
        return this.entry;
    }

    remove(): void{
        this.index--;
        this.map.removeIndex(this.index);
    }

    reset(): void{
        this.index = 0;
    }
}

export class Values<V>{
    private readonly map: ArrayMap<unknown, V>;
    index = 0;
    valid = true;

    constructor(map: ArrayMap<unknown, V>){
        this.map = map;
    }

    hasNext(): boolean{
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        return this.index < this.map.size;
    }

    iterator(): this{
        return this;
    }

    next(): V{
        if(this.index >= this.map.size) throw new Error(String(this.index));
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        return this.map.values[this.index++];
    }

    remove(): void{
        this.index--;
        this.map.removeIndex(this.index);
    }

    reset(): void{
        this.index = 0;
    }

    toArray(): Seq<V>{
        return new Seq<V>(true, this.map.values, this.index, this.map.size - this.index);
    }

    toArray(array: Seq<V>): Seq<V>{
        array.addAll(this.map.values, this.index, this.map.size - this.index);
        return array;
    }
}

export class Keys<K>{
    private readonly map: ArrayMap<K, unknown>;
    index = 0;
    valid = true;

    constructor(map: ArrayMap<K, unknown>){
        this.map = map;
    }

    hasNext(): boolean{
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        return this.index < this.map.size;
    }

    iterator(): this{
        return this;
    }

    next(): K{
        if(this.index >= this.map.size) throw new Error(String(this.index));
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        return this.map.keys[this.index++];
    }

    remove(): void{
        this.index--;
        this.map.removeIndex(this.index);
    }

    reset(): void{
        this.index = 0;
    }

    toArray(): Seq<K>{
        return new Seq<K>(true, this.map.keys, this.index, this.map.size - this.index);
    }

    toArray(array: Seq<K>): Seq<K>{
        array.addAll(this.map.keys, this.index, this.map.size - this.index);
        return array;
    }
}
