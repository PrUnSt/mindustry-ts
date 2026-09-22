// 源: arc-core/src/arc/struct/*.java (Iterator/Iterable 语义的 TS 适配)
// 迁移说明: 为让 Java 风格迭代器 (hasNext()/next()/remove()) 也能用于 for..of,
// 这里提供 jsIterator() 适配器, 将 Java 风格迭代器包装为 JS 迭代器.

/** 将一个 Java 风格迭代器 (hasNext()/next()) 包装为 JS 可迭代迭代器. */
export function jsIterator<T>(source: {hasNext(): boolean; next(): T}): Iterator<T> & Iterable<T>{
    const it: Iterator<T> & Iterable<T> = {
        next(): IteratorResult<T>{
            if(source.hasNext()){
                return {value: source.next(), done: false};
            }
            return {value: undefined as unknown as T, done: true};
        },
        [Symbol.iterator](){
            return it;
        },
    };
    return it;
}
