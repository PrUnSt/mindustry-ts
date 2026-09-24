import { BigEndianReader } from "./reader.js";
import { CONTENT_TYPE_NAMES } from "./contentTypes.js";
import type { ContentTable, EntityBlob, RawMap, TileData, TileExtra } from "./saveVersion.js";
import { parseMarkers, type MarkersData } from "./mapMarkers.js";

/**
 * The binary `body` of the new `MTSM` map format (see `docs/formats/map-format.md:27-32`).
 *
 * Design notes:
 *  - The body stores a **content name table** plus per-tile **indices** into the `block` name list.
 *    No raw Java content ids leak out, so the output does not depend on whether the TS `Blocks` ids
 *    match the Java ones (`map-format.md:32`).
 *  - Floors / overlays are plain RLE. Blocks mirror the Java layout: `u16 index + u8 packed`
 *    (`bit0` entity, `bit2` data), optional 7-byte tile data, optional entity blob, optional RLE run.
 *  - Inline tile entities stay **opaque** (length + revision + raw bytes) exactly as parsed.
 *
 * Layout (all big-endian):
 *   u16 width, u16 height
 *   u8 contentTypeCount
 *     per type: u8 ordinal, u16 nameCount, per name: u16 byteLen + UTF-8 bytes
 *   floors   : (u16 index + u8 consecutives)*
 *   overlays : (u16 index + u8 consecutives)*
 *   blocks   : per entry { u16 index, u8 packed,
 *                          if data  : u8 data, u8 floorData, u8 overlayData, i32 extraData,
 *                          if entity: u8 center, u32 blobLen, bytes,
 *                          if neither: u8 consecutives }
 *   u32 blockResidualLen + bytes
 *   u32 markersLen + bytes
 */

export interface MapBody{
  width: number;
  height: number;
  content: ContentTable[];
  /** Resolution table for `floors`/`overlays`/`blocks` (the `block` ContentType name list). */
  blockNames: string[];
  floors: Uint16Array;
  overlays: Uint16Array;
  blocks: Uint16Array;
  extras: Map<number, TileExtra>;
  entities: EntityBlob[];
  /** Marker count (`MapMarkers.read`). Always 0 for the bundled campaign maps. */
  markerCount: number;
  /** Raw UBJSON marker payload. */
  markers: Uint8Array;
  /** Unconsumed bytes of the original `map` region (legacy v1..3 only, empty otherwise). */
  blockResidual: Uint8Array;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: false });

class ByteWriter{
  private buf = new Uint8Array(4096);
  private pos = 0;

