// 源: arc-core/src/arc/struct/IntSeq.java
// 迁移说明: 可扩容、有序/无序的 int 数组. items 用 number[] (float64 表示 int). 无序时 remove 避免内存拷贝.
import {Mathf, Rand} from './Mathf';
import {jsIterator} from './Iterators';
import {Intc, Cons} from './Funcs';

/** 可扩容、有序或无序的 int 数组. */
export class IntSeq{
    items: number[];
    size = 0;
    ordered: boolean;

    static range(min: number, max: number): IntSeq{
        const out = new IntSeq();
        for(let i = min; i < max; i++){
            out.add(i);
        }
        return out;
    }

    /** 创建容量为 16 的有序数组. */
    constructor();
    constructor(capacity: number);
    constructor(ordered: boolean, capacity: number);
    constructor(array: IntSeq);
    constructor(array: number[]);
    constructor(ordered: boolean, array: number[], startIndex: number, count: number);
    constructor(a?: any, b?: any, c?: any, d?: any){
        if(a === undefined){
            this.ordered = true;
            this.items = new Array<number>(16);
        }else if(typeof a === 'boolean'){
            this.ordered = a;
            if(b === undefined){
                this.items = new Array<number>(16);
            }else if(typeof b === 'number'){
                this.items = new Array<number>(b);
            }else{
                // IntSeq(boolean, int[], startIndex, count)
                const array = b as number[];
                const startIndex = (c as number) | 0;
                const count = (d as number) | 0;
                this.items = new Array<number>(count);
                this.size = count;
                for(let i = 0; i < count; i++) this.items[i] = array[startIndex + i];
            }
        }else if(a instanceof IntSeq){
            const array = a as IntSeq;
            this.ordered = array.ordered;
            this.size = array.size;
            this.items = new Array<number>(this.size);
            for(let i = 0; i < this.size; i++) this.items[i] = array.items[i];
        }else if(Array.isArray(a)){
            const array = a as number[];
            this.ordered = true;
            this.items = new Array<number>(array.length);
            this.size = array.length;
            for(let i = 0; i < array.length; i++) this.items[i] = array[i];
        }else{
            this.ordered = true;
            this.items = new Array<number>(a as number);
        }
    }

    /** @see IntSeq(number[]) */
    static with(...array: number[]): IntSeq{
        return new IntSeq(array);
    }

    /** @return 出现最频繁的元素. */
    mode(): number{
        let count = 1, tempCount: number;
        let popular = this.size === 0 ? 0 : this.items[0];
        let temp: number;
        for(let i = 0; i < this.size - 1; i++){
            temp = this.items[i];
            tempCount = 0;
            for(let j = 1; j < this.size; j++){
                if(temp === this.items[j]) tempCount++;
            }
            if(tempCount > count){
                popular = temp;
                count = tempCount;
            }
        }
        return popular;
    }

    each(iterator: Intc): void{
        const size = this.size;
        const items = this.items;
        for(let i = 0; i < size; i++){
            iterator(items[i]);
        }
    }

    count(value: number): number{
        let out = 0;
        for(let i = 0; i < this.size; i++){
            if(this.items[i] === value){
                out++;
            }
        }
        return out;
    }

    sum(): number{
        let sum = 0;
        for(let i = 0; i < this.size; i++){
            sum += this.items[i];
        }
        return sum;
    }

    chunked(chunkSize: number, iterator: Cons<number[]>): void{
        for(let i = 0; i < this.size; i += chunkSize){
            const slice = this.items.slice(i, Math.min(i + chunkSize, this.size));
            iterator(slice);
        }
    }

    /**
     * 若值此前不在序列中则添加.
     * @return 该值此前是否不在序列中.
     */
    addUnique(value: number): boolean{
        if(!this.contains(value)){
            this.add(value);
            return true;
        }
        return false;
    }

