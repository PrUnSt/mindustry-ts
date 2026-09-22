// 源: arc-core/src/arc/struct/Seq.java
// 迁移说明: 可扩容、有序/无序的对象数组. 无序时 remove 把最后一个元素移到被删位置以避免内存拷贝.
// items 用 T[] 表示 (Java 的 T[] 备份数组); null 写入通过 as any 完成 (TS strict 下 T 不含 null).
import {Mathf, Rand} from './Mathf';
import {hashOf, identityHashOf, equalsOf} from './Hash';
import {jsIterator} from './Iterators';
import {Cons, Boolf, Func, Func2, Intf, Floatf, Prov, Comparator} from './Funcs';
import {ObjectMap} from './ObjectMap';
import {ObjectIntMap} from './ObjectIntMap';
import {ObjectSet} from './ObjectSet';
import {IntSeq} from './IntSeq';
import {FloatSeq} from './FloatSeq';

/** 调试用: 统计分配的迭代器总数. */
export let iteratorsAllocated = 0;

/** 可扩容、有序或无序的对象数组. 无序时, 移除元素会把最后一个元素移到被删位置, 避免内存拷贝. */
export class Seq<T>{
    /** 提供对底层数组的直接访问. */
    items: T[];
    size = 0;
    ordered: boolean;

    private iterable: SeqIterable<T> | null = null;

    /** 创建一个容量为 16 的有序数组. */
    constructor();
    /** 创建指定容量的有序数组. */
    constructor(capacity: number);
    /** 创建指定有序性的数组, 容量 16. */
    constructor(ordered: boolean);
    /** 创建指定有序性与容量的数组. */
    constructor(ordered: boolean, capacity: number);
    /** 创建底层数组为指定类型的数组 (arrayType 在 TS 中无实际作用, 仅为签名兼容). */
    constructor(ordered: boolean, capacity: number, arrayType: unknown);
    /** 创建底层数组为指定类型的数组, 容量 16. */
    constructor(arrayType: unknown);
    /** 复制构造: 包含指定数组中的元素. */
    constructor(array: Seq<T>);
    /** 包含指定数组元素的新的有序数组. */
    constructor(array: T[]);
    /** 包含指定数组中 [start, start+count) 元素的新的数组. */
    constructor(ordered: boolean, array: T[], start: number, count: number);
    constructor(a?: unknown, b?: unknown, c?: unknown, d?: unknown){
        if(a === undefined){
            this.ordered = true;
            this.items = new Array<T>(16);
        }else if(typeof a === 'boolean'){
            this.ordered = a;
            if(b === undefined){
                this.items = new Array<T>(16);
            }else if(typeof b === 'number'){
                if(c === undefined){
                    this.items = new Array<T>(b);
                }else{
                    // Seq(boolean, int, Class) -> arrayType 忽略
                    this.items = new Array<T>(b);
                }
            }else if(b instanceof Seq){
                // 实际不会走到这里 (Seq 复制构造是单参), 保险处理
                this.items = new Array<T>(b.size);
                this.size = b.size;
                for(let i = 0; i < this.size; i++) this.items[i] = b.items[i];
            }else if(Array.isArray(b)){
                // Seq(boolean, T[], start, count)
                const array = b as T[];
                const start = (c as number) | 0;
                const count = (d as number) | 0;
                this.items = new Array<T>(count);
                this.size = count;
                for(let i = 0; i < count; i++) this.items[i] = array[start + i];
            }else{
                this.items = new Array<T>(16);
            }
        }else if(a instanceof Seq){
            this.ordered = a.ordered;
            this.items = new Array<T>(a.size);
            this.size = a.size;
            for(let i = 0; i < this.size; i++) this.items[i] = a.items[i];
        }else if(Array.isArray(a)){
            const array = a as T[];
            this.ordered = true;
            this.items = new Array<T>(array.length);
            this.size = array.length;
            for(let i = 0; i < array.length; i++) this.items[i] = array[i];
        }else if(typeof a === 'number'){
            this.ordered = true;
            this.items = new Array<T>(a);
        }else{
            // Seq(Class<?>) -> arrayType 忽略
            this.ordered = true;
            this.items = new Array<T>(16);
        }
    }

    static withArrays<T>(...arrays: unknown[]): Seq<T>{
        const result = new Seq<T>();
        for(const a of arrays){
            if(a instanceof Seq){
                result.addAll(a as Seq<T>);
            }else{
                result.add(a as T);
            }
        }
        return result;
    }

