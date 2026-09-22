// 源: arc-core/src/arc/util/io/Reads.java

import { DataInput } from "./DataInput";
import { decodeModifiedUtf8 } from "./Utf8";

/** A wrapper for DataInput with more concise method names and no IOExceptions. */
export class Reads{
  public input: DataInput;

  constructor(input: DataInput){
    this.input = input;
  }

  /** @deprecated Use the constructor instead. */
  static get(input: DataInput): Reads{
    return new Reads(input);
  }

  /** @return -1 if EOF or unsupported, or the next byte. */
  checkEOF(): number{
    if(typeof (this.input as { read?: () => number }).read === "function"){
      return (this.input as { read: () => number }).read();
    }
    return -1;
  }

  /** read long */
  l(): number{
    return this.input.readLong();
  }

  /** read int */
  i(): number{
    return this.input.readInt();
  }

  /** read short */
  s(): number{
    return this.input.readShort();
  }

  /** read unsigned short */
  us(): number{
    return this.input.readUnsignedShort();
  }

  /** read byte */
  b(): number;
  /** allocate & read byte array */
  b(length: number): Uint8Array;
  /** read byte array */
  b(array: Uint8Array): Uint8Array;
  /** read byte array w/ offset */
  b(array: Uint8Array, offset: number, length: number): Uint8Array;
  b(a?: number | Uint8Array, offset?: number, length?: number): number | Uint8Array{
    if(a === undefined) return this.input.readByte();
    if(typeof a === "number"){
      const array = new Uint8Array(a);
      this.input.readFully(array);
      return array;
    }
    if(offset === undefined){
      this.input.readFully(a);
      return a;
    }
    this.input.readFully(a, offset, length!);
    return a;
  }

  /** read unsigned byte */
  ub(): number{
    return this.input.readUnsignedByte();
  }

  /** read boolean */
  bool(): boolean{
    return this.input.readBoolean();
  }

  /** read float */
  f(): number{
    return this.input.readFloat();
  }

  /** read double */
  d(): number{
    return this.input.readDouble();
  }

  /** read string (UTF) */
  str(): string;
  /** read string (UTF), with an optional max length */
  str(maxLen: number): string;
  str(maxLen?: number): string{
    const in_ = this.input;

    const utflen = in_.readUnsignedShort();
    if(maxLen !== undefined && maxLen > 0 && utflen > maxLen) throw new Error("String too long: " + maxLen);

    const bytes = new Uint8Array(utflen);
    in_.readFully(bytes);

    // Reads uses Java's cached bytearr/chararr; TS strings are immutable so decode directly.
    return decodeModifiedUtf8(bytes, 0, utflen);
  }

  /** skip bytes */
  skip(amount: number): void{
    this.input.skipBytes(amount);
  }

  close(): void{
    if(typeof (this.input as { close?: () => void }).close === "function"){
      (this.input as unknown as { close: () => void }).close();
    }
  }
}


