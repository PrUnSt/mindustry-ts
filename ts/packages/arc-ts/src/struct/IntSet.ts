// 源: arc-core/src/arc/struct/IntSet.java
// 迁移说明: int 键的无序集合. keyTable 用 number[] (0 表示空槽), 键 0 用 hasZeroValue 单独存放.
import {tableSize} from './ObjectSet';
import {jsIterator} from './Iterators';
import {Intc} from './Funcs';
import {IntSeq} from './IntSeq';

/**
 * 使用 int 键的无序集合. 除扩容外无分配.
 */
export class IntSet{
    size = 0;

    keyTable: number[];
    hasZeroValue = false;

    private readonly loadFactor: number;
    private threshold: number;

    protected shift: number;
    protected mask: number;

    private iterator1: IntSetIterator | null = null;
    private iterator2: IntSetIterator | null = null;

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

        this.keyTable = new Array<number>(ts).fill(0);
    }

    /** 创建与指定集合相同的新集合. */
    constructor(set: IntSet);
    constructor(a?: any, b?: any){
        if(a instanceof IntSet){
            const set = a as IntSet;
            this.loadFactor = set.loadFactor;
            this.keyTable = set.keyTable.slice();
            this.size = set.size;
            this.hasZeroValue = set.hasZeroValue;
            const ts = this.keyTable.length;
            this.threshold = Math.floor(ts * set.loadFactor);
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
    }

    each(cons: Intc): void{
        const iter = this.iterator();
        while(iter.hasNext()){
            cons(iter.next());
        }
    }

    /**
     * 返回指定 item 在 [0, mask] 内的索引. 默认实现使用斐波那契哈希.
     */
    protected place(item: number): number{
        const h = BigInt.asIntN(64, BigInt(item | 0));
        const prod = h * 0x9e3779b97f4a7c15n;
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

    /** @return 若 key 已加入集合返回 false, 否则加入并返回 true. */
    add(key: number): boolean{
        if(key === 0){
            if(this.hasZeroValue) return false;
            this.hasZeroValue = true;
            this.size++;
            return true;
        }
        let i = this.locateKey(key);
        if(i >= 0) return false; // 已有 key
        i = -(i + 1); // 找到空位
        this.keyTable[i] = key;
        if(++this.size >= this.threshold) this.resize(this.keyTable.length << 1);
        return true;
    }

    addAll(array: IntSeq): void;
    addAll(array: IntSeq, offset: number, length: number): void;
    addAll(...array: number[]): void;
    addAll(array: number[], offset: number, length: number): void;
    addAll(set: IntSet): void;
    addAll(...args: any[]): void{
        if(args.length === 1){
            const a = args[0];
            if(a instanceof IntSeq){
                this.addAll(a.items, 0, a.size);
                return;
            }
            if(a instanceof IntSet){
                this.ensureCapacity(a.size);
                if(a.hasZeroValue) this.add(0);
                const keyTable = a.keyTable;
                for(let i = 0, n = keyTable.length; i < n; i++){
                    const key = keyTable[i];
                    if(key !== 0) this.add(key);
                }
                return;
            }
            this.addAll(a as number[], 0, (a as number[]).length);
            return;
        }
        if(args.length === 2){
            const array: number[] = args[0];
            const offset = args[1];
            this.addAll(array, offset, array.length - offset);
            return;
        }
        const array: number[] = args[0];
        const offset = args[1];
        const length = args[2];
        this.ensureCapacity(length);
        for(let i = offset, n = i + length; i < n; i++)
            this.add(array[i]);
    }

    /** 跳过已有 key 检查, 不递增 size, 无需处理 key 0. */
    private addResize(key: number): void{
        const keyTable = this.keyTable;
        for(let i = this.place(key); ; i = (i + 1) & this.mask){
            if(keyTable[i] === 0){
                keyTable[i] = key;
                return;
            }
        }
    }

    /** @return 是否移除了该 key. */
    remove(key: number): boolean{
        if(key === 0){
            if(!this.hasZeroValue) return false;
            this.hasZeroValue = false;
            this.size--;
            return true;
        }

        let i = this.locateKey(key);
        if(i < 0) return false;
        const keyTable = this.keyTable;
        const mask = this.mask;
        let next = i + 1 & mask;
        let k: number;
        while((k = keyTable[next]) !== 0){
            const placement = this.place(k);
            if((next - placement & mask) > (i - placement & mask)){
                keyTable[i] = k;
                i = next;
            }
            next = next + 1 & mask;
        }
        keyTable[i] = 0;
        this.size--;
        return true;
    }

    /** @return 集合是否有一个或多个元素. */
    notEmpty(): boolean{
        return this.size > 0;
    }

    /** @return 集合是否为空. */
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

    /** 清空集合并将备份数组缩减为指定容量 / loadFactor, 若更大. */
    clear(maximumCapacity: number): void{
        const ts = tableSize(maximumCapacity, this.loadFactor);
        if(this.keyTable.length <= ts){
            this.clear();
            return;
        }
        this.size = 0;
        this.hasZeroValue = false;
        this.resize(ts);
    }

    clear(): void{
        if(this.size === 0) return;
        this.size = 0;
        for(let i = 0; i < this.keyTable.length; i++) this.keyTable[i] = 0;
        this.hasZeroValue = false;
    }

    contains(key: number): boolean{
        if(key === 0) return this.hasZeroValue;
        return this.locateKey(key) >= 0;
    }

    first(): number{
        if(this.hasZeroValue) return 0;
        const keyTable = this.keyTable;
        for(let i = 0, n = keyTable.length; i < n; i++)
            if(keyTable[i] !== 0) return keyTable[i];
        throw new Error("IntSet is empty.");
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

        this.keyTable = new Array<number>(newSize).fill(0);

        if(this.size > 0){
            for(let i = 0; i < oldCapacity; i++){
                const key = oldKeyTable[i];
                if(key !== 0) this.addResize(key);
            }
        }
    }

    hashCode(): number{
        let h = this.size;
        const keyTable = this.keyTable;
        for(let i = 0, n = keyTable.length; i < n; i++){
            const key = keyTable[i];
            if(key !== 0) h = (h + key) | 0;
        }
        return h;
    }

    equals(obj: unknown): boolean{
        if(!(obj instanceof IntSet)) return false;
        const other = obj as IntSet;
        if(other.size !== this.size) return false;
        if(other.hasZeroValue !== this.hasZeroValue) return false;
        const keyTable = this.keyTable;
        for(let i = 0, n = keyTable.length; i < n; i++)
            if(keyTable[i] !== 0 && !other.contains(keyTable[i])) return false;
        return true;
    }

    toString(): string{
        if(this.size === 0) return "[]";
        let buffer = "[";
        const keyTable = this.keyTable;
        let i = keyTable.length;
        if(this.hasZeroValue)
            buffer += "0";
        else{
            while(i-- > 0){
                const key = keyTable[i];
                if(key === 0) continue;
                buffer += String(key);
                break;
            }
        }
        while(i-- > 0){
            const key = keyTable[i];
            if(key === 0) continue;
            buffer += ", ";
            buffer += String(key);
        }
        buffer += "]";
        return buffer;
    }

    /**
     * 返回集合元素的迭代器. 支持 remove.
     */
    iterator(): IntSetIterator{
        if(this.iterator1 == null){
            this.iterator1 = new IntSetIterator(this);
            this.iterator2 = new IntSetIterator(this);
        }
        if(!this.iterator1.valid){
            this.iterator1.reset();
            this.iterator1.valid = true;
            this.iterator2.valid = false;
            return this.iterator1;
        }
        this.iterator2.reset();
        this.iterator2.valid = true;
        this.iterator1.valid = false;
        return this.iterator2;
    }

    /** JS for..of 支持. */
    [Symbol.iterator](){
        return jsIterator(this.iterator());
    }

    static with(...array: number[]): IntSet{
        const set = new IntSet(array.length);
        set.addAll(array);
        return set;
    }
}

export class IntSetIterator{
    private hasNextValue = false;

    readonly set: IntSet;
    nextIndex = 0;
    currentIndex = 0;
    valid = true;

    constructor(set: IntSet){
        this.set = set;
        this.reset();
    }

    reset(): void{
        this.currentIndex = -2; // INDEX_ILLEGAL
        this.nextIndex = -1; // INDEX_ZERO
        if(this.set.hasZeroValue)
            this.hasNextValue = true;
        else
            this.findNextIndex();
    }

    private findNextIndex(): void{
        const keyTable = this.set.keyTable;
        for(let n = keyTable.length; ++this.nextIndex < n; ){
            if(keyTable[this.nextIndex] !== 0){
                this.hasNextValue = true;
                return;
            }
        }
        this.hasNextValue = false;
    }

    remove(): void{
        let i = this.currentIndex;
        if(i === -1 && this.set.hasZeroValue){
            this.set.hasZeroValue = false;
        }else if(i < 0){
            throw new Error("next must be called before remove.");
        }else{
            const keyTable = this.set.keyTable;
            const mask = this.set.mask;
            let next = i + 1 & mask;
            let key: number;
            while((key = keyTable[next]) !== 0){
                const placement = this.set.place(key);
                if((next - placement & mask) > (i - placement & mask)){
                    keyTable[i] = key;
                    i = next;
                }
                next = next + 1 & mask;
            }
            keyTable[i] = 0;
            if(i !== this.currentIndex) --this.nextIndex;
        }
        this.currentIndex = -2;
        this.set.size--;
    }

    hasNext(): boolean{
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        return this.hasNextValue;
    }

    next(): number{
        if(!this.hasNextValue) throw new Error("NoSuchElementException");
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        const key = this.nextIndex === -1 ? 0 : this.set.keyTable[this.nextIndex];
        this.currentIndex = this.nextIndex;
        this.findNextIndex();
        return key;
    }

    /** @return 包含剩余 key 的新数组. */
    toArray(): IntSeq{
        const array = new IntSeq(true, this.set.size);
        while(this.hasNextValue)
            array.add(this.next());
        return array;
    }

    [Symbol.iterator](){
        return jsIterator(this);
    }
}
