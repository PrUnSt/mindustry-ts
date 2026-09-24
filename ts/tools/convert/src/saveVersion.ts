import { BigEndianReader } from "./reader.js";
import { CONTENT_TYPE_NAMES } from "./contentTypes.js";
import { parseMarkers, type MarkersData } from "./mapMarkers.js";

/**
 * Version-aware reader for the `content` and `map` regions of a Mindustry save/map file.
 *
 * Java side (`core/src/mindustry/io/`):
 *  - `SaveVersion.read` (`:64-77`) walks the regions in an order that depends on the save version.
 *  - `SaveVersion.readContentHeader` (`:627-654`) reads `u8 mapped` then, per type,
 *    `u8 ContentType.ordinal + u16 count + UTF[]`.
 *  - `SaveVersion.readMap` (`:292-396`) is the modern reader; older saves use subclasses:
 *      * `versions/LegacySaveVersion.readMap`  — v1..3  (`legacy`)
 *      * `versions/ShortChunkSaveVersion.readMap` — v4..9 (`short`, 2-byte entity chunks + bit-1 legacy data)
 *      * `SaveVersion.readMap`                 — v10+  (`int`, 4-byte entity chunks)
 *  - `SaveVersion.readMarkers` (`:467-469`) → `game/MapMarkers.java`.
 *
 * The RLE / packed flag layout is byte-exact: a single misread byte desynchronises the whole stream,
 * hence the parser verifies that `meta`/`content`/`map` regions are consumed exactly.
 */

export type RegionName = "meta" | "patches" | "content" | "map" | "entities" | "markers" | "custom";

/** Which `readMap` flavour a save version uses. */
export type MapKind = "legacy" | "short" | "int";

export interface ContentTable{
  /** Frozen ContentType name (see `contentTypes.ts`). */
  type: string;
  names: string[];
}

export interface TileData{
  data: number;
  floorData: number;
  overlayData: number;
  extraData: number;
}

export interface TileExtra{
  data: TileData | null;
  /** Index into `RawMap.entities` (only set for center tiles that carry an entity blob). */
  entity: number | null;
  center: boolean;
  /** `packed & 1` — a entity is associated with this tile, even for non-center multiblock parts. */
  hadEntity: boolean;
}

/**
 * An inline entity sub-block inside the `map` chunk (`SaveVersion.java:365-382` → `tile.build.readAll`).
 * Kept **opaque**: we retain its length boundary, revision byte and raw bytes, never decode the entity.
 */
export interface EntityBlob{
  tileIndex: number;
  /** `byte revision = in.b()` — the first payload byte. */
  revision: number;
  /** Raw payload including the revision byte (byte-lossless). */
  bytes: Uint8Array;
  center: boolean;
}

export interface RawMap{
  width: number;
  height: number;
  /** File-local block ids (indices into the `block` ContentType name list), length = width*height. */
  floorIds: Uint16Array;
  overlayIds: Uint16Array;
  blockIds: Uint16Array;
  extras: Map<number, TileExtra>;
  entities: EntityBlob[];
  /** Bytes of the `map` region left unconsumed (only legacy v1..3 with buildings; empty otherwise). */
  residualBytes: Uint8Array;
}

export interface ReadMapOptions{
  /** When false, stop after the floor/overlay pass (used by the staged tests). */
  includeBlocks?: boolean;
  /** Absolute offset of the first byte after the `map` region; enables residual detection. */
  regionEnd?: number;
}

export function mapKindForVersion(version: number): MapKind{
  if(version <= 3) return "legacy";
  if(version <= 9) return "short";
  return "int";
}

/** Region order per `SaveVersion.read` and its version subclasses. */
export function regionLayoutForVersion(version: number): RegionName[]{
  if(version <= 6) return ["meta", "content", "map", "entities"];
  if(version === 7) return ["meta", "content", "map", "entities", "custom"];
  if(version <= 10) return ["meta", "content", "map", "entities", "markers", "custom"];
  if(version === 11) return ["meta", "content", "patches", "map", "entities", "markers", "custom"];
  return ["meta", "patches", "content", "map", "entities", "markers", "custom"];
}

/** `SaveVersion.readContentHeader`: `u8 mapped` + per type `u8 ordinal + u16 count + UTF[]`. */
export function readContentHeader(r: BigEndianReader): ContentTable[]{
  const mapped = r.readUnsignedByte();
  const out: ContentTable[] = [];
  for(let i = 0; i < mapped; i++){
    const ordinal = r.readUnsignedByte();
    const total = r.readUnsignedShort();
    const names: string[] = [];
    for(let j = 0; j < total; j++){
      names.push(r.readUTF());
    }
    out.push({ type: CONTENT_TYPE_NAMES[ordinal] ?? `unknown_${ordinal}`, names });
  }
  return out;
}

