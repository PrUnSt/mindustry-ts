// 源: 迁移辅助（对应 java.io.ByteArrayInputStream + DataInputStream 语义，DataView 实现）
// 移植: 大端字节序，与 Java DataInput 一致；long 用 BigInt64 保证 64 位位布局

import { DataInput } from "./DataInput";
import { decodeModifiedUtf8 } from "./Utf8";

/** A big-endian byte input implementing {@link DataInput}, backed by a DataView over a Uint8Array. */
export class ByteArrayInput implements DataInput{
  private buffer: Uint8Array;
  private view: DataView;
  private pos = 0;

  constructor(buffer: Uint8Array){
    this.buffer = buffer;
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  read(): number{
    return this.pos < this.buffer.length ? this.buffer[this.pos++] : -1;
  }

  readByte(): number{
    const v = this.view.getInt8(this.pos);
    this.pos += 1;
    return v;
  }

  readUnsignedByte(): number{
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }

  readShort(): number{
    const v = this.view.getInt16(this.pos, false);
    this.pos += 2;
    return v;
  }

  readUnsignedShort(): number{
    const v = this.view.getUint16(this.pos, false);
    this.pos += 2;
    return v;
  }

  readInt(): number{
    const v = this.view.getInt32(this.pos, false);
    this.pos += 4;
    return v;
  }

  readLong(): number{
    const v = Number(this.view.getBigInt64(this.pos, false));
    this.pos += 8;
    return v;
  }

  readFloat(): number{
    const v = this.view.getFloat32(this.pos, false);
    this.pos += 4;
    return v;
  }

  readDouble(): number{
    const v = this.view.getFloat64(this.pos, false);
    this.pos += 8;
    return v;
  }

  readBoolean(): boolean{
    return this.readUnsignedByte() !== 0;
  }

  readUTF(): string{
    const len = this.readUnsignedShort();
    const value = decodeModifiedUtf8(this.buffer, this.pos, len);
    this.pos += len;
    return value;
  }

  readFully(bytes: Uint8Array, offset?: number, length?: number): void{
    const off = offset ?? 0;
    const len = length ?? bytes.length;
    bytes.set(this.buffer.subarray(this.pos, this.pos + len), off);
    this.pos += len;
  }

  skipBytes(n: number): number{
    const skipped = Math.min(n, this.buffer.length - this.pos);
    this.pos += skipped;
    return skipped;
  }

  /** The number of bytes remaining. */
  available(): number{
    return this.buffer.length - this.pos;
  }

  close(): void{
  }
}
