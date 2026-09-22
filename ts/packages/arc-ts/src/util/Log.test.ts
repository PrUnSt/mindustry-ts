// 测试: arc-core/src/arc/util/Log.java 移植
import { describe, expect, it, beforeEach } from "vitest";
import { Log, LogLevel, LogHandler } from "./Log";

function capture(): { handler: LogHandler; messages: string[] }{
  const messages: string[] = [];
  return {
    messages,
    handler: {
      log(_level: LogLevel, text: string): void{
        messages.push(text);
      }
    }
  };
}

describe("Log", () => {
  beforeEach(() => {
    Log.level = LogLevel.info;
    Log.useColors = false;
  });

  it("info logs formatted text through the handler", () => {
    const { handler, messages } = capture();
    Log.logger = handler;
    Log.info("health: @", 50);
    expect(messages).toEqual(["health: 50"]);
  });

  it("level filtering suppresses lower-priority calls", () => {
    const { handler, messages } = capture();
    Log.logger = handler;
    Log.level = LogLevel.warn;
    Log.info("not shown");
    Log.debug("not shown");
    Log.warn("shown");
    Log.err("also shown");
    expect(messages).toEqual(["shown", "also shown"]);
  });

  it("infoTag/errTag prefix the tag", () => {
    const { handler, messages } = capture();
    Log.logger = handler;
    Log.infoTag("mod", "hello");
    Log.errTag("mod", "boom");
    expect(messages).toEqual(["[mod] hello", "[mod] boom"]);
  });

  it("infoList joins with spaces", () => {
    const { handler, messages } = capture();
    Log.logger = handler;
    Log.infoList(1, "two", 3);
    expect(messages).toEqual(["1 two 3 "]);
  });

  it("debug/info accept a bare object", () => {
    const { handler, messages } = capture();
    Log.logger = handler;
    Log.level = LogLevel.debug;
    Log.debug(42);
    Log.info({ a: 1 });
    expect(messages[0]).toBe("42");
    expect(messages[1]).toContain("[object Object]");
  });

  it("addColors/removeColors round-trip color tags", () => {
    expect(Log.removeColors("&rred")).toBe("red");
    expect(Log.addColors("&rred")).toBe("\u001b[31mred");
  });

  it("format applies colors when useColors is true", () => {
    Log.useColors = true;
    expect(Log.format("&r@", "x")).toBe("\u001b[31mx");
    Log.useColors = false;
    expect(Log.format("&r@", "x")).toBe("x");
  });
});