    /** @see Seq(T[]) */
    static with<T>(...array: T[]): Seq<T>;
    /** 从可迭代对象创建数组. */
    static with<T>(iterable: Iterable<T>): Seq<T>;
    static with<T>(...arrayOrIterable: any[]): Seq<T>{
        if(arrayOrIterable.length === 1){
            const arg = arrayOrIterable[0];
            if(arg != null && typeof arg === 'object' && !Array.isArray(arg)){
                const out = new Seq<T>();
                const it: any = typeof arg.iterator === 'function' ? arg.iterator() : (typeof arg[Symbol.iterator] === 'function' ? arg[Symbol.iterator]() : null);
                if(it){
                    if(typeof it.next === 'function' && typeof it.hasNext === 'function'){
                        while(it.hasNext()) out.add(it.next());
                    }else if(typeof it.next === 'function'){
                        let r: IteratorResult<T>;
                        while(!(r = it.next()).done) out.add(r.value);
                    }
                    return out;
                }
            }
        }
        return new Seq<T>(arrayOrIterable as T[]);
    }

    static map<T, V>(array: T[], mapper: Func<T, V>): Seq<V>{
        const result = new Seq<V>(array.length);
        for(let i = 0; i < array.length; i++){
            result.add(mapper(array[i]));
        }
        return result;
    }

    /** @see Seq(T[]) */
    static select<T>(array: T[], test: Boolf<T>): Seq<T>{
        const out = new Seq<T>(array.length);
        for(const t of array){
            if(test(t)){
                out.add(t);
            }
        }
        return out;
    }

    asMap<K, V>(keygen: Func<T, K>, valgen: Func<T, V>): ObjectMap<K, V>{
        const map = new ObjectMap<K, V>();
        for(let i = 0; i < this.size; i++){
            map.put(keygen(this.items[i]), valgen(this.items[i]));
        }
        return map;
    }

    groupBy<K>(keygen: Func<T, K>): ObjectMap<K, Seq<T>>{
        const map = new ObjectMap<K, Seq<T>>();
        for(let i = 0; i < this.size; i++){
            const item = this.items[i];
            map.get(keygen(item), () => new Seq<T>()).add(item);
        }
        return map;
    }

    groupByCount<K>(keygen: Func<T, K>): ObjectIntMap<K>{
        const map = new ObjectIntMap<K>();
        for(let i = 0; i < this.size; i++){
            map.increment(keygen(this.items[i]));
        }
        return map;
    }

    asMap<K>(keygen: Func<T, K>): ObjectMap<K, T>{
        return this.asMap(keygen, t => t);
    }

    asSet(): ObjectSet<T>{
        return ObjectSet.with(this);
    }

    copy(): Seq<T>{
        return new Seq<T>(this);
    }

    /** ArrayList 的等价物: 返回一个普通 JS 数组. */
    list(): T[]{
        const list: T[] = [];
        this.each(t => list.push(t));
        return list;
    }

    sumf(summer: Floatf<T>): number{
        let sum = 0;
        for(let i = 0; i < this.size; i++){
            sum += summer(this.items[i]);
        }
        return sum;
    }

    sum(summer: Intf<T>): number{
        let sum = 0;
        for(let i = 0; i < this.size; i++){
            sum += summer(this.items[i]);
        }
        return sum;
    }

    each(pred: Boolf<T>, consumer: Cons<T>): void{
        for(let i = 0; i < this.size; i++){
            if(pred(this.items[i])) consumer(this.items[i]);
        }
    }

    each(consumer: Cons<T>): void{
        for(let i = 0; i < this.size; i++){
            consumer(this.items[i]);
        }
    }

    /** 原地替换值, 不创建新数组. */
    replace(mapper: Func<T, T>): void;
    /** 将第一个出现的 from 替换为 to. @return 是否有元素被替换. */
    replace(from: T, to: T): boolean;
    replace(a: any, b?: any): any{
        if(arguments.length === 2){
            const idx = this.indexOf(a);
            if(idx !== -1){
                this.items[idx] = b;
                return true;
            }
            return false;
        }
        const mapper: Func<T, T> = a;
        for(let i = 0; i < this.size; i++){
            this.items[i] = mapper(this.items[i]);
        }
        return undefined;
    }

