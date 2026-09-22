// 源: arc-core/src/arc/struct/GridMap.java
// 迁移说明: 二维哈希表, 用 x/y 坐标存储对象. Java 内部用 LongMap; 这里用 JS Map<number, T> 语义等价实现,
// 键为 getHash(x, y) (x<<32 | y, 64 位). values()/keys() 返回与 LongMap 迭代器接口一致的对象.
import {Seq} from './Seq';

/**
 * 使用 x/y 坐标存储对象的二维哈希表.
 */
export class GridMap<T>{
    /** Java 中为 protected LongMap<T> map; 这里用 JS Map 语义等价. */
    readonly map = new Map<number, T>();

    private static getHash(x: number, y: number): number{
        return Number(BigInt.asIntN(64, (BigInt(x) << 32n) | BigInt.asUintN(32, BigInt(y))));
    }

    get(x: number, y: number): T | null;
    get(x: number, y: number, defaultValue: T): T;
    get(x: number, y: number, defaultValue?: T): T | null{
        const hash = GridMap.getHash(x, y);
        const v = this.map.get(hash);
        if(v === undefined){
            return defaultValue === undefined ? null : defaultValue;
        }
        return v;
    }

    containsKey(x: number, y: number): boolean{
        return this.map.has(GridMap.getHash(x, y));
    }

    put(x: number, y: number, t: T): void{
        this.map.set(GridMap.getHash(x, y), t);
    }

    remove(x: number, y: number): void{
        this.map.delete(GridMap.getHash(x, y));
    }

    values(): GridMapValues<T>{
        return new GridMapValues<T>(this);
    }

    keys(): GridMapKeys{
        return new GridMapKeys(this);
    }

    clear(): void{
        this.map.clear();
    }

    size(): number{
        return this.map.size;
    }
}

/** GridMap.values() 返回的迭代器 (接口与 LongMap.Values 一致). */
export class GridMapValues<T>{
    private it: Iterator<[number, T]>;
    private pending: {key: number, value: T} | null = null;
    private lastKey: number | null = null;

    constructor(private readonly grid: GridMap<T>){
        this.it = this.grid.map.entries();
        this.fill();
    }

    private fill(): void{
        const r = this.it.next();
        this.pending = r.done ? null : {key: r.value[0], value: r.value[1]};
    }

    hasNext(): boolean{
        return this.pending !== null;
    }

    next(): T{
        if(this.pending === null) throw new Error("NoSuchElementException");
        this.lastKey = this.pending.key;
        const v = this.pending.value;
        this.fill();
        return v;
    }

    remove(): void{
        if(this.lastKey !== null){
            this.grid.map.delete(this.lastKey);
            this.lastKey = null;
        }
    }

    iterator(): this{
        return this;
    }

    toSeq(): Seq<T>{
        const array = new Seq<T>(true, this.grid.size());
        while(this.hasNext())
            array.add(this.next());
        return array;
    }
}

/** GridMap.keys() 返回的迭代器 (接口与 LongMap.Keys 一致). */
export class GridMapKeys{
    private it: Iterator<[number, unknown]>;
    private pending: {key: number} | null = null;
    private lastKey: number | null = null;

    constructor(private readonly grid: GridMap<unknown>){
        this.it = this.grid.map.entries();
        this.fill();
    }

    private fill(): void{
        const r = this.it.next();
        this.pending = r.done ? null : {key: r.value[0]};
    }

    hasNext(): boolean{
        return this.pending !== null;
    }

    next(): number{
        if(this.pending === null) throw new Error("NoSuchElementException");
        this.lastKey = this.pending.key;
        const k = this.pending.key;
        this.fill();
        return k;
    }

    remove(): void{
        if(this.lastKey !== null){
            this.grid.map.delete(this.lastKey);
            this.lastKey = null;
        }
    }

    iterator(): this{
        return this;
    }
}
