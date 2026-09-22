// 源: arc-core/src/arc/util/io/Streams.java

import { Floatc } from "../func/Floatc";

/** Minimal byte-stream read side (corresponds to java.io.InputStream). */
export interface InputStream{
  /** Reads up to buffer.length bytes; returns the count read, or -1 at EOF. */
  read(buffer: Uint8Array): number;
  /** An estimate of the number of bytes available (may be absent). */
  available?(): number;
  close?(): void;
}

/** Minimal byte-stream write side (corresponds to java.io.OutputStream). */
export interface OutputStream{
  write(bytes: Uint8Array, offset: number, length: number): void;
  write(bytes: Uint8Array): void;
  close?(): void;
}

/** Provides utility methods to copy streams. */
export class Streams{
  static readonly defaultBufferSize = 8192;
  static readonly emptyBytes = new Uint8Array(0);

  /** Copies all data from input to output using a {@link #defaultBufferSize} buffer. The streams are not closed. */
  static copy(input: InputStream, output: OutputStream): void;
  /** Copies all data from input to output using a buffer of the specified size. */
  static copy(input: InputStream, output: OutputStream, bufferSize: number): void;
  /** Copies all data from input to output using the specified buffer. The streams are not closed. */
  static copy(input: InputStream, output: OutputStream, buffer: Uint8Array): void;
  static copy(input: InputStream, output: OutputStream, bufferOrSize?: Uint8Array | number): void{
    const buffer = typeof bufferOrSize === "number"
      ? new Uint8Array(bufferOrSize)
      : bufferOrSize ?? new Uint8Array(Streams.defaultBufferSize);
    let bytesRead: number;
    while((bytesRead = input.read(buffer)) !== -1){
      output.write(buffer, 0, bytesRead);
    }
  }

  /**
   * Copies all data from input to output using a buffer of the specified size, reporting progress as a 0-1 value.
   * @param totalLength the total byte length of the input.
   */
  static copyProgress(input: InputStream, output: OutputStream, totalLength: number, bufferSize: number, progress: Floatc): void{
    const buffer = new Uint8Array(bufferSize);
    let totalRead = 0;
    let bytesRead: number;
    while((bytesRead = input.read(buffer)) !== -1){
      totalRead += bytesRead;
      progress(totalRead / totalLength);
      output.write(buffer, 0, bytesRead);
    }
  }

  /** Copies all data from input to a byte array. The stream is not closed. */
  static copyBytes(input: InputStream): Uint8Array;
  /** Copies all data from input to a byte array. The stream is not closed. */
  static copyBytes(input: InputStream, estimatedSize: number): Uint8Array;
  static copyBytes(input: InputStream, estimatedSize?: number): Uint8Array{
    const baos = new OptimizedByteArrayOutputStream(Math.max(0, estimatedSize ?? (input.available ? input.available() : 0)));
    Streams.copy(input, baos);
    return baos.toByteArray();
  }

  /** Copies all data from input to a string, decoded as UTF-8. */
  static copyString(input: InputStream): string;
  /** Copies all data from input to a string, decoded as UTF-8. */
  static copyString(input: InputStream, estimatedSize: number): string;
  /** Copies all data from input to a string using the specified charset (UTF-8 by default). */
  static copyString(input: InputStream, estimatedSize: number, charset: string | null): string;
  static copyString(input: InputStream, estimatedSize?: number, charset?: string | null): string{
    const bytes = Streams.copyBytes(input, estimatedSize ?? (input.available ? input.available() : 0));
    // Java uses InputStreamReader with the given charset; the TextDecoder covers the common UTF-8 case.
    // TODO: 迁移到 <io/Charset> 统一实现（多字符集支持）
    return new TextDecoder(charset ?? "utf-8").decode(bytes);
  }

  /** Close and ignore all errors. */
  static close(c: { close?(): void } | null | undefined): void{
    if(c != null){
      try{
        c.close?.();
      }catch{
        // ignored
      }
    }
  }

}

/** A ByteArrayOutputStream which avoids copying of the byte array if possible. */
export class OptimizedByteArrayOutputStream implements OutputStream{
  private buffer: Uint8Array;
  private count = 0;

  constructor(initialSize = 32){
    this.buffer = new Uint8Array(Math.max(1, initialSize));
  }

  write(bytes: Uint8Array, offset?: number, length?: number): void{
    const off = offset ?? 0;
    const len = length ?? bytes.length;
    if(this.count + len > this.buffer.length){
      let newSize = Math.max(1, this.buffer.length * 2);
      while(newSize < this.count + len) newSize *= 2;
      const next = new Uint8Array(newSize);
      next.set(this.buffer.subarray(0, this.count));
      this.buffer = next;
    }
    this.buffer.set(bytes.subarray(off, off + len), this.count);
    this.count += len;
  }

  toByteArray(): Uint8Array{
    if(this.count === this.buffer.length) return this.buffer;
    return this.buffer.slice(0, this.count);
  }

  getBuffer(): Uint8Array{
    return this.buffer;
  }

  /** The number of bytes written. */
  size(): number{
    return this.count;
  }
}