    /** 将数组的数组扁平化为一个数组. 分配新实例. */
    flatten<R>(): Seq<R>{
        const arr = new Seq<R>();
        for(let i = 0; i < this.size; i++){
            arr.addAll((this.items[i] as unknown) as Seq<R>);
        }
        return arr;
    }

    /** @return 包含映射值的新数组. */
    flatMap<R>(mapper: Func<T, Iterable<R>>): Seq<R>{
        const arr = new Seq<R>(this.size);
        for(let i = 0; i < this.size; i++){
            arr.addAll(mapper(this.items[i]));
        }
        return arr;
    }

    /** @return 包含映射值的新数组. */
    map<R>(mapper: Func<T, R>): Seq<R>{
        const arr = new Seq<R>(this.size);
        for(let i = 0; i < this.size; i++){
            arr.add(mapper(this.items[i]));
        }
        return arr;
    }

    /** @return 包含映射值的新 int 数组. */
    mapInt(mapper: Intf<T>): IntSeq{
        const arr = new IntSeq(this.size);
        for(let i = 0; i < this.size; i++){
            arr.add(mapper(this.items[i]));
        }
        return arr;
    }

    /** @return 包含映射值的新 int 数组. */
    mapInt(mapper: Intf<T>, retain: Boolf<T>): IntSeq{
        const arr = new IntSeq(this.size);
        for(let i = 0; i < this.size; i++){
            const item = this.items[i];
            if(retain(item)){
                arr.add(mapper(item));
            }
        }
        return arr;
    }

    /** @return 包含映射值的新 float 数组. */
    mapFloat(mapper: Floatf<T>): FloatSeq{
        const arr = new FloatSeq(this.size);
        for(let i = 0; i < this.size; i++){
            arr.add(mapper(this.items[i]));
        }
        return arr;
    }

    reduce<R>(initial: R, reducer: Func2<T, R, R>): R{
        let result = initial;
        for(let i = 0; i < this.size; i++){
            result = reducer(this.items[i], result);
        }
        return result;
    }

    allMatch(predicate: Boolf<T>): boolean{
        for(let i = 0; i < this.size; i++){
            if(!predicate(this.items[i])){
                return false;
            }
        }
        return true;
    }

    contains(predicate: Boolf<T>): boolean{
        for(let i = 0; i < this.size; i++){
            if(predicate(this.items[i])){
                return true;
            }
        }
        return false;
    }

    min(func: Comparator<T>): T | null;
    min(filter: Boolf<T>, func: Floatf<T>): T | null;
    min(filter: Boolf<T>, func: Comparator<T>): T | null;
    min(func: Floatf<T>): T | null;
    min(...args: any[]): T | null{
        const func = args[args.length - 1];
        const filter = args.length === 2 ? args[0] : null;
        if(filter != null){
            if(func.length >= 2){
                // filter + Comparator
                let result: T | null = null;
                for(let i = 0; i < this.size; i++){
                    const t = this.items[i];
                    if(filter(t) && (result == null || (func as Comparator<T>)(result, t) > 0)){
                        result = t;
                    }
                }
                return result;
            }
            // filter + Floatf
            let result: T | null = null;
            let min = Number.MAX_VALUE;
            for(let i = 0; i < this.size; i++){
                const t = this.items[i];
                if(!filter(t)) continue;
                const val = (func as Floatf<T>)(t);
                if(val <= min){
                    result = t;
                    min = val;
                }
            }
            return result;
        }
        // Comparator 或 Floatf
        if(func.length >= 2){
            // Comparator: (a, b) => number
            let result: T | null = null;
            for(let i = 0; i < this.size; i++){
                const t = this.items[i];
                if(result == null || (func as Comparator<T>)(result, t) > 0){
                    result = t;
                }
            }
            return result;
        }
        // Floatf: (t) => number
        let result: T | null = null;
        let min = Number.MAX_VALUE;
        for(let i = 0; i < this.size; i++){
            const t = this.items[i];
            const val = (func as Floatf<T>)(t);
            if(val <= min){
                result = t;
                min = val;
            }
        }
        return result;
    }

    max(func: Comparator<T>): T | null;
    max(func: Floatf<T>): T | null;
    max(...args: any[]): T | null{
        const func = args[0];
        if(func.length >= 2){
            let result: T | null = null;
            for(let i = 0; i < this.size; i++){
                const t = this.items[i];
                if(result == null || (func as Comparator<T>)(result, t) < 0){
                    result = t;
                }
            }
            return result;
        }
        let result: T | null = null;
        let max = Number.NEGATIVE_INFINITY;
        for(let i = 0; i < this.size; i++){
            const t = this.items[i];
            const val = (func as Floatf<T>)(t);
            if(val >= max){
                result = t;
                max = val;
            }
        }
        return result;
    }

