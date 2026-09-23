// 测试: arc-core/src/arc/Events.java 移植
import { describe, expect, it, beforeEach } from "vitest";
import { Events } from "./Events";

class MyEvent{
  constructor(readonly value: number){
  }
}

class OtherEvent{
}

enum Trigger{
  spawn,
  despawn
}

describe("Events", () => {
  beforeEach(() => {
    Events.clear();
  });

  it("两个监听器 fire 后计数 2, 且拿到同一个事件对象 (e1 === e2)", () => {
    const seen: MyEvent[] = [];
    const listener1 = (e: MyEvent): void => { seen.push(e); };
    const listener2 = (e: MyEvent): void => { seen.push(e); };

    Events.on(MyEvent, listener1);
    Events.on(MyEvent, listener2);

    const e1 = new MyEvent(7);
    Events.fire(e1);

    expect(seen.length).toBe(2);
    expect(seen[0]).toBe(e1);            // 对象身份, 不是等值拷贝
    expect(seen[1]).toBe(e1);
    expect(seen[0]).toBe(seen[1]);
    expect(seen[0]!.value).toBe(7);
  });

  it("按运行时类型分派: 只调用该类型的监听器", () => {
    let mine = 0, other = 0;
    Events.on(MyEvent, () => mine++);
    Events.on(OtherEvent, () => other++);

    Events.fire(new MyEvent(1));
    expect(mine).toBe(1);
    expect(other).toBe(0);

    Events.fire(new OtherEvent());
    expect(mine).toBe(1);
    expect(other).toBe(1);
  });

  it("fireTrigger 只触发对应 trigger (枚举值本身作 key)", () => {
    let spawns = 0, despawns = 0;
    Events.run(Trigger.spawn, () => spawns++);
    Events.run(Trigger.despawn, () => despawns++);

    Events.fireTrigger(Trigger.spawn);
    expect(spawns).toBe(1);
    expect(despawns).toBe(0);

    Events.fireTrigger(Trigger.despawn);
    expect(spawns).toBe(1);
    expect(despawns).toBe(1);
  });

  it("fireClass(ctype, type) 用显式 key 分派 (Java fire(Class<?>, T))", () => {
    let calls = 0;
    Events.on(MyEvent, () => calls++);

    Events.fireClass(MyEvent, new MyEvent(3));
    expect(calls).toBe(1);
  });

  it("remove() 按引用移除, 返回是否真的移除", () => {
    let calls = 0;
    const listener = (): void => { calls++; };

    Events.on(MyEvent, listener);
    Events.fire(new MyEvent(1));
    expect(calls).toBe(1);

    expect(Events.remove(MyEvent, listener)).toBe(true);
    Events.fire(new MyEvent(2));
    expect(calls).toBe(1);                       // 已移除, 不再累加

    expect(Events.remove(MyEvent, listener)).toBe(false);
  });

  it("clear() 清空全部监听器 (含 trigger)", () => {
    let calls = 0;
    Events.on(MyEvent, () => calls++);
    Events.run(Trigger.spawn, () => calls++);

    Events.clear();
    Events.fire(new MyEvent(1));
    Events.fireTrigger(Trigger.spawn);
    expect(calls).toBe(0);
  });

  it("遍历中使用快照长度: 本轮新增的监听器不会被执行 (对齐 Java 的 len/items 快照)", () => {
    const seen: string[] = [];
    const second = (): void => { seen.push("second"); };

    Events.on(MyEvent, () => {
      seen.push("first");
      Events.on(MyEvent, second);                // 本轮不应被调用
    });

    Events.fire(new MyEvent(1));
    expect(seen).toEqual(["first"]);

    Events.fire(new MyEvent(2));                 // 下一轮才生效
    expect(seen).toEqual(["first", "first", "second"]);
  });

  it("同一监听器注册两次会被调用两次 (Java: 不去重)", () => {
    let calls = 0;
    const listener = (): void => { calls++; };

    Events.on(MyEvent, listener);
    Events.on(MyEvent, listener);
    Events.fire(new MyEvent(1));
    expect(calls).toBe(2);
  });
});
