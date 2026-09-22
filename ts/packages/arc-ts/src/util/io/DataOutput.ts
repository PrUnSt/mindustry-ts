// 源: java.io.DataOutput（Writes 的底层抽象；语义对齐 Java DataOutputStream，大端字节序）

/** A data output sink, mirroring the java.io.DataOutput methods used by {@link Writes}. */
export interface DataOutput{
  /** Writes one byte. */
  writeByte(value: number): void;
  /** Writes two bytes, big-endian. */
  writeShort(value: number): void;
  /** Writes four bytes, big-endian. */
  writeInt(value: number): void;
  /** Writes eight bytes, big-endian. */
  writeLong(value: number): void;
  /** Writes four bytes, big-endian (IEEE 754). */
  writeFloat(value: number): void;
  /** Writes eight bytes, big-endian (IEEE 754). */
  writeDouble(value: number): void;
  /** Writes a boolean as one byte (1 or 0). */
  writeBoolean(value: boolean): void;
  /** Writes a string using modified UTF-8 with a two-byte big-endian length prefix. */
  writeUTF(value: string): void;
  /** Writes `length` bytes from `bytes` starting at `offset`. */
  write(bytes: Uint8Array, offset: number, length: number): void;
  /** Writes all of `bytes`. */
  write(bytes: Uint8Array): void;
}