    find(predicate: Boolf<T>): T | null{
        for(let i = 0; i < this.size; i++){
            if(predicate(this.items[i])){
                return this.items[i];
            }
        }
        return null;
    }

    with(cons: Cons<Seq<T>>): Seq<T>{
        cons(this);
        return this;
    }

    /**
     * 仅当值不在序列中时添加.
     * @return 该值此前是否不在序列中.
     */
    addUnique(value: T): boolean{
        if(!this.contains(value)){
            this.add(value);
            return true;
        }
        return false;
    }

    add(value: T): Seq<T>;
    add(value1: T, value2: T): Seq<T>;
    add(value1: T, value2: T, value3: T): Seq<T>;
    add(value1: T, value2: T, value3: T, value4: T): Seq<T>;
    add(array: Seq<T>): Seq<T>;
    add(array: T[]): Seq<T>;
    add(...args: any[]): Seq<T>{
        const items = this.items;
        if(args.length === 1){
            const a = args[0];
            if(a instanceof Seq){
                return this.addAll(a.items, 0, a.size);
            }
            if(Array.isArray(a)){
                return this.addAll(a, 0, a.length);
            }
            if(this.size === items.length) this.resize(Math.max(8, Math.floor(this.size * 1.75)));
            items[this.size++] = a;
            return this;
        }
        if(args.length === 2){
            if(this.size + 1 >= items.length) this.resize(Math.max(8, Math.floor(this.size * 1.75)));
            items[this.size] = args[0];
            items[this.size + 1] = args[1];
            this.size += 2;
        }else if(args.length === 3){
            if(this.size + 2 >= items.length) this.resize(Math.max(8, Math.floor(this.size * 1.75)));
            items[this.size] = args[0];
            items[this.size + 1] = args[1];
            items[this.size + 2] = args[2];
            this.size += 3;
        }else{
            if(this.size + 3 >= items.length) this.resize(Math.max(8, Math.floor(this.size * 1.8))); // 1.75 在 size=5 时不够
            items[this.size] = args[0];
            items[this.size + 1] = args[1];
            items[this.size + 2] = args[2];
            items[this.size + 3] = args[3];
            this.size += 4;
        }
        return this;
    }

    addAll(array: Seq<T>): Seq<T>;
    addAll(array: Seq<T>, start: number, count: number): Seq<T>;
    addAll(...array: T[]): Seq<T>;
    addAll(array: T[], start: number, count: number): Seq<T>;
    addAll(items: Iterable<T>): Seq<T>;
    addAll(...args: any[]): Seq<T>{
        if(args.length === 1){
            const a = args[0];
            if(a instanceof Seq){
                return this.addAll(a.items, 0, a.size);
            }
            if(a && typeof a === 'object' && !Array.isArray(a) && typeof a[Symbol.iterator] === 'function'){
                for(const t of a as Iterable<T>){
                    this.add(t);
                }
                return this;
            }
            return this.addAll(a as T[], 0, (a as T[]).length);
        }
        const array: T[] = args[0];
        const start = args[1];
        const count = args[2];
        let items = this.items;
        const sizeNeeded = this.size + count;
        if(sizeNeeded > items.length) items = this.resize(Math.max(8, Math.floor(sizeNeeded * 1.75)));
        for(let i = 0; i < count; i++){
            items[this.size + i] = array[start + i];
        }
        this.size += count;
        return this;
    }

    /** 将本数组内容设置为指定数组. */
    set(array: Seq<T>): void;
    set(array: T[]): void;
    set(array: any): void{
        if(array === this) return;
        this.clear();
        if(array instanceof Seq){
            this.addAll(array.items, 0, array.size);
        }else{
            this.addAll(array as T[]);
        }
    }

    getFrac(index: number): T | null{
        if(this.isEmpty()) return null;
        return this.get(Mathf.clamp(Math.floor(index * this.size), 0, this.size - 1));
    }

    get(index: number): T{
        if(index >= this.size) throw new Error("index can't be >= size: " + index + " >= " + this.size);
        return this.items[index];
    }

    set(index: number, value: T): void{
        if(index >= this.size) throw new Error("index can't be >= size: " + index + " >= " + this.size);
        this.items[index] = value;
    }