    add(value: number): void;
    add(value1: number, value2: number): void;
    add(value1: number, value2: number, value3: number): void;
    add(value1: number, value2: number, value3: number, value4: number): void;
    add(...args: number[]): void{
        const items = this.items;
        if(args.length === 1){
            if(this.size === items.length) this.resize(Math.max(8, Math.floor(this.size * 1.75)));
            items[this.size++] = args[0];
        }else if(args.length === 2){
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
    }

    addAll(array: IntSeq): void;
    addAll(array: IntSeq, offset: number, length: number): void;
    addAll(...array: number[]): void;
    addAll(array: number[], offset: number, length: number): void;
    addAll(...args: any[]): void{
        if(args.length === 1){
            const a = args[0];
            if(a instanceof IntSeq){
                this.addAll(a.items, 0, a.size);
            }else{
                this.addAll(a as number[], 0, (a as number[]).length);
            }
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
        let items = this.items;
        const sizeNeeded = this.size + length;
        if(sizeNeeded > items.length) items = this.resize(Math.max(8, Math.floor(sizeNeeded * 1.75)));
        for(let i = 0; i < length; i++) items[this.size + i] = array[offset + i];
        this.size += length;
    }

    get(index: number): number{
        if(index >= this.size) throw new Error("index can't be >= size: " + index + " >= " + this.size);
        return this.items[index];
    }

    set(index: number, value: number): void{
        if(index >= this.size) throw new Error("index can't be >= size: " + index + " >= " + this.size);
        this.items[index] = value;
    }

    incr(index: number, value: number): void{
        if(index >= this.size) throw new Error("index can't be >= size: " + index + " >= " + this.size);
        this.items[index] += value;
    }

    mul(index: number, value: number): void{
        if(index >= this.size) throw new Error("index can't be >= size: " + index + " >= " + this.size);
        this.items[index] *= value;
    }

    insert(index: number, value: number): void{
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

    contains(value: number): boolean{
        let i = this.size - 1;
        const items = this.items;
        while(i >= 0)
            if(items[i--] === value) return true;
        return false;
    }

    indexOf(value: number): number{
        const items = this.items;
        for(let i = 0, n = this.size; i < n; i++)
            if(items[i] === value) return i;
        return -1;
    }

    lastIndexOf(value: number): number{
        const items = this.items;
        for(let i = this.size - 1; i >= 0; i--)
            if(items[i] === value) return i;
        return -1;
    }

    removeValue(value: number): boolean{
        const items = this.items;
        for(let i = 0, n = this.size; i < n; i++){
            if(items[i] === value){
                this.removeIndex(i);
                return true;
            }
        }
        return false;
    }

    /** 移除并返回指定索引处的元素. */
    removeIndex(index: number): number{
        if(index >= this.size) throw new Error("index can't be >= size: " + index + " >= " + this.size);
        const items = this.items;
        const value = items[index];
        this.size--;
        if(this.ordered){
            for(let i = index; i < this.size; i++) items[i] = items[i + 1];
        }else{
            items[index] = items[this.size];
        }
        return value;
    }

    /** 移除 [start, end] 区间 (含端点) 内的元素. */
    removeRange(start: number, end: number): void{
        if(end >= this.size) throw new Error("end can't be >= size: " + end + " >= " + this.size);
        if(start > end) throw new Error("start can't be > end: " + start + " > " + end);
        const items = this.items;
        const count = end - start + 1;
        if(this.ordered){
            for(let i = start; i < this.size - count; i++) items[i] = items[i + count];
        }else{
            const lastIndex = this.size - 1;
            for(let i = 0; i < count; i++)
                items[start + i] = items[lastIndex - i];
        }
        this.size -= count;
    }

    /**
     * 从本数组中移除指定数组包含的所有元素.
     * @return 本数组是否被修改.
     */
    removeAll(array: IntSeq): boolean{
        let size = this.size;
        const startSize = size;
        const items = this.items;
        for(let i = 0, n = array.size; i < n; i++){
            const item = array.get(i);
            for(let ii = 0; ii < size; ii++){
                if(item === items[ii]){
                    this.removeIndex(ii);
                    size--;
                    break;
                }
            }
        }
        return size !== startSize;
    }

    /** 移除并返回最后一个元素. */
    pop(): number{
        return this.items[--this.size];
    }

    /** 返回最后一个元素. */
    peek(): number{
        return this.items[this.size - 1];
    }

    /** 返回第一个元素. */
    first(): number{
        if(this.size === 0) throw new Error("Array is empty.");
        return this.items[0];
    }

    /** @return 数组是否为空. */
    isEmpty(): boolean{
        return this.size === 0;
    }

    clear(): void{
        this.size = 0;
    }

    /**
     * 将备份数组缩减到实际元素个数.
     * @return {@link #items}
     */
    shrink(): number[]{
        if(this.items.length !== this.size) this.resize(this.size);
        return this.items;
    }

    /**
     * 扩大备份数组以容纳指定数量的额外元素.
     * @return {@link #items}
     */
    ensureCapacity(additionalCapacity: number): number[]{
        if(additionalCapacity < 0)
            throw new Error("additionalCapacity must be >= 0: " + additionalCapacity);
        const sizeNeeded = this.size + additionalCapacity;
        if(sizeNeeded > this.items.length) this.resize(Math.max(8, sizeNeeded));
        return this.items;
    }

    /**
     * 设置数组大小, 超出当前大小的值未定义.
     * @return {@link #items}
     */
    setSize(newSize: number): number[]{
        if(newSize < 0) throw new Error("newSize must be >= 0: " + newSize);
        if(newSize > this.items.length) this.resize(Math.max(8, newSize));
        this.size = newSize;
        return this.items;
    }

    protected resize(newSize: number): number[]{
        const newItems = new Array<number>(newSize);
        const items = this.items;
        for(let i = 0; i < Math.min(this.size, newItems.length); i++) newItems[i] = items[i];
        this.items = newItems;
        return newItems;
    }

    sort(): void{
        const slice = this.items.slice(0, this.size).sort((a, b) => a - b);
        for(let i = 0; i < this.size; i++) this.items[i] = slice[i];
    }

    reverse(): void{
        const items = this.items;
        for(let i = 0, lastIndex = this.size - 1, n = this.size / 2; i < n; i++){
            const ii = lastIndex - i;
            const temp = items[i];
            items[i] = items[ii];
            items[ii] = temp;
        }
    }

    shuffle(): void;
    shuffle(rand: Rand): void;
    shuffle(rand: Rand = Mathf.rand): void{
        const items = this.items;
        for(let i = this.size - 1; i >= 0; i--){
            const ii = rand.nextInt(i + 1);
            const temp = items[i];
            items[i] = items[ii];
            items[ii] = temp;
        }
    }

    /**
     * 将数组缩减到指定大小. 若数组已经更小则不做任何事.
     */
    truncate(newSize: number): void{
        if(this.size > newSize) this.size = newSize;
    }

    /** @return 数组中的随机元素, 空数组返回 0. */
    random(): number{
        if(this.size === 0) return 0;
        return this.items[Mathf.random(0, this.size - 1)];
    }

    toArray(): number[]{
        return this.items.slice(0, this.size);
    }

    hashCode(): number{
        if(!this.ordered) return 0; // Java: super.hashCode() (identity)
        const items = this.items;
        let h = 1;
        for(let i = 0, n = this.size; i < n; i++)
            h = (Math.imul(h, 31) + items[i]) | 0;
        return h;
    }

    equals(object: unknown): boolean{
        if(object === this) return true;
        if(!this.ordered) return false;
        if(!(object instanceof IntSeq)) return false;
        const array = object as IntSeq;
        if(!array.ordered) return false;
        const n = this.size;
        if(n !== array.size) return false;
        for(let i = 0; i < n; i++)
            if(this.items[i] !== array.items[i]) return false;
        return true;
    }

    toString(): string;
    toString(separator: string): string;
    toString(separator?: string): string{
        if(this.size === 0) return separator === undefined ? "[]" : "";
        const items = this.items;
        if(separator === undefined){
            let buffer = "[";
            buffer += String(items[0]);
            for(let i = 1; i < this.size; i++){
                buffer += ", ";
                buffer += String(items[i]);
            }
            buffer += "]";
            return buffer;
        }
        let buffer = String(items[0]);
        for(let i = 1; i < this.size; i++){
            buffer += separator;
            buffer += String(items[i]);
        }
        return buffer;
    }

    /** JS for..of 支持. */
    [Symbol.iterator](){
        return this.items.slice(0, this.size)[Symbol.iterator]();
    }
}
