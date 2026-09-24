import { inflateSync } from "node:zlib";
import { BigEndianReader } from "./reader.js";
import {
  mapKindForVersion,
  readContentHeader,
  readMap,
  readMarkers,
  regionLayoutForVersion,
  type ContentTable,
  type RawMap,
} from "./saveVersion.js";
import { buildMapBody, type MapBody } from "./mapBody.js";
import type { MarkersData } from "./mapMarkers.js";

export const MSAV_MAGIC = [0x4d, 0x53, 0x41, 0x56]; // "MSAV"

export interface MschMeta{
  version: number;
  tags: Map<string, string>;
  width: number;
  height: number;
  name: string;
  description: string;
  author: string;
}

/** A region we do not decode (patches / entities / custom) or that stays opaque by design. */
export interface OpaqueRegion{
  name: string;
  bytes: Uint8Array;
}

export interface ParsedMap{
  meta: MschMeta;
  saveVersion: number;
  /** Tile-grid width/height from the `map` region (not the meta tags). */
  width: number;
  height: number;
  content: ContentTable[];
  body: MapBody;
  opaqueRegions: OpaqueRegion[];
  warnings: string[];
}

/** Reads a chunk (int length + payload), runs fn within it, then seeks past any remainder. */
function readChunk<T>(r: BigEndianReader, fn: () => T): T{
  const length = r.readInt();
  const start = r.position;
  const value = fn();
  r.seek(start + length);
  return value;
}

function readStringMap(r: BigEndianReader): Map<string, string>{
  const size = r.readUnsignedShort();
  const map = new Map<string, string>();
  for(let i = 0; i < size; i++){
    map.set(r.readUTF(), r.readUTF());
  }
  return map;
}

/** Same mapping as `parseMschMeta` (kept in sync deliberately — that function is frozen for callers). */
function metaFromTags(version: number, tags: Map<string, string>): MschMeta{
  const int = (key: string, def = 0): number => {
    const v = tags.get(key);
    return v === undefined ? def : parseInt(v, 10);
  };
  return {
    version,
    tags,
    width: int("width"),
    height: int("height"),
    name: tags.get("name") ?? tags.get("mapname") ?? "unknown",
    description: tags.get("description") ?? "",
    author: tags.get("author") ?? "",
  };
}

/**
 * Parses the meta header of a Mindustry map/save file (.msch / .msav).
 * Format (zlib-deflated stream):
 *   "MSAV" (4 bytes) + int version + ordered regions (each: int length + payload):
 *   meta, patches(v>=12), content, map, entities, markers(v>=8), custom.
 * Only the first region ("meta" StringMap) is required to obtain width/height/name/tags.
 */
export function parseMschMeta(bytes: Uint8Array): MschMeta{
  const inflated = inflateSync(bytes);
  const r = new BigEndianReader(inflated);

  for(const magic of MSAV_MAGIC){
    if(r.readUnsignedByte() !== magic){
      throw new Error("Not a Mindustry map/save file (bad magic).");
    }
  }
  const version = r.readInt();

  const tags = readChunk(r, () => readStringMap(r));

  const int = (key: string, def = 0): number => {
    const v = tags.get(key);
    return v === undefined ? def : parseInt(v, 10);
  };

  return {
    version,
    tags,
    width: int("width"),
    height: int("height"),
    name: tags.get("name") ?? tags.get("mapname") ?? "unknown",
    description: tags.get("description") ?? "",
    author: tags.get("author") ?? "",
  };
}

export interface ParseMschOptions{
  /**
   * When false, stop the `map` region after the floor/overlay pass. Used by the staged tests to
   * localise RLE desyncs (floor/overlay first, blocks second).
   */
  includeBlocks?: boolean;
}

/**
 * Full parse of a Mindustry map/save: meta + content header + tile body (floors/overlays/blocks) +
 * markers. Inline tile entities are preserved as opaque blobs; the `entities`/`patches`/`custom`
 * regions stay opaque (see plan §9 — save loading is a separate milestone).
 */
export function parseMsch(bytes: Uint8Array, opts: ParseMschOptions = {}): ParsedMap{
  const inflated = inflateSync(bytes);
  const r = new BigEndianReader(inflated);

  for(const magic of MSAV_MAGIC){
    if(r.readUnsignedByte() !== magic){
      throw new Error("Not a Mindustry map/save file (bad magic).");
    }
  }
  const version = r.readInt();
  const kind = mapKindForVersion(version);
  const layout = regionLayoutForVersion(version);

  let meta: MschMeta | null = null;
  let content: ContentTable[] = [];
  let raw: RawMap | null = null;
  let markers: MarkersData = { markers: [], count: 0, raw: new Uint8Array(0), json: null };
  const opaqueRegions: OpaqueRegion[] = [];
  const warnings: string[] = [];

  for(const name of layout){
    if(r.remaining() <= 0){
      if(name === "custom" || name === "markers" || name === "patches"){
        warnings.push(`region "${name}" is absent (truncated file)`);
        continue;
      }
      throw new Error(`unexpected end of file before region "${name}"`);
    }
    const length = r.readInt();
    const end = r.position + length;
    if(name === "meta"){
      meta = metaFromTags(version, readStringMap(r));
    }else if(name === "content"){
      content = readContentHeader(r);
    }else if(name === "map"){
      raw = readMap(r, kind, { regionEnd: end, includeBlocks: opts.includeBlocks });
    }else if(name === "markers"){
      markers = readMarkers(r.readBytes(end - r.position));
    }else{
      opaqueRegions.push({ name, bytes: r.readBytes(end - r.position) });
    }
    r.seek(end);
  }

  if(meta === null) throw new Error("missing meta region");
  if(raw === null) throw new Error("missing map region");

  const body = buildMapBody(raw, content, markers);
  if(raw.residualBytes.length > 0){
    warnings.push(
      `map region left ${raw.residualBytes.length} unconsumed byte(s): legacy v${version} inline block ` +
      `entities require Block.hasBuilding() (not available without the Java Block class)`,
    );
  }

  return {
    meta,
    saveVersion: version,
    width: raw.width,
    height: raw.height,
    content,
    body,
    opaqueRegions,
    warnings,
  };
}