    insert(index: number, value: T): void{
        if(index > this.size) throw new Error("index can't be > size: " + index + " > " + this.size);
        let items = this.items;
        if(this.size === items.length) items = this.resize(Math.max(8, Math.floor(this.size * 1.75)));
        if(this.ordered){
            for(let i = this.size; i > index; i--) items[i] = items[i - 1];
        }else{
            items[this.size] = items[index];
        }
        this.size++;
        items[index] = value;
    }

    swap(first: number, second: number): void{
        if(first >= this.size) throw new Error("first can't be >= size: " + first + " >= " + this.size);
        if(second >= this.size) throw new Error("second can't be >= size: " + second + " >= " + this.size);
        const items = this.items;
        const firstValue = items[first];
        items[first] = items[second];
        items[second] = firstValue;
    }

    /** @return 本序列是否包含另一序列中的每个元素. */
    containsAll(seq: Seq<T>): boolean;
    containsAll(seq: Seq<T>, identity: boolean): boolean;
    containsAll(seq: Seq<T>, identity: boolean = false): boolean{
        const others = seq.items;
        for(let i = 0; i < seq.size; i++){
            if(!this.contains(others[i], identity)){
                return false;
            }
        }
        return true;
    }

    contains(value: T): boolean;
    contains(value: T, identity: boolean): boolean;
    contains(value: T, identity: boolean = false): boolean{
        const items = this.items;
        let i = this.size - 1;
        if(identity || value === null || value === undefined){
            while(i >= 0)
                if(items[i--] === value) return true;
        }else{
            while(i >= 0){
                const item = items[i--];
                if(equalsOf(value, item)) return true;
            }
        }
        return false;
    }

    indexOf(value: T): number;
    indexOf(value: T, identity: boolean): number;
    indexOf(value: T, identity: boolean = false): number{
        const items = this.items;
        if(identity || value === null || value === undefined){
            for(let i = 0, n = this.size; i < n; i++)
                if(items[i] === value) return i;
        }else{
            for(let i = 0, n = this.size; i < n; i++)
                if(equalsOf(value, items[i])) return i;
        }
        return -1;
    }

    indexOf(value: Boolf<T>): number{
        const items = this.items;
        for(let i = 0, n = this.size; i < n; i++)
            if(value(items[i])) return i;
        return -1;
    }

    /**
     * 返回 value 在数组中最后一次出现的索引, 不存在则 -1. 从数组末尾开始搜索.
     */
    lastIndexOf(value: T, identity: boolean): number{
        const items = this.items;
        if(identity || value === null || value === undefined){
            for(let i = this.size - 1; i >= 0; i--)
                if(items[i] === value) return i;
        }else{
            for(let i = this.size - 1; i >= 0; i--)
                if(equalsOf(value, items[i])) return i;
        }
        return -1;
    }

    /** 不使用 identity 移除一个值. */
    remove(value: T): boolean;
    /** 按谓词移除单个值. @return 是否找到并移除了元素. */
    remove(value: Boolf<T>): boolean;
    /** 移除值的第一个实例. */
    remove(value: T, identity: boolean): boolean;
    /** 移除并返回指定索引处的元素. */
    remove(index: number): T;
    remove(valueOrIndex: any, identity: boolean = false): any{
        if(typeof valueOrIndex === 'number'){
            const index = valueOrIndex;
            if(index >= this.size) throw new Error("index can't be >= size: " + index + " >= " + this.size);
            const items = this.items;
            const value = items[index];
            this.size--;
            if(this.ordered){
                for(let i = index; i < this.size; i++) items[i] = items[i + 1];
            }else{
                items[index] = items[this.size];
            }
            (items[this.size] as any) = null;
            return value;
        }
        if(typeof valueOrIndex === 'function'){
            const value = valueOrIndex as Boolf<T>;
            for(let i = 0; i < this.size; i++){
                if(value(this.items[i])){
                    this.remove(i);
                    return true;
                }
            }
            return false;
        }
        const value = valueOrIndex;
        const items = this.items;
        if(identity || value === null || value === undefined){
            for(let i = 0, n = this.size; i < n; i++){
                if(items[i] === value){
                    this.remove(i);
                    return true;
                }
            }
        }else{
            for(let i = 0, n = this.size; i < n; i++){
                if(equalsOf(value, items[i])){
                    this.remove(i);
                    return true;
                }
            }
        }
        return false;
    }

