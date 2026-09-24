/**
 * Reads the `markers` region of a Mindustry save/map.
 *
 * Java side: `SaveVersion.readMarkers` → `MapMarkers.read` (`game/MapMarkers.java:61-74`) which does
 *   `JsonIO.readBytes(IntMap.class, ObjectiveMarker.class, stream)`.
 * `JsonIO.readBytes` decodes the payload with arc's **UBJSON** reader and then maps it onto
 * `IntMap<Integer, ObjectiveMarker>`. The marker *values* carry polymorphic class tags for
 * `ObjectiveMarker` subclasses — resolving those to real classes is out of scope (see plan §9: no save
 * loading). So we decode the UBJSON structure fully (structure-complete, byte-lossless) and expose a
 * plain JS value; the raw payload is always retained.
 *
 * Every map shipped in `core/assets/maps/**` stores an empty `IntMap` here, i.e. the two bytes `{}`.
 */

export type UbjsonValue =
  | null
  | boolean
  | number
  | string
  | UbjsonValue[]
  | { [key: string]: UbjsonValue };

export interface MarkersData{
  /** Decoded marker entries (id → opaque value). Empty for all bundled campaign maps. */
  markers: { id: number; value: UbjsonValue }[];
  count: number;
  /** The raw UBJSON payload, exactly as stored in the markers region. */
  raw: Uint8Array;
  /** The fully decoded UBJSON value (never lossy on structure). */
  json: UbjsonValue;
}

const textDecoder = new TextDecoder("utf-8", { fatal: false });

/** Minimal UBJSON (Universal Binary JSON) reader covering every type arc's `UBJsonReader` emits. */
class UbjsonReader{
  private pos = 0;

  constructor(private readonly view: DataView, private readonly bytes: Uint8Array){}

  private u8(): number{ return this.view.getUint8(this.pos++); }

  private int(kind: number): number{
    switch(kind){
      case 0x69: return this.view.getInt8(this.pos++);            // 'i' int8
      case 0x55: return this.view.getUint8(this.pos++);           // 'U' uint8
      case 0x49: { const v = this.view.getInt16(this.pos, false); this.pos += 2; return v; } // 'I'
      case 0x6c: { const v = this.view.getInt32(this.pos, false); this.pos += 4; return v; } // 'l'
      case 0x4c: { const v = this.view.getBigInt64(this.pos, false); this.pos += 8; return Number(v); } // 'L'
      default: throw new Error(`UBJSON: not an integer marker 0x${kind.toString(16)}`);
    }
  }

  private string(): string{
    const kind = this.u8();
    const len = this.int(kind);
    const s = textDecoder.decode(this.bytes.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }

  /** Reads a single value whose container-provided type marker may already be known. */
  private value(forced?: number): UbjsonValue{
    const kind = forced ?? this.u8();
    switch(kind){
      case 0x5a: return null;                    // 'Z'
      case 0x54: return true;                    // 'T'
      case 0x46: return false;                   // 'F'
      case 0x69: case 0x55: case 0x49: case 0x6c: case 0x4c:
        return this.int(kind);
      case 0x64: { const v = this.view.getFloat32(this.pos, false); this.pos += 4; return v; } // 'd'
      case 0x44: { const v = this.view.getFloat64(this.pos, false); this.pos += 8; return v; } // 'D'
      case 0x43: return String.fromCharCode(this.u8()); // 'C' char
      case 0x48: return Number(this.string());          // 'H' high-precision number
      case 0x53: return this.string();                  // 'S' string
      case 0x5b: return this.array();                   // '['
      case 0x7b: return this.object();                  // '{'
      default: throw new Error(`UBJSON: unsupported marker 0x${kind.toString(16)} at ${this.pos - 1}`);
    }
  }

  private array(): UbjsonValue[]{
    const out: UbjsonValue[] = [];
    let forcedType: number | undefined;
    let count = -1;
    let mark = this.u8();
    if(mark === 0x24){ // '$' typed array
      forcedType = this.u8();
      mark = this.u8();
    }
    if(mark === 0x23){ // '#' counted array
      count = this.int(this.u8());
      mark = this.u8();
    }
    if(mark === 0x5d) return out; // ']' — empty

    if(count >= 0){
      out.push(this.value(forcedType ?? mark));
      for(let i = 1; i < count; i++) out.push(this.value(forcedType));
      this.expect(0x5d, "']'");
      return out;
    }
    // unbounded: `mark` is already the first element's type marker
    out.push(this.value(mark));
    while(true){
      const m = this.u8();
      if(m === 0x5d) return out;
      out.push(this.value(m));
    }
  }

  private object(): { [key: string]: UbjsonValue }{
    const out: { [key: string]: UbjsonValue } = {};
    let forcedType: number | undefined;
    let count = -1;
    let mark = this.u8();
    if(mark === 0x24){ // '$' typed object
      forcedType = this.u8();
      mark = this.u8();
    }
    if(mark === 0x23){ // '#' counted object
      count = this.int(this.u8());
      mark = this.u8();
    }
    if(mark === 0x7d) return out; // '}' — empty

    // `mark` is the length marker of the first key; put it back and read keys normally.
    this.pos--;

    if(count >= 0){
      for(let i = 0; i < count; i++) out[this.string()] = this.value(forcedType);
      this.expect(0x7d, "'}'");
      return out;
    }
    while(true){
      const m = this.u8();
      if(m === 0x7d) return out;
      this.pos--;
      out[this.string()] = this.value(forcedType);
    }
  }

  private expect(marker: number, what: string): void{
    const got = this.u8();
    if(got !== marker) throw new Error(`UBJSON: expected ${what} at ${this.pos - 1}, got 0x${got.toString(16)}`);
  }

  parse(): UbjsonValue{
    const v = this.value();
    return v;
  }
}

/** Decodes a UBJSON payload into a plain JS value. An empty payload yields `null`. */
export function readUbjson(bytes: Uint8Array): UbjsonValue{
  if(bytes.length === 0) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return new UbjsonReader(view, bytes).parse();
}

/** Parses the raw `markers` region payload (`MapMarkers.read` on the Java side). */
export function parseMarkers(payload: Uint8Array): MarkersData{
  const json = readUbjson(payload);
  const markers: { id: number; value: UbjsonValue }[] = [];

  if(Array.isArray(json)){
    json.forEach((value, i) => markers.push({ id: i, value }));
  }else if(json !== null && typeof json === "object"){
    for(const [key, value] of Object.entries(json)){
      markers.push({ id: Number.parseInt(key, 10), value });
    }
  }

  return { markers, count: markers.length, raw: payload, json };
}
