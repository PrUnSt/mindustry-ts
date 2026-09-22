// 源: arc-core/src/arc/util/Log.java

import { Strings } from "./Strings";
import { ColorCodes } from "./ColorCodes";

/** Log levels, in ascending severity order (matching Log.LogLevel ordinal). */
export enum LogLevel{
  debug,
  info,
  warn,
  err,
  none
}

export interface LogFormatter{
  format(text: string, useColors: boolean, ...args: unknown[]): string;
}

export interface LogHandler{
  log(level: LogLevel, text: string): void;
}

export class DefaultLogFormatter implements LogFormatter{
  format(text: string, useColors: boolean, ...args: unknown[]): string{
    let t = Strings.format(text, ...args);
    return useColors ? Log.addColors(t) : Log.removeColors(t);
  }
}

export class DefaultLogHandler implements LogHandler{
  log(level: LogLevel, text: string): void{
    console.log(Log.format((
      level === LogLevel.debug ? "&lc&fb" :
      level === LogLevel.info ? "&fb" :
      level === LogLevel.warn ? "&ly&fb" :
      level === LogLevel.err ? "&lr&fb" :
      "") + text + "&fr"));
  }
}

export class NoopLogHandler implements LogHandler{
  log(_level: LogLevel, _text: string): void{
  }
}

export class Log{

  static useColors = true;
  static level: LogLevel = LogLevel.info;
  static logger: LogHandler = new DefaultLogHandler();
  static formatter: LogFormatter = new DefaultLogFormatter();

  static log(level: LogLevel, text: string, ...args: unknown[]): void{
    if(Log.level > level) return;
    Log.logger.log(level, Log.format(text, ...args));
  }

  static debug(text: string, ...args: unknown[]): void;
  static debug(object: unknown): void;
  static debug(textOrObject: unknown, ...args: unknown[]): void{
    if(args.length === 0){
      Log.log(LogLevel.debug, String(textOrObject));
    }else{
      Log.log(LogLevel.debug, textOrObject as string, ...args);
    }
  }

  static infoList(...args: unknown[]): void{
    if(Log.level > LogLevel.info) return;
    let build = "";
    for(const o of args){
      build += String(o);
      build += " ";
    }
    Log.info(build);
  }

  static infoTag(tag: string, text: string): void{
    Log.log(LogLevel.info, "[" + tag + "] " + text);
  }

  static info(text: string, ...args: unknown[]): void;
  static info(object: unknown): void;
  static info(textOrObject: unknown, ...args: unknown[]): void{
    if(args.length === 0){
      Log.log(LogLevel.info, String(textOrObject));
    }else{
      Log.log(LogLevel.info, textOrObject as string, ...args);
    }
  }

  static warn(text: string, ...args: unknown[]): void{
    Log.log(LogLevel.warn, text, ...args);
  }

  static errTag(tag: string, text: string): void{
    Log.log(LogLevel.err, "[" + tag + "] " + text);
  }

  static err(text: string, ...args: unknown[]): void;
  static err(th: Error): void;
  static err(text: string, th: Error): void;
  static err(a: string | Error, ...args: unknown[]): void{
    if(typeof a === "string"){
      if(args.length === 1 && args[0] instanceof Error){
        Log.log(LogLevel.err, a + ": " + (args[0].stack ?? args[0].toString()));
      }else{
        Log.log(LogLevel.err, a, ...args);
      }
    }else{
      Log.log(LogLevel.err, a.stack ?? a.toString());
    }
  }

  static format(text: string, ...args: unknown[]): string{
    return Log.formatColors(text, Log.useColors, ...args);
  }

  static formatColors(text: string, useColors: boolean, ...args: unknown[]): string{
    return Log.formatter.format(text, useColors, ...args);
  }

  static removeColors(text: string): string{
    for(const color of ColorCodes.codes){
      text = text.replace("&" + color, "");
    }
    return text;
  }

  static addColors(text: string): string{
    for(let i = 0; i < ColorCodes.codes.length; i++){
      text = text.replace("&" + ColorCodes.codes[i], ColorCodes.values[i]);
    }
    return text;
  }
}
