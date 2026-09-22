import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseMschMeta } from "./msch.js";

describe("parseMschMeta", () => {
  it("parses a real campaign map header (archipelago.msav)", () => {
    const bytes = readFileSync("D:/zjl/Mindustry/core/assets/maps/default/archipelago.msav");
    const meta = parseMschMeta(bytes);
    expect(meta.version).toBeGreaterThanOrEqual(1);
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
    expect(meta.name.length).toBeGreaterThan(0);
  });

  it("parses another map (caldera.msav)", () => {
    const bytes = readFileSync("D:/zjl/Mindustry/core/assets/maps/default/caldera.msav");
    const meta = parseMschMeta(bytes);
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });
});