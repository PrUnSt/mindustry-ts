// 测试: arc-core/src/arc/util/io/Writes.java + Reads.java 往返（DataView 大端实现）
import { describe, expect, it } from "vitest";
import { ByteArrayOutput } from "./ByteArrayOutput";
import { ByteArrayInput } from "./ByteArrayInput";
import { Writes } from "./Writes";
import { Reads } from "./Reads";

function roundTrip(fn: (w: Writes) => void): ByteArrayInput{
  const out = new ByteArrayOutput();
  fn(new Writes(out));
  return new ByteArrayInput(out.toByteArray());
}

describe("Writes/Reads round trip", () => {
  it("integers: byte/short/int boundaries", () => {
    const in_ = roundTrip(w => {
      w.b(-128); w.b(-1); w.b(0); w.b(127);
      w.s(-32768); w.s(-1); w.s(0); w.s(32767);
      w.i(-2147483648); w.i(-1); w.i(0); w.i(2147483647);
    });
    const r = new Reads(in_);
    expect(r.b()).toBe(-128);
    expect(r.b()).toBe(-1);
    expect(r.b()).toBe(0);
    expect(r.b()).toBe(127);
    expect(r.s()).toBe(-32768);
    expect(r.s()).toBe(-1);
    expect(r.s()).toBe(0);
    expect(r.s()).toBe(32767);
    expect(r.i()).toBe(-2147483648);
    expect(r.i()).toBe(-1);
    expect(r.i()).toBe(0);
    expect(r.i()).toBe(2147483647);
  });

  it("unsigned reads: ub/us", () => {
    const in_ = roundTrip(w => {
      w.b(255); w.s(65535);
    });
    const r = new Reads(in_);
    expect(r.ub()).toBe(255);
    expect(r.us()).toBe(65535);
  });

  it("longs (big-endian 64-bit)", () => {
    const values = [-9223372036854776000, -1, 0, 1, 123456789012345678, 9007199254740991];
    const in_ = roundTrip(w => {
      for(const v of values) w.l(v);
    });
    const r = new Reads(in_);
    for(const v of values){
      expect(r.l()).toBe(v);
    }
  });

  it("floats and doubles", () => {
    const in_ = roundTrip(w => {
      w.f(3.14); w.f(-0.5); w.f(0); w.f(1e30);
      w.d(2.718281828459045); w.d(-1e-300); w.d(0);
    });
    const r = new Reads(in_);
    expect(r.f()).toBeCloseTo(3.14, 6);
    expect(r.f()).toBe(-0.5);
    expect(r.f()).toBe(0);
    expect(r.f()).toBe(Math.fround(1e30)); // exact float32 round-trip value
    expect(r.d()).toBeCloseTo(2.718281828459045, 12);
    expect(r.d()).toBe(-1e-300);
    expect(r.d()).toBe(0);
  });

  it("booleans", () => {
    const in_ = roundTrip(w => {
      w.bool(true); w.bool(false);
    });
    const r = new Reads(in_);
    expect(r.bool()).toBe(true);
    expect(r.bool()).toBe(false);
  });

  it("UTF strings: ascii, NUL, CJK, emoji surrogate pairs", () => {
    const strings = ["hello", "", "\u0000\u0001", "你好世界", "𝄞𝄢 music", "a\u0000b"];
    const in_ = roundTrip(w => {
      for(const s of strings) w.str(s);
    });
    const r = new Reads(in_);
    for(const s of strings){
      expect(r.str()).toBe(s);
    }
  });

  it("str(maxLen) rejects oversized strings", () => {
    const in_ = roundTrip(w => w.str("a long string"));
    const r = new Reads(in_);
    expect(() => r.str(5)).toThrow("String too long");
  });

  it("byte arrays", () => {
    const data = new Uint8Array([0, 1, 2, 250, 251, 255]);
    const in_ = roundTrip(w => w.b(data));
    const r = new Reads(in_);
    expect([...r.b(6)]).toEqual([0, 1, 2, 250, 251, 255]);
  });

  it("checkEOF returns -1 at end and byte otherwise", () => {
    const in_ = roundTrip(w => w.b(42));
    const r = new Reads(in_);
    expect(r.checkEOF()).toBe(42);
    expect(r.checkEOF()).toBe(-1);
  });

  it("skip advances the position", () => {
    const in_ = roundTrip(w => {
      w.i(111); w.i(222);
    });
    const r = new Reads(in_);
    expect(r.i()).toBe(111);
    r.skip(4);
    expect(r.checkEOF()).toBe(-1);
  });

  it("reads and writes byte order matches Java (big-endian)", () => {
    const out = new ByteArrayOutput();
    const w = new Writes(out);
    w.s(0x1234);
    w.i(0x12345678);
    const bytes = out.toByteArray();
    expect([...bytes.slice(0, 2)]).toEqual([0x12, 0x34]);
    expect([...bytes.slice(2, 6)]).toEqual([0x12, 0x34, 0x56, 0x78]);
  });

  it("UTF length prefix is big-endian", () => {
    const out = new ByteArrayOutput();
    const w = new Writes(out);
    w.str("AB"); // 2 bytes of UTF
    const bytes = out.toByteArray();
    expect([...bytes.slice(0, 2)]).toEqual([0x00, 0x02]);
    expect([...bytes.slice(2, 4)]).toEqual([0x41, 0x42]);
  });
});