    /** 移除 [start, end] 区间 (含端点) 内的元素. */
    removeRange(start: number, end: number): void{
        if(end >= this.size) throw new Error("end can't be >= size: " + end + " >= " + this.size);
        if(start > end) throw new Error("start can't be > end: " + start + " > " + end);
        const items = this.items;
        const count = end - start + 1;
        if(this.ordered){
            for(let i = start; i < this.size - count; i++) items[i] = items[i + count];
            for(let i = this.size - count; i < this.size; i++) (items[i] as any) = null;
        }else{
            const lastIndex = this.size - 1;
            for(let i = 0; i < count; i++)
                items[start + i] = items[lastIndex - i];
        }
        this.size -= count;
    }

    /** @return 本对象 */
    removeAll(pred: Boolf<T>): Seq<T>{
        const iter = this.iterator();
        while(iter.hasNext()){
            if(pred(iter.next())){
                iter.remove();
            }
        }
        return this;
    }

    removeAll(array: Seq<T>): boolean;
    removeAll(array: Seq<T>, identity: boolean): boolean;
    removeAll(array: Seq<T>, identity: boolean = false): boolean{
        let size = this.size;
        const startSize = size;
        const items = this.items;
        if(identity){
            for(let i = 0, n = array.size; i < n; i++){
                const item = array.get(i);
                for(let ii = 0; ii < size; ii++){
                    if(item === items[ii]){
                        this.remove(ii);
                        size--;
                        break;
                    }
                }
            }
        }else{
            for(let i = 0, n = array.size; i < n; i++){
                const item = array.get(i);
                for(let ii = 0; ii < size; ii++){
                    if(equalsOf(item, items[ii])){
                        this.remove(ii);
                        size--;
                        break;
                    }
                }
            }
        }
        return size !== startSize;
    }

    /** 若数组为空, 返回构造器生成的对象; 否则同 pop(). */
    pop(constructor: Prov<T>): T{
        if(this.size === 0) return constructor();
        return this.pop();
    }

    /** 移除并返回最后一个元素. */
    pop(): T{
        if(this.size === 0) throw new Error("Array is empty.");
        --this.size;
        const item = this.items[this.size];
        (this.items[this.size] as any) = null;
        return item;
    }

    /** 返回最后一个元素. */
    peek(): T{
        if(this.size === 0) throw new Error("Array is empty.");
        return this.items[this.size - 1];
    }

    /** 返回第一个元素. */
    first(): T{
        if(this.size === 0) throw new Error("Array is empty.");
        return this.items[0];
    }

    /** 返回第一个元素, 空数组返回 null. */
    firstOpt(): T | null{
        if(this.size === 0) return null;
        return this.items[0];
    }

    /** @return 数组是否为空. */
    isEmpty(): boolean{
        return this.size === 0;
    }

    any(): boolean{
        return this.size > 0;
    }

    clear(): Seq<T>{
        const items = this.items;
        for(let i = 0, n = this.size; i < n; i++)
            (items[i] as any) = null;
        this.size = 0;
        return this;
    }

    /**
     * 将备份数组缩减到实际元素个数.
     * @return {@link #items}
     */
    shrink(): T[]{
        if(this.items.length !== this.size) this.resize(this.size);
        return this.items;
    }

    /**
     * 扩大备份数组以容纳指定数量的额外元素.
     * @return {@link #items}
     */
    ensureCapacity(additionalCapacity: number): T[]{
        if(additionalCapacity < 0)
            throw new Error("additionalCapacity must be >= 0: " + additionalCapacity);
        const sizeNeeded = this.size + additionalCapacity;
        if(sizeNeeded > this.items.length) this.resize(Math.max(8, sizeNeeded));
        return this.items;
    }

    /**
     * 设置数组大小, 超出当前大小的值置为 null.
     * @return {@link #items}
     */
    setSize(newSize: number): T[]{
        this.truncate(newSize);
        if(newSize > this.items.length) this.resize(Math.max(8, newSize));
        this.size = newSize;
        return this.items;
    }

    /** 创建指定大小的新备份数组, 包含当前元素. */
    protected resize(newSize: number): T[]{
        const items = this.items;
        const newItems = new Array<T>(newSize);
        for(let i = 0; i < Math.min(this.size, newItems.length); i++) newItems[i] = items[i];
        this.items = newItems;
        return newItems;
    }

