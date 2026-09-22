// 源: arc-core/src/arc/struct/EnumSet.java
// 迁移说明: 带 int mask 的小型数组包装, 用于快速 contains() 检查.
// Java 泛型为 T extends Enum<T> (有 ordinal() 方法); TS 数字枚举的值即其序号, 枚举对象可带 ordinal 属性,
// 因此这里不约束泛型, 用 ordinalOf() 统一取序号.
import {Seq} from './Seq';

/** 小型数组包装, 带 int mask 用于快速 contains() 检查. */
export class EnumSet<T>{
    private mask = 0;

    /** 数组, 用于迭代. 不要修改. */
    array!: T[];
    size = 0;

    private constructor();
    private constructor(size: number);
    private constructor(size?: number){
        if(size !== undefined) this.size = size;
    }

    static of<T>(...arr: T[]): EnumSet<T>{
        const set = new EnumSet<T>(arr.length);
        set.array = arr;
        for(const t of arr){
            set.mask |= (1 << ordinalOf(t));
        }
        return set;
    }

    /**
     * @return 包含指定枚举的新集合, 若该标志已存在则返回自身.
     */
    with(add: T): EnumSet<T>{
        if(!this.contains(add)){
            const copy = this.array.slice();
            copy[copy.length] = add;
            return EnumSet.of(...copy);
        }
        return this;
    }

    contains(t: T): boolean{
        return (this.mask & (1 << ordinalOf(t))) !== 0;
    }

    containsAny(other: EnumSet<T>): boolean{
        return (this.mask & other.mask) !== 0;
    }

    containsAll(other: EnumSet<T>): boolean{
        return (this.mask & other.mask) === other.mask;
    }

    /** 迭代支持. */
    [Symbol.iterator](){
        return this.array.slice(0, this.size)[Symbol.iterator]();
    }
}

/** 取枚举序号: 数字枚举的值即序号; 对象可提供 ordinal 属性. */
export function ordinalOf<T>(t: T): number{
    const v = t as any;
    if(v !== null && v !== undefined && typeof v === 'object' && typeof v.ordinal === 'number') return v.ordinal;
    return v as number;
}
