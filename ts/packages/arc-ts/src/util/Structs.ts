// 源: arc-core/src/arc/util/Structs.java

import { Boolf } from "./func/Boolf";
import { Func } from "./func/Func";
import { Floatf } from "./func/Floatf";
import { Intf } from "./func/Intf";
import { Longf } from "./func/Longf";
import { Cons } from "./func/Cons";

/** 对应 java.util.Comparator<T>。 */
export type Comparator<T> = (a: T, b: T) => number;

export class Structs{
  static eq(a: unknown, b: unknown): boolean{
    return a === b || (a !== null && a !== undefined && typeof (a as { equals?: (x: unknown) => boolean }).equals === "function" && (a as { equals: (x: unknown) => boolean }).equals(b));
  }

  static arr<T>(...array: T[]): T[]{
    return array;
  }

  /** Remove all values that match this predicate. */
  static filter<T>(iterable: T[], removal: Boolf<T>): void;
  /** Returns a new array with the values that match this predicate. */
  static filter<T>(type: new () => T, array: T[], value: Boolf<T>): T[];
  static filter<T>(a: T[] | (new () => T), b: Boolf<T> | T[], c?: Boolf<T>): void | T[]{
    if(typeof a === "function"){
      // Java 用 Seq + Class 反射；TS 直接过滤。type 参数仅为签名对齐保留。
      return (b as T[]).filter(t => (c as Boolf<T>)(t));
    }
    // Java 通过 Iterator.remove() 原地删除；JS 数组用反向 splice 等价实现
    const iterable = a as T[];
    const removal = b as Boolf<T>;
    for(let i = iterable.length - 1; i >= 0; i--){
      if(removal(iterable[i])){
        iterable.splice(i, 1);
      }
    }
  }

  static random<T>(...array: T[]): T | null;
  static random<T>(rand: { random(range: number): number }, ...array: T[]): T | null;
  static random<T>(first?: { random(range: number): number } | T, ...rest: T[]): T | null{
    const isRand = first !== null && first !== undefined && typeof first === "object"
      && typeof (first as { random?: unknown }).random === "function";
    const array = isRand ? rest : (first === undefined ? [] : [first as T, ...rest]);
    if(array.length === 0) return null;
    if(isRand) return array[(first as { random(range: number): number }).random(array.length - 1)];
    return array[Math.floor(Math.random() * array.length)];
  }

  static count<T>(array: T[], value: Boolf<T>): number{
    let total = 0;
    for(const t of array){
      if(value(t)) total++;
    }
    return total;
  }

  /** Uses identity comparisons. */
  static contains<T>(array: T[], value: T): boolean;
  static contains<T>(array: T[], value: Boolf<T>): boolean;
  static contains<T>(array: T[], value: T | Boolf<T>): boolean{
    if(typeof value === "function"){
      return Structs.find(array, value as Boolf<T>) !== null;
    }
    for(const t of array){
      if(t === value || (value !== null && value !== undefined && Structs.eq(value, t))) return true;
    }
    return false;
  }

  static find<T>(array: T[], value: Boolf<T>): T | null{
    for(const t of array){
      if(value(t)) return t;
    }
    return null;
  }

  static indexOf<T>(array: Iterable<T>, value: Boolf<T>): number;
  static indexOf<T>(array: T[], value: T): number;
  static indexOf<T>(array: T[], value: Boolf<T>): number;
  static indexOf<T>(array: Iterable<T>, value: T | Boolf<T>): number{
    if(typeof value === "function"){
      let i = 0;
      for(const t of array){
        if((value as Boolf<T>)(t)) return i;
        i++;
      }
      return -1;
    }
    const arr = array as T[];
    for(let i = 0; i < arr.length; i++){
      if(arr[i] === value) return i;
    }
    return -1;
  }

  static remove<T>(array: T[], value: T): T[];
  static remove<T>(array: T[], index: number): T[];
  static remove<T>(array: T[], valueOrIndex: T | number): T[]{
    const index = typeof valueOrIndex === "number" ? valueOrIndex : Structs.indexOf(array, valueOrIndex);
    if(index < 0 || index >= array.length){
      return array;
    }

    const next = new Array<T>(array.length - 1);
    for(let i = 0; i < index; i++){
      next[i] = array[i];
    }
    if(index < array.length - 1){
      for(let i = index; i < array.length - 1; i++){
        next[i] = array[i + 1];
      }
    }

    return next;
  }

  static add<T>(array: T[], item: T): T[]{
    const next = new Array<T>(array.length + 1);
    next[array.length] = item;
    for(let i = 0; i < array.length; i++){
      next[i] = array[i];
    }
    return next;
  }

  static swap<T>(array: T[], a: number, b: number): void{
    const temp = array[a];
    array[a] = array[b];
    array[b] = temp;
  }

  /** Equivalent to Comparator#thenComparing, but more compatible. */
  static comps<T>(first: Comparator<T>, second: Comparator<T>): Comparator<T>{
    return (a, b) => {
      const v = first(a, b);
      return v !== 0 ? v : second(a, b);
    };
  }