  private ensure(n: number): void{
    if(this.pos + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while(cap < this.pos + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
  }

  u8(v: number): void{ this.ensure(1); this.buf[this.pos++] = v & 0xff; }

  u16(v: number): void{
    this.ensure(2);
    this.buf[this.pos++] = (v >>> 8) & 0xff;
    this.buf[this.pos++] = v & 0xff;
  }

  i32(v: number): void{
    this.ensure(4);
    this.buf[this.pos++] = (v >>> 24) & 0xff;
    this.buf[this.pos++] = (v >>> 16) & 0xff;
    this.buf[this.pos++] = (v >>> 8) & 0xff;
    this.buf[this.pos++] = v & 0xff;
  }

  utf(s: string): void{
    const bytes = textEncoder.encode(s);
    this.u16(bytes.length);
    this.ensure(bytes.length);
    this.buf.set(bytes, this.pos);
    this.pos += bytes.length;
  }

  bytes(b: Uint8Array): void{
    this.ensure(b.length);
    this.buf.set(b, this.pos);
    this.pos += b.length;
  }

  finish(): Uint8Array{ return this.buf.slice(0, this.pos); }
}

function readString(r: BigEndianReader): string{
  const len = r.readUnsignedShort();
  return textDecoder.decode(r.readBytes(len));
}

/**
 * Resolves raw file-local block ids to name-table indices.
 * Mirrors `SaveVersion.java:310`: when `content.block(floorid) == Blocks.air` the floor falls back to
 * `stone`. We compare by *name*, so no Java `Blocks` id table is required.
 */
function resolveFloorIndices(raw: Uint16Array, blockNames: string[]): Uint16Array{
  const stoneIdx = blockNames.indexOf("stone");
  const airIdx = blockNames.indexOf("air");
  const fallback = stoneIdx >= 0 ? stoneIdx : (airIdx >= 0 ? airIdx : 0);
  const out = new Uint16Array(raw.length);
  for(let i = 0; i < raw.length; i++){
    const id = raw[i];
    const name = id < blockNames.length ? blockNames[id] : "air";
    out[i] = name === "air" ? fallback : id;
  }
  return out;
}

export function buildMapBody(raw: RawMap, content: ContentTable[], markers: MarkersData): MapBody{
  const blockNames = content.find(t => t.type === "block")?.names ?? [];
  return {
    width: raw.width,
    height: raw.height,
    content,
    blockNames,
    floors: resolveFloorIndices(raw.floorIds, blockNames),
    overlays: raw.overlayIds,
    blocks: raw.blockIds,
    extras: raw.extras,
    entities: raw.entities,
    markerCount: markers.count,
    markers: markers.raw,
    blockResidual: raw.residualBytes,
  };
}

export function encodeMapBody(body: MapBody): Uint8Array{
  const w = new ByteWriter();
  w.u16(body.width);
  w.u16(body.height);

  w.u8(body.content.length);
  for(const table of body.content){
    const ordinal = CONTENT_TYPE_NAMES.indexOf(table.type as typeof CONTENT_TYPE_NAMES[number]);
    if(ordinal < 0) throw new Error(`unknown content type "${table.type}"`);
    w.u8(ordinal);
    w.u16(table.names.length);
    for(const name of table.names) w.utf(name);
  }

  const writeRle = (values: Uint16Array): void => {
    let i = 0;
    while(i < values.length){
      const v = values[i];
      let run = 0;
      while(run < 255 && i + run + 1 < values.length && values[i + run + 1] === v) run++;
      w.u16(v);
      w.u8(run);
      i += run + 1;
    }
  };
  writeRle(body.floors);
  writeRle(body.overlays);

  const total = body.width * body.height;
  let i = 0;
  while(i < total){
    const extra = body.extras.get(i);
    const hasData = extra?.data != null;
    const hasEntity = extra?.hadEntity === true;
    w.u16(body.blocks[i]);

    let packed = 0;
    if(hasEntity) packed |= 1;
    if(hasData) packed |= 4;
    w.u8(packed);

    if(hasData && extra?.data){
      w.u8(extra.data.data);
      w.u8(extra.data.floorData);
      w.u8(extra.data.overlayData);
      w.i32(extra.data.extraData);
    }
    if(hasEntity && extra){
      w.u8(extra.center ? 1 : 0);
      // Center tiles carry an opaque entity blob; non-center multiblock parts carry none.
      if(extra.entity != null){
        const blob = body.entities[extra.entity];
        w.i32(blob.bytes.length);
        w.bytes(blob.bytes);
      }
    }
    if(!hasData && !hasEntity){
      let run = 0;
      while(run < 255 && i + run + 1 < total){
        const next = i + run + 1;
        if(body.extras.has(next) || body.blocks[next] !== body.blocks[i]) break;
        run++;
      }
      w.u8(run);
      i += run + 1;
      continue;
    }
    i += 1;
  }

  w.i32(body.blockResidual.length);
  w.bytes(body.blockResidual);
  w.i32(body.markers.length);
  w.bytes(body.markers);
  return w.finish();
}

export function decodeMapBody(bytes: Uint8Array): MapBody{
  const r = new BigEndianReader(bytes);
  const width = r.readUnsignedShort();
  const height = r.readUnsignedShort();

  const contentTypeCount = r.readUnsignedByte();
  const content: ContentTable[] = [];
  for(let i = 0; i < contentTypeCount; i++){
    const ordinal = r.readUnsignedByte();
    const count = r.readUnsignedShort();
    const names: string[] = [];
    for(let j = 0; j < count; j++) names.push(readString(r));
    content.push({ type: CONTENT_TYPE_NAMES[ordinal] ?? `unknown_${ordinal}`, names });
  }

  const total = width * height;
  const readRle = (): Uint16Array => {
    const out = new Uint16Array(total);
    let i = 0;
    while(i < total){
      const v = r.readUnsignedShort();
      const run = r.readUnsignedByte();
      for(let j = 0; j <= run && i + j < total; j++) out[i + j] = v;
      i += run + 1;
    }
    if(i !== total) throw new Error(`body RLE did not cover the map: covered ${i} of ${total}`);
    return out;
  };

  const floors = readRle();
  const overlays = readRle();

  const blocks = new Uint16Array(total);
  const extras = new Map<number, TileExtra>();
  const entities: EntityBlob[] = [];

  let i = 0;
  while(i < total){
    const index = r.readUnsignedShort();
    blocks[i] = index;
    const packed = r.readUnsignedByte();
    const hasEntity = (packed & 1) !== 0;
    const hasData = (packed & 4) !== 0;

    let data: TileData | null = null;
    if(hasData){
      data = {
        data: r.readUnsignedByte(),
        floorData: r.readUnsignedByte(),
        overlayData: r.readUnsignedByte(),
        extraData: r.readInt(),
      };
    }

    let entity: number | null = null;
    let center = true;
    if(hasEntity){
      center = r.readBoolean();
      if(center){
        const len = r.readInt();
        const payload = r.readBytes(len);
        entity = entities.length;
        entities.push({ tileIndex: i, revision: payload.length > 0 ? payload[0] : 0, bytes: payload, center });
      }
    }

    if(hasData || hasEntity) extras.set(i, { data, entity, center, hadEntity: hasEntity });

    if(!hasData && !hasEntity){
      const run = r.readUnsignedByte();
      for(let j = 1; j <= run && i + j < total; j++) blocks[i + j] = index;
      i += run + 1;
      continue;
    }
    i += 1;
  }
  if(i !== total) throw new Error(`body block stream did not cover the map: covered ${i} of ${total}`);

  const blockResidual = r.readBytes(r.readInt());
  const markerLen = r.readInt();
  const markerBytes = r.readBytes(markerLen);
  const markers = parseMarkers(markerBytes);

  return {
    width,
    height,
    content,
    blockNames: content.find(t => t.type === "block")?.names ?? [],
    floors,
    overlays,
    blocks,
    extras,
    entities,
    markerCount: markers.count,
    markers: markerBytes,
    blockResidual,
  };
}
