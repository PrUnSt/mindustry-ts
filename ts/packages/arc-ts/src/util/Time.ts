// 源: arc-core/src/arc/util/Time.java

import { Floatp } from "./func/Floatp";
import { Pools } from "./Pools";
import { Poolable } from "./Pool";

/** 对应 java.lang.Runnable。 */
export type Runnable = () => void;

/** 最小本地 Core 替代（默认 60fps），TODO: 迁移到 <Core.graphics> 统一实现 */
const Core = {
  graphics: {
    getDeltaTime(): number{
      return 1 / 60;
    }
  }
};

/** 最小本地 Timer 替代（setTimeout），TODO: 迁移到 <util/Timer> 统一实现 */
export class Task{
  cancelled = false;
  private handle: ReturnType<typeof setTimeout> | null = null;

  schedule(runnable: Runnable, delaySeconds: number): void{
    this.handle = setTimeout(() => {
      if(this.cancelled) return;
      runnable();
    }, delaySeconds * 1000);
  }

  cancel(): void{
    this.cancelled = true;
    if(this.handle !== null) clearTimeout(this.handle);
  }
}

const Timer = {
  schedule(r: Runnable, delaySeconds: number): Task{
    const task = new Task();
    task.schedule(r, delaySeconds);
    return task;
  }
};

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