    /** 排序. */
    sort(): Seq<T>;
    /** 用比较器排序. */
    sort(comparator: Comparator<T>): Seq<T>;
    /** 用 float 提取函数排序. */
    sort(comparator: Floatf<T>): Seq<T>;
    sort(comparator?: any): Seq<T>{
        let cmp: Comparator<T>;
        if(comparator === undefined){
            cmp = (a: any, b: any) => (a < b ? -1 : (a > b ? 1 : 0));
        }else if(comparator.length >= 2){
            cmp = comparator as Comparator<T>;
        }else{
            const f = comparator as Floatf<T>;
            cmp = (a: T, b: T) => f(a) - f(b);
        }
        const slice = this.items.slice(0, this.size);
        slice.sort(cmp as any);
        for(let i = 0; i < this.size; i++) this.items[i] = slice[i];
        return this;
    }

    sortComparing<U>(keyExtractor: Func<T, U>): Seq<T>{
        return this.sort(((a: T, b: T) => {
            const ka = keyExtractor(a);
            const kb = keyExtractor(b);
            return (ka as any) < (kb as any) ? -1 : ((ka as any) > (kb as any) ? 1 : 0);
        }) as Comparator<T>);
    }

    selectFrom(base: Seq<T>, predicate: Boolf<T>): Seq<T>{
        this.clear();
        base.each(t => {
            if(predicate(t)){
                this.add(t);
            }
        });
        return this;
    }

    /** 注意: 会分配新的 set. 会修改自身. */
    distinct(): Seq<T>{
        const set = this.asSet();
        this.clear();
        this.addAll(set as any);
        return this;
    }

    as<R>(): Seq<R>{
        return this as unknown as Seq<R>;
    }

    /** 分配包含所有匹配谓词元素的新数组. */
    select(predicate: Boolf<T>): Seq<T>{
        const arr = new Seq<T>();
        for(let i = 0; i < this.size; i++){
            if(predicate(this.items[i])){
                arr.add(this.items[i]);
            }
        }
        return arr;
    }

    /** 移除所有不匹配谓词的元素. */
    retainAll(predicate: Boolf<T>): Seq<T>{
        return this.removeAll(e => !predicate(e));
    }

    count(predicate: Boolf<T>): number{
        let count = 0;
        for(let i = 0; i < this.size; i++){
            if(predicate(this.items[i])){
                count++;
            }
        }
        return count;
    }

    /**
     * 按 Comparator 排名选出第 kthLowest 小的元素. 可能部分排序数组.
     */
    selectRanked(comparator: Comparator<T>, kthLowest: number): T{
        if(kthLowest < 1){
            throw new Error("nth_lowest must be greater than 0, 1 = first, 2 = second...");
        }
        const slice = this.items.slice(0, this.size).sort(comparator as any);
        return slice[kthLowest - 1];
    }

    /** @return 第 kthLowest 小的元素的下标. */
    selectRankedIndex(comparator: Comparator<T>, kthLowest: number): number{
        if(kthLowest < 1){
            throw new Error("nth_lowest must be greater than 0, 1 = first, 2 = second...");
        }
        const slice = this.items.slice(0, this.size).sort(comparator as any);
        return this.indexOf(slice[kthLowest - 1], true);
    }

    reverse(): Seq<T>{
        const items = this.items;
        for(let i = 0, lastIndex = this.size - 1, n = this.size / 2; i < n; i++){
            const ii = lastIndex - i;
            const temp = items[i];
            items[i] = items[ii];
            items[ii] = temp;
        }
        return this;
    }

    shuffle(): Seq<T>{
        const items = this.items;
        for(let i = this.size - 1; i >= 0; i--){
            const ii = Mathf.random(i);
            const temp = items[i];
            items[i] = items[ii];
            items[ii] = temp;
        }
        return this;
    }

    /** 将数组缩减到指定大小. 若数组已经更小则不做任何事. */
    truncate(newSize: number): void{
        if(newSize < 0) throw new Error("newSize must be >= 0: " + newSize);
        if(this.size <= newSize) return;
        for(let i = newSize; i < this.size; i++)
            (this.items[i] as any) = null;
        this.size = newSize;
    }

    random(rand: Rand): T | null{
        if(this.size === 0) return null;
        return this.items[rand.random(0, this.size - 1)];
    }

    /** @return 数组中的随机元素, 空数组返回 null. */
    random(): T | null{
        return this.random(Mathf.rand);
    }

