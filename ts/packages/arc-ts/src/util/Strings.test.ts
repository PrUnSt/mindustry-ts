// 测试: arc-core/src/arc/util/Strings.java 移植
import { describe, expect, it } from "vitest";
import { Strings } from "./Strings";

describe("Strings", () => {
  it("format substitutes @ placeholders", () => {
    expect(Strings.format("Hello @!", "world")).toBe("Hello world!");
    expect(Strings.format("a=@, b=@", 1, "x")).toBe("a=1, b=x");
    expect(Strings.format("no args")).toBe("no args");
    expect(Strings.format("too few @ @", 1)).toBe("too few 1 @");
  });

  it("format stringifies arrays like Java Arrays.toString/deepToString", () => {
    expect(Strings.format("@", [1, 2, 3])).toBe("[1, 2, 3]");
    expect(Strings.format("@", [["a", "b"], [1]])).toBe("[[a, b], [1]]");
  });

  it("join joins with a separator", () => {
    expect(Strings.join(", ", "a", "b", "c")).toBe("a, b, c");
    expect(Strings.join("-", "x")).toBe("x");
    expect(Strings.join("/", "a", "b")).toBe("a/b");
  });

  it("capitalize/camelize/kebab conversions", () => {
    expect(Strings.capitalize("test_string")).toBe("Test String");
    expect(Strings.capitalize("foo-bar baz")).toBe("Foo Bar baz");
    expect(Strings.camelize("Camel Case")).toBe("camelCase");
    expect(Strings.kebabToCamel("some_kebab-name")).toBe("someKebabName");
    expect(Strings.camelToKebab("someKebabName")).toBe("some-kebab-name");
    expect(Strings.insertSpaces("helloWorldFoo")).toBe("hello World Foo");
  });

  it("truncate and count", () => {
    expect(Strings.truncate("hello", 3)).toBe("hel");
    expect(Strings.truncate("hello", 3, "...")).toBe("hel...");
    expect(Strings.truncate("hi", 5)).toBe("hi");
    expect(Strings.count("banana", "a")).toBe(3);
    expect(Strings.count("ababab", "ab")).toBe(3);
    expect(Strings.count("a b c", " ")).toBe(2);
  });

  it("bytesToHex", () => {
    expect(Strings.bytesToHex([0xde, 0xad, 0xbe, 0xef])).toBe("DEADBEEF");
    expect(Strings.bytesToHex([0, 255, 16])).toBe("00FF10");
  });

  it("parseInt variants", () => {
    expect(Strings.parseInt("42")).toBe(42);
    expect(Strings.parseInt("-42")).toBe(-42);
    expect(Strings.parseInt("+42")).toBe(42);
    expect(Strings.parseInt("2147483647")).toBe(2147483647);
    expect(Strings.parseInt("-2147483648")).toBe(-2147483648);
    expect(Strings.parseInt("abc")).toBe(-2147483648);
    expect(Strings.parseInt("", 7)).toBe(7);
    expect(Strings.parseInt("ff", 16, -1)).toBe(255);
    expect(Strings.parseInt("1f", 16, -1)).toBe(31);
    expect(Strings.parseInt("99", 8, -1)).toBe(-1);
    expect(Strings.canParseInt("123")).toBe(true);
    expect(Strings.canParseInt("x")).toBe(false);
    expect(Strings.canParsePositiveInt("5")).toBe(true);
    expect(Strings.canParsePositiveInt("-5")).toBe(false);
  });

  it("parseFloat/parseDouble variants", () => {
    expect(Strings.parseFloat("3.14")).toBeCloseTo(3.14, 10);
    expect(Strings.parseFloat("1.5f")).toBeCloseTo(1.5, 10);
    expect(Strings.parseFloat("2.5.")).toBeCloseTo(2.5, 10);
    expect(Strings.parseFloat("1e3")).toBe(1000);
    expect(Strings.parseFloat("-0.5")).toBeCloseTo(-0.5, 10);
    expect(Strings.parseFloat("junk")).toBe(Number.NEGATIVE_INFINITY);
    expect(Strings.parseFloat("junk", 9)).toBe(9);
    expect(Strings.canParseFloat("12.5")).toBe(true);
    expect(Strings.canParseFloat("nope")).toBe(false);
    expect(Strings.canParsePositiveFloat("1")).toBe(true);
    expect(Strings.parseDouble("123.456", 0)).toBeCloseTo(123.456, 10);
  });

  it("fixed/autoFixed", () => {
    expect(Strings.fixed(3.14159, 2)).toBe("3.14");
    expect(Strings.fixed(-3.14159, 1)).toBe("-3.1");
    expect(Strings.fixed(2, 0)).toBe("2");
    expect(Strings.fixed(0.0005, 4)).toBe("0.0005");
    expect(Strings.autoFixed(3.14159, 3)).toBe("3.141"); // Arc truncates extra digits
    expect(Strings.autoFixed(100.0, 2)).toBe("100");
    expect(() => Strings.fixed(1, 9)).toThrow();
  });

  it("formatMillis", () => {
    expect(Strings.formatMillis(0)).toBe("0:00:00");
    expect(Strings.formatMillis(3_661_000)).toBe("1:01:01");
    expect(Strings.formatMillis(-3_661_000)).toBe("-1:01:01");
  });

  it("replace replaces all literal occurrences", () => {
    expect(Strings.replace("aXbX", "X", "YZ")).toBe("aYZbYZ");
    expect(Strings.replace("aXbX", "X", "YZW")).toBe("aYZWbYZW");
    expect(Strings.replace("no match", "z", "1")).toBe("no match");
  });

  it("sanitizeFilename / isSafeFilename", () => {
    expect(Strings.sanitizeFilename("a/b\\c:d")).toBe("a_b_c_d");
    expect(Strings.sanitizeFilename(".")).toBe("_");
    expect(Strings.sanitizeFilename("..")).toBe("__");
    expect(Strings.sanitizeFilename("con.msch")).toBe("_con.msch");
    expect(Strings.isSafeFilename("hello.txt")).toBe(true);
    expect(Strings.isSafeFilename("con.txt")).toBe(false);
    expect(Strings.isSafeFilename("bad/name")).toBe(false);
  });

  it("levenshtein and biasedLevenshtein", () => {
    expect(Strings.levenshtein("kitten", "sitting")).toBe(3);
    expect(Strings.levenshtein("abc", "abc")).toBe(0);
    expect(Strings.levenshtein("", "abc")).toBe(3);
    expect(Strings.biasedLevenshtein("Hello", "hello")).toBe(0);
  });

  it("getFileName/getFileNameWithoutExtension/getFileExtension", () => {
    expect(Strings.getFileName("a/b/c.txt")).toBe("c.txt");
    expect(Strings.getFileNameWithoutExtension("a/b/c.txt")).toBe("c");
    expect(Strings.getFileExtension("a/b/c.txt")).toBe("txt");
    expect(Strings.getFileName("plain")).toBe("plain");
    expect(Strings.getFileExtension("noext")).toBe("");
  });

  it("matches is case-insensitive and empty-query is always true", () => {
    expect(Strings.matches("Ab", "aBc")).toBe(true);
    expect(Strings.matches("", "anything")).toBe(true);
    expect(Strings.matches("zz", "abc")).toBe(false);
    expect(Strings.matches(null, "abc")).toBe(true);
  });

  it("sanitizeVersion / checkNewerSemver", () => {
    expect(Strings.sanitizeVersion("v1.2.3")).toEqual([1, 2, 3, 0]);
    expect(Strings.sanitizeVersion("alpha 2.0.0 release")).toEqual([2, 0, 0, 0]);
    expect(Strings.sanitizeVersion("junk")).toBeNull();
    expect(Strings.checkNewerSemver("1.2.0", "1.1.9")).toBe(true);
    expect(Strings.checkNewerSemver("1.2.0", "1.2.0")).toBe(false);
    expect(Strings.checkNewerSemver("1.2.0", "1.3.0")).toBe(false);
  });

  it("encode mirrors Java URLEncoder", () => {
    expect(Strings.encode("a b/c")).toBe("a+b%2Fc");
    expect(Strings.encode("a~b")).toBe("a%7Eb");
    expect(Strings.encode("abc-_.*")).toBe("abc-_.*");
    expect(Strings.encode("你好")).toBe("%E4%BD%A0%E5%A5%BD");
  });

  it("stripColors handles hex tags and escapes", () => {
    expect(Strings.stripColors("[#ff0000]red")).toBe("red");
    expect(Strings.stripColors("[[escaped")).toBe("[escaped");
    expect(Strings.stripColors("plain")).toBe("plain");
  });

  it("stripGlyphs removes private use area", () => {
    expect(Strings.stripGlyphs("ab\uE000c\uF8FFd")).toBe("abcd");
  });

  it("neatError/getCauses/getFinalCause over Error cause chains", () => {
    const inner = new Error("inner");
    const outer = new Error("outer");
    (outer as { cause?: Error }).cause = inner;
    expect(Strings.getCauses(outer).length).toBe(2);
    expect(Strings.getFinalCause(outer).message).toBe("inner");
    expect(Strings.getFinalMessage(outer)).toBe("inner");
    expect(Strings.getSimpleMessages(outer)).toContain("inner");
    expect(Strings.neatError(outer)).toContain("inner");
  });
});

