// 测试: arc-core/src/arc/util/Interval.java (47 行) 移植
import { describe, expect, it, beforeEach } from "vitest";
import { Interval } from "./Interval";
import { Time } from "./Time";

describe("Interval", () => {
  beforeEach(() => {
    Time.delta = 1;
    Time.setInternalTime(0);
    Time.globalTime = 0;
  });

  it("get(1) 每 tick 通过一次: 精确得到 true,true,true,false", () => {
    const interval = new Interval();
    const got: boolean[] = [];

    for(let k = 0; k < 3; k++){
      Time.update();                       // 推进虚拟时钟 1 tick
      got.push(interval.get(1));
    }
    got.push(interval.get(1));             // 同一 tick 内再次调用

    expect(got).toEqual([true, true, true, false]);
  });

  it("check() 的第二个分支: Time.time < times[id] (时间回拨) 也返回 true", () => {
    const interval = new Interval();

    // Time.time = 0 时 get(1): 0-0 >= 1 为 false, 0 < 0 为 false → 不通过, 不写入 times
    expect(interval.get(1)).toBe(false);
    expect(interval.getTimes()[0]).toBe(0);
    expect(interval.getTime(0)).toBe(0);

    // 把记录时刻放到「未来」: times[0] = Time.time - (-3) = 3
    interval.reset(0, -3);
    expect(interval.getTimes()[0]).toBe(3);
    expect(interval.check(0, 1)).toBe(true);
    expect(interval.get(0, 1)).toBe(true);   // 命中后 times[0] 归位到 Time.time
    expect(interval.getTimes()[0]).toBe(0);
  });

  it("命中后重置计时, 同一 tick 内不会连续通过", () => {
    const interval = new Interval();

    Time.update();                          // Time.time = 1
    expect(interval.get(0, 1)).toBe(true);  // 1-0 >= 1, times[0] = 1
    expect(interval.get(0, 1)).toBe(false); // 1-1 >= 1 为 false
    Time.update();                          // Time.time = 2
    expect(interval.get(0, 1)).toBe(true);  // 2-1 >= 1
  });

  it("多个 id 互不影响 (capacity=2)", () => {
    const interval = new Interval(2);

    Time.update();                          // Time.time = 1
    expect(interval.get(0, 1)).toBe(true);  // times[0] = 1
    expect(interval.get(1, 1)).toBe(true);  // times[1] = 1
    expect(interval.get(0, 1)).toBe(false);
    expect(interval.get(1, 1)).toBe(false);
    expect(interval.getTimes()).toEqual([1, 1]);
    expect(interval.getTime(0)).toBe(0);
    expect(interval.getTime(1)).toBe(0);
  });

  it("id 越界抛错, 消息包含最大容量 (Interval.java:21)", () => {
    const interval = new Interval(2);
    expect(() => interval.get(2, 1)).toThrowError("Out of bounds! Max timer size is 2!");
  });

  it("clear() 把上次通过时刻清 0 (不再等到 time 秒后)", () => {
    const interval = new Interval();

    Time.update();                          // Time.time = 1
    expect(interval.get(1)).toBe(true);
    expect(interval.get(1)).toBe(false);

    interval.clear();
    expect(interval.getTimes()).toEqual([0]);
    expect(interval.get(1)).toBe(true);     // 1-0 >= 1
  });
});
