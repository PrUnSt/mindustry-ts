// 源: arc-core/src/arc/util/Timer.java (369 行)
//
// 迁移说明 (重要, 与 Java 有意偏离):
//  Java 的 Timer 由独立守护线程 TimerThread + System.nanoTime() 驱动, 任务到点后经 `task.app.post()`
//  排到主循环下一帧执行。headless 是虚拟时钟 (没有真实流逝的时间), 线程/真实等待会让模拟不可复现,
//  因此本移植把时钟整体换成「帧/tick 时钟」:
//    - 时间单位: tick。1 tick = 1/60 秒 (对齐 Time.toSeconds)。
//      Java: executeTimeMillis = System.nanoTime()/1e6 + (long)(delaySeconds * 1000)
//      此处: executeTimeTicks  = Time.time          + delaySeconds * 60
//    - 推进方式: Time.update() 每帧末尾调用 Timer.update(), 由它比对 Time.time 执行到期任务。
//      绝无 setTimeout / 线程 / sleep / 真实等待。
//    - 执行方式: 直接同步调用 task.run()。Java 走 app.post(task), 而 headless 的 Application.post
//      本身就是同步执行 (MockApplication.post / HeadlessApplication 的 TaskQueue 下一帧), 语义等价且更确定。
//    - 省略: TimerThread / threadLock 线程同步 / start()/stop() 的线程实例表 / Core.files 变化检测。
//      stop()/start() 保留为简单的开关语义 (停止后 tick() 不再执行也不推进任务计时, 与 Java 注释一致)。
//    - 省略: Task 构造器里 `app = Core.app` 与 "Core.app not available." 抛错 (本移植不依赖 app)。
import { Seq } from "../struct/Seq";
import { Time } from "./Time";
import type { Runnable } from "./Time";

/** 1 秒对应的 tick 数 (对齐 Time.toSeconds)。 */
const ticksPerSecond = 60;

/** 可被 Timer 调度的任务。对应 Java `Timer.Task`。
 *  Java 声明为 `static abstract class Task implements Runnable`; TS 里的 Runnable 是函数类型
 *  `() => void`, 类无法实现调用签名, 故此处不写 `implements Runnable`
 *  (Timer.schedule 用重载同时接受 Task 与 () => void)。 */
export abstract class Task{
  /** 绝对执行时刻, 单位 tick (对应 Java executeTimeMillis)。 */
  executeTimeTicks = 0;
  /** 重复间隔, 单位 tick (对应 Java intervalMillis)。 */
  intervalTicks = 0;
  /** 剩余重复次数: 0 = 只执行一次; > 0 = 再重复该次数; < 0 = 无限重复。 */
  repeatCount = 0;
  /** 所属 timer; null 表示未调度。 */
  timer: Timer | null = null;

  /** 对应 Java Task.run()。 */
  abstract run(): void;

  /** 取消任务。对应 Java Task.cancel()。 */
  cancel(): void{
    const timer = this.timer;
    if(timer !== null){
      this.executeTimeTicks = 0;
      this.timer = null;
      timer.removeTask(this);
    }else{
      this.executeTimeTicks = 0;
      this.timer = null;
    }
  }

  /** @return 该任务是否已排入某个 timer。对应 Java Task.isScheduled()。 */
  isScheduled(): boolean{
    return this.timer !== null;
  }

  /** @return 下一次执行时刻 (单位 tick)。对应 Java Task.getExecuteTimeMillis()。 */
  getExecuteTimeTicks(): number{
    return this.executeTimeTicks;
  }
}

/** 把 Runnable 包装成一次性 Task (对应 Java Timer 里的匿名 Task 子类)。 */
class RunnableTask extends Task{
  private readonly fn: Runnable;

  constructor(fn: Runnable){
    super();
    this.fn = fn;
  }

  run(): void{
    this.fn();
  }
}

/**
 * 在主循环线程上按帧执行任务。对应 arc.util.Timer。
 * 静态方法 (@see post/schedule) 使用全局单例 instance()。
 */
export class Timer{
  private static singleton: Timer | null = null;

  /** 全局单例 (对应 Java Timer.instance())。惰性创建, 避免模块加载期互相引用。 */
  static instance(): Timer{
    if(Timer.singleton === null) Timer.singleton = new Timer();
    return Timer.singleton;
  }

  /** 任务队列。对应 Java `final Seq<Task> tasks = new Seq<>(false, 8)`。 */
  private readonly tasks = new Seq<Task>(false, 8);
  /** false 表示已 stop(); 对应 Java 从 TimerThread.instances 中摘除的效果。 */
  private running = true;

  /** 调度一个「下一帧尽快执行」的任务。对应 Java Timer.post(Task)。 */
  static post(task: Task): Task{
    return Timer.instance().postTask(task);
  }

