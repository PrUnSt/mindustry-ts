// 源: arc-core/src/arc/struct/ObjectSet.java
// 迁移说明: 无序对象集合, cuckoo 哈希. Null key 不允许. 键的哈希/相等使用 Hash.ts 的 hashOf/equalsOf.
import {Mathf} from './Mathf';
import {hashOf, equalsOf} from './Hash';
import {jsIterator} from './Iterators';
import {Cons, Boolf} from './Funcs';
import {Seq} from './Seq';

/** 计算哈希表大小 (ObjectSet.tableSize 的模块级等价, 供 ObjectMap/IntMap 等复用). */
export function tableSize(capacity: number, loadFactor: number): number{
    if(capacity < 0) throw new Error("capacity must be >= 0: " + capacity);
    let tableSize = Mathf.nextPowerOfTwo(Math.max(2, Math.ceil(capacity / loadFactor)));
    if(tableSize > 1 << 30) throw new Error("The required capacity is too large: " + capacity);
    return tableSize;
}

/** 无序对象集合. Null key 不允许. */
export class ObjectSet<T>{
    static tableSize = tableSize;

    size = 0;

    keyTable: (T | null)[];

    loadFactor: number;
    threshold: number;

    /** Java 中为 protected. */
    shift: number;
    /** Java 中为 protected. */
    mask: number;

    private iterator1: ObjectSetIterator<T> | null = null;
    private iterator2: ObjectSetIterator<T> | null = null;

    /** 创建初始容量 51、负载因子 0.8 的集合. */
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

