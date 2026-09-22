import { readFileSync, writeFileSync } from "node:fs";
import { parseMschMeta } from "./msch.js";
import { writeNewMap } from "./map.js";

const [input, output] = process.argv.slice(2);
if(!input || !output){
  console.error("Usage: node cli.js <input.msav|.msch> <output>");
  process.exit(1);
}
const bytes = readFileSync(input);
const meta = parseMschMeta(bytes);
// v1: convert header/meta only; tile body conversion TODO (needs content id->name table).
const body = new Uint8Array(0);
writeFileSync(output, writeNewMap(meta, body));
console.log(`converted ${input}: ${meta.width}x${meta.height} "${meta.name}" -> ${output}`);