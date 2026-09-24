import { readFileSync, writeFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { parseMsch } from "./msch.js";
import { readNewMap, writeNewMap } from "./map.js";
import { encodeMapBody } from "./mapBody.js";

const args = process.argv.slice(2);
const check = args.includes("--check");
const [input, output] = args.filter(a => !a.startsWith("--"));
if(!input || !output){
  console.error("Usage: node cli.js <input.msav|.msch> <output> [--check]");
  process.exit(1);
}

const bytes = readFileSync(input);
const parsed = parseMsch(bytes);
const out = writeNewMap(parsed);
writeFileSync(output, out);

const tiles = parsed.width * parsed.height;
console.log(
  `converted ${input}: v${parsed.saveVersion} ${parsed.width}x${parsed.height} "${parsed.meta.name}" -> ${output} ` +
  `(floors=${parsed.body.floors.length} overlays=${parsed.body.overlays.length} blocks=${parsed.body.blocks.length} ` +
  `entities=${parsed.body.entities.length} tiles=${tiles})`,
);
for(const warning of parsed.warnings) console.warn(`warning: ${warning}`);

if(check){
  // 1. converting the same input twice must produce identical bytes.
  const second = writeNewMap(parseMsch(readFileSync(input)));
  const stable = Buffer.compare(Buffer.from(out), Buffer.from(second)) === 0;

  // 2. decoding the body and re-encoding it must reproduce the exact body bytes.
  const reread = readNewMap(out);
  const before = encodeMapBody(parsed.body);
  const after = encodeMapBody(reread.body);
  const bodyStable = Buffer.compare(Buffer.from(before), Buffer.from(after)) === 0;

  // 3. the decoded body must round-trip its dimensions and tile counts.
  const dimsOk = reread.body.width === parsed.width && reread.body.height === parsed.height
    && reread.body.floors.length === tiles
    && reread.body.overlays.length === tiles
    && reread.body.blocks.length === tiles;

  console.log(`--check: stable=${stable} bodyRoundTrip=${bodyStable} dimensions=${dimsOk}`);
  if(!stable || !bodyStable || !dimsOk){
    process.exit(2);
  }
}