  /** 调度一次性任务。对应 Java Timer.schedule(Task, float)。 */
  static schedule(task: Task, delaySeconds: number): Task;
  /** 调度周期性任务 (无限重复)。对应 Java Timer.schedule(Task, float, float)。 */
  static schedule(task: Task, delaySeconds: number, intervalSeconds: number): Task;
  /** 调度重复 repeatCount 次的任务。对应 Java Timer.schedule(Task, float, float, int)。 */
  static schedule(task: Task, delaySeconds: number, intervalSeconds: number, repeatCount: number): Task;
  /** 调度一次性 Runnable。对应 Java Timer.schedule(Runnable, float)。 */
  static schedule(task: Runnable, delaySeconds: number): Task;
  /** 调度周期性 Runnable (无限重复)。对应 Java Timer.schedule(Runnable, float, float)。 */
  static schedule(task: Runnable, delaySeconds: number, intervalSeconds: number): Task;
  /** 调度重复 repeatCount 次的 Runnable。对应 Java Timer.schedule(Runnable, float, float, int)。 */
  static schedule(task: Runnable, delaySeconds: number, intervalSeconds: number, repeatCount: number): Task;
  static schedule(task: Task | Runnable, delaySeconds: number, intervalSeconds?: number, repeatCount?: number): Task{
    const wrapped = typeof task === "function" ? new RunnableTask(task) : task;
    if(intervalSeconds === undefined) return Timer.instance().scheduleTask(wrapped, delaySeconds);
    if(repeatCount === undefined) return Timer.instance().scheduleTask(wrapped, delaySeconds, intervalSeconds);
    return Timer.instance().scheduleTask(wrapped, delaySeconds, intervalSeconds, repeatCount);
  }

  /** 由 Time.update() 每帧调用, 用虚拟 tick 时钟推进队列 (对应 Java TimerThread.run 的 update 循环)。 */
  static update(): void{
    Timer.instance().tick();
  }

  /** 对应 Java Timer.postTask(Task)。 */
  postTask(task: Task): Task{
    return this.scheduleTask(task, 0, 0, 0);
  }

  /** 对应 Java Timer.scheduleTask(Task, float): 延迟 delaySeconds 后执行一次。 */
  scheduleTask(task: Task, delaySeconds: number): Task;
  /** 对应 Java Timer.scheduleTask(Task, float, float): 延迟后按间隔无限重复。 */
  scheduleTask(task: Task, delaySeconds: number, intervalSeconds: number): Task;
  /** 对应 Java Timer.scheduleTask(Task, float, float, int)。 */
  scheduleTask(task: Task, delaySeconds: number, intervalSeconds: number, repeatCount: number): Task;
  scheduleTask(task: Task, delaySeconds: number, intervalSeconds?: number, repeatCount?: number): Task{
    const interval = intervalSeconds === undefined ? 0 : intervalSeconds;
    // Java: scheduleTask(task, delay) -> scheduleTask(task, delay, 0, 0)
    //       scheduleTask(task, delay, interval) -> scheduleTask(task, delay, interval, -1)
    const repeat = repeatCount === undefined
      ? (intervalSeconds === undefined ? 0 : -1)
      : repeatCount;

    if(task.timer !== null) throw new Error("The same task may not be scheduled twice.");

    task.timer = this;
    task.executeTimeTicks = Time.time + delaySeconds * ticksPerSecond;
    task.intervalTicks = interval * ticksPerSecond;
    task.repeatCount = repeat;
    this.tasks.add(task);
    return task;
  }

  /** 停止该 timer: 任务不再执行, 流逝的时间也不再作用于任务延迟。对应 Java Timer.stop()。 */
  stop(): void{
    this.running = false;
  }

  /** 重新启动该 timer。对应 Java Timer.start()。 */
  start(): void{
    this.running = true;
  }

  /** 取消所有任务。对应 Java Timer.clear()。 */
  clear(): void{
    for(let i = 0, n = this.tasks.size; i < n; i++){
      const task = this.tasks.items[i];
      task.executeTimeTicks = 0;
      task.timer = null;
    }
    this.tasks.clear();
  }

  /** @return 队列是否为空。对应 Java Timer.isEmpty()。 */
  isEmpty(): boolean{
    return this.tasks.size === 0;
  }

  /** 把队列中所有任务的执行时刻推后 delayTicks 个 tick。对应 Java Timer.delay(long delayMillis)
   *  —— 注意 Java 是毫秒, 本移植以 tick 为单位 (虚拟时钟的原子单位)。 */
  delayTicks(delayTicks: number): void{
    for(let i = 0, n = this.tasks.size; i < n; i++){
      this.tasks.items[i].executeTimeTicks += delayTicks;
    }
  }

  /** 移除任务 (Task.cancel() 的内部实现)。对应 Java `timer.tasks.remove(this, true)`。 */
  /** 包私有 (Java 中为包私有访问)。 */
  removeTask(task: Task): void{
    this.tasks.remove(task, true);
  }

  /**
   * 用虚拟时钟推进一帧, 执行所有到期的任务。
   * 对应 Java Timer.update(long timeMillis, long waitMillis) 的任务处理部分。
   */
  private tick(): void{
    if(!this.running) return;

    const now = Time.time;
    // Java: 遍历 tasks, 到期者执行; repeatCount==0 者执行后移除。
    // tasks 为无序 Seq, remove(i) 会把最后一个元素补位, 故需 i-- (与 Java 循环一致)。
    for(let i = 0; i < this.tasks.size; i++){
      const task = this.tasks.items[i];

      if(task.executeTimeTicks > now) continue;

      if(task.repeatCount === 0){
        task.timer = null;
        this.tasks.remove(i);
        i--;
      }else{
        task.executeTimeTicks = now + task.intervalTicks;
        if(task.repeatCount > 0) task.repeatCount--;
      }

      task.run();
    }
  }
}
