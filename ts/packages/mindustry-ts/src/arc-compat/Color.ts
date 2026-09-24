// 源: arc-core/src/arc/graphics/Color.java
//
// 为什么放在 mindustry-ts 里: 计划 §11 要求 `arc/graphics/Color` 真实移植（`Team` 依赖
// `Color.valueOf` / `Color.HSVtoRGB`），但 arc-ts 此刻没有 `graphics/` 目录，而 S3 的文件
// 范围**不含 arc-ts**（另一 agent 正在改它）。按 `ts/README.md` 的「自包含优先」约定，
// 这里先放一份最小实现。
//
// TODO: arc-ts 补上 graphics 模块后，本文件应删除并改为 `export {Color} from "@mindustry-ts/arc"`。

/** 对应 `arc.graphics.Color`。r/g/b/a 均为 0-1 的 float64（Java float 语义）。 */
export class Color{
  /** 对应 `Color.white = new Color(1,1,1,1)`（Java 里是静态可变实例，这里按同样语义保留可变）。 */
  static readonly white = new Color(1, 1, 1, 1);
  /** 对应 `Color.black = new Color(0,0,0,1)`。 */
  static readonly black = new Color(0, 0, 0, 1);
  /** 对应 `Color.clear = new Color(0,0,0,0)`。 */
  static readonly clear = new Color(0, 0, 0, 0);
  /** 对应 `Color.lightGray = new Color(0.75f,0.75f,0.75f,1)`。 */
  static readonly lightGray = new Color(0.75, 0.75, 0.75, 1);

  r = 0;
  g = 0;
  b = 0;
  a = 1;

  constructor();
  constructor(r: number, g: number, b: number, a: number);
  constructor(color: Color);
  constructor(rOrColor?: number | Color, g?: number, b?: number, a?: number){
    if(rOrColor instanceof Color){
      this.setColor(rOrColor);
    }else if(rOrColor !== undefined){
      this.r = rOrColor;
      this.g = g ?? 0;
      this.b = b ?? 0;
      this.a = a ?? 1;
    }
  }

  setColor(color: Color): Color{
    this.r = color.r;
    this.g = color.g;
    this.b = color.b;
    this.a = color.a;
    return this;
  }

  cpy(): Color{
    return new Color(this.r, this.g, this.b, this.a);
  }

  mul(f: number): Color{
    this.r *= f;
    this.g *= f;
    this.b *= f;
    this.a *= f;
    return this;
  }

  /** 对应 `Color.rgba8888()`：打包为 32 位 `rrggbbaa`。 */
  rgba(): number{
    const ri = Math.round(Math.min(Math.max(this.r, 0), 1) * 255) & 0xff;
    const gi = Math.round(Math.min(Math.max(this.g, 0), 1) * 255) & 0xff;
    const bi = Math.round(Math.min(Math.max(this.b, 0), 1) * 255) & 0xff;
    const ai = Math.round(Math.min(Math.max(this.a, 0), 1) * 255) & 0xff;
    return ((ri << 24) | (gi << 16) | (bi << 8) | ai) | 0;
  }

  /** 对应 `Color.toDoubleBits()`：把 `rgba8888()` 的 32 位模式塞进一个 double。 */
  toDoubleBits(): number{
    return intBitsToDouble(this.rgba());
  }

  toString(): string{
    return this.r.toString() + "," + this.g.toString() + "," + this.b.toString() + "," + this.a.toString();
  }

  /**
   * 对应 `Color.valueOf("#rrggbb")` / `"rrggbb"` / `"rrggbbaa"`。
   * 单字符简写（`#f` 之类）在 arc 里也支持，这里保留该分支以对齐语义。
   */
  static valueOf(hex: string): Color{
    let value = hex;
    if(value.startsWith("#")) value = value.slice(1);

    if(value.length === 1){
      const v = parseInt(value + value, 16);
      return new Color((v & 0xff) / 255, (v & 0xff) / 255, (v & 0xff) / 255, 1);
    }

    const r = parseInt(value.slice(0, 2), 16) / 255;
    const g = parseInt(value.slice(2, 4), 16) / 255;
    const b = parseInt(value.slice(4, 6), 16) / 255;
    const a = value.length >= 8 ? parseInt(value.slice(6, 8), 16) / 255 : 1;
    return new Color(r, g, b, a);
  }

  /** 对应 `Color.HSVtoRGB(float h, float s, float v)`；h 为角度 0-360，s/v 为 0-1。 */
  static HSVtoRGB(h: number, s: number, v: number): Color;
  static HSVtoRGB(h: number, s: number, v: number, a: number): Color;
  static HSVtoRGB(h: number, s: number, v: number, a: number, out: Color): Color;
  static HSVtoRGB(h: number, s: number, v: number, a = 1, out = new Color()): Color{
    // 与 arc 的 `Color.HSVtoRGB` 同式（`:h / 60` 分扇区 + p/q/t 三分量）。
    const hue = h / 60;
    const i = Math.floor(hue);
    const f = hue - i;
    const p = v * (1 - s);
    const q = v * (1 - s * f);
    const t = v * (1 - s * (1 - f));

    switch(((i % 6) + 6) % 6){
      case 0: out.r = v; out.g = t; out.b = p; break;
      case 1: out.r = q; out.g = v; out.b = p; break;
      case 2: out.r = p; out.g = v; out.b = t; break;
      case 3: out.r = p; out.g = q; out.b = v; break;
      case 4: out.r = t; out.g = p; out.b = v; break;
      default: out.r = v; out.g = p; out.b = q; break;
    }
    out.a = a;
    return out;
  }
}

/** 对应 `arc.util.NumberUtils.doubleToLongBits` 的位搬运（JS 用 BigInt 组装双精度位模式）。 */
function intBitsToDouble(bits: number): number{
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setInt32(0, bits, false);
  view.setInt32(4, 0, false);
  return view.getFloat64(0, false);
}
