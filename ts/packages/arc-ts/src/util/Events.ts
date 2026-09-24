// 源: arc-core/src/arc/Events.java
//
// 迁移说明: Java 用 `ObjectMap<Object, Seq<Cons<?>>>`, key 可以是 Class<?> 也可以是枚举实例。
//  Java 有两个 fire 重载, 靠静态类型分派:
//    fire(Enum<T> type)  -> 直接以枚举值本身为 key
//    fire(T type)        -> 以 type.getClass() 为 key
//  TS 没有重载分派, 故拆成两个显式方法 (语义一一对应):
//    Events.fire(event)          <=> fire(T type)        (以 event.constructor 为 key)
//    Events.fireTrigger(trigger) <=> fire(Enum<T> type)  (以枚举值本身为 key)
//  on / run / remove / clear 与 Java 同名同义。
import { ObjectMap } from "../struct/ObjectMap";
import { Seq } from "../struct/Seq";
import type { Cons } from "../util/func/Cons";

/** 简单的全局事件监听系统。对应 arc.Events。 */
export class Events{
  private static readonly events = new ObjectMap<unknown, Seq<Cons<unknown>>>();

  /** 按类型 (构造器) 注册监听器。对应 Java Events.on(Class<T>, Cons<T>)。 */
  static on<T>(type: Function, listener: Cons<T>): void{
    Events.listeners(type).add(listener as Cons<unknown>);
  }

  /** 按任意 trigger 对象 (通常是枚举值) 注册无参监听器。对应 Java Events.run(Object, Runnable)。 */
  static run(type: unknown, listener: () => void): void{
    Events.listeners(type).add(() => listener());
  }

  /** 按引用移除监听器。对应 Java Events.remove(Class<T>, Cons<T>)。 */
  static remove<T>(type: unknown, listener: Cons<T>): boolean{
    const listeners = Events.events.get(type);
    if(listeners === null) return false;

    // Java: listeners.remove(listener, true) —— 监听器队列是 Seq<Cons<T>>, 即「元素本身是函数」.
    // Seq.remove(value, true) 现在只按引用比较 (Seq.ts 顶部注释: 已不再用 typeof==='function' 猜测意图),
    // 因此这里可以直接用自然写法, 无需再手动索引循环.
    return listeners.remove(listener as Cons<unknown>, true);
  }

  /** 触发枚举/trigger 事件 (key 为 trigger 本身)。对应 Java Events.fire(Enum<T>)。 */
  static fireTrigger(type: unknown): void{
    Events.dispatch(Events.events.get(type), type);
  }

  /** 触发以 event 的运行时类型为 key 的事件。对应 Java Events.fire(T type)。 */
  static fire<T>(type: T): void{
    Events.fireClass((type as any)?.constructor, type);
  }

  /** 触发指定 key 的事件。对应 Java Events.fire(Class<?> ctype, T type)。 */
  static fireClass<T>(ctype: unknown, type: T): void{
    Events.dispatch(Events.events.get(ctype), type);
  }

  /** 清空所有监听器。对应 Java Events.clear()。 */
  static clear(): void{
    Events.events.clear();
  }

  private static listeners(key: unknown): Seq<Cons<unknown>>{
    // Java: events.get(type, () -> new Seq<>(Cons.class))
    return Events.events.get(key, () => new Seq<Cons<unknown>>());
  }

  private static dispatch<T>(listeners: Seq<Cons<unknown>> | null, type: T): void{
    if(listeners === null) return;
    // 先取长度与底层数组, 与 Java 一致: 监听器在执行过程中增删不影响本轮遍历。
    const len = listeners.size;
    const items = listeners.items;
    for(let i = 0; i < len; i++){
      (items[i] as Cons<T>)(type);
    }
  }
}
