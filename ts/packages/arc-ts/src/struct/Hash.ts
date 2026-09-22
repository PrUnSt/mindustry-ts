// 源: arc-core/src/arc/struct/*.java 中依赖的 Object.hashCode()/equals() 语义的 TS 等价
// 迁移说明: Java 对象有 hashCode()/equals(); TS 普通对象没有. 这里提供统一的哈希与相等比较:
// - 若对象定义了 hashCode()/equals() 方法, 优先调用 (与 Java 一致);
// - 数字/字符串/布尔按值哈希 (字符串为 Java String.hashCode 同款算法);
// - 其他对象退化为按引用 (identity) 哈希, 使用 WeakMap 分配稳定整数.

const identityHashes = new WeakMap<object, number>();
let identityCounter = 0;

/** 返回与 Java Object.hashCode() 语义等价 (32 位有符号整数) 的哈希值. */
export function hashOf(item: unknown): number{
    if(item === null || item === undefined) return 0;
    if(typeof item === 'number') return item | 0;
    if(typeof item === 'string'){
        // Java String.hashCode(): h = 31*h + char
        let h = 0;
        for(let i = 0; i < item.length; i++) h = (Math.imul(31, h) + item.charCodeAt(i)) | 0;
        return h;
    }
    if(typeof item === 'boolean') return item ? 1231 : 1237;
    if(typeof item === 'bigint') return Number(BigInt.asIntN(32, item));
    const obj = item as object;
    if(typeof (obj as any).hashCode === 'function') return ((obj as any).hashCode() as number) | 0;
    let h = identityHashes.get(obj);
    if(h === undefined){
        h = ++identityCounter;
        identityHashes.set(obj, h);
    }
    return h;
}

/** 返回与 Java equals() 语义等价的比较结果. */
export function equalsOf(a: unknown, b: unknown): boolean{
    if(a === b) return true;
    if(a === null || a === undefined || b === null || b === undefined) return false;
    if(typeof (a as any).equals === 'function') return (a as any).equals(b) === true;
    return false;
}

/** 始终返回按引用 (identity) 分配的稳定整数哈希 (等价于 Java Object 默认 hashCode). */
export function identityHashOf(obj: object): number{
    let h = identityHashes.get(obj);
    if(h === undefined){
        h = ++identityCounter;
        identityHashes.set(obj, h);
    }
    return h;
}

/** 等价于 Java Long.numberOfLeadingZeros(long), 用于哈希表移位. 仅需支持 32 位以内的 mask. */
export function numberOfLeadingZeros(value: number): number{
    if(value === 0) return 64;
    return 32 + Math.clz32(value);
}
