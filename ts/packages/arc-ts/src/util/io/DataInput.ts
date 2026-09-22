// 源: java.io.DataInput（Reads 的底层抽象；语义对齐 Java DataInputStream，大端字节序）

/** A data input source, mirroring the java.io.DataInput methods used by {@link Reads}. */
export interface DataInput{
  /** Reads one byte (signed). */
  readByte(): number;
  /** Reads one byte (unsigned, 0..255). */
  readUnsignedByte(): number;
  /** Reads two bytes, big-endian (signed). */
  readShort(): number;
  /** Reads two bytes, big-endian (unsigned, 0..65535). */
  readUnsignedShort(): number;
  /** Reads four bytes, big-endian (signed). */
  readInt(): number;
  /** Reads eight bytes, big-endian (as float64; exact within 2^53). */
  readLong(): number;
  /** Reads four bytes, big-endian (IEEE 754). */
  readFloat(): number;
  /** Reads eight bytes, big-endian (IEEE 754). */
  readDouble(): number;
  /** Reads a boolean (nonzero byte). */
  readBoolean(): boolean;
  /** Reads a modified-UTF-8 string with a two-byte big-endian length prefix. */
  readUTF(): string;
  /** Reads `bytes.length` bytes into `bytes`. */
  readFully(bytes: Uint8Array): void;
  /** Reads `length` bytes into `bytes` starting at `offset`. */
  readFully(bytes: Uint8Array, offset: number, length: number): void;
  /** Skips up to `n` bytes; returns the actual number skipped. */
  skipBytes(n: number): number;
  /** Reads the next byte (0..255) or -1 at end of stream (InputStream semantics). */
  read(): number;
}
