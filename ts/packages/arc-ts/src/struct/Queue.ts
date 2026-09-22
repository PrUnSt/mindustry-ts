// 源: arc-core/src/arc/struct/Queue.java
// 迁移说明: 可扩容的对象队列, 首尾增删高效 (O(1)). 备份数组中的值可能回绕到开头.
import {jsIterator} from './Iterators';
import {hashOf, equalsOf} from './Hash';
import {Cons, Boolf} from './Funcs';

/**
 * 可扩容的对象队列, 首尾增删高效. 备份数组中的值可能回绕到开头.
 */
export class Queue<T>{
    /** 队列中的元素数. */
    size = 0;
    /** 包含队列中的值. head 和 tail 索引围绕此数组循环, 到末尾时回绕. */
    values: T[];
    /** 第一个元素的索引. 逻辑上小于 tail. 除非为空, 否则指向队列中的有效元素. */
    protected head = 0;
    /**
     * 最后一个元素的索引. 逻辑上大于 head. 通常指向空位置, 但满时 (size == values.length) 指向 head.
     */
    protected tail = 0;
    private iterable: QueueIterable<T> | null = null;

    /** 创建可容纳 16 个值而无需扩容的新队列. */
    constructor();
    /** 创建可容纳指定数量值而无需扩容的新队列. */
    constructor(initialSize: number);
    /** 创建指定类型备份数组的队列 (type 在 TS 中无实际作用). */
    constructor(initialSize: number, type: unknown);
    constructor(initialSize: number = 16, type?: unknown){
        this.values = new Array<T>(initialSize);
    }

    /** 以数组形式返回元素 (拷贝). */
    toArray(): T[]{
        const out: T[] = new Array<T>(this.size);
        for(let i = 0; i < this.size; i++){
            out[i] = this.get(i);
        }
        return out;
    }

    /**
     * 将给定对象追加到尾部. (enqueue to tail) 除非需要扩容, O(1) 时间.
     * @param object 可以为 null
     */
    addLast(object: T): void{
        let values = this.values;

        if(this.size === values.length){
            this.resize(values.length << 1); // * 2
            values = this.values;
        }

        values[this.tail++] = object;
        if(this.tail === values.length){
            this.tail = 0;
        }
        this.size++;
    }

    /** 将对象添加到尾部. */
    add(object: T): void{
        this.addLast(object);
    }

    /**
     * 将给定对象放到头部. (enqueue to head) 除非需要扩容, O(1) 时间.
     */
    addFirst(object: T): void{
        let values = this.values;

        if(this.size === values.length){
            this.resize(values.length << 1); // * 2
            values = this.values;
        }

        let head = this.head;
        head--;
        if(head === -1){
            head = values.length - 1;
        }
        values[head] = object;

        this.head = head;
        this.size++;
    }

    /**
     * 将备份数组缩减到实际元素个数.
     * @return {@link #values}
     */
    shrink(): T[]{
        if(this.values.length !== this.size) this.resize(this.size);
        return this.values;
    }

    /**
     * 扩大备份数组以容纳指定数量的额外元素.
     */
    ensureCapacity(additional: number): void{
        const needed = this.size + additional;
        if(this.values.length < needed){
            this.resize(needed);
        }
    }

    /** 调整备份数组大小. newSize 必须大于当前 size. */
    protected resize(newSize: number): void{
        const values = this.values;
        const head = this.head;
        const tail = this.tail;

        const newArray = new Array<T>(newSize);
        if(head < tail){
            // 连续
            for(let i = head; i < tail; i++) newArray[i - head] = values[i];
        }else if(this.size > 0){
            // 回绕
            const rest = values.length - head;
            for(let i = head; i < values.length; i++) newArray[i - head] = values[i];
            for(let i = 0; i < tail; i++) newArray[rest + i] = values[i];
        }
        this.values = newArray;
        this.head = 0;
        this.tail = this.size;
    }

    /**
     * 移除第一个元素. (dequeue from head) 恒 O(1).
     * @return 被移除的对象
     */
    removeFirst(): T{
        if(this.size === 0){
            throw new Error("Queue is empty.");
        }

        const values = this.values;

        const result = values[this.head];
        (values[this.head] as any) = null;
        this.head++;
        if(this.head === values.length){
            this.head = 0;
        }
        this.size--;

        return result;
    }

    /**
     * 移除最后一个元素. (dequeue from tail) 恒 O(1).
     * @return 被移除的对象
     */
    removeLast(): T{
        if(this.size === 0){
            throw new Error("Queue is empty.");
        }

        const values = this.values;
        let tail = this.tail;
        tail--;
        if(tail === -1){
            tail = values.length - 1;
        }
        const result = values[tail];
        (values[tail] as any) = null;
        this.tail = tail;
        this.size--;

        return result;
    }

