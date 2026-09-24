import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { parseMsch, parseMschMeta } from "./msch.js";
import { decodeMapBody, encodeMapBody } from "./mapBody.js";
import { readNewMap, writeNewMap } from "./map.js";
import { CONTENT_TYPE_NAMES, CONTENT_TYPE_COUNT } from "./contentTypes.js";
import { parseMarkers, readUbjson } from "./mapMarkers.js";

// Maps ship with the source tree (`core/assets/maps/**`), so we derive the repo root from this file's
// location instead of hard-coding a machine-specific absolute path.
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const mapsRoot = join(repoRoot, "core", "assets", "maps");

function collectMaps(dir: string, out: string[] = []): string[]{
  for(const entry of readdirSync(dir)){
    const path = join(dir, entry);
    if(statSync(path).isDirectory()){
      collectMaps(path, out);
    }else if(entry.endsWith(".msav") || entry.endsWith(".msch")){
      out.push(path);
    }
  }
  return out;
}

const maps = collectMaps(mapsRoot).sort();
const mapByBase = (base: string): string => maps.find(m => m.endsWith(base))!;

// Pinned statistics measured from the real files (all 114 are `.msav`; the repo has no `.msch`).
const EXPECTED_MAP_COUNT = 114;
const EXPECTED_TOTAL_TILES = 19586152;
const EXPECTED_TOTAL_ENTITIES = 718731;

describe("ContentType frozen table", () => {
  it("is exactly the 18 upstream enum constants, in order", () => {
    // ContentType.java carries "Do not rearrange, ever!" — this order is a permanent wire contract.
    expect(CONTENT_TYPE_COUNT).toBe(18);
    expect([...CONTENT_TYPE_NAMES]).toEqual([
      "item", "block", "mech_UNUSED", "bullet", "liquid", "status", "unit", "weather",
      "effect_UNUSED", "sector", "loadout_UNUSED", "typeid_UNUSED", "error", "planet",
      "ammo_UNUSED", "team", "unitCommand", "unitStance",
    ]);
    expect(CONTENT_TYPE_NAMES.indexOf("block")).toBe(1);
  });

  it("resolves every bundled map's content header to a known ContentType", () => {
    for(const path of maps){
      const parsed = parseMsch(readFileSync(path), { includeBlocks: false });
      expect(parsed.content.length).toBeGreaterThan(0);
      for(const table of parsed.content){
        expect(CONTENT_TYPE_NAMES).toContain(table.type);
        expect(table.names.length).toBeGreaterThan(0);
      }
      // Every map must declare a block name list — floors/overlays/blocks index into it.
      expect(parsed.body.blockNames.length).toBeGreaterThan(0);
    }
  });
});

describe("parseMsch — stage 1: floors & overlays across all bundled maps", () => {
  it(`parses floors/overlays for all ${EXPECTED_MAP_COUNT} maps without throwing`, () => {
    expect(maps.length).toBe(EXPECTED_MAP_COUNT);

    const failures: string[] = [];
    let tiles = 0;
    for(const path of maps){
      const rel = relative(repoRoot, path);
      try{
        const parsed = parseMsch(readFileSync(path), { includeBlocks: false });
        const expected = parsed.width * parsed.height;
        expect(expected).toBeGreaterThan(0);
        expect(parsed.body.floors.length).toBe(expected);
        expect(parsed.body.overlays.length).toBe(expected);
        expect(parsed.body.width).toBe(parsed.width);
        expect(parsed.body.height).toBe(parsed.height);
        tiles += expected;
      }catch(e){
        failures.push(`${rel}: ${(e as Error).message}`);
      }
    }

    expect(failures).toEqual([]);
    expect(tiles).toBe(EXPECTED_TOTAL_TILES);
  });
});

describe("parseMsch — stage 2: blocks & inline entities across all bundled maps", () => {
  it(`parses blocks for all ${EXPECTED_MAP_COUNT} maps with length === width*height`, () => {
    const failures: string[] = [];
    let tiles = 0;
    let entities = 0;
    for(const path of maps){
      const rel = relative(repoRoot, path);
      try{
        const parsed = parseMsch(readFileSync(path));
        const expected = parsed.width * parsed.height;
        expect(parsed.body.blocks.length).toBe(expected);
        expect(parsed.body.floors.length).toBe(expected);
        expect(parsed.body.overlays.length).toBe(expected);

        // Entity sub-blocks stay opaque: length boundary + revision byte must be self-consistent.
        for(const blob of parsed.body.entities){
          expect(blob.bytes.length).toBeGreaterThanOrEqual(1);
          expect(blob.bytes[0]).toBe(blob.revision);
          expect(blob.tileIndex).toBeGreaterThanOrEqual(0);
          expect(blob.tileIndex).toBeLessThan(expected);
        }
        tiles += expected;
        entities += parsed.body.entities.length;
      }catch(e){
        failures.push(`${rel}: ${(e as Error).message}`);
      }
    }

    expect(failures).toEqual([]);
    expect(tiles).toBe(EXPECTED_TOTAL_TILES);
    expect(entities).toBe(EXPECTED_TOTAL_ENTITIES);
  });
});

