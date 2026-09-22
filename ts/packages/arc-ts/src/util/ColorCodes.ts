// 源: arc-core/src/arc/util/ColorCodes.java
// 移植: 保留完整 ANSI 码（不做 Windows/Android 平台禁用逻辑；TODO: 迁移到 <OS> 统一实现）

/** Note that these color codes will only work on linux or mac terminals. */
export class ColorCodes{
  static flush = "\u001b[H\u001b[2J";
  static reset = "\u001b[0m";
  static bold = "\u001b[1m";
  static italic = "\u001b[3m";
  static underline = "\u001b[4m";
  static black = "\u001b[30m";
  static red = "\u001b[31m";
  static green = "\u001b[32m";
  static yellow = "\u001b[33m";
  static blue = "\u001b[34m";
  static purple = "\u001b[35m";
  static cyan = "\u001b[36m";
  static lightBlack = "\u001b[90m";
  static lightRed = "\u001b[91m";
  static lightGreen = "\u001b[92m";
  static lightYellow = "\u001b[93m";
  static lightBlue = "\u001b[94m";
  static lightMagenta = "\u001b[95m";
  static lightCyan = "\u001b[96m";
  static lightWhite = "\u001b[97m";
  static white = "\u001b[37m";

  static backDefault = "\u001b[49m";
  static backRed = "\u001b[41m";
  static backGreen = "\u001b[42m";
  static backYellow = "\u001b[43m";
  static backBlue = "\u001b[44m";

  static codes: string[];
  static values: string[];

  static{
    const map: [string, string][] = [
      ["bd", ColorCodes.backDefault],
      ["br", ColorCodes.backRed],
      ["bg", ColorCodes.backGreen],
      ["by", ColorCodes.backYellow],
      ["bb", ColorCodes.backBlue],

      ["ff", ColorCodes.flush],
      ["fr", ColorCodes.reset],
      ["fb", ColorCodes.bold],
      ["fi", ColorCodes.italic],
      ["fu", ColorCodes.underline],
      ["k", ColorCodes.black],
      ["lk", ColorCodes.lightBlack],
      ["lw", ColorCodes.lightWhite],
      ["r", ColorCodes.red],
      ["g", ColorCodes.green],
      ["y", ColorCodes.yellow],
      ["b", ColorCodes.blue],
      ["p", ColorCodes.purple],
      ["c", ColorCodes.cyan],
      ["lr", ColorCodes.lightRed],
      ["lg", ColorCodes.lightGreen],
      ["ly", ColorCodes.lightYellow],
      ["lm", ColorCodes.lightMagenta],
      ["lb", ColorCodes.lightBlue],
      ["lc", ColorCodes.lightCyan],
      ["w", ColorCodes.white]
    ];

    ColorCodes.codes = map.map(e => e[0]);
    ColorCodes.values = map.map(e => e[1]);
  }
}
