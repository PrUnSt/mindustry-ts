// 源: arc-core/src/arc/util/Strings.java
// 移植: 核心字符串工具；Mathf 依赖以最小本地实现内联（TODO: 迁移到 <math/Mathf> 统一实现）
// 跳过: sha256/deflate/undeflate（需 crypto/zlib，TODO: 迁移到 <crypto>/<zlib> 统一实现）、parseColor（需 <graphics/Color>）

export class Strings{
  private static readonly hexArray = "0123456789ABCDEF";

  private static readonly filenamePattern = /[\u0000\/"<>|:*?\\]/g;
  private static readonly unsafeFilenamePattern = /[\u0000\/"'<>|:*!?\\]/g;
  private static readonly reservedFilenamePattern = /^(CON|AUX|PRN|NUL|COM[0-9]|LPT[0-9])(\..*)?$/i;

  //https://stackoverflow.com/a/9855338
  static bytesToHex(bytes: Uint8Array | number[]): string{
    let out = "";
    for(let j = 0; j < bytes.length; j++){
      const v = bytes[j] & 0xFF;
      out += Strings.hexArray[v >>> 4];
      out += Strings.hexArray[v & 0x0F];
    }
    return out;
  }

  static getFileExtension(path: string): string{
    const dotIndex = path.lastIndexOf(".");
    return dotIndex === -1 ? "" : path.substring(dotIndex + 1);
  }

  static getFileName(path: string): string{
    const index = path.lastIndexOf("/");
    return index < 0 ? path : path.substring(index + 1);
  }

  static getFileNameWithoutExtension(path: string): string{
    const name = Strings.getFileName(path);
    const dotIndex = name.lastIndexOf(".");
    return dotIndex === -1 ? name : name.substring(0, dotIndex);
  }

  /** @return whether the name matches the query; case-insensitive. Always returns true if query is empty. */
  static matches(query: string | null | undefined, name: string | null | undefined): boolean{
    return query === null || query === undefined || query.length === 0 || (name !== null && name !== undefined && name.toLowerCase().includes(query.toLowerCase()));
  }

  static count(s: string, c: string): number;
  static count(str: string, substring: string): number;
  static count(s: string, cOrSubstring: string): number{
    if(cOrSubstring.length === 1){
      let total = 0;
      for(let i = 0; i < s.length; i++){
        if(s.charAt(i) === cOrSubstring) total++;
      }
      return total;
    }
    let lastIndex = 0;
    let count = 0;

    while(lastIndex !== -1){
      lastIndex = s.indexOf(cOrSubstring, lastIndex);

      if(lastIndex !== -1){
        count++;
        lastIndex += cOrSubstring.length;
      }
    }
    return count;
  }

  static truncate(s: string, length: number): string;
  static truncate(s: string, length: number, ellipsis: string): string;
  static truncate(s: string, length: number, ellipsis?: string): string{
    return s.length <= length ? s : s.substring(0, length) + (ellipsis ?? "");
  }

  static getCauses(e: Error | null | undefined): Error[]{
    const arr: Error[] = [];
    while(e != null){
      arr.push(e);
      e = ((e as { cause?: Error | null }).cause ?? null) as Error;
    }
    return arr;
  }

  static getSimpleMessage(e: Error): string{
    const fcause = Strings.getFinalCause(e);
    return fcause.message === null || fcause.message === undefined ? fcause.name : fcause.name + ": " + fcause.message;
  }

  static getSimpleMessages(e: Error): string{
    let builder = "";
    while(e != null){
      if(e.message !== null && e.message !== undefined){
        builder += e.name + ": " + e.message;
      }else{
        builder += e.name;
      }
      e = ((e as { cause?: Error | null }).cause ?? null) as Error;
      if(e != null){
        builder += " -> ";
      }
    }
    return builder;
  }

  static getFinalMessage(e: Error): string{
    let message = e.message;
    let cur: Error | null | undefined = e;
    let next: Error | null | undefined = ((cur as { cause?: Error | null }).cause ?? null) as Error;
    while(next != null){
      cur = next;
      if(cur.message !== null && cur.message !== undefined){
        message = cur.message;
      }
      next = ((cur as { cause?: Error | null }).cause ?? null) as Error;
    }
    return message;
  }

  static getFinalCause(e: Error): Error{
    let cur: Error | null | undefined = e;
    let next: Error | null | undefined = ((cur as { cause?: Error | null }).cause ?? null) as Error;
    while(next != null){
      cur = next;
      next = ((cur as { cause?: Error | null }).cause ?? null) as Error;
    }
    return cur as Error;
  }

  static getStackTrace(e: Error): string{
    return e.stack ?? e.toString();
  }

  /** @return a neat error message of a throwable, with stack trace. */
  static neatError(e: Error): string;
  /** @return a neat error message of a throwable, with stack trace. */
  static neatError(e: Error, stacktrace: boolean): string;
  static neatError(e: Error, stacktrace = true): string{
    let build = "";

    while(e != null){
      let name = e.name;
      if(name.includes(".")){
        name = name.substring(name.lastIndexOf(".") + 1);
      }

      build += "> " + name;
      if(e.message !== null && e.message !== undefined){
        build += ": ";
        build += "'" + e.message + "'";
      }

      if(stacktrace && e.stack){
        // Java filters reflection MethodAccessor/Method frames; TS keeps all frames minus the message line.
        const lines = e.stack.split("\n").slice(1);
        for(const line of lines){
          build += "\n";
          build += line.trim();
        }
      }

      build += "\n";

      e = ((e as { cause?: Error | null }).cause ?? null) as Error;
    }

    return build;
  }

  static stripColors(str: string): string{
    let out = "";

    let i = 0;
    while(i < str.length){
      const c = str.charAt(i);

      // Possible color tag.
      if(c === "["){
        const length = Strings.parseColorMarkup(str, i + 1, str.length);
        if(length >= 0){
          i += length + 2;
        }else if(length === -2){
          // "[[" is an escaped left square bracket: emit a single "[" and skip both brackets.
          out += "[";
          i += 2;
        }else{
          out += c;
          //escaped string
          i++;
        }
      }else{
        out += c;
        i++;
      }
    }

    return out;
  }

  static stripGlyphs(str: string): string{
    let out = "";

    for(let i = 0; i < str.length; i++){
      const c = str.charCodeAt(i);
      if(c >= 0xe000 && c <= 0xf8ff) continue;
      out += str.charAt(i);
    }

    return out;
  }

  private static parseColorMarkup(str: string, start: number, end: number): number{
    if(start >= end) return -1; // String ended with "[".
    switch(str.charAt(start)){
      case "#":
        // Parse hex color RRGGBBAA where AA is optional and defaults to 0xFF if less than 6 chars are used.
        for(let i = start + 1; i < end; i++){
          const ch = str.charAt(i);
          if(ch === "]"){
            if(i < start + 2 || i > start + 9) break; // Illegal number of hex digits.
            return i - start;
          }
          if(!((ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F"))){
            break; // Unexpected character in hex color.
          }
        }
        return -1;
      case "[": // "[[" is an escaped left square bracket.
        return -2;
      case "]": // "[]" is a "pop" color tag.
        //pop the color stack here if needed
        return 0;
    }
    // Parse named color. Needs arc.graphics.Colors, which is not ported here.
    // TODO: 迁移到 <graphics/Colors> 统一实现（此处未知颜色名一律返回 -1）
    return -1;
  }



  /** Replaces non-safe filename characters with '_'. Handles reserved window file names. */
  static sanitizeFilename(str: string): string{
    if(str === "."){
      return "_";
    }else if(str === ".."){
      return "__";
    }else if(Strings.reservedFilenamePattern.test(str)){
      //turn things like con.msch -> _con.msch, which is no longer reserved
      str = "_" + str;
    }
    return str.replace(Strings.filenamePattern, "_");
  }

  static isSafeFilename(name: string): boolean{
    return name !== "." && name !== ".." && !Strings.reservedFilenamePattern.test(name) && !Strings.unsafeFilenamePattern.test(name);
  }

  static encode(str: string): string{
    // Java URLEncoder.encode(str, "UTF-8"): keeps [A-Za-z0-9-_.*], space -> '+', everything else %XX.
    return encodeURIComponent(str)
      .replace(/%20/g, "+")
      .replace(/[!'()~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  }

  static format(text: string, ...args: unknown[]): string{
    if(args.length > 0){
      let out = "";
      let argi = 0;
      for(let i = 0; i < text.length; i++){
        const c = text.charAt(i);
        if(c === "@" && argi < args.length){
          out += Strings.stringify(args[argi++]);
        }else{
          out += c;
        }
      }

      return out;
    }

    return text;
  }

  static stringify(o: unknown): string{
    if(Array.isArray(o)) return "[" + o.map(Strings.stringify).join(", ") + "]";
    return String(o);
  }

  static join(separator: string, ...strings: string[]): string{
    let builder = "";
    for(const s of strings){
      builder += s;
      builder += separator;
    }
    if(strings.length === 0) return "";
    return builder.substring(0, builder.length - separator.length);
  }

  /** Returns the levenshtein distance between two strings. */
  static levenshtein(x: string, y: string): number{
    const dp: number[][] = new Array(x.length + 1);
    for(let i = 0; i <= x.length; i++){
      dp[i] = new Array(y.length + 1).fill(0);
      for(let j = 0; j <= y.length; j++){
        if(i === 0){
          dp[i][j] = j;
        }else if(j === 0){
          dp[i][j] = i;
        }else{
          dp[i][j] = Math.min(
            Math.min(dp[i - 1][j - 1] + (x.charAt(i - 1) === y.charAt(j - 1) ? 0 : 1), dp[i - 1][j] + 1),
            dp[i][j - 1] + 1
          );
        }
      }
    }

    return dp[x.length][y.length];
  }

  /** Returns the case-independent biased levenshtein distance between two strings. */
  static biasedLevenshtein(x: string, y: string): number{
    x = x.toLowerCase();
    y = y.toLowerCase();

    const dp: number[][] = new Array(x.length + 1);
    for(let i = 0; i <= x.length; i++){
      dp[i] = new Array(y.length + 1).fill(0);
      for(let j = 0; j <= y.length; j++){
        if(i === 0){
          dp[i][j] = j;
        }else if(j === 0){
          dp[i][j] = i;
        }else{
          dp[i][j] = Math.min(
            Math.min(dp[i - 1][j - 1] + (x.charAt(i - 1) === y.charAt(j - 1) ? 0 : 1), dp[i - 1][j] + 1),
            dp[i][j - 1] + 1
          );
        }
      }
    }

    const output = dp[x.length][y.length];
    if(y.startsWith(x) || x.startsWith(y)){
      return output / 3;
    }
    return (y.includes(x) || x.includes(y)) ? output / 1.5 : output;
  }

  static animated(time: number, length: number, scale: number, replacement: string): string{
    return replacement.repeat(Math.abs(Math.trunc(time / scale) % length));
  }

  static kebabToCamel(s: string): string{
    let result = "";

    for(let i = 0; i < s.length; i++){
      const c = s.charAt(i);
      if(c !== "_" && c !== "-"){
        if(i !== 0 && (s.charAt(i - 1) === "_" || s.charAt(i - 1) === "-")){
          result += c.toUpperCase();
        }else{
          result += c;
        }
      }
    }

    return result;
  }

  static camelToKebab(s: string): string{
    let result = "";

    for(let i = 0; i < s.length; i++){
      const c = s.charAt(i);
      if(i > 0 && Strings.isUpperCase(c)){
        result += "-";
      }

      result += c.toLowerCase();
    }

    return result;
  }

  /** Converts a snake_case or kebab-case string to Upper Case.
   * For example: "test_string" -> "Test String"*/
  static capitalize(s: string): string{
    let result = "";

    for(let i = 0; i < s.length; i++){
      const c = s.charAt(i);
      if(c === "_" || c === "-"){
        result += " ";
      }else if(i === 0 || s.charAt(i - 1) === "_" || s.charAt(i - 1) === "-"){
        result += c.toUpperCase();
      }else{
        result += c;
      }
    }

    return result;
  }

  /** Adds spaces to a camel/pascal case string. */
  static insertSpaces(s: string): string{
    let result = "";

    for(let i = 0; i < s.length; i++){
      const c = s.charAt(i);

      if(i > 0 && Strings.isUpperCase(c)){
        result += " ";
      }

      result += c;
    }

    return result;
  }

  /** Converts a Space Separated string to camelCase.
   * For example: "Camel Case" -> "camelCase"*/
  static camelize(s: string): string{
    let result = "";

    for(let i = 0; i < s.length; i++){
      const c = s.charAt(i);
      if(i === 0){
        result += c.toLowerCase();
      }else if(c !== " "){
        result += c;
      }
    }

    return result;
  }

  static canParseInt(s: string): boolean{
    return Strings.parseInt(s) !== -2147483648;
  }

  static canParsePositiveInt(s: string): boolean{
    const p = Strings.parseInt(s);
    return p >= 0;
  }

  static parseInt(s: string): number;
  static parseInt(s: string, defaultValue: number): number;
  static parseInt(s: string, radix: number, defaultValue: number): number;
  static parseInt(s: string, radix: number, defaultValue: number, start: number, end: number): number;
  static parseInt(s: string, a?: number, b?: number, c?: number, d?: number): number{
    if(b === undefined) return Strings.parseIntImpl(s, 10, a ?? -2147483648, 0, s.length);
    if(c === undefined) return Strings.parseIntImpl(s, a!, b, 0, s.length);
    return Strings.parseIntImpl(s, a!, b, c!, d!);
  }

  private static parseIntImpl(s: string, radix: number, defaultValue: number, start: number, end: number): number{
    let negative = false;
    let i = start, len = end - start, limit = -2147483647;
    if(len <= 0){
      return defaultValue;
    }else{
      const firstChar = s.charAt(i);
      if(firstChar < "0"){
        if(firstChar === "-"){
          negative = true;
          limit = -2147483648;
        }else if(firstChar !== "+"){
          return defaultValue;
        }

        if(len === 1) return defaultValue;

        ++i;
      }

      const limitForMaxRadix = Math.trunc(-2147483647 / 36);
      let limitBeforeMul = limitForMaxRadix;

      let digit: number, result = 0;
      while(i < end){
        digit = Strings.digit(s.charAt(i++), radix);
        if(digit < 0) return defaultValue;
        if(result < limitBeforeMul){
          if(limitBeforeMul === limitForMaxRadix){
            limitBeforeMul = Math.trunc(limit / radix);

            if(result < limitBeforeMul){
              return defaultValue;
            }
          }else{
            return defaultValue;
          }
        }

        result *= radix;
        if(result < limit + digit){
          return defaultValue;
        }

        result -= digit;
      }

      return negative ? result : result === 0 ? 0 : -result;
    }
  }

  static parseLong(s: string, defaultValue: number): number;
  static parseLong(s: string, radix: number, defaultValue: number): number;
  static parseLong(s: string, radix: number, start: number, end: number, defaultValue: number): number;
  static parseLong(s: string, a?: number, b?: number, c?: number, d?: number): number{
    if(b === undefined) return Strings.parseLongImpl(s, 10, 0, s.length, a ?? -9223372036854775808);
    if(c === undefined) return Strings.parseLongImpl(s, a!, 0, s.length, b!);
    return Strings.parseLongImpl(s, a!, b!, c!, d!);
  }

  private static parseLongImpl(s: string, radix: number, start: number, end: number, defaultValue: number): number{
    let negative = false;
    let i = start, len = end - start;
    let limit = -9223372036854775807;
    if(len <= 0){
      return defaultValue;
    }else{
      const firstChar = s.charAt(i);
      if(firstChar < "0"){
        if(firstChar === "-"){
          negative = true;
          limit = -9223372036854775808;
        }else if(firstChar !== "+"){
          return defaultValue;
        }

        if(len === 1) return defaultValue;

        ++i;
      }

      const multmin = Math.trunc(limit / radix);
      let result = 0;
      let digit: number;
      for(; i < end; result -= digit){
        digit = Strings.digit(s.charAt(i++), radix);
        if(digit < 0 || result < multmin){
          return defaultValue;
        }

        result *= radix;
        if(result < limit + digit){
          return defaultValue;
        }
      }

      return negative ? result : result === 0 ? 0 : -result;
    }
  }

  /** Faster double parser that doesn't throw exceptions. */
  static parseDouble(value: string, defaultValue: number): number{
    const len = value.length;
    if(len === 0) return defaultValue;

    let sign = 1;
    let start = 0, end = len;
    const last = value.charAt(len - 1), first = value.charAt(0);
    if(last === "F" || last === "f" || last === "."){
      end--;
    }
    if(first === "+"){
      start = 1;
    }
    if(first === "-"){
      start = 1;
      sign = -1;
    }
    if(start >= end) return defaultValue;

    let dot = -1, e = -1;
    let dotCount = 0, eCount = 0;
    for(let i = start; i < end; i++){
      const c = value.charAt(i);
      if(c === "."){ dot = i; dotCount++; }
      if(c === "e" || c === "E"){ e = i; eCount++; }
    }
    if(dotCount > 1 || eCount > 1) return defaultValue;
    if(dot !== -1 && e !== -1 && dot > e) return defaultValue;

    const mantissaEnd = (e !== -1) ? e : end;

    let exponent = 0;
    if(e !== -1){
      if(e + 1 >= end) return defaultValue;
      exponent = Strings.parseLong(value, 10, e + 1, end, -9223372036854775808);
      if(exponent === -9223372036854775808) return defaultValue;
    }

    if(dot !== -1 && dot < end){
      //negation as first character
      const whole = start === dot ? 0 : Strings.parseLong(value, 10, start, dot, -9223372036854775808);
      if(whole === -9223372036854775808 || whole < 0) return defaultValue;

      const decDigits = mantissaEnd - (dot + 1);
      if(decDigits === 0){
        return whole * Math.pow(10, exponent) * sign;
      }

      //a long holds 18 decimal digits safely, and a double can't represent more precision than that anyway
      const used = Math.min(decDigits, 18);
      const dec = Strings.parseLong(value, 10, dot + 1, dot + 1 + used, -9223372036854775808);
      if(dec < 0) return defaultValue;

      //truncated digits still have to be valid digits
      for(let i = dot + 1 + used; i < mantissaEnd; i++){
        const c = value.charAt(i);
        if(c < "0" || c > "9") return defaultValue;
      }

      const pow = Math.pow(10, used);
      const p = Math.trunc(pow);
      // Java uses Long.MAX_VALUE (2^63-1); float64 只能精确表示 2^53-1，此处以 MAX_SAFE_INTEGER 近似
      let mantissa: number;
      if(whole <= (9007199254740991 - dec) / p){
        //fits in a long, keeps the original (more accurate) path
        mantissa = (whole * p + dec) / pow;
      }else{
        mantissa = whole + dec / pow;
      }
      return mantissa * Math.pow(10, exponent) * sign;
    }

    //check scientific notation
    if(e !== -1){
      const whole = Strings.parseLong(value, 10, start, e, -9223372036854775808);
      if(whole === -9223372036854775808) return defaultValue;
      return whole * Math.pow(10, exponent) * sign;
    }

    //parse as standard integer
    const out = Strings.parseLong(value, 10, start, end, -9223372036854775808);
    return out === -9223372036854775808 ? defaultValue : out * sign;
  }

  static canParseFloat(s: string): boolean{
    return Strings.parseFloat(s, Number.NEGATIVE_INFINITY) !== Number.NEGATIVE_INFINITY;
  }

  static canParsePositiveFloat(s: string): boolean{
    return Strings.parseFloat(s) >= 0;
  }

  /** Returns Float.NEGATIVE_INFINITY if parsing failed. */
  static parseFloat(s: string): number;
  static parseFloat(s: string, defaultValue: number): number;
  static parseFloat(s: string, defaultValue?: number): number{
    return Strings.parseDouble(s, defaultValue ?? Number.NEGATIVE_INFINITY);
  }

  static autoFixed(value: number, max: number): string{
    //truncate extra digits past the max
    value = Math.floor(value * Math.pow(10, max) + 0.001) / Math.pow(10, max);

    const precision =
      Math.abs(Math.floor(value) - value) < 0.0001 ? 0 :
      Math.abs(Math.floor(value * 10) - value * 10) < 0.0001 ? 1 :
      Math.abs(Math.floor(value * 100) - value * 100) < 0.0001 ? 2 :
      Math.abs(Math.floor(value * 1000) - value * 1000) < 0.0001 ? 3 :
      4;

    return Strings.fixed(value, Math.min(max, precision));
  }

  static fixed(d: number, decimalPlaces: number): string{
    if(decimalPlaces < 0 || decimalPlaces > 8){
      throw new Error("Unsupported number of " + "decimal places: " + decimalPlaces);
    }
    const negative = d < 0;
    d = Math.abs(d);
    const dec = "" + Math.floor(d * Math.pow(10, decimalPlaces) + 0.0001);

    const len = dec.length;
    const decimalPosition = len - decimalPlaces;
    let result = "";
    if(negative) result += "-";
    if(decimalPlaces === 0){
      return result + dec;
    }else if(decimalPosition > 0){
      // Insert a dot in the right place
      result += dec.substring(0, decimalPosition);
      result += ".";
      result += dec.substring(decimalPosition);
    }else{
      result += "0.";
      // Insert leading zeroes into the decimal part
      let pos = decimalPosition;
      while(pos++ < 0){
        result += "0";
      }
      result += dec;
    }
    return result;
  }

  static formatMillis(val: number): string{
    let buf = "";
    let sgn = "";

    if(val < 0) sgn = "-";
    val = Math.abs(val);

    buf += Strings.append(sgn, 0, Math.trunc(val / 3600000));
    val %= 3600000;
    buf += Strings.append(":", 2, Math.trunc(val / 60000));
    val %= 60000;
    buf += Strings.append(":", 2, Math.trunc(val / 1000));
    return buf;
  }

  private static append(pfx: string, dgt: number, val: number): string{
    let out = pfx;
    if(dgt > 1){
      let pad = (dgt - 1);
      for(let xa = val; xa > 9 && pad > 0; xa = Math.trunc(xa / 10)) pad--;
      for(let xa = 0; xa < pad; xa++) out += "0";
    }
    out += val;
    return out;
  }

  /** Replaces all instances of {@code find} with {@code replace}. */
  static replace(builder: string, find: string, replace: string): string{
    const findLength = find.length;
    let out = "";
    let search = 0;
    let last = 0;
    while(true){
      const index = builder.indexOf(find, search);
      if(index === -1) break;
      out += builder.substring(last, index) + replace;
      search = index + findLength;
      last = index + findLength;
    }
    return out + builder.substring(last);
  }

  private static isDigitsOnly(part: string): boolean{
    for(let i = 0; i < part.length; i++){
      if(!(part.charAt(i) >= "0" && part.charAt(i) <= "9")){
        return false;
      }
    }
    return true;
  }

  /**
   * Strips leading/trailing non-numeric, non-dot characters, normalizes a loose version string (e.g. "v1", "2.0", "alpha 2.0.0 release") into an array.
   * This can handle semver, but is adapted for a maximum of 4 components, since people do that for some reason.
   * @return the parsed {major, minor, patch, build} array, or null upon failure.
   */
  static sanitizeVersion(raw: string | null | undefined): number[] | null{
    if(raw === null || raw === undefined){
      return null;
    }
    const trimmed = raw.trim();
    //strip leading chars until first digit
    let start = 0;
    while(start < trimmed.length && !(trimmed.charAt(start) >= "0" && trimmed.charAt(start) <= "9")){
      start++;
    }
    //strip trailing chars after last digit
    let end = trimmed.length - 1;
    while(end >= 0 && !(trimmed.charAt(end) >= "0" && trimmed.charAt(end) <= "9")){
      end--;
    }
    if(start > end){
      return null; //no digits at all
    }
    const core = trimmed.substring(start, end + 1);
    const parts = core.split(".");
    if(parts.length < 1 || parts.length > 4){
      return null;
    }
    const nums = [0, 0, 0, 0]; //major, minor, patch, build
    for(let i = 0; i < 4; i++){
      if(i < parts.length){
        const part = parts[i];
        if(part.length === 0 || !Strings.isDigitsOnly(part)){
          return null;
        }
        nums[i] = Strings.parseInt(part);
        if(nums[i] === -2147483648) return null;
      }
    }
    return nums;
  }

  /** @return true if semver {@param version} > {@param target}. If either parameter is not a valid (or sanitizable) semver string, just returns (version != target). */
  static checkNewerSemver(version: string | null | undefined, target: string | null | undefined): boolean{
    if(version === null || version === undefined || target === null || target === undefined) return false;

    const versionNums = Strings.sanitizeVersion(version);
    const targetNums = Strings.sanitizeVersion(target);
    if(versionNums === null || targetNums === null){
      return version !== target;
    }
    for(let i = 0; i < 4; i++){
      if(versionNums[i] !== targetNums[i]){
        return versionNums[i] > targetNums[i];
      }
    }
    return false;
  }

  private static isUpperCase(c: string): boolean{
    // 对应 Character.isUpperCase：是大写字母（有大小写之分）即 true
    return c === c.toUpperCase() && c !== c.toLowerCase();
  }

  private static digit(c: string, radix: number): number{
    const v = parseInt(c, radix);
    return Number.isNaN(v) ? -1 : v;
  }
}