    /**
     * @return 数组中排除指定元素的随机元素. 空数组返回 null; 只有一个元素时返回该元素.
     */
    random(exclude: T): T | null{
        if(exclude === null || exclude === undefined) return this.random();
        if(this.size === 0) return null;
        if(this.size === 1) return this.first();

        const eidx = this.indexOf(exclude);
        // 该元素根本不在数组中!
        if(eidx === -1) return this.random();

        // 把下标向上偏移
        let index = Mathf.random(0, this.size - 2);
        if(index >= eidx){
            index++;
        }
        return this.items[index];
    }

    /** 以数组形式返回元素 (拷贝). */
    toArray(): T[]{
        const result: T[] = new Array<T>(this.size);
        for(let i = 0; i < this.size; i++) result[i] = this.items[i];
        return result;
    }

    hashCode(): number{
        if(!this.ordered) return identityHashOf(this);
        const items = this.items;
        let h = 1;
        for(let i = 0, n = this.size; i < n; i++){
            h = Math.imul(h, 31);
            const item = items[i];
            if(item !== null && item !== undefined) h = (h + hashOf(item)) | 0;
            h |= 0;
        }
        return h;
    }

    equals(object: unknown): boolean{
        if(object === this) return true;
        if(!this.ordered) return false;
        if(!(object instanceof Seq)) return false;
        const array = object as Seq<unknown>;
        if(!array.ordered) return false;
        const n = this.size;
        if(n !== array.size) return false;
        const items1 = this.items;
        const items2 = array.items;
        for(let i = 0; i < n; i++){
            const o1 = items1[i];
            const o2 = items2[i];
            if(!(o1 === null || o1 === undefined ? (o2 === null || o2 === undefined) : equalsOf(o1, o2))) return false;
        }
        return true;
    }

    toString(): string{
        if(this.size === 0) return "[]";
        const items = this.items;
        let buffer = "[";
        buffer += String(items[0]);
        for(let i = 1; i < this.size; i++){
            buffer += ", ";
            buffer += String(items[i]);
        }
        buffer += "]";
        return buffer;
    }

    toString(separator: string, stringifier: Func<T, string>): string{
        if(this.size === 0) return "";
        const items = this.items;
        let buffer = stringifier(items[0]);
        for(let i = 1; i < this.size; i++){
            buffer += separator;
            buffer += stringifier(items[i]);
        }
        return buffer;
    }

    toString(separator: string): string{
        return this.toString(separator, String);
    }

    /**
     * 返回数组元素的迭代器. 支持 remove. 注意: 除非嵌套循环, 每次调用此方法都返回同一个迭代器实例.
     */
    iterator(): SeqIterator<T>{
        if(this.iterable == null) this.iterable = new SeqIterable<T>(this);
        return this.iterable.iterator();
    }

    /** JS for..of 支持. */
    [Symbol.iterator](){
        return jsIterator(this.iterator());
    }
}

export class SeqIterable<T>{
    readonly array: Seq<T>;
    readonly allowRemove: boolean;
    private iterator1: SeqIterator<T>;
    private iterator2: SeqIterator<T>;

    constructor(array: Seq<T>);
    constructor(array: Seq<T>, allowRemove: boolean);
    constructor(array: Seq<T>, allowRemove: boolean = true){
        this.array = array;
        this.allowRemove = allowRemove;
        this.iterator1 = new SeqIterator(this);
        this.iterator2 = new SeqIterator(this);
    }

    iterator(): SeqIterator<T>{
        if(this.iterator1.done){
            this.iterator1.index = 0;
            this.iterator1.done = false;
            return this.iterator1;
        }
        if(this.iterator2.done){
            this.iterator2.index = 0;
            this.iterator2.done = false;
            return this.iterator2;
        }
        // 3 层以上嵌套循环时分配新迭代器.
        return new SeqIterator(this);
    }
}

export class SeqIterator<T>{
    index = 0;
    done = true;

    constructor(private readonly iterable: SeqIterable<T>){
        iteratorsAllocated++;
    }

    hasNext(): boolean{
        if(this.index >= this.iterable.array.size) this.done = true;
        return this.index < this.iterable.array.size;
    }

    next(): T{
        if(this.index >= this.iterable.array.size) throw new Error(String(this.index));
        return this.iterable.array.items[this.index++];
    }

    remove(): void{
        if(!this.iterable.allowRemove) throw new Error("Remove not allowed.");
        this.index--;
        this.iterable.array.remove(this.index);
    }

    [Symbol.iterator](){
        return jsIterator(this);
    }
}
