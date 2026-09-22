// 测试: arc-core/src/arc/util/pooling/Pool.java + Pools.java 移植
import { describe, expect, it } from "vitest";
import { Pool, Poolable } from "./Pool";
import { Pools } from "./Pools";

class Widget implements Poolable{
  id = 0;
  buffer: string | null = null;

  reset(): void{
    this.id = 0;
    this.buffer = null;
  }
}

class NonPoolable{
  value = 1;
}

class Limited extends Pool<Widget>{
  constructor(){
    super(2, 1); // max 1 free object
  }

  protected newObject(): Widget{
    return new Widget();
  }
}

describe("Pool", () => {
  it("obtain creates new objects when empty", () => {
    const pool = new (class extends Pool<Widget>{
      protected newObject(): Widget{
        return new Widget();
      }
    })();
    const a = pool.obtain();
    const b = pool.obtain();
    expect(a).not.toBe(b);
    expect(pool.getFree()).toBe(0);
  });

  it("free then obtain reuses the same instance and resets it", () => {
    const pool = new (class extends Pool<Widget>{
      protected newObject(): Widget{
        return new Widget();
      }
    })();
    const a = pool.obtain();
    a.id = 42;
    a.buffer = "x";
    pool.free(a);
    expect(a.id).toBe(0);
    expect(a.buffer).toBeNull();
    expect(pool.getFree()).toBe(1);

    const b = pool.obtain();
    expect(b).toBe(a);
    expect(pool.getFree()).toBe(0);
  });

  it("max limits the number of free objects", () => {
    const pool = new Limited();
    const a = pool.obtain();
    const b = pool.obtain();
    const c = pool.obtain();
    pool.free(a);
    pool.free(b);
    pool.free(c);
    // only 1 free slot
    expect(pool.getFree()).toBe(1);
    expect(pool.peak).toBe(1);
  });

  it("clear empties free objects", () => {
    const pool = new (class extends Pool<Widget>{
      protected newObject(): Widget{
        return new Widget();
      }
    })();
    const a = pool.obtain();
    pool.free(a);
    expect(pool.getFree()).toBe(1);
    pool.clear();
    expect(pool.getFree()).toBe(0);
  });

  it("freeAll pools multiple objects", () => {
    const pool = new (class extends Pool<Widget>{
      protected newObject(): Widget{
        return new Widget();
      }
    })();
    const items = [new Widget(), new Widget(), new Widget()];
    pool.freeAll(items);
    expect(pool.getFree()).toBe(3);
  });
});

describe("Pools", () => {
  it("obtain/free reuse instances per class", () => {
    const a = Pools.obtain(Widget, () => new Widget());
    a.id = 7;
    Pools.free(a);
    expect(a.id).toBe(0);

    const b = Pools.obtain(Widget, () => new Widget());
    expect(b).toBe(a);
  });

  it("free of an unknown object is ignored", () => {
    expect(() => Pools.free(new NonPoolable())).not.toThrow();
  });

  it("freeAll with and without samePool", () => {
    const a = Pools.obtain(Widget, () => new Widget());
    const b = Pools.obtain(Widget, () => new Widget());
    Pools.freeAll([a, b], true);
    // Java Seq.pop() is LIFO, so the last freed object is obtained first.
    expect(Pools.obtain(Widget, () => new Widget())).toBe(b);
    expect(Pools.obtain(Widget, () => new Widget())).toBe(a);
  });

  it("free throws on null", () => {
    expect(() => Pools.free(null)).toThrow();
  });
});

