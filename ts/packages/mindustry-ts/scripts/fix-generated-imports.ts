// codegen 产物包名改写（S3 接线）。
//
// 背景（S2 交接单）: `packages/codegen/src/config.ts` 的 `entityGroupImport` 默认值是
// `@mindustry-ts/mindustry-ts`，但本包在 workspace 里的真实名字是 **`@mindustry-ts/game`**。
// codegen 不属于 S3 的文件范围（不能改），`cli.ts` 也不接受外部 config，
// 所以这里在 `gen` 之后做一次**幂等**的产物改写。
//
// ⚠️ 为什么改成**相对路径**而不是包名（S3 实测修正）:
//   最初的方案是把包名改写成 `@mindustry-ts/game`。但 pnpm 的 workspace 软链只存在于
//   **依赖方**的 node_modules 下（`apps/headless/node_modules/@mindustry-ts/game`），
//   本包自己的 `node_modules/@mindustry-ts/` 里**没有**自链接
//   （包不会把自己列为自己的依赖）。于是：
//     - `pnpm --filter @mindustry-ts/game test`（包内 vitest）解析失败；
//     - `tsc -p packages/mindustry-ts/tsconfig.json` 报 `TS2307: Cannot find module`。
//   改成相对路径 `../entities/EntityGroup.js` 后：
//     - 包内、apps 内、tsx、vite、vitest 的解析结果**完全一致**（都是同一个文件）；
//     - 不存在「同包两个模块实例」的风险（这正是原方案想避免的问题，相对路径同样能避免）；
//     - 不需要往 tsconfig 塞 `paths`，也不需要自链接。
//   代价：生成产物多了一处「依赖目录布局」的知识 —— 由本脚本集中承担，且 `gen/` 是
//   gitignore 的构建产物，不影响阅读源码的人。
//
// 用法: tsx scripts/fix-generated-imports.ts [--check]
//   --check  只检查是否已经正确（有差异则退出码 1，不写盘）

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** codegen 默认写的包名（`packages/codegen/src/config.ts` 的 `entityGroupImport`）。 */
const WRONG = "@mindustry-ts/mindustry-ts";
/** `EntityGroup` 相对 `src/gen/` 的真实位置。 */
const RIGHT = "../entities/EntityGroup.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const genDir = path.join(packageRoot, "src", "gen");

function listGenerated(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listGenerated(full));
    else if (entry.name.endsWith(".ts")) found.push(full);
  }
  return found.sort();
}

function main(): number {
  const checkOnly = process.argv.includes("--check");
  const files = listGenerated(genDir);
  if (files.length === 0) {
    console.error(`No generated files under: ${genDir} — run \`pnpm gen\` first.`);
    return 1;
  }

  let changed = 0;
  const drifted: string[] = [];
  for (const file of files) {
    // 逐行处理后统一用 LF 写回：`.gitattributes` 已对 *.ts 声明 LF，
    // 且生成产物不依赖 CRLF（见交付说明里的 CRLF 容错要求）。
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    let touched = false;
    const rewritten = lines.map((line) => {
      if (!line.includes(`"${WRONG}"`)) return line;
      touched = true;
      return line.split(`"${WRONG}"`).join(`"${RIGHT}"`);
    });
    if (!touched) continue;

    changed++;
    drifted.push(path.relative(packageRoot, file));
    if (!checkOnly) fs.writeFileSync(file, rewritten.join("\n"), "utf8");
  }

  if (checkOnly && changed > 0) {
    console.error(`Generated files still import "${WRONG}" (${changed}):\n  ${drifted.join("\n  ")}`);
    return 1;
  }

  console.log(`fix-generated-imports: ${changed} file(s) ${checkOnly ? "would be" : ""} updated ("${WRONG}" -> "${RIGHT}")`);
  return 0;
}

process.exit(main());