    contains(value: T): boolean{
        return this.contains(value, true);
    }

    contains(value: T, identity: boolean): boolean{
        return this.indexOf(value, identity) !== -1;
    }

    /**
     * 返回 value 在队列中第一次出现的索引, 或 -1.
     * @param identity true 时用 === 比较, false 时用 .equals() 比较.
     */
    indexOf(value: T, identity: boolean): number{
        if(this.size === 0) return -1;
        const values = this.values;
        const head = this.head, tail = this.tail;
        if(identity || value === null || value === undefined){
            if(head < tail){
                for(let i = head; i < tail; i++)
                    if(values[i] === value) return i - head;
            }else{
                for(let i = head, n = values.length; i < n; i++)
                    if(values[i] === value) return i - head;
                for(let i = 0; i < tail; i++)
                    if(values[i] === value) return i + values.length - head;
            }
        }else{
            if(head < tail){
                for(let i = head; i < tail; i++)
                    if(equalsOf(value, values[i])) return i - head;
            }else{
                for(let i = head, n = values.length; i < n; i++)
                    if(equalsOf(value, values[i])) return i - head;
                for(let i = 0; i < tail; i++)
                    if(equalsOf(value, values[i])) return i + values.length - head;
            }
        }
        return -1;
    }

    indexOf(value: Boolf<T>): number{
        if(this.size === 0) return -1;
        const values = this.values;
        const head = this.head, tail = this.tail;
        if(head < tail){
            for(let i = head; i < tail; i++)
                if(value(values[i])) return i - head;
        }else{
            for(let i = head, n = values.length; i < n; i++)
                if(value(values[i])) return i - head;
            for(let i = 0; i < tail; i++)
                if(value(values[i])) return i + values.length - head;
        }
        return -1;
    }

    remove(value: Boolf<T>): boolean;
    remove(value: T): boolean;
    remove(value: T, identity: boolean): boolean;
    remove(valueOrPred: any, identity: boolean = false): boolean{
        if(typeof valueOrPred === 'function'){
            const i = this.indexOf(valueOrPred as Boolf<T>);
            if(i !== -1){
                this.removeIndex(i);
                return true;
            }
            return false;
        }
        const index = this.indexOf(valueOrPred, identity);
        if(index === -1) return false;
        this.removeIndex(index);
        return true;
    }

    /** 移除并返回指定索引处的元素. */
    removeIndex(index: number): T{
        if(index < 0) throw new Error("index can't be < 0: " + index);
        if(index >= this.size) throw new Error("index can't be >= size: " + index + " >= " + this.size);

        const values = this.values;
        let head = this.head, tail = this.tail;
        index += head;
        let value: T;
        if(head < tail){ // index 在 head 和 tail 之间.
            value = values[index];
            for(let i = index; i < tail; i++) values[i] = values[i + 1];
            (values[tail] as any) = null;
            this.tail--;
        }else if(index >= values.length){ // index 在 0 和 tail 之间.
            index -= values.length;
            value = values[index];
            for(let i = index; i < tail; i++) values[i] = values[i + 1];
            (values[tail] as any) = null;
            this.tail--;
        }else{ // index 在 head 和 values.length 之间.
            value = values[index];
            for(let i = head; i < index; i++) values[i + 1] = values[i];
            (values[head] as any) = null;
            this.head++;
            if(this.head === values.length){
                this.head = 0;
            }
        }
        this.size--;
        return value;
    }

    /** @return 队列是否为空. */
    isEmpty(): boolean{
        return this.size === 0;
    }

    /**
     * 返回队列的第一个 (head) 元素 (不移除).
     */
    first(): T{
        if(this.size === 0){
            throw new Error("Queue is empty.");
        }
        return this.values[this.head];
    }

    /**
     * 返回队列的最后一个 (tail) 元素 (不移除).
     */
    last(): T{
        if(this.size === 0){
            throw new Error("Queue is empty.");
        }
        const values = this.values;
        let tail = this.tail;
        tail--;
        if(tail === -1){
            tail = values.length - 1;
        }
        return values[tail];
    }

    /**
     * 取出队列中的值而不移除. 索引从前往后, 从 0 开始. 因此 get(0) 同 first().
     */
    get(index: number): T{
        if(index < 0) throw new Error("index can't be < 0: " + index);
        if(index >= this.size) throw new Error("index can't be >= size: " + index + " >= " + this.size);
        const values = this.values;

        let i = this.head + index;
        if(i >= values.length){
            i -= values.length;
        }
        return values[i];
    }

