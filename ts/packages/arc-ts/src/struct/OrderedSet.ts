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
        if(a instanceof OrderedSet){
            super(a as OrderedSet<T>);
            this.items = new Seq<T>((a as OrderedSet<T>).items);
            return;
        }
        if(b !== undefined){
            super(a as number, b as number);
            this.items = new Seq<T>(a as number);
            return;
        }
        if(a !== undefined){
            super(a as number);
            this.items = new Seq<T>(a as number);
            return;
        }
        super();
        this.items = new Seq<T>();
    }

    add(key: T): boolean{
        if(!super.add(key)) return false;
        this.items.add(key);
        return true;
    }

    /**
     * 将 key 放到指定索引. 若 key 已存在返回 false 且 (如需要) 改变其索引.
     */
    add(key: T, index: number): boolean{
        if(!super.add(key)){
            const oldIndex = this.items.indexOf(key, true);
            if(oldIndex !== index) this.items.insert(index, this.items.remove(oldIndex));
            return false;
        }
        this.items.insert(index, key);
        return true;
    }

    addAll(set: OrderedSet<T>): void{
        this.ensureCapacity(set.size);
        const keys = set.items.items;
        for(let i = 0, n = set.items.size; i < n; i++)
            this.add(keys[i]);
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

    clear(maximumCapacity: number): void{
        this.items.clear();
        super.clear(maximumCapacity);
    }

    clear(): void{
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
        if(!this.orderedIterator1.valid){
            this.orderedIterator1.reset();
            this.orderedIterator1.valid = true;
            this.orderedIterator2.valid = false;
            return this.orderedIterator1;
        }
        this.orderedIterator2.reset();
        this.orderedIterator2.valid = true;
        this.orderedIterator1.valid = false;
        return this.orderedIterator2;
    }

    toString(): string{
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

    toString(separator: string): string{
        return this.items.toString(separator);
    }

    static with<T>(...array: T[]): OrderedSet<T>{
        const set = new OrderedSet<T>();
        set.addAll(array as any);
        return set;
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

    toSeq(array: Seq<K>): Seq<K>{
        array.addAll(this.items, this.nextIndex, this.items.size - this.nextIndex);
        this.nextIndex = this.items.size;
        this.hasNextValue = false;
        return array;
    }

    toSeq(): Seq<K>{
        return this.toSeq(new Seq<K>(true, this.set.size - this.nextIndex));
    }
}
