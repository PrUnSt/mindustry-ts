// 源: java.io.DataOutputStream.writeUTF / java.io.DataInputStream.readUTF 语义（modified UTF-8）
// 移植: 最小本地实现，供 ByteArrayOutput/ByteArrayInput 使用（TODO: 迁移到 io/DataStreams 统一实现）

/** Thrown on malformed modified-UTF-8 input, mirroring java.io.UTFDataFormatException. */
export class UtfDataFormatError extends Error {
  constructor(message: string){
    super(message);
    this.name = "UTFDataFormatException";
  }
}

/**
 * Encodes a JS string using Java's "modified UTF-8" rules:
 * - U+0001..U+007F: 1 byte
 * - U+0000 and U+0080..U+07FF: 2 bytes (NUL is encoded as C0 80)
 * - U+0800..U+FFFF (including unpaired surrogates): 3 bytes
 */
export function encodeModifiedUtf8(str: string): Uint8Array{
  const out: number[] = [];
  for(let i = 0; i < str.length; i++){
    const c = str.charCodeAt(i);
    if(c >= 0x0001 && c <= 0x007f){
      out.push(c);
    }else if(c <= 0x07ff){
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    }else{
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

/** Decodes `length` bytes of modified UTF-8 starting at `offset` (port of Java readUTFBody). */
export function decodeModifiedUtf8(bytes: Uint8Array, offset: number, length: number): string{
  let count = 0;
  const chars: string[] = [];

  let c: number;
  while(count < length){
    c = bytes[offset + count] & 255;
    if(c > 127){
      break;
    }
    count++;
    chars.push(String.fromCharCode(c));
  }

  while(count < length){
    c = bytes[offset + count] & 255;
    switch(c >> 4){
      case 0:
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
      case 6:
      case 7:
        count++;
        chars.push(String.fromCharCode(c));
        break;
      case 8:
      case 9:
      case 10:
      case 11:
      default:
        throw new UtfDataFormatError("malformed input around byte " + count);
      case 12:
      case 13:{
        count += 2;
        if(count > length){
          throw new UtfDataFormatError("malformed input: partial character at end");
        }
        const char2 = bytes[offset + count - 1];
        if((char2 & 192) !== 128){
          throw new UtfDataFormatError("malformed input around byte " + count);
        }
        chars.push(String.fromCharCode(((c & 31) << 6) | (char2 & 63)));
        break;
      }
      case 14:{
        count += 3;
        if(count > length){
          throw new UtfDataFormatError("malformed input: partial character at end");
        }
        const char2 = bytes[offset + count - 2];
        const char3 = bytes[offset + count - 1];
        if((char2 & 192) !== 128 || (char3 & 192) !== 128){
          throw new UtfDataFormatError("malformed input around byte " + (count - 1));
        }
        chars.push(String.fromCharCode(((c & 15) << 12) | ((char2 & 63) << 6) | ((char3 & 63) << 0)));
        break;
      }
    }
  }

  return chars.join("");
}
