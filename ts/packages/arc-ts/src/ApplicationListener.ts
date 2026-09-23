// 源: arc-core/src/arc/ApplicationListener.java (67 行)
//
// 迁移说明: Java 的每个方法都是 default 空实现; TS 接口用「可选方法」表达同一语义
// (调用方用 listener.update?.() 调用, 等价于 Java 调用 default 空实现)。
export interface ApplicationListener{
  /** 应用首次创建时调用。 */
  init?(): void;
  /** 应用尺寸变化时调用。 */
  resize?(width: number, height: number): void;
  /** 每帧更新。 */
  update?(): void;
  /** 应用被暂停 (通常是不可见/失焦)。销毁前也会先 pause()。 */
  pause?(): void;
  /** 从暂停恢复。 */
  resume?(): void;
  /** 应用被销毁。 */
  dispose?(): void;
  /** 应用正常退出 (Core.app.exit() 或关闭窗口)。崩溃时不会调用。 */
  exit?(): void;
  /** 有外部文件被拖入窗口时调用。 */
  fileDropped?(file: unknown): void;
}
