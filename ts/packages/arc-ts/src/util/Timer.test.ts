// 测试: arc-core/src/arc/util/Timer.java (369 行) 的帧驱动移植 (TS-3)
// 关键验收: 推 4 次 Time.update() 后 calls===0, 第 5 次后 ===1 —— 全程无真实等待 (不 sleep)。
import { describe, expect, it, beforeEach } from "vitest";
import { Time } from "./Time";
import { Timer, Task } from "./Timer";

/** 记录被调用次数的测试任务。 */
class Counting extends Task{
  calls = 0;

  run(): void{
    this.calls++;
  }
}

describe("Timer (帧驱动, 无 setTimeout)", () => {
  beforeEach(() => {
    Time.delta = 1;
    Time.setInternalTime(0);
    Time.globalTime = 0;
    Timer.instance().clear();
    Timer.instance().start();
  });

  it("5 tick 的任务: 推 4 次 Time.update() 后 calls===0, 第 5 次后 calls===1", () => {
    const task = new Counting();
    Timer.schedule(task, 5 / 60);           // 5 个 tick (不换算成真实毫秒等待)

    for(let i = 0; i < 4; i++) Time.update();
    expect(task.calls).toBe(0);

    Time.update();                           // 第 5 次
    expect(task.calls).toBe(1);
    expect(task.isScheduled()).toBe(false);  // 一次性任务执行后出队
    expect(Timer.instance().isEmpty()).toBe(true);
  });

  it("反事实: 执行时刻完全由虚拟 tick 决定, 与挂钟无关", () => {
    Time.setInternalTime(1000);
    const task = new Counting();
    Timer.schedule(task, 2 / 60);

    // 若 Timer 用 System.nanoTime()/Date.now(), 这里会是「当前毫秒 + 33」这样的大数;
    // 现在它必须精确等于 Time.time + 2。
    expect(task.getExecuteTimeTicks()).toBe(1002);
    expect(task.calls).toBe(0);              // 未推帧 → 绝不执行 (setTimeout 版会自行到点)
  });

  it("周期性任务: delay 0 立即执行, 之后每个 interval 执行一次, 共 1+repeatCount 次", () => {
    const task = new Counting();
    Timer.schedule(task, 0, 2 / 60, 2);      // 每 2 tick, 额外重复 2 次

    Time.update();                           // tick 1: 首次执行
    expect(task.calls).toBe(1);

    Time.update();                           // tick 2
    expect(task.calls).toBe(1);
    Time.update();                           // tick 3: 第 2 次
    expect(task.calls).toBe(2);

    Time.update();                           // tick 4
    expect(task.calls).toBe(2);
    Time.update();                           // tick 5: 第 3 次后出队
    expect(task.calls).toBe(3);
    expect(task.isScheduled()).toBe(false);
    expect(Timer.instance().isEmpty()).toBe(true);
  });

  it("3 参 schedule 默认无限重复 (Timer.java:131 -> repeatCount = -1)", () => {
    const task = new Counting();
    Timer.schedule(task, 1 / 60, 1 / 60);    // 每 tick 一次, 永不自动结束

    for(let i = 0; i < 5; i++) Time.update();
    expect(task.calls).toBe(5);
    expect(task.isScheduled()).toBe(true);
    expect(task.repeatCount).toBe(-1);
  });

  it("Runnable 重载被包装成一次性 Task", () => {
    let calls = 0;
    const task = Timer.schedule(() => calls++, 1 / 60);

    expect(Timer.instance().isEmpty()).toBe(false);
    Time.update();
    expect(calls).toBe(1);
    expect(task.isScheduled()).toBe(false);
    expect(Timer.instance().isEmpty()).toBe(true);
  });

  it("同一个 Task 不能被调度两次 (Timer.java:141)", () => {
    const task = new Counting();
    Timer.schedule(task, 1 / 60);
    expect(() => Timer.schedule(task, 1 / 60)).toThrowError("The same task may not be scheduled twice.");
  });

  it("cancel() 后不再执行, 且执行时刻被置 0", () => {
    const task = new Counting();
    Timer.schedule(task, 3 / 60);
    expect(task.isScheduled()).toBe(true);

    task.cancel();
    expect(task.isScheduled()).toBe(false);
    expect(task.executeTimeTicks).toBe(0);
    expect(Timer.instance().isEmpty()).toBe(true);

    for(let i = 0; i < 6; i++) Time.update();
    expect(task.calls).toBe(0);
  });

  it("post()/postTask() 在下一帧执行 (delay 0)", () => {
    const task = new Counting();
    Timer.post(task);
    expect(task.calls).toBe(0);

    Time.update();
    expect(task.calls).toBe(1);
  });

  it("stop() 后不执行, start() 后立刻补执行", () => {
    const task = new Counting();
    Timer.schedule(task, 1 / 60);

    Timer.instance().stop();
    Time.update();
    expect(task.calls).toBe(0);

    Timer.instance().start();
    Time.update();                           // executeTimeTicks(1) <= Time.time(2)
    expect(task.calls).toBe(1);
  });

  it("delayTicks() 把队列内所有任务整体推后", () => {
    const task = new Counting();
    Timer.schedule(task, 1 / 60);
    Timer.instance().delayTicks(3);          // 执行时刻 1 -> 4

    Time.update();
    Time.update();
    Time.update();
    expect(task.calls).toBe(0);              // 4 > 3

    Time.update();                           // 4 <= 4
    expect(task.calls).toBe(1);
  });

  it("clear() 取消全部任务", () => {
    const a = new Counting(), b = new Counting();
    Timer.schedule(a, 1 / 60);
    Timer.schedule(b, 1 / 60);
    expect(Timer.instance().isEmpty()).toBe(false);

    Timer.instance().clear();
    expect(Timer.instance().isEmpty()).toBe(true);
    expect(a.isScheduled()).toBe(false);
    expect(b.isScheduled()).toBe(false);

    for(let i = 0; i < 3; i++) Time.update();
    expect(a.calls + b.calls).toBe(0);
  });

  it("Time.runTask(delay, r) 按 tick 延迟, 并被 Time.update() 推进", () => {
    let calls = 0;
    Time.runTask(3, () => calls++);

    Time.update();
    Time.update();
    expect(calls).toBe(0);

    Time.update();
    expect(calls).toBe(1);
  });
});
