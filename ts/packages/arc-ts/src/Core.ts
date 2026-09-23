// 源: arc-core/src/arc/Core.java
//
// 迁移说明:
//  - Java 侧 Core 是一组全局模块引用; 字段类型分散在 arc.Application / arc.Graphics /
//    arc.util.Settings / arc.util.I18NBundle 等文件中。S1 只收敛 tick 必需项, 故把
//    `Application` 这个真正是接口的类型内联在本文件 (对齐 arc/Core.java 的引用点),
//    实现由 mock/ 提供; Graphics / Settings / Bundle 目前直接以 mock 类为类型
//    (对应 Java 的 MockGraphics extends Graphics、MockSettings extends Settings)。
//  - Java 中未初始化的字段为 null; 这里保持 null 语义, 由后续阶段的 backend 赋值。
//    例外: app/graphics/settings/bundle 由 §11「身份稳定存根」要求初始化为真实对象,
//    否则 Time.delta 的取样点 (Core.graphics) 与 UnlockableContent 构造器
//    (Core.settings / Core.bundle) 会在 headless 下拿到 null。
import { MockApplication } from "./mock/MockApplication";
import { MockBundle } from "./mock/MockBundle";
import { MockGraphics } from "./mock/MockGraphics";
import { MockSettings } from "./mock/MockSettings";
import { Time } from "./util/Time";
import type { ApplicationListener } from "./ApplicationListener";
import type { Seq } from "./struct/Seq";

/** 对应 arc.Application.ApplicationType (ordinal 顺序与 Java 一致)。 */
export enum ApplicationType{
  android,
  desktop,
  headless,
  web,
  iOS
}

/** 对应 arc.Application。 */
export interface Application{
  /** @return 该应用持有的全部 ApplicationListener。 */
  getListeners(): Seq<ApplicationListener>;
  /** 添加一个监听器。 */
  addListener(listener: ApplicationListener): void;
  /** 移除一个监听器。 */
  removeListener(listener: ApplicationListener): void;
  /** 各 backend 在 update() 前调用。对应 Application.defaultUpdate()。 */
  defaultUpdate(): void;
  getType(): ApplicationType;
  isDesktop(): boolean;
  isHeadless(): boolean;
  isMobile(): boolean;
  isWeb(): boolean;
  /** @return 当前线程是否是主线程; 主线程未初始化时返回 true (对齐 Java)。 */
  isOnMainThread(): boolean;
  getClipboardText(): string | null;
  setClipboardText(text: string): void;
  /** 把 runnable 投递到主循环线程。 */
  post(runnable: () => void): void;
  /** 请求退出应用。 */
  exit(): void;
  /** 释放资源。对应 Disposable.dispose()。 */
  dispose(): void;
}

/**
 * Arc 各核心模块的全局引用。对应 arc.Core。
 * Java 全部是 static 字段, 这里用 static 属性逐一对照。
 */
export class Core{
  static app: Application = new MockApplication();
  static graphics: MockGraphics = new MockGraphics();
  static settings: MockSettings = new MockSettings();
  /** Java: `static I18NBundle bundle = I18NBundle.createEmptyBundle();` —— 保证永不 null。 */
  static bundle: MockBundle = new MockBundle();

  // ---- 以下为 Java Core 中未初始化的模块引用 (Java 里即 null), 待对应阶段/backend 赋值 ----
  /** 对应 arc.audio.Audio (尚未移植 Sound 层)。 */
  static audio: unknown = null;
  /** 对应 arc.Input。 */
  static input: unknown = null;
  /** 对应 arc.Files。 */
  static files: unknown = null;
  /** 对应 arc.graphics.Camera。 */
  static camera: unknown = null;
  /** 对应 arc.graphics.g2d.Batch。 */
  static batch: unknown = null;
  /** 对应 arc.scene.Scene。 */
  static scene: unknown = null;
  /** 对应 arc.assets.AssetManager。 */
  static assets: unknown = null;
  /** 对应 arc.graphics.g2d.TextureAtlas。 */
  static atlas: unknown = null;
  /** 对应 arc.graphics.GL20 / GL30。 */
  static gl: unknown = null;
  static gl20: unknown = null;
  static gl30: unknown = null;

  /** 对应 Application.defaultUpdate(): 各 backend 在 update() 前调用。 */
  static defaultUpdate(): void{
    Core.settings.autosave();
    Time.updateGlobal();
  }
}
