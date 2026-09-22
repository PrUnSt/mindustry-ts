import { inflateSync } from "node:zlib";
import { BigEndianReader } from "./reader.js";

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