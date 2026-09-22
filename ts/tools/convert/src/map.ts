import { deflateSync } from "node:zlib";
import type { MschMeta } from "./msch.js";

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

export function writeNewMap(meta: MschMeta, body: Uint8Array): Uint8Array{
  const header: NewMapHeader = {
    format: "mindustry-ts-map",
    version: 1,
    width: meta.width,
    height: meta.height,
    name: meta.name,
    description: meta.description,
    author: meta.author,
    tags: Object.fromEntries(meta.tags),
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const bodyBytes = deflateSync(body);
  const out = new Uint8Array(4 + 4 + headerBytes.length + bodyBytes.length);
  out.set(NEW_MAP_MAGIC, 0);
  new DataView(out.buffer).setUint32(4, headerBytes.length, false);
  out.set(headerBytes, 8);
  out.set(bodyBytes, 8 + headerBytes.length);
  return out;
}