import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { generate } from "./codegen.js";

const COMPONENT_SOURCE_RE = /\.comp\.ts$/;

function collectComponentSources(directory: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectComponentSources(full));
    } else if (COMPONENT_SOURCE_RE.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/**
 * CLI entry point: `codegen <inputDir> <outputDir>`.
 * Scans `<inputDir>` recursively for `*.comp.ts` files, generates
 * `<InterfaceName>.gen.ts` files and writes them to `<outputDir>`.
 * Returns the process exit code.
 */
export function main(argv: string[]): number {
  const [inputDir, outputDir] = argv;

  if (inputDir === undefined || outputDir === undefined) {
    console.error("Usage: codegen <inputDir> <outputDir>");
    console.error("  Scans <inputDir> for *.comp.ts files and writes generated *.gen.ts files to <outputDir>.");
    return 1;
  }

  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    console.error(`Input directory not found or not a directory: ${inputDir}`);
    return 1;
  }

  const sources = collectComponentSources(inputDir);
  if (sources.length === 0) {
    console.error(`No *.comp.ts files found under: ${inputDir}`);
    return 1;
  }

  const outputs = generate(sources);
  fs.mkdirSync(outputDir, { recursive: true });
  for (const [fileName, content] of outputs) {
    fs.writeFileSync(path.join(outputDir, fileName), content, "utf8");
  }

  console.log(`Generated ${outputs.size} file(s) from ${sources.length} component source file(s) into ${outputDir}`);
  return 0;
}

// Run directly: `node dist/cli.js <inputDir> <outputDir>`.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  process.exitCode = main(process.argv.slice(2));
}