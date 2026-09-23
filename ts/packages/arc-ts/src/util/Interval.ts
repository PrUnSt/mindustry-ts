// 源: arc-core/src/arc/util/Interval.java (47 行)
// 迁移说明: 逐字移植。时间基准是 arc.util.Time.time (tick 计数), 无任何真实时钟依赖。
import { Time } from "./Time";

/** 用于「每隔 time 秒最多通过一次」的计时器组。对应 arc.util.Interval。 */
export class Interval{
  /** 每个 id 上次通过时的 Time.time。Java 中为包私有 `float[] times`。 */
  readonly times: number[];

  constructor(capacity: number = 1){
    this.times = new Array<number>(capacity).fill(0);
  }

  /** 对应 Java Interval.get(float time): 等价于 get(0, time)。 */
  get(time: number): boolean;
  /** 对应 Java Interval.get(int id, float time)。 */
  get(id: number, time: number): boolean;
  get(idOrTime: number, time?: number): boolean{
    if(time === undefined) return this.get(0, idOrTime);

    const id = idOrTime;
    if(id >= this.times.length) throw new Error("Out of bounds! Max timer size is " + this.times.length + "!");

    const got = this.check(id, time);
    if(got) this.times[id] = Time.time;
    return got;
  }

  /** @return 指定 id 是否距上次通过已超过 time (或时间被回拨)。对应 Java Interval.check。 */
  check(id: number, time: number): boolean{
    return Time.time - this.times[id] >= time || Time.time < this.times[id];
  }

  /** 把指定 id 的上次通过时刻设为 time 秒之前。对应 Java Interval.reset。 */
  reset(id: number, time: number): void{
    this.times[id] = Time.time - time;
  }

  /** 对应 Java Interval.clear(): Arrays.fill(times, 0)。 */
  clear(): void{
    this.times.fill(0);
  }

  /** @return 距指定 id 上次通过已过去多少 tick。对应 Java Interval.getTime。 */
  getTime(id: number): number{
    return Time.time - this.times[id];
  }

  /** 对应 Java Interval.getTimes()。 */
  getTimes(): number[]{
    return this.times;
  }
}
