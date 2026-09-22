// 源: arc-core/src/arc/util/io/Writes.java

import { DataOutput } from "./DataOutput";

/** A wrapper for DataOutput with more concise method names and no IOExceptions. */
export class Writes{
  public output: DataOutput;

  constructor(output: DataOutput){
    this.output = output;
  }

  /** @deprecated Use the constructor instead. */
  static get(output: DataOutput): Writes{
    return new Writes(output);
  }

  /** write long */
  l(i: number): void{
    this.output.writeLong(i);
  }

  /** write int */
  i(i: number): void{
    this.output.writeInt(i);
  }

  /** write byte */
  b(i: number): void;
  /** write bytes */
  b(array: Uint8Array, offset: number, length: number): void;
  /** write bytes */
  b(array: Uint8Array): void;
  b(iOrArray: number | Uint8Array, offset?: number, length?: number): void{
    if(typeof iOrArray === "number"){
      this.output.writeByte(iOrArray);
    }else if(offset === undefined){
      this.output.write(iOrArray, 0, iOrArray.length);
    }else{
      this.output.write(iOrArray, offset, length!);
    }
  }

  /** write boolean (writes a byte internally) */
  bool(b: boolean): void{
    this.b(b ? 1 : 0);
  }

  /** write short */
  s(i: number): void{
    this.output.writeShort(i);
  }

  /** write float */
  f(f: number): void{
    this.output.writeFloat(f);
  }

  /** write double */
  d(d: number): void{
    this.output.writeDouble(d);
  }

  /** writes a string (UTF) */
  str(str: string): void{
    this.output.writeUTF(str);
  }

  close(): void{
    if(typeof (this.output as { close?: () => void }).close === "function"){
      (this.output as unknown as { close: () => void }).close();
    }
  }
}
