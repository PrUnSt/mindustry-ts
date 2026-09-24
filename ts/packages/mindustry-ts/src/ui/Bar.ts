// 源: core/src/mindustry/ui/Bar.java
//
// 计划 §11: 「`ui.Bar` → 纯数据类（保留 `.blink()` 返回 this）」。原因是
// `Block.setBars()` 会 `new Bar(...).blink(...)`（`Block.java:709-710`），
// 而 `Block.init()` 会调 `setBars()`（`Block.java:1478`）。
// S3 的 `setBars()` 本身是空实现，所以这里只需要保证「类型存在 + 链式调用返回 this」。

import type { Color } from "../arc-compat/Color.js";

/** 进度条配置（纯数据）。对应 `mindustry.ui.Bar`。 */
export class Bar{
  readonly name: string;
  /** 取值函数（Java 是 `Func<Building, Float>`）。 */
  readonly func: (build: unknown) => number;
  readonly color: Color | null;

  constructor(name: string, color: Color | null, func: (build: unknown) => number){
    this.name = name;
    this.color = color;
    this.func = func;
  }

  /** 对应 Java `Bar.blink(...)`。S3 只记录参数并返回 this（保持链式语义）。 */
  blink(...args: unknown[]): Bar{
    void args;
    return this;
  }
}