/** `MapMarkers.read`: the region payload is a UBJSON-encoded `IntMap<Integer, ObjectiveMarker>`. */
export function readMarkers(payload: Uint8Array): MarkersData{
  return parseMarkers(payload);
}

export function readMap(r: BigEndianReader, kind: MapKind, opts: ReadMapOptions = {}): RawMap{
  const includeBlocks = opts.includeBlocks !== false;
  const width = r.readUnsignedShort();
  const height = r.readUnsignedShort();
  const total = width * height;

  const floorIds = new Uint16Array(total);
  const overlayIds = new Uint16Array(total);

  // --- floors: `short floorid + short oreid + u8 consecutives` (the `oreid` is the overlay/ore id) ---
  let i = 0;
  while(i < total){
    const floorId = r.readShort() & 0xffff;
    const overlayId = r.readShort() & 0xffff;
    const consecutives = r.readUnsignedByte();
    const last = i + consecutives;
    if(last >= total){
      throw new Error(`floor RLE overflow: run ends at ${last} but tile count is ${total}`);
    }
    for(let j = i; j <= last; j++){
      floorIds[j] = floorId;
      overlayIds[j] = overlayId;
    }
    i = last + 1;
  }
  if(i !== total){
    throw new Error(`floor RLE did not cover the map: covered ${i} of ${total} tiles`);
  }

  const blockIds = includeBlocks ? new Uint16Array(total) : new Uint16Array(0);
  const extras = new Map<number, TileExtra>();
  const entities: EntityBlob[] = [];

  if(includeBlocks){
    let b = 0;
    while(b < total){
      const blockId = r.readShort() & 0xffff;
      blockIds[b] = blockId;

      if(kind === "legacy"){
        // LegacySaveVersion.readMap: no packed byte; `hasBuilding` decides chunk-vs-RLE. We cannot
        // evaluate `Block.hasBuilding()` without the Java Block class, so we take the RLE branch and
        // tolerate a desync (the leftover bytes land in `residualBytes`, see the warning in `msch.ts`).
        const consecutives = r.readUnsignedByte();
        const last = Math.min(b + consecutives, total - 1);
        for(let j = b + 1; j <= last; j++){
          blockIds[j] = blockId;
        }
        b = last + 1;
        continue;
      }

      const packed = r.readUnsignedByte();
      const hadEntity = (packed & 1) !== 0;
      const hadDataOld = kind === "short" && (packed & 2) !== 0;
      const hadDataNew = (packed & 4) !== 0;

      let data: TileData | null = null;
      if(hadDataNew){
        data = {
          data: r.readUnsignedByte(),
          floorData: r.readUnsignedByte(),
          overlayData: r.readUnsignedByte(),
          extraData: r.readInt(),
        };
      }

      let center = true;
      let entityIdx: number | null = null;
      if(hadEntity){
        center = r.readBoolean();
        if(center){
          const len = kind === "short" ? r.readUnsignedShort() : r.readInt();
          const payload = r.readBytes(len);
          entityIdx = entities.length;
          entities.push({
            tileIndex: b,
            revision: payload.length > 0 ? payload[0] : 0,
            bytes: payload,
            center,
          });
        }
      }

      if(hadDataNew || hadEntity || hadDataOld){
        extras.set(b, { data, entity: entityIdx, center, hadEntity });
      }

      if(!hadEntity){
        if(hadDataOld){
          const oldByte = r.readUnsignedByte();
          const entry = extras.get(b);
          if(entry && entry.data === null){
            entry.data = { data: oldByte, floorData: 0, overlayData: 0, extraData: 0 };
          }
        }else if(!hadDataNew){
          const consecutives = r.readUnsignedByte();
          const last = b + consecutives;
          if(last >= total){
            throw new Error(`block RLE overflow: run ends at ${last} but tile count is ${total}`);
          }
          for(let j = b + 1; j <= last; j++){
            blockIds[j] = blockId;
          }
          b = last + 1;
          continue;
        }
      }
      b += 1;
    }
    if(b !== total){
      throw new Error(`block RLE did not cover the map: covered ${b} of ${total} tiles`);
    }
  }

  const residualBytes = opts.regionEnd === undefined ? new Uint8Array(0) : r.readBytes(Math.max(0, opts.regionEnd - r.position));

  return { width, height, floorIds, overlayIds, blockIds, extras, entities, residualBytes };
}
