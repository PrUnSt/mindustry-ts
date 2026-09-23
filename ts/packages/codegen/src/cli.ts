import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generate } from "./codegen.js";
import { defaultConfig, type CodegenConfig } from "./config.js";

/** Own package root; used to resolve the repo-relative `classids.properties` seed. */
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const USAGE = [
  "Usage: codegen <inputDir> <outputDir> [--check]",
  "  Scans <inputDir> recursively for *.def.ts files and writes generated files to <outputDir>.",
  "  --check  generate in memory and compare against <outputDir>; exit 1 on any drift (writes nothing).",
];

function collectSources(directory: string, extension: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...collectSources(full, extension));
    else if (entry.name.endsWith(extension)) found.push(full);
  }
  return found.sort();
}

export interface CliOptions {
  config?: CodegenConfig;
}

/**
 * CLI entry point. Returns the process exit code.
 *
 * One run drives every generator (entity interfaces, abstract bases, merged entities,
 * `Groups`, `EntityMapping` and `@Struct` value types) — Java needed three annotation
 * rounds for the same output (`EntityProcess.java:65-231`).
 */
export function main(argv: string[], options: CliOptions = {}): number {
  const flags = argv.filter((argument) => argument.startsWith("--"));
  const positional = argv.filter((argument) => !argument.startsWith("--"));
  const unknown = flags.filter((flag) => flag !== "--check");
  if (unknown.length > 0) {
    console.error(`Unknown option(s): ${unknown.join(", ")}`);
    console.error(USAGE.join("\n"));
    return 1;
  }

  const [inputDir, outputDir] = positional;
  if (inputDir === undefined || outputDir === undefined) {
    console.error(USAGE.join("\n"));
    return 1;
  }
  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    console.error(`Input directory not found or not a directory: ${inputDir}`);
    return 1;
  }

  const config = options.config ?? defaultConfig(PACKAGE_ROOT);
  const sources = collectSources(inputDir, config.sourceExtension);
  if (sources.length === 0) {
    console.error(`No ${config.sourceExtension} files found under: ${inputDir}`);
    return 1;
  }

  let outputs: Map<string, string>;
  try {
    outputs = generate(sources, { inputRoot: inputDir, config });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  if (flags.includes("--check")) return check(outputDir, outputs);

  fs.mkdirSync(outputDir, { recursive: true });
  for (const [fileName, content] of outputs) {
    fs.writeFileSync(path.join(outputDir, fileName), content, "utf8");
  }
  console.log(`Generated ${outputs.size} file(s) from ${sources.length} source file(s) into ${outputDir}`);
  return 0;
}

/** Compares generated text against what is already on disk; writes nothing. */
function check(outputDir: string, outputs: ReadonlyMap<string, string>): number {
  const drift: string[] = [];
  for (const [fileName, expected] of outputs) {
    const target = path.join(outputDir, fileName);
    if (!fs.existsSync(target)) drift.push(`${fileName}: missing`);
    else if (fs.readFileSync(target, "utf8") !== expected) drift.push(`${fileName}: out of date`);
  }
  if (drift.length > 0) {
    console.error(`Generated output is not up to date (${drift.length} file(s)):`);
    for (const entry of drift) console.error(`  ${entry}`);
    return 1;
  }
  console.log(`Checked ${outputs.size} file(s) in ${outputDir}: up to date`);
  return 0;
}

// Run directly: `node dist/cli.js <inputDir> <outputDir> [--check]`.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  process.exitCode = main(process.argv.slice(2));
}
