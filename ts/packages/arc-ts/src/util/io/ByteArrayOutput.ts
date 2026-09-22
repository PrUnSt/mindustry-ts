// 源: 迁移辅助（对应 java.io.ByteArrayOutputStream + DataOutputStream 语义，DataView 实现）
// 移植: 大端字节序，与 Java DataOutput 一致；long 用 BigInt64 保证 64 位位布局

import { DataOutput } from "./DataOutput";
import { encodeModifiedUtf8 } from "./Utf8";

/** A growable big-endian byte output implementing {@link DataOutput}, backed by a DataView. */
export class ByteArrayOutput implements DataOutput{
  private buffer: Uint8Array;
  private view: DataView;
  private pos = 0;

  constructor(initialSize = 32){
    this.buffer = new Uint8Array(Math.max(1, initialSize));
    this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
  }

  private ensure(extra: number): void{
    if(this.pos + extra <= this.buffer.length) return;
    let newSize = this.buffer.length * 2;
    while(newSize < this.pos + extra) newSize *= 2;
    const next = new Uint8Array(newSize);
    next.set(this.buffer.subarray(0, this.pos));
    this.buffer = next;
    this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
  }

  writeByte(value: number): void{
    this.ensure(1);
    this.view.setInt8(this.pos, value);
    this.pos += 1;
  }

  writeShort(value: number): void{
    this.ensure(2);
    this.view.setInt16(this.pos, value, false);
    this.pos += 2;
  }

  writeInt(value: number): void{
    this.ensure(4);
    this.view.setInt32(this.pos, value, false);
    this.pos += 4;
  }

  writeLong(value: number): void{
    this.ensure(8);
    this.view.setBigInt64(this.pos, BigInt(Math.trunc(value)), false);
    this.pos += 8;
  }

  writeFloat(value: number): void{
    this.ensure(4);
    this.view.setFloat32(this.pos, value, false);
    this.pos += 4;
  }

  writeDouble(value: number): void{
    this.ensure(8);
    this.view.setFloat64(this.pos, value, false);
    this.pos += 8;
  }

  writeBoolean(value: boolean): void{
    this.writeByte(value ? 1 : 0);
  }

  writeUTF(value: string): void{
    const bytes = encodeModifiedUtf8(value);
    if(bytes.length > 65535){
      throw new RangeError("encoded string too long: " + bytes.length + " bytes");
    }
    this.writeShort(bytes.length);
    this.write(bytes);
  }

  write(bytes: Uint8Array, offset?: number, length?: number): void{
    const off = offset ?? 0;
    const len = length ?? bytes.length;
    this.ensure(len);
    this.buffer.set(bytes.subarray(off, off + len), this.pos);
    this.pos += len;
  }

  /** Returns a copy of the written bytes. */
  toByteArray(): Uint8Array{
    return this.buffer.slice(0, this.pos);
  }

  /** Returns the raw internal buffer (may be larger than the written size). */
  getBuffer(): Uint8Array{
    return this.buffer;
  }

  /** The number of bytes written so far. */
  size(): number{
    return this.pos;
  }

  close(): void{
  }
}
