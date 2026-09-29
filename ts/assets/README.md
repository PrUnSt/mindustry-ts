# ts/assets —— TS 侧自有资源

## 为什么要有这个目录（前置条件②）

原先 TS 侧**直接引用 Java 原版的资源目录** `core/assets/`：

- `ts/tools/convert/src/msch.full.test.ts` → `join(repoRoot, "core", "assets", "maps")`
- `ts/tools/convert/src/msch.test.ts` → `join(repoRoot, "core", "assets", "maps", "default", name)`

这意味着「删掉 Java 只留 TS」会连带打断 convert 的验收——删 Java 的四条前置条件之一
（② 资源迁出 + 改掉测试路径）就是为此设立的。现在两条路径都已改指 `ts/assets/maps/`。

## 当前内容

| 目录 | 体积 | 内容 | 谁在用 |
|---|---|---|---|
| `maps/` | 8.0 MB | 114 个 `.msav`（`default/` 19 · `erekir/` · `serpulo/`） | `tools/convert` 的 12 个用例 |

来源：**从 `core/assets/maps/` 复制**（逐字节相同，未做任何转换）。

## ⚠️ 是「复制」不是「移动」——以及为什么

`core/assets/` 目前**不能动**，两条硬理由：

1. **Java 侧 golden 导出器还在用它**。`tests/src/test/java/GoldenExportTest.java` 的输出路径
   `Paths.get("..","..","ts","golden")` 是相对 `core/assets` 推导的
   （根 `build.gradle:460` 把 `:tests` 的 `workingDir` 设成了 `../core/assets`）。
   移动资源 → `:tests:test` 起不来 → 前置条件③④（golden 对拍）的基准没法重新导出。
2. Java 原版本身的构建与运行也要读 `core/assets`（贴图/音效/地图/着色器）。

**所以现在是「TS 侧自给自足 + Java 侧保留原样」，两边各有一份地图副本（共约 16MB）。**

## 尚未迁出的资源

| 目录 | 体积 | 何时迁 |
|---|---|---|
| `core/assets/sprites/` | 1.7 MB | 渲染层从「Canvas 2D 纯几何」升级到真贴图时 |
| `core/assets/sounds/` | 7.3 MB | 音效接入时 |
| `core/assets/music/` | 28 MB | 优先级最低，玩法不依赖 |
| `core/assets/{shaders,cubemaps,bundles,locales,...}` | — | 按需 |

判据很简单：**TS 侧有代码真的去读它，才迁。** 提前搬运只会增加 git 体积而没有验收价值。

## 「什么时候才能删 core/」

按 `.workbuddy/memory/MEMORY.md` §7，四条前置条件全部满足才谈。当前状态：

- ① 玩法闭环 —— **部分**（采矿→入库→建造已通；冶炼/供电/工厂链/单位生产/完整 UI 未做）
- ② 资源迁出 —— **部分**（地图已迁；贴图音效未迁，`core/assets` 仍需保留供 Java 用）
- ③ golden 快照固化 —— ✅
- ④ 与原版对拍 —— ✅
