// 测试: arc-core/src/arc/util/io/Streams.java 移植
import { describe, expect, it } from "vitest";
import { Streams, InputStream, OutputStream, OptimizedByteArrayOutputStream } from "./Streams";

class ArrayInputStream implements InputStream{
  private pos = 0;

  constructor(private data: Uint8Array){
  }

  read(buffer: Uint8Array): number{
    if(this.pos >= this.data.length) return -1;
    const n = Math.min(buffer.length, this.data.length - this.pos);
    buffer.set(this.data.subarray(this.pos, this.pos + n));
    this.pos += n;
    return n;
  }

  available(): number{
    return this.data.length - this.pos;
  }
}

class ArrayOutputStream implements OutputStream{
  private chunks: Uint8Array[] = [];

  write(bytes: Uint8Array, offset?: number, length?: number): void{
    // Copy (not a view): the caller reuses its buffer across reads.
    this.chunks.push(bytes.slice(offset ?? 0, (offset ?? 0) + (length ?? bytes.length)));
  }

  toByteArray(): Uint8Array{
    const total = this.chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for(const c of this.chunks){
      out.set(c, p);
      p += c.length;
    }
    return out;
  }
}

describe("Streams", () => {
  it("copy copies all bytes", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const input = new ArrayInputStream(data);
    const output = new ArrayOutputStream();
    Streams.copy(input, output, 2); // small buffer
    expect([...output.toByteArray()]).toEqual([1, 2, 3, 4, 5]);
  });

  it("copy with default buffer size", () => {
    const data = new Uint8Array(10000).map((_, i) => i % 256);
    const output = new ArrayOutputStream();
    Streams.copy(new ArrayInputStream(data), output);
    expect([...output.toByteArray()]).toEqual([...data]);
  });

  it("copyBytes reads all remaining bytes", () => {
    const data = new Uint8Array([10, 20, 30]);
    expect([...Streams.copyBytes(new ArrayInputStream(data))]).toEqual([10, 20, 30]);
  });

  it("copyString decodes UTF-8", () => {
    const text = "你好, world!";
    const bytes = new TextEncoder().encode(text);
    expect(Streams.copyString(new ArrayInputStream(bytes))).toBe(text);
  });

  it("copyProgress reports progress 0..1", () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const seen: number[] = [];
    const output = new ArrayOutputStream();
    Streams.copyProgress(new ArrayInputStream(data), output, 4, 2, (p) => seen.push(p));
    expect(seen[0]).toBeCloseTo(0.5, 10);
    expect(seen[1]).toBeCloseTo(1, 10);
    expect([...output.toByteArray()]).toEqual([1, 2, 3, 4]);
  });

  it("OptimizedByteArrayOutputStream returns internal buffer when full", () => {
    const baos = new OptimizedByteArrayOutputStream(4);
    baos.write(new Uint8Array([1, 2, 3, 4]));
    expect(baos.size()).toBe(4);
    expect(baos.toByteArray()).toBe(baos.getBuffer()); // no copy when full
    expect([...baos.toByteArray()]).toEqual([1, 2, 3, 4]);
  });

  it("OptimizedByteArrayOutputStream grows", () => {
    const baos = new OptimizedByteArrayOutputStream(2);
    baos.write(new Uint8Array([1, 2, 3]));
    expect([...baos.toByteArray()]).toEqual([1, 2, 3]);
  });

  it("close ignores errors", () => {
    expect(() => Streams.close({ close: () => { throw new Error("boom"); } })).not.toThrow();
    expect(() => Streams.close(null)).not.toThrow();
  });

  it("emptyBytes constant", () => {
    expect(Streams.emptyBytes.length).toBe(0);
  });
});