    /**
     * 移除队列中的所有值. 备份数组中的值设为 null 以防止内存泄漏, 因此 O(n).
     */
    clear(): void{
        if(this.size === 0) return;
        const values = this.values;
        const head = this.head;
        const tail = this.tail;

        if(head < tail){
            // 连续
            for(let i = head; i < tail; i++){
                (values[i] as any) = null;
            }
        }else{
            // 回绕
            for(let i = head; i < values.length; i++){
                (values[i] as any) = null;
            }
            for(let i = 0; i < tail; i++){
                (values[i] as any) = null;
            }
        }
        this.head = 0;
        this.tail = 0;
        this.size = 0;
    }

    toString(): string{
        if(this.size === 0){
            return "[]";
        }
        const values = this.values;
        const head = this.head;
        const tail = this.tail;

        let sb = "[";
        sb += String(values[head]);
        for(let i = (head + 1) % values.length; i !== tail; i = (i + 1) % values.length){
            sb += ", " + String(values[i]);
        }
        sb += "]";
        return sb;
    }

    hashCode(): number{
        const size = this.size;
        const values = this.values;
        const backingLength = values.length;
        let index = this.head;

        let hash = size + 1;
        for(let s = 0; s < size; s++){
            const value = values[index];

            hash = Math.imul(hash, 31);
            if(value !== null && value !== undefined) hash = (hash + hashOf(value)) | 0;

            index++;
            if(index === backingLength) index = 0;
        }

        return hash;
    }

    equals(o: unknown): boolean{
        if(this === o) return true;
        if(!(o instanceof Queue)) return false;

        const q = o as Queue<unknown>;
        const size = this.size;

        if(q.size !== size) return false;

        const myValues = this.values;
        const myBackingLength = myValues.length;
        const itsValues = q.values;
        const itsBackingLength = itsValues.length;

        let myIndex = this.head;
        let itsIndex = q.head;
        for(let s = 0; s < size; s++){
            const myValue = myValues[myIndex];
            const itsValue = itsValues[itsIndex];

            if(!(myValue === null || myValue === undefined ? (itsValue === null || itsValue === undefined) : equalsOf(myValue, itsValue))) return false;
            myIndex++;
            itsIndex++;
            if(myIndex === myBackingLength) myIndex = 0;
            if(itsIndex === itsBackingLength) itsIndex = 0;
        }
        return true;
    }

    each(c: Cons<T>): void{
        const values = this.values;

        for(let index = 0; index < this.size; index++){
            let i = this.head + index;
            if(i >= values.length){
                i -= values.length;
            }
            c(values[i]);
        }
    }

    find(func: Boolf<T>): T | null{
        const values = this.values;

        for(let index = 0; index < this.size; index++){
            let i = this.head + index;
            if(i >= values.length){
                i -= values.length;
            }
            const val = values[i];
            if(func(val)){
                return val;
            }
        }
        return null;
    }

    /**
     * 返回队列元素的迭代器. 支持 remove.
     */
    iterator(): QueueIterator<T>{
        if(this.iterable == null) this.iterable = new QueueIterable<T>(this);
        return this.iterable.iterator();
    }

    /** JS for..of 支持. */
    [Symbol.iterator](){
        return jsIterator(this.iterator());
    }
}

export class QueueIterable<T>{
    readonly queue: Queue<T>;
    readonly allowRemove: boolean;
    private iterator1: QueueIterator<T> | null = null;
    private iterator2: QueueIterator<T> | null = null;

    constructor(queue: Queue<T>);
    constructor(queue: Queue<T>, allowRemove: boolean);
    constructor(queue: Queue<T>, allowRemove: boolean = true){
        this.queue = queue;
        this.allowRemove = allowRemove;
    }

    iterator(): QueueIterator<T>{
        if(this.iterator1 == null){
            this.iterator1 = new QueueIterator(this);
            this.iterator2 = new QueueIterator(this);
        }

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
        return new QueueIterator(this);
    }
}

export class QueueIterator<T>{
    index = 0;
    done = true;

    constructor(private readonly iterable: QueueIterable<T>){
    }

    hasNext(): boolean{
        if(this.index >= this.iterable.queue.size) this.done = true;
        return this.index < this.iterable.queue.size;
    }

    next(): T{
        if(this.index >= this.iterable.queue.size) throw new Error(String(this.index));
        return this.iterable.queue.get(this.index++);
    }

    remove(): void{
        if(!this.iterable.allowRemove) throw new Error("Remove not allowed.");
        this.index--;
        this.iterable.queue.removeIndex(this.index);
    }

    reset(): void{
        this.index = 0;
    }

    [Symbol.iterator](){
        return jsIterator(this);
    }
}
