// 源: arc-core/src/arc/util/Time.java
//
// 迁移说明:
//  - 原文件的「内联 Core 存根」与「setTimeout 版 Task/Timer」已删除 (TS-1 / TS-3):
//    delta 取样点改为真实的 ../Core, 延时任务改为 util/Timer 的帧驱动实现。
//  - 保留时间基准量全部由 util/Time 提供, math 层不再另有一份 Time (见 math/Time.ts 已删除)。
import { Core } from "../Core";
import { Floatp } from "./func/Floatp";
import { Pools } from "./Pools";
import { Poolable } from "./Pool";
import { Timer } from "./Timer";
import type { Task } from "./Timer";

/** 对应 java.lang.Runnable。 */
export type Runnable = () => void;

/** Time.DelayRun（对应 Java 嵌套静态类）。 */
export class DelayRun implements Poolable{
  delay = 0;
  finish: Runnable | null = null;

  reset(): void{
    this.delay = 0;
    this.finish = null;
  }
}

export class Time{
  /** Conversion factors for ticks to other unit values. */
  static readonly toSeconds = 60;
  static readonly toMinutes = 60 * 60;
  static readonly toHours = 60 * 60 * 60;

  /** Global delta value. Do not change. */
  static delta = 1;
  /** Global time values. Do not change. */
  static time = 0;
  static globalTime = 0;

  static readonly nanosPerMilli = 1000000;

  private static timeRaw = 0;
  private static globalTimeRaw = 0;

  private static runs: DelayRun[] = [];
  private static removal: DelayRun[] = [];
  private static marks: number[] = [];
  // 对齐 arc/util/Time.java:26: delta = min(graphics.getDeltaTime() * 60, 3)。
  // headless 下 Core.graphics 是 MockGraphics, getDeltaTime() 固定 1/60, 故 delta 恒为 1。
  private static deltaimpl: Floatp = () => Math.min(Core.graphics.getDeltaTime() * 60, 3);

  /** 对应 Java 嵌套类 Time.DelayRun。 */
  static DelayRun = DelayRun;

  static getRuns(): DelayRun[]{
    return Time.runs;
  }

  static setRuns(runs: DelayRun[]): void{
    Time.runs = runs;
  }

  /** Runs a task with a delay of several ticks. If Time.clear() is called, this task will be cancelled. */
  static run(delay: number, r: Runnable): void{
    const run = Pools.obtain(DelayRun, () => new DelayRun());
    run.finish = r;
    run.delay = delay;
    Time.runs.push(run);
  }

  /** Runs a task with a delay of several ticks. Unless the application is closed, this task will always complete. */
  static runTask(delay: number, r: Runnable): Task{
    // Java: Timer.schedule(r, delay / 60) —— delay 单位是 tick, 换算成秒交给 Timer。
    return Timer.schedule(r, delay / 60);
  }

  static mark(): void{
    Time.marks.push(Time.nanos());
  }

  /** A value of -1 means mark() wasn't called beforehand. */
  static elapsed(): number{
    if(Time.marks.length === 0){
      return -1;
    }else{
      return Time.timeSinceNanos(Time.marks.pop()!) / 1000000;
    }
  }

  static updateGlobal(): void{
    Time.globalTimeRaw += Core.graphics.getDeltaTime() * 60;
    Time.delta = Time.deltaimpl();

    if(!Number.isFinite(Time.timeRaw)){
      Time.timeRaw = 0;
    }

    Time.time = Time.timeRaw;
    Time.globalTime = Time.globalTimeRaw;
  }

  static update(): void{
    Time.timeRaw += Time.delta;
    Time.removal.length = 0;

    if(!Number.isFinite(Time.timeRaw)){
      Time.timeRaw = 0;
    }

    Time.time = Time.timeRaw;
    Time.globalTime = Time.globalTimeRaw;

    for(const run of Time.runs){
      run.delay -= Time.delta;

      if(run.delay <= 0){
        run.finish!();
        Time.removal.push(run);
        Pools.free(run);
      }
    }

    // Java Seq.removeAll(removal)：按引用移除
    for(const r of Time.removal){
      const idx = Time.runs.indexOf(r);
      if(idx !== -1) Time.runs.splice(idx, 1);
    }

    // Java 里 Timer 由独立线程驱动; headless 没有真实时间, 改由本帧调用推进 (TS-3)。
    Timer.update();
  }

  static getInternalTime(): number{
    return Time.timeRaw;
  }

  static setInternalTime(timeInternal: number): void{
    Time.timeRaw = timeInternal;
    Time.time = timeInternal;
  }

  static clear(): void{
    Time.runs.length = 0;
  }

  static setDeltaProvider(impl: Floatp): void{
    Time.deltaimpl = impl;
    Time.delta = impl();
  }

  /** @return The current value of the system timer, in nanoseconds. */
  static nanos(): number{
    // 对应 System.nanoTime()：单调时钟；performance.now() 以毫秒计，换算为纳秒
    return Math.round(performance.now() * 1e6);
  }

  /** @return the difference, measured in milliseconds, between the current time and midnight, January 1, 1970 UTC. */
  static millis(): number{
    return Date.now();
  }

  /**
   * Convert nanoseconds time to milliseconds
   * @param nanos must be nanoseconds
   * @return time value in milliseconds
   */
  static nanosToMillis(nanos: number): number{
    return nanos / Time.nanosPerMilli;
  }

  /**
   * Convert milliseconds time to nanoseconds
   * @param millis must be milliseconds
   * @return time value in nanoseconds
   */
  static millisToNanos(millis: number): number{
    return millis * Time.nanosPerMilli;
  }

  /**
   * Get the time in nanos passed since a previous time
   * @param prevTime - must be nanoseconds
   * @return - time passed since prevTime in nanoseconds
   */
  static timeSinceNanos(prevTime: number): number{
    return Time.nanos() - prevTime;
  }

  /**
   * Get the time in millis passed since a previous time
   * @param prevTime - must be milliseconds
   * @return - time passed since prevTime in milliseconds
   */
  static timeSinceMillis(prevTime: number): number{
    return Time.millis() - prevTime;
  }
}
