// 源: arc-core/src/arc/util/pooling/Pools.java

import { Pool } from "./Pool";
import { Prov } from "./func/Prov";

type Constructor<T> = new (...args: never[]) => T;

/**
 * Stores a map of {@link Pool}s by type for convenient static access.
 * @author Nathan Sweet
 */
export class Pools{
  private static readonly typePools = new Map<Constructor<unknown>, Pool<unknown>>();

  private constructor(){
  }

  /**
   * Returns a new or existing pool for the specified type, stored in a Class to {@link Pool} map. Note that the max size is ignored for some reason.
   * if this is not the first time this pool has been requested.
   */
  static get<T>(type: Constructor<T>, supplier: Prov<T>, max: number): Pool<T>;
  static get<T>(type: Constructor<T>, supplier: Prov<T>): Pool<T>;
  static get<T>(type: Constructor<T>, supplier: Prov<T>, max?: number): Pool<T>{
    if(max === undefined) max = 5000;
    let pool = Pools.typePools.get(type as Constructor<unknown>) as Pool<T> | undefined;
    if(pool === undefined){
      pool = new (class extends Pool<T>{
        protected newObject(): T{
          return supplier();
        }
      })(4, max);
      Pools.typePools.set(type as Constructor<unknown>, pool);
    }
    return pool;
  }

  /** Sets an existing pool for the specified type, stored in a Class to {@link Pool} map. */
  static set<T>(type: Constructor<T>, pool: Pool<T>): void{
    Pools.typePools.set(type as Constructor<unknown>, pool);
  }

  /** Obtains an object from the {@link Pools.get(Class, Prov) pool}. */
  static obtain<T>(type: Constructor<T>, supplier: Prov<T>): T{
    return Pools.get(type, supplier).obtain();
  }

  /** Frees an object from the {@link Pools.get(Class, Prov) pool}. */
  static free(object: unknown): void{
    if(object === null || object === undefined) throw new Error("Object cannot be null.");
    const pool = Pools.typePools.get((object as { constructor: Constructor<unknown> }).constructor);
    if(pool === undefined) return; // Ignore freeing an object that was never retained.
    pool.free(object);
  }

  /**
   * Frees the specified objects from the {@link Pools.get(Class, Prov) pool}. Null objects within the array are silently ignored. Objects
   * don't need to be from the same pool.
   */
  static freeAll(objects: unknown[]): void;
  /**
   * Frees the specified objects from the {@link Pools.get(Class, Prov) pool}. Null objects within the array are silently ignored.
   * @param samePool If true, objects don't need to be from the same pool but the pool must be looked up for each object.
   */
  static freeAll(objects: unknown[], samePool: boolean): void;
  static freeAll(objects: unknown[], samePool?: boolean): void{
    if(objects === null || objects === undefined) throw new Error("Objects cannot be null.");
    const useSamePool = samePool ?? false;
    let pool: Pool<unknown> | undefined = undefined;
    for(let i = 0, n = objects.length; i < n; i++){
      const object = objects[i];
      if(object === null || object === undefined) continue;
      if(pool === undefined){
        pool = Pools.typePools.get((object as { constructor: Constructor<unknown> }).constructor);
        if(pool === undefined) continue; // Ignore freeing an object that was never retained.
      }
      pool.free(object);
      if(!useSamePool) pool = undefined;
    }
  }
}