        this.keyTable = new Array<T | null>(ts);
    }

    static with<T>(...array: T[]): ObjectSet<T>;
    static with<T>(array: Seq<T>): ObjectSet<T>;
    static with<T>(...args: any[]): ObjectSet<T>{
        const set = new ObjectSet<T>();
        if(args.length === 1 && args[0] instanceof Seq){
            set.addAll(args[0]);
        }else{
            set.addAll(args as T[]);
        }
        return set;
    }

    copy(): ObjectSet<T>{
        const result = new ObjectSet<T>();
        result.addAll(this);
        return result;
    }

    /** 分配一个包含所有匹配谓词元素的新集合. */
    select(predicate: Boolf<T>): ObjectSet<T>{
        const arr = new ObjectSet<T>();
        for(const t of this){
            if(predicate(t)) arr.add(t);
        }
        return arr;
    }

    toSeq(): Seq<T>{
        return this.iterator().toSeq();
    }

    each(cons: Cons<T>): void{
        for(const t of this){
            cons(t);
        }
    }

    find(predicate: Boolf<T>): T | null{
        for(const t of this){
            if(predicate(t)){
                return t;
            }
        }
        return null;
    }

    /** Java 中为 protected. */
    place(item: T): number{
        const h = BigInt.asIntN(64, BigInt(hashOf(item) | 0));
        const prod = h * 0x9e3779b97f4a7c15n;
        const shifted = BigInt.asUintN(64, prod) >> BigInt(this.shift & 63);
        return Number(shifted & 0xffffffffn) | 0;
    }

    locateKey(key: T): number{
        if(key === null || key === undefined) throw new Error("key cannot be null.");
        const keyTable = this.keyTable;
        for(let i = this.place(key); ; i = i + 1 & this.mask){
            const other = keyTable[i];
            if(other === null) return -(i + 1); // 有空位
            if(equalsOf(other, key)) return i; // 找到相同 key
        }
    }

    any(): boolean{
        return this.size > 0;
    }

    /**
     * 若 key 已加入集合返回 false, 否则加入并返回 true. 若集合已包含该 key, 调用不改变集合并返回 false.
     */
    add(key: T): boolean{
        if(key === null || key === undefined) return false;
        let i = this.locateKey(key);
        if(i >= 0) return false; // 已有 key
        i = -(i + 1); // 找到空位
        this.keyTable[i] = key;
        if(++this.size >= this.threshold) this.resize(this.keyTable.length << 1);
        return true;
    }

    addAll(array: Seq<T>): void;
    addAll(array: Seq<T>, offset: number, length: number): void;
    addAll(...array: T[]): boolean;
    addAll(array: T[], offset: number, length: number): boolean;
    addAll(set: ObjectSet<T>): void;
    addAll(...args: any[]): any{
        if(args.length === 1){
            const a = args[0];
            if(a instanceof Seq){
                this.addAll(a.items as T[], 0, a.size);
                return undefined;
            }
            if(a instanceof ObjectSet){
                this.ensureCapacity(a.size);
                const oldSize = this.size;
                const keyTable = a.keyTable;
                for(let i = 0, n = keyTable.length; i < n; i++){
                    const key = keyTable[i];
                    if(key !== null) this.add(key);
                }
                return undefined;
            }
            // T... (数组参数)
            return this.addAll(a as T[], 0, (a as T[]).length);
        }
        if(args.length === 2){
            // addAll(Seq, offset, length) 只有 3 参版本; 2 参即 addAll(T[], offset)?? Java 无此版本
            const array: T[] = args[0];
            const offset = args[1];
            return this.addAll(array, offset, (array as T[]).length - offset);
        }
        const array: T[] = args[0];
        const offset = args[1];
        const length = args[2];
        if(offset + length > array.length && (array as any).length !== undefined){
            // 若源是 Seq, 用其 size 语义校验
        }
        this.ensureCapacity(length);
        const oldSize = this.size;
        for(let i = offset, n = i + length; i < n; i++){
            const value = array[i];
            if(value !== null && value !== undefined) this.add(value);
        }
        return oldSize !== this.size;
    }

    /** 跳过已有 key 检查, 不递增 size. */
    private addResize(key: T): void{
        const keyTable = this.keyTable;
        for(let i = this.place(key); ; i = (i + 1) & this.mask){
            if(keyTable[i] === null){
                keyTable[i] = key;
                return;
            }
        }
    }

    removeAll(array: T[], offset: number, length: number): void;
    removeAll(array: T[]): void;
    removeAll(array: Seq<T>): void;
    removeAll(...args: any[]): void{
        if(args.length === 3){
            const array: T[] = args[0];
            const offset = args[1];
            const length = args[2];
            for(let i = offset, n = i + length; i < n; i++)
                this.remove(array[i]);
        }else if(args[0] instanceof Seq){
            const array = args[0] as Seq<T>;
            this.removeAll(array.items as T[], 0, array.size);
        }else{
            const array: T[] = args[0];
            for(const t of array){
                this.remove(t);
            }
        }
    }

    /** @return 是否移除了该 key. */
    remove(key: T): boolean{
        const i = this.locateKey(key);
        if(i < 0) return false;
        const keyTable = this.keyTable;
        const mask = this.mask;
        let next = i + 1 & mask;
        let k: T | null;
        while((k = keyTable[next]) !== null){
            const placement = this.place(k);
            if((next - placement & mask) > (i - placement & mask)){
                keyTable[i] = k;
                i = next;
            }
            next = next + 1 & mask;
        }
        keyTable[i] = null;
        this.size--;
        return true;
    }

    /** @return 集合是否有元素. */
    notEmpty(): boolean{
        return this.size > 0;
    }

    /** @return 集合是否为空. */
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

    /**
     * 清空集合并将备份数组缩减为指定容量 / loadFactor, 若更大.
     */
    clear(maximumCapacity: number): void;
    /** 清空集合, 备份数组保持当前容量. */
    clear(): void;
    clear(maximumCapacity?: number): void{
        if(maximumCapacity === undefined){
            if(this.size === 0) return;
            this.size = 0;
            for(let i = 0; i < this.keyTable.length; i++) this.keyTable[i] = null;
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

    contains(key: T): boolean{
        return this.locateKey(key) >= 0;
    }

    get(key: T): T | null{
        const i = this.locateKey(key);
        return i < 0 ? null : this.keyTable[i];
    }

    first(): T{
        const keyTable = this.keyTable;
        for(let i = 0, n = keyTable.length; i < n; i++)
            if(keyTable[i] !== null) return keyTable[i] as T;
        throw new Error("ObjectSet is empty.");
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

        this.keyTable = new Array<T | null>(newSize);

        if(this.size > 0){
            for(let i = 0; i < oldCapacity; i++){
                const key = oldKeyTable[i];
                if(key !== null) this.addResize(key);
            }
        }
    }

    hashCode(): number{
        let h = this.size;
        const keyTable = this.keyTable;
        for(let i = 0, n = keyTable.length; i < n; i++){
            const key = keyTable[i];
            if(key !== null) h = (h + hashOf(key)) | 0;
        }
        return h;
    }

    equals(obj: unknown): boolean{
        if(!(obj instanceof ObjectSet)) return false;
        const other = obj as ObjectSet<unknown>;
        if(other.size !== this.size) return false;
        const keyTable = this.keyTable;
        for(let i = 0, n = keyTable.length; i < n; i++)
            if(keyTable[i] !== null && !other.contains(keyTable[i] as T)) return false;
        return true;
    }

    toString(): string;
    toString(separator: string): string;
    toString(separator?: string): string{
        if(separator === undefined) return "{" + this.toString(", ") + "}";
        if(this.size === 0) return "";
        const keyTable = this.keyTable;
        let buffer = "";
        let i = keyTable.length;
        while(i-- > 0){
            const key = keyTable[i];
            if(key === null) continue;
            buffer += String(key === this ? "(this)" : key);
            break;
        }
        while(i-- > 0){
            const key = keyTable[i];
            if(key === null) continue;
            buffer += separator;
            buffer += String(key === this ? "(this)" : key);
        }
        return buffer;
    }

    /**
     * 返回集合元素的迭代器. 支持 remove.
     */
    iterator(): ObjectSetIterator<T>{
        let it1 = this.iterator1;
        if(it1 == null){
            it1 = new ObjectSetIterator<T>(this);
            this.iterator1 = it1;
            this.iterator2 = new ObjectSetIterator<T>(this);
        }
        if(!it1.valid){
            it1.reset();
            it1.valid = true;
            (this.iterator2 as ObjectSetIterator<T>).valid = false;
            return it1;
        }
        const it2 = this.iterator2 as ObjectSetIterator<T>;
        it2.reset();
        it2.valid = true;
        it1.valid = false;
        return it2;
    }

    /** JS for..of 支持. */
    [Symbol.iterator](){
        return jsIterator(this.iterator());
    }
}

export class ObjectSetIterator<K>{
    protected hasNextValue = false;

    readonly set: ObjectSet<K>;
    nextIndex = 0;
    currentIndex = 0;
    valid = true;

    constructor(set: ObjectSet<K>){
        this.set = set;
        this.reset();
    }

    reset(): void{
        this.currentIndex = -1;
        this.nextIndex = -1;
        this.findNextIndex();
    }

    private findNextIndex(): void{
        const keyTable = this.set.keyTable;
        for(let n = this.set.keyTable.length; ++this.nextIndex < n; ){
            if(keyTable[this.nextIndex] !== null){
                this.hasNextValue = true;
                return;
            }
        }
        this.hasNextValue = false;
    }

    remove(): void{
        let i = this.currentIndex;
        if(i < 0) throw new Error("next must be called before remove.");
        const keyTable = this.set.keyTable;
        const mask = this.set.mask;
        let next = i + 1 & mask;
        let key: K | null;
        while((key = keyTable[next]) !== null){
            const placement = this.set.place(key);
            if((next - placement & mask) > (i - placement & mask)){
                keyTable[i] = key;
                i = next;
            }
            next = next + 1 & mask;
        }
        keyTable[i] = null;
        this.set.size--;
        if(i !== this.currentIndex) --this.nextIndex;
        this.currentIndex = -1;
    }

    hasNext(): boolean{
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        return this.hasNextValue;
    }

    next(): K{
        if(!this.hasNextValue) throw new Error("NoSuchElementException");
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        const key = this.set.keyTable[this.nextIndex] as K;
        this.currentIndex = this.nextIndex;
        this.findNextIndex();
        return key;
    }

    iterator(): this{
        return this;
    }

    /** 将剩余值添加到数组. */
    toSeq(array: Seq<K>): Seq<K>{
        while(this.hasNext())
            array.add(this.next());
        return array;
    }

    /** @return 包含剩余值的新数组. */
    toSeq(): Seq<K>{
        return this.toSeq(new Seq<K>(true, this.set.size));
    }

    [Symbol.iterator](){
        return jsIterator(this);
    }
}
