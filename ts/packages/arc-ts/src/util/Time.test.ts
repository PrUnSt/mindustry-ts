// 测试: arc-core/src/arc/util/Time.java 移植
import { describe, expect, it, beforeEach } from "vitest";
import { Time, DelayRun } from "./Time";
import { Pools } from "./Pools";

describe("Time", () => {
  beforeEach(() => {
    Time.delta = 1;
    Time.setInternalTime(0); // resets the internal timeRaw as well
    Time.globalTime = 0;
    Time.setRuns([]);
    Time.setDeltaProvider(() => 1);
  });

  it("update() advances time by delta", () => {
    expect(Time.time).toBe(0);
    Time.update();
    expect(Time.time).toBe(1);
    Time.update();
    expect(Time.time).toBe(2);
  });

  it("setDeltaProvider controls delta", () => {
    Time.setDeltaProvider(() => 2.5);
    expect(Time.delta).toBe(2.5);
    Time.update();
    expect(Time.time).toBe(2.5);
  });

  it("run() executes after the delay and is removed", () => {
    let calls = 0;
    Time.run(1, () => calls++);
    expect(Time.getRuns().length).toBe(1);

    Time.update(); // delay 1 -> 0, fires
    expect(calls).toBe(1);
    expect(Time.getRuns().length).toBe(0);
  });

  it("run() with a larger delay does not fire early", () => {
    let calls = 0;
    Time.run(5, () => calls++);
    Time.update();
    Time.update();
    expect(calls).toBe(0);
    Time.update();
    Time.update();
    Time.update();
    expect(calls).toBe(1);
  });

  it("clear() cancels pending runs", () => {
    let calls = 0;
    Time.run(1, () => calls++);
    Time.clear();
    Time.update();
    expect(calls).toBe(0);
    expect(Time.getRuns().length).toBe(0);
  });

  it("mark()/elapsed() reports elapsed milliseconds", () => {
    expect(Time.elapsed()).toBe(-1); // no mark
    Time.mark();
    expect(Time.elapsed()).toBeGreaterThanOrEqual(0);
  });

  it("DelayRun is pooled and reused", () => {
    const a = Pools.obtain(DelayRun, () => new DelayRun());
    a.delay = 7;
    a.finish = () => {};
    Pools.free(a);
    expect(a.delay).toBe(0); // reset() called
    expect(a.finish).toBeNull();

    const b = Pools.obtain(DelayRun, () => new DelayRun());
    expect(b).toBe(a); // reused
  });

  it("conversion factors and nanos helpers", () => {
    expect(Time.toSeconds).toBe(60);
    expect(Time.toMinutes).toBe(3600);
    expect(Time.toHours).toBe(216000);
    expect(Time.nanosToMillis(1_000_000)).toBe(1);
    expect(Time.millisToNanos(1)).toBe(1_000_000);
    expect(Time.timeSinceMillis(Time.millis() - 5)).toBeGreaterThanOrEqual(4);
  });

  it("getInternalTime/setInternalTime round-trips", () => {
    Time.setInternalTime(12.5);
    expect(Time.getInternalTime()).toBe(12.5);
    expect(Time.time).toBe(12.5);
  });
});


