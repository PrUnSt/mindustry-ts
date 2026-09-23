# Mindustry TypeScript 迁移工作区

Java 源基准：本仓库根目录（上游 [Anuken/Mindustry](https://github.com/Anuken/Mindustry)，基线 commit `3a54813513`）
Arc 引擎源参考：上游 [Anuken/Arc](https://github.com/Anuken/Arc) 的 `arc-core/src/arc`（基线 commit `8eb00ffff0`）

## 迁移约定（所有 sub-agent 必须遵守）
- 语义等价：类名/方法名/字段名/行为与 Java 版逐字对齐；数值一律 float64；不追求字节级一致。
- 命名映射：Java 公开字段 → TS 同名公开属性（保持 obj.field 访问形式）；方法 → 同名方法；静态 → 静态成员；构造器参数顺序一致；泛型 → TS 泛型。
- 目录对齐：packages/mindustry-ts 对齐 core/src/mindustry；packages/arc-ts 对齐 arc-core/src/arc。
- 序列化统一走 Writes/Reads 语义（packages/arc-ts/src/util/io）。
- 实体/Struct/Remote 由 packages/codegen 生成，不手写 mixin。
- 线程：Thread/AsyncCore → Web Worker（浏览器）/ worker_threads（Node）；世界模拟主线程单线程。
- 自包含优先：arc-ts 子模块间暂避免硬依赖，交叉需求用文件内最小实现 + "// TODO: 迁移到 <模块> 统一实现" 注释。
- 许可：代码 GPLv3；素材 CC BY-NC-SA 非商用。

## 命令
pnpm install
pnpm -r test
pnpm -r build

## 许可与归属

本目录是 [Anuken/Mindustry](https://github.com/Anuken/Mindustry) 的 **Java → TypeScript 迁移实验**，位于该 fork 的 `ts/` 下；上游 Java 实现与素材均未修改。

| 内容 | 许可 |
|---|---|
| Java 原版代码（`core/`、`desktop/`、`server/` 等） | **GPLv3** —— 见仓库根目录 [`LICENSE`](../LICENSE) |
| 本目录（`ts/`）的 TypeScript 迁移代码 | **GPLv3**（GPLv3 的衍生作品，同样受其约束） |
| 美术 / 音乐 / 音效素材（`core/assets/` 下） | **CC BY-NC-SA** —— **禁止商用** |

- 上游基线：`3a54813513`；Arc 引擎基线：`8eb00ffff0`（[Anuken/Arc](https://github.com/Anuken/Arc)）。
- 再分发本仓库须保留 `LICENSE` 与版权声明，并提供对应源码（GPLv3 要求）。
- 若要商用，必须自行替换 `core/assets/` 下采用 CC BY-NC-SA 的贴图与音频。
- "Mindustry" 及相关名称、标识归原作者 Anuken 所有；本 fork 与上游官方无隶属关系。
