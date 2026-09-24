import { deflateSync, inflateSync } from "node:zlib";
import { decodeMapBody, encodeMapBody, type MapBody } from "./mapBody.js";
import type { ParsedMap } from "./msch.js";

/** New-format map file: magic "MTSM" + u32 headerLength + JSON header + zlib(body). */
export const NEW_MAP_MAGIC = [0x4d, 0x54, 0x53, 0x4d]; // "MTSM"

export interface NewMapHeader{
  format: "mindustry-ts-map";
  version: 1;
  width: number;
  height: number;
  name: string;
  description: string;
  author: string;
  tags: Record<string, string>;
}

export interface NewMapFile{
  header: NewMapHeader;
  body: MapBody;
}

/** Serializes a parsed source map into the new `MTSM` format (JSON header + binary body). */
export function writeNewMap(map: ParsedMap): Uint8Array{
  const header: NewMapHeader = {
    format: "mindustry-ts-map",
    version: 1,
    width: map.width,
    height: map.height,
    name: map.meta.name,
    description: map.meta.description,
    author: map.meta.author,
    tags: Object.fromEntries(map.meta.tags),
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const bodyBytes = deflateSync(encodeMapBody(map.body));
  const out = new Uint8Array(4 + 4 + headerBytes.length + bodyBytes.length);
  out.set(NEW_MAP_MAGIC, 0);
  new DataView(out.buffer).setUint32(4, headerBytes.length, false);
  out.set(headerBytes, 8);
  out.set(bodyBytes, 8 + headerBytes.length);
  return out;
}

/** Parses a new `MTSM` file back into its header and (decoded) body. */
export function readNewMap(bytes: Uint8Array): NewMapFile{
  for(let i = 0; i < NEW_MAP_MAGIC.length; i++){
    if(bytes[i] !== NEW_MAP_MAGIC[i]) throw new Error("Not a mindustry-ts map file (bad magic).");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = view.getUint32(4, false);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLength))) as NewMapHeader;
  const body = decodeMapBody(inflateSync(bytes.subarray(8 + headerLength)));
  return { header, body };
}
