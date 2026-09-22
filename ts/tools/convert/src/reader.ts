// Big-endian reader over a byte array (Java DataInputStream semantics).
export class BigEndianReader{
  private view: DataView;
  private pos: number;

  constructor(bytes: Uint8Array){
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = 0;
  }

  get position(): number{ return this.pos; }
  seek(position: number): void{ this.pos = position; }

  readUnsignedByte(): number{ const v = this.view.getUint8(this.pos); this.pos++; return v; }
  readByte(): number{ const v = this.view.getInt8(this.pos); this.pos++; return v; }
  readUnsignedShort(): number{ const v = this.view.getUint16(this.pos, false); this.pos += 2; return v; }
  readShort(): number{ const v = this.view.getInt16(this.pos, false); this.pos += 2; return v; }
  readInt(): number{ const v = this.view.getInt32(this.pos, false); this.pos += 4; return v; }
  readBoolean(): boolean{ return this.readUnsignedByte() !== 0; }
  readBytes(length: number): Uint8Array{
    const v = new Uint8Array(this.view.buffer, this.view.byteOffset + this.pos, length);
    this.pos += length;
    return v;
  }
  skip(length: number): void{ this.pos += length; }
  remaining(): number{ return this.view.byteLength - this.pos; }

  /** Java writeUTF/readUTF: unsigned-short length + modified UTF-8. */
  readUTF(): string{
    const len = this.readUnsignedShort();
    const bytes = this.readBytes(len);
    return decodeModifiedUtf8(bytes);
  }
}

// Java "modified UTF-8": 0xC0 0x80 encodes U+0000; supplementary chars are encoded as UTF-16 surrogate pairs (2x3-byte).
export function decodeModifiedUtf8(b: Uint8Array): string{
  const out: number[] = [];
  let i = 0;
  while(i < b.length){
    const c = b[i];
    if(c < 0x80){
      out.push(c); i++;
    }else if((c & 0xE0) === 0xC0){
      out.push(((c & 0x1F) << 6) | (b[i + 1] & 0x3F)); i += 2;
    }else{
      // 3-byte (also covers surrogate-pair halves, which are 0xED xx xx)
      out.push(((c & 0x0F) << 12) | ((b[i + 1] & 0x3F) << 6) | (b[i + 2] & 0x3F)); i += 3;
    }
  }
  return String.fromCharCode(...out);
}