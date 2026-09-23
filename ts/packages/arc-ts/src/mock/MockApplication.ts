// 源: arc-core/src/arc/mock/MockApplication.java (37 行)
//
// 迁移说明:
//  - 有意偏离 #1: Java 的 `getListeners()` 每次 `new Seq<>()` —— 调用 addListener 的结果会立刻丢失,
//    这是 Java 侧的缺陷。此处改为持有单一 Seq 实例, 否则 Application 的监听器语义不成立。
//  - 有意偏离 #2: listeners 用惰性创建, 不做字段初始化。原因是模块加载期存在
//    struct/Seq -> struct/Mathf -> math/Mathf -> util/Time -> Core -> mock/MockApplication -> struct/Seq
//    的循环; 若在构造期 `new Seq()` 会命中 Seq 的 TDZ (Cannot access 'Seq' before initialization)。
//  - 其余 (getType/post/exit 等) 与 Java MockApplication 一致: 全部按 headless 的 no-op 语义。
import { Core, ApplicationType } from "../Core";
import type { Application } from "../Core";
import { Seq } from "../struct/Seq";
import type { ApplicationListener } from "../ApplicationListener";

/** headless 用的无操作 Application 实现。对应 arc.mock.MockApplication。 */
export class MockApplication implements Application{
  private listenerSeq: Seq<ApplicationListener> | null = null;

  getListeners(): Seq<ApplicationListener>{
    if(this.listenerSeq === null) this.listenerSeq = new Seq<ApplicationListener>();
    return this.listenerSeq;
  }

  /** 对应 Application.addListener 的默认实现。 */
  addListener(listener: ApplicationListener): void{
    this.getListeners().add(listener);
  }

  /** 对应 Application.removeListener 的默认实现。 */
  removeListener(listener: ApplicationListener): void{
    this.getListeners().remove(listener, true);
  }

  /** 对应 Application.defaultUpdate(): Core.settings.autosave() + Time.updateGlobal()。 */
  defaultUpdate(): void{
    Core.defaultUpdate();
  }

  getType(): ApplicationType{
    return ApplicationType.headless;
  }

  isDesktop(): boolean{
    return this.getType() === ApplicationType.desktop;
  }

  isHeadless(): boolean{
    return this.getType() === ApplicationType.headless;
  }

  isMobile(): boolean{
    return false;
  }

  isWeb(): boolean{
    return this.getType() === ApplicationType.web;
  }

  isOnMainThread(): boolean{
    return true;
  }

  getClipboardText(): string | null{
    return null;
  }

  setClipboardText(_text: string): void{
  }

  /** 对应 MockApplication.post(): 直接同步执行。 */
  post(runnable: () => void): void{
    runnable();
  }

  exit(): void{
  }

  dispose(): void{
  }
}
