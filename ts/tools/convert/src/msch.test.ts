import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseMschMeta } from "./msch.js";

// 地图取自本仓库 `core/assets/maps/default/`（随源码一起克隆，人人可用），
// 故按测试文件自身位置解析仓库根，避免硬编码任何本机绝对路径。
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const mapFile = (name: string): string =>
  join(repoRoot, "core", "assets", "maps", "default", name);

describe("parseMschMeta", () => {
  it("parses a real campaign map header (archipelago.msav)", () => {
    const bytes = readFileSync(mapFile("archipelago.msav"));
    const meta = parseMschMeta(bytes);
    expect(meta.version).toBeGreaterThanOrEqual(1);
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
    expect(meta.name.length).toBeGreaterThan(0);
  });

  it("parses another map (caldera.msav)", () => {
    const bytes = readFileSync(mapFile("caldera.msav"));
    const meta = parseMschMeta(bytes);
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });
});
