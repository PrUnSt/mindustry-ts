// 源: arc-core/src/arc/struct/OrderedSet.java
// 迁移说明: 在 ObjectSet 基础上额外用 Seq 按插入顺序保存 key. 迭代有序且比无序 set 快.
import {ObjectSet, ObjectSetIterator} from './ObjectSet';
import {hashOf} from './Hash';
import {Seq} from './Seq';

/**
 * 同时按插入顺序在 {@link Seq} 中保存 key 的 {@link ObjectSet}. 迭代有序.
 */
export class OrderedSet<T> extends ObjectSet<T>{
    readonly items: Seq<T>;
    private orderedIterator1: OrderedSetIterator<T> | null = null;
    private orderedIterator2: OrderedSetIterator<T> | null = null;

    constructor();
    constructor(initialCapacity: number);
    constructor(initialCapacity: number, loadFactor: number);
    constructor(set: OrderedSet<T>);
    constructor(a?: any, b?: any){
        super(a instanceof OrderedSet ? 51 : (a === undefined ? 51 : (a as number)), b === undefined ? 0.8 : (b as number));
        if(a instanceof OrderedSet){
            const set = a as OrderedSet<T>;
            // 直接拷贝基础哈希表 (Java: super(set) 即 ObjectSet 拷贝构造).
            this.keyTable = set.keyTable.slice();
            this.size = set.size;
            this.threshold = set.threshold;
            this.mask = set.mask;
            this.shift = set.shift;
            this.loadFactor = set.loadFactor;
            this.items = new Seq<T>(set.items);
            return;
        }
        this.items = new Seq<T>(a === undefined ? 16 : (a as number));
    }

    add(key: T): boolean;
    add(key: T, index: number): boolean;
    add(key: T, index?: number): boolean{
        if(index === undefined){
            if(!super.add(key)) return false;
            this.items.add(key);
            return true;
        }
        if(!super.add(key)){
            const oldIndex = this.items.indexOf(key, true);
            if(oldIndex !== index) this.items.insert(index, this.items.remove(oldIndex));
            return false;
        }
        this.items.insert(index, key);
        return true;
    }

    addAll(array: Seq<T>): void;
    addAll(array: Seq<T>, offset: number, length: number): void;
    addAll(array: T[]): boolean;
    addAll(...array: T[]): boolean;
    addAll(array: T[], offset: number, length: number): boolean;
    addAll(set: OrderedSet<T>): void;
    addAll(...args: any[]): any{
        if(args.length === 1 && args[0] instanceof OrderedSet){
            const set = args[0] as OrderedSet<T>;
            this.ensureCapacity(set.size);
            const keys = set.items.items;
            for(let i = 0, n = set.items.size; i < n; i++)
                this.add(keys[i]);
            return undefined;
        }
        return (super.addAll as (...a: any[]) => any)(...args);
    }

    ensureCapacity(additionalCapacity: number): void{
        super.ensureCapacity(additionalCapacity);
        this.items.ensureCapacity(additionalCapacity);
    }

    remove(key: T): boolean{
        if(!super.remove(key)) return false;
        this.items.remove(key, false);
        return true;
    }

    removeIndex(index: number): T{
        const key = this.items.remove(index);
        super.remove(key);
        return key;
    }

    /**
     * 将元素 {@code before} 改为 {@code after} 而不改变其顺序位置. 若 {@code after} 已存在或 {@code before} 不存在返回 false.
     */
    alter(before: T, after: T): boolean{
        if(this.contains(after)) return false;
        if(!super.remove(before)) return false;
        super.add(after);
        this.items.set(this.items.indexOf(before, false), after);
        return true;
    }

    /**
     * 将顺序中给定 {@code index} 处的元素改为 {@code after}, 不改变其他元素顺序. 常量时间.
     */
    alterIndex(index: number, after: T): boolean{
        if(index < 0 || index >= this.size || this.contains(after)) return false;
        super.remove(this.items.get(index));
        super.add(after);
        this.items.set(index, after);
        return true;
    }

    clear(maximumCapacity: number): void;
    clear(): void;
    clear(maximumCapacity?: number): void{
        if(maximumCapacity !== undefined){
            this.items.clear();
            super.clear(maximumCapacity);
            return;
        }
        this.items.clear();
        super.clear();
    }
    orderedItems(): Seq<T>{
        return this.items;
    }

    first(): T{
        return this.items.first();
    }

    hashCode(): number{
        let h = this.size;
        const items = this.items.items;
        for(let i = 0, n = this.items.size; i < n; i++){
            const key = items[i];
            if(key !== null && key !== undefined) h = (h + hashOf(key)) | 0;
        }
        return h;
    }

    equals(obj: unknown): boolean{
        if(!(obj instanceof ObjectSet)) return false;
        const other = obj as ObjectSet<unknown>;
        if(other.size !== this.size) return false;
        const items = this.items.items;
        for(let i = 0, n = this.items.size; i < n; i++)
            if(items[i] !== null && items[i] !== undefined && !other.contains(items[i] as T)) return false;
        return true;
    }

    iterator(): OrderedSetIterator<T>{
        if(this.orderedIterator1 == null){
            this.orderedIterator1 = new OrderedSetIterator<T>(this);
            this.orderedIterator2 = new OrderedSetIterator<T>(this);
        }
        const orderedIterator1 = this.orderedIterator1!;
        const orderedIterator2 = this.orderedIterator2!;
        if(!orderedIterator1.valid){
            orderedIterator1.reset();
            orderedIterator1.valid = true;
            orderedIterator2.valid = false;
            return orderedIterator1;
        }
        orderedIterator2.reset();
        orderedIterator2.valid = true;
        orderedIterator1.valid = false;
        return orderedIterator2;
    }

    toString(): string;
    toString(separator: string): string;
    toString(separator?: string): string{
        if(separator === undefined){
            if(this.size === 0) return "{}";
            const items = this.items.items;
            let buffer = "{";
            buffer += String(items[0]);
            for(let i = 1; i < this.size; i++){
                buffer += ", ";
                buffer += String(items[i]);
            }
            buffer += "}";
            return buffer;
        }
        return this.items.toString(separator);
    }
}

export class OrderedSetIterator<K> extends ObjectSetIterator<K>{
    private readonly items: Seq<K>;

    constructor(set: OrderedSet<K>){
        super(set);
        this.items = set.items;
    }

    reset(): void{
        this.nextIndex = 0;
        this.hasNextValue = this.set.size > 0;
    }

    next(): K{
        if(!this.hasNextValue) throw new Error("NoSuchElementException");
        if(!this.valid) throw new Error("#iterator() cannot be used nested.");
        const key = this.items.get(this.nextIndex);
        this.nextIndex++;
        this.hasNextValue = this.nextIndex < this.set.size;
        return key;
    }

    remove(): void{
        if(this.nextIndex < 0) throw new Error("next must be called before remove.");
        this.nextIndex--;
        (this.set as unknown as OrderedSet<K>).removeIndex(this.nextIndex);
    }

    toSeq(array: Seq<K>): Seq<K>;
    toSeq(): Seq<K>;
    toSeq(array?: Seq<K>): Seq<K>{
        if(array === undefined){
            array = new Seq<K>(true, this.set.size - this.nextIndex);
        }
        array.addAll(this.items, this.nextIndex, this.items.size - this.nextIndex);
        this.nextIndex = this.items.size;
        this.hasNextValue = false;
        return array;
    }
}