  static comparing<T, U>(keyExtractor: Func<T, U>, keyComparator: Comparator<U>): Comparator<T>;
  static comparing<T, U>(keyExtractor: Func<T, U>): Comparator<T>;
  static comparing<T, U>(keyExtractor: Func<T, U>, keyComparator?: Comparator<U>): Comparator<T>{
    if(keyComparator !== undefined){
      return (c1, c2) => keyComparator(keyExtractor(c1), keyExtractor(c2));
    }
    // Java: keyExtractor.get(c1).compareTo(...) —— 原生类型回退到 < / > 比较
    return (c1, c2) => {
      const a = keyExtractor(c1) as unknown as number;
      const b = keyExtractor(c2) as unknown as number;
      return a < b ? -1 : a > b ? 1 : 0;
    };
  }

  static comparingFloat<T>(keyExtractor: Floatf<T>): Comparator<T>{
    return (c1, c2) => {
      const a = keyExtractor(c1), b = keyExtractor(c2);
      return a < b ? -1 : a > b ? 1 : 0;
    };
  }

  static comparingInt<T>(keyExtractor: Intf<T>): Comparator<T>{
    return (c1, c2) => {
      const a = keyExtractor(c1), b = keyExtractor(c2);
      return a < b ? -1 : a > b ? 1 : 0;
    };
  }

  static comparingLong<T>(keyExtractor: Longf<T>): Comparator<T>{
    return (c1, c2) => {
      const a = keyExtractor(c1), b = keyExtractor(c2);
      return a < b ? -1 : a > b ? 1 : 0;
    };
  }

  static comparingBool<T>(keyExtractor: Boolf<T>): Comparator<T>{
    return (c1, c2) => {
      const a = keyExtractor(c1), b = keyExtractor(c2);
      return a === b ? 0 : a ? 1 : -1;
    };
  }

  static each<T>(cons: Cons<T>, ...objects: T[]): void{
    for(const t of objects){
      cons(t);
    }
  }

  static forEach<T>(iterable: Iterable<T>, cons: Cons<T>): void{
    for(const t of iterable){
      cons(t);
    }
  }

  static findMin<T>(arr: T[], comp: Comparator<T>): T | null;
  static findMin<T>(arr: T[], proc: Floatf<T>): T | null;
  static findMin<T>(arr: Iterable<T>, comp: Comparator<T>): T | null;
  static findMin<T>(arr: Iterable<T>, allow: Boolf<T>, comp: Comparator<T>): T | null;
  static findMin<T>(arr: Iterable<T>, second: Comparator<T> | Floatf<T> | Boolf<T>, third?: Comparator<T>): T | null{
    if(third !== undefined){
      // (arr, allow, comp)
      const allow = second as Boolf<T>;
      const comp = third;
      let result: T | null = null;
      for(const t of arr){
        if(allow(t) && (result === null || comp(result, t) > 0)){
          result = t;
        }
      }
      return result;
    }
    // A single-argument extractor is a Floatf; a two-argument function is a Comparator.
    if((second as Floatf<T>).length !== 2){
      let result: T | null = null;
      let min = Number.MAX_VALUE;
      for(const t of arr){
        const val = (second as Floatf<T>)(t);
        if(val <= min){
          result = t;
          min = val;
        }
      }
      return result;
    }
    const comp = second as Comparator<T>;
    let result: T | null = null;
    for(const t of arr){
      if(result === null || comp(result, t) > 0){ // Java uses < 0 which keeps the larger element; keep the smaller for a true min
        result = t;
      }
    }
    return result;
  }

  static inBounds(x: number, y: number, array: unknown[][]): boolean;
  static inBounds(x: number, y: number, array: number[][]): boolean;
  static inBounds(x: number, y: number, array: boolean[][]): boolean;
  static inBounds(x: number, y: number, z: number, array: unknown[][][]): boolean;
  static inBounds(x: number, y: number, z: number, array: number[][][]): boolean;
  static inBounds(x: number, y: number, z: number, size: number, padding: number): boolean;
  static inBounds(x: number, y: number, width: number, height: number): boolean;
  static inBounds(x: number, y: number, z: number | unknown[][] | unknown[][][], a?: unknown[][] | unknown[][][] | number, b?: number): boolean{
    if(typeof z !== "number"){
      // (x, y, array) — the 2D array is passed as `z`.
      const arr = z as unknown[][];
      return x >= 0 && y >= 0 && x < arr.length && y < arr[0].length;
    }
    if(typeof a === "number"){
      // (x, y, width, height) — height is `z`.
      if(b === undefined) return x >= 0 && y >= 0 && x < a && y < z;
      // (x, y, z, size, padding)
      return x >= b && y >= b && z >= b && x < a - b && y < a - b && z < a - b;
    }
    // (x, y, z, array) — 3D array.
    const arr = a as unknown[][][];
    return x >= 0 && y >= 0 && z >= 0 && x < arr.length && y < arr[0].length && z < arr[0][0].length;
  }
}

