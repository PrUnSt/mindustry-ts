// 源: arc-core/src/arc/util/pooling/Pool.java

/** Objects implementing this interface will have {@link Pool.reset} called when passed to {@link Pool.free}. */
export interface Poolable{
  /** Resets the object for reuse. Object references should be nulled and fields may be set to default values. */
  reset(): void;
}

/**
 * A pool of objects that can be reused to avoid allocation.
 * @author Nathan Sweet
 * @see Pools
 */
export abstract class Pool<T>{
  /** The maximum number of objects that will be pooled. */
  readonly max: number;
  private readonly freeObjects: T[];
  /** The highest number of free objects. Can be reset any time. */
  peak = 0;

  /** Creates a pool with an initial capacity of 16 and no maximum. */
  constructor();
  /** Creates a pool with the specified initial capacity and no maximum. */
  constructor(initialCapacity: number);
  /** @param max The maximum number of free objects to store in this pool. */
  constructor(initialCapacity: number, max: number);
  constructor(initialCapacity?: number, max?: number){
    this.freeObjects = [];
    this.max = max ?? Number.MAX_SAFE_INTEGER;
  }

  protected abstract newObject(): T;

  /**
   * Returns an object from this pool. The object may be new (from {@link newObject}) or reused (previously
   * {@link free freed}).
   */
  obtain(): T{
    return this.freeObjects.length === 0 ? this.newObject() : this.freeObjects.pop()!;
  }

  /**
   * Puts the specified object in the pool, making it eligible to be returned by {@link obtain}. If the pool already contains
   * {@link max} free objects, the specified object is reset but not added to the pool.
   * <p>
   * The pool does not check if an object is already freed, so the same object must not be freed multiple times.
   */
  free(object: T): void{
    if(object === null || object === undefined) throw new Error("object cannot be null.");
    if(this.freeObjects.length < this.max){
      this.freeObjects.push(object);
      this.peak = Math.max(this.peak, this.freeObjects.length);
    }
    this.reset(object);
  }

  /**
   * Called when an object is freed to clear the state of the object for possible later reuse. The default implementation calls
   * {@link Poolable.reset} if the object is {@link Poolable}.
   */
  protected reset(object: T): void{
    if(object !== null && object !== undefined && typeof (object as { reset?: () => void }).reset === "function"){
      (object as unknown as { reset: () => void }).reset();
    }
  }

  /**
   * Puts the specified objects in the pool. Null objects within the array are silently ignored.
   * <p>
   * The pool does not check if an object is already freed, so the same object must not be freed multiple times.
   * @see #free(Object)
   */
  freeAll(objects: T[]): void{
    if(objects === null || objects === undefined) throw new Error("objects cannot be null.");
    const freeObjects = this.freeObjects;
    const max = this.max;
    for(let i = 0; i < objects.length; i++){
      const object = objects[i];
      if(object === null || object === undefined) continue;
      if(freeObjects.length < max) freeObjects.push(object);
      this.reset(object);
    }
    this.peak = Math.max(this.peak, freeObjects.length);
  }

  /** Removes all free objects from this pool. */
  clear(): void{
    this.freeObjects.length = 0;
  }

  /** The number of objects available to be obtained. */
  getFree(): number{
    return this.freeObjects.length;
  }
}
