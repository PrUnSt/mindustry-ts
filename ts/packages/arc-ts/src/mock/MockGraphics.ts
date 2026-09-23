// 源: arc-core/src/arc/mock/MockGraphics.java (181 行) + HeadlessApplication.java:39
//
// 迁移说明 (关键正确性点):
//  Java 的 MockGraphics.updateTime() 用 System.nanoTime() 真实耗时算出 deltaTime, getDeltaTime()
//  返回该字段。headless 是虚拟时钟, 真实耗时不可复现, 因此本移植把 deltaTime 固定为 1/60 秒
//  (对齐 HeadlessApplication 默认 renderInterval = 1f/60f, 见 HeadlessApplication.java:23)。
//  由此 Time.delta = min(1/60 * 60, 3) = 1 恒成立 —— 这是整个确定性模拟的锚点, 不可改为读真实时间。
//  其余成员为 Java MockGraphics 的重声明: 图形/GL 层在 headless 下不做事, 返回值取 Java 中的常量。
export class MockGraphics{
  /** 虚拟帧时长 (秒)。getDeltaTime() 恒返回它, 不读真实时钟。 */
  static readonly fixedDeltaTime = 1 / 60;

  /** 对应 Java MockGraphics.frameId, 初值 -1。 */
  frameId = -1;
  /** 对应 Java MockGraphics.frames。 */
  frames = 0;
  /** 对应 Java MockGraphics.fps。 */
  fps = 0;

  getFrameId(): number{
    return this.frameId;
  }

  getDeltaTime(): number{
    return MockGraphics.fixedDeltaTime;
  }

  getFramesPerSecond(): number{
    return this.fps;
  }

  getWidth(): number{
    return 0;
  }

  getHeight(): number{
    return 0;
  }

  getBackBufferWidth(): number{
    return 0;
  }

  getBackBufferHeight(): number{
    return 0;
  }

  isGL30Available(): boolean{
    return false;
  }

  isContinuousRendering(): boolean{
    return false;
  }

  isFullscreen(): boolean{
    return false;
  }

  supportsExtension(_extension: string): boolean{
    return false;
  }

  setTitle(_title: string): void{
  }

  setVSync(_vsync: boolean): void{
  }

  setContinuousRendering(_isContinuous: boolean): void{
  }

  requestRendering(): void{
  }

  /** 对应 Java MockGraphics.incrementFrameId()。 */
  incrementFrameId(): void{
    this.frameId++;
  }

  /** 对应 Java MockGraphics.updateTime()。Java 在此用真实时间重算 deltaTime/fps;
   *  这里只累计帧数, 不修改 deltaTime (见文件头说明)。 */
  updateTime(): void{
    this.frames++;
  }
}