describe("parseMsch — regression vs the frozen parseMschMeta", () => {
  it("keeps archipelago's width/height/name identical", () => {
    const bytes = readFileSync(mapByBase("archipelago.msav"));
    const old = parseMschMeta(bytes);
    const full = parseMsch(bytes);

    expect(full.width).toBe(old.width);
    expect(full.height).toBe(old.height);
    expect(full.meta.name).toBe(old.name);
    expect(full.width).toBe(500);
    expect(full.height).toBe(500);
    expect(full.meta.name).toBe("Archipelago");
    expect(full.saveVersion).toBe(5);
  });
});

describe("new MTSM map body", () => {
  it("round-trips floors/overlays/blocks through encode → decode (archipelago)", () => {
    const parsed = parseMsch(readFileSync(mapByBase("archipelago.msav")));
    const decoded = decodeMapBody(encodeMapBody(parsed.body));

    expect(decoded.width).toBe(500);
    expect(decoded.height).toBe(500);
    expect(decoded.floors.length).toBe(250000);
    expect(decoded.blocks.length).toBe(250000);
    expect([...decoded.floors]).toEqual([...parsed.body.floors]);
    expect([...decoded.blocks]).toEqual([...parsed.body.blocks]);
    expect(decoded.entities.length).toBe(parsed.body.entities.length);
    expect(decoded.entities.length).toBe(90);
    expect(decoded.blockNames).toEqual(parsed.body.blockNames);
  });

  it("is idempotent: converting twice yields byte-identical output", () => {
    const bytes = readFileSync(mapByBase("archipelago.msav"));
    const first = writeNewMap(parseMsch(bytes));
    const second = writeNewMap(parseMsch(bytes));
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);

    // Re-encoding the decoded body must reproduce the exact body bytes.
    const reread = readNewMap(first);
    expect(Buffer.from(encodeMapBody(reread.body)).equals(Buffer.from(encodeMapBody(parseMsch(bytes).body)))).toBe(true);
    expect(reread.header.width).toBe(500);
    expect(reread.body.blocks.length).toBe(250000);
  });

  it("rejects a body whose declared dimensions were corrupted", () => {
    const parsed = parseMsch(readFileSync(mapByBase("archipelago.msav")));
    const body = encodeMapBody(parsed.body);
    // Shrink the declared height from 500 to 100 ⇒ the RLE streams no longer cover the map.
    body[2] = 0x00;
    body[3] = 0x64;
    expect(() => decodeMapBody(body)).toThrow(/did not cover the map/);
  });
});

describe("markers", () => {
  it("decodes empty marker maps and reads real marker payloads as {}", () => {
    const aegis = readFileSync(mapByBase("aegis.msav")); // save version 11 ⇒ has a markers region
    const parsed = parseMsch(aegis);
    expect(parsed.saveVersion).toBe(11);
    expect(parsed.body.markerCount).toBe(0);
    expect(parsed.body.markers.length).toBe(2);
    expect([...parsed.body.markers]).toEqual([0x7b, 0x7d]); // "{}"
  });

  it("reads UBJSON values used by the marker format", () => {
    expect(readUbjson(new Uint8Array([0x7b, 0x7d]))).toEqual({});
    expect(readUbjson(new Uint8Array([0x5b, 0x5d]))).toEqual([]);
    // {"a": true, "b": -2}
    const value = readUbjson(new Uint8Array([
      0x7b,
      0x69, 0x01, 0x61, 0x54,             // 'i' len1 "a" 'T'
      0x69, 0x01, 0x62, 0x69, 0xfe,       // 'i' len1 "b" 'i' -2
      0x7d,
    ]));
    expect(value).toEqual({ a: true, b: -2 });

    const markers = parseMarkers(new Uint8Array([0x7b, 0x7d]));
    expect(markers.count).toBe(0);
    expect(markers.raw.length).toBe(2);
  });
});
