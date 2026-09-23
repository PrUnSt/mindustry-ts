# 资源管线清单与转换决策（M1/M4/M5）

> 盘点本仓库 `core/assets` 现状，给出每类资源的 Web 转换方案与归属里程碑。统计为实测值（2026-09-22）。

## 现状统计
| 目录 | 文件数 | 大小 | 说明 |
|---|---|---|---|
| bundles | 36 | 7.8MB | 本地化 .properties（en + 35 语言） |
| fonts | 6 | 6.7MB | font.woff / font_jp.woff / monospace.woff / icon.ttf / logic.ttf / tech.ttf |
| icons | 4 | 0.8MB | icons.properties + icon.ttf（图标字体）+ 应用图标 png/icns/ico |
| sounds | 205 | 6.8MB | .ogg 音效（beams/block/charge/explosions/loops/movement/shoot/ui…） |
| music | 16 | 27.2MB | .ogg 音乐 |
| maps | 114 | 7.7MB | .msch 战役/自定义地图 |
| baseparts | 210 | 0.1MB | .msch 编辑器装饰件 |
| sprites | 13 | 1.6MB | 背景/杂项源图；块/单位贴图构建期程序化生成 |
| shaders | 33 | ~0 | GLSL 片段/顶点着色器 |
| cubemaps | 6 | 1.0MB | 行星 3D 天空盒 |
| cursors | 7 | ~0 | 自定义光标 |
| scripts | 2 | ~0 | Rhino 脚本（mod 体系，v1 不做） |

## 分项决策
1. **bundles → JSON**（归属 M4）
   - 写一个 .properties 解析器（处理 `key=value`、续行 `\`、Unicode 转义、注释）→ 输出 JSON（每语言一个文件）。
   - 键名保留原样（如 `block.copper-wall.name`）；36 语言全部转换，首个里程碑可只带 en + zh。
2. **fonts → Canvas 位图字体**（归属 M1c/M4）
   - woff/ttf 已具备，浏览器可用 FontFace 直接加载文本 UI；游戏内位图字体（对齐 arc.freetype 语义）用 Canvas 栅格化 `font.woff`/`font_jp.woff` 生成字距/字形图集。
   - `logic.ttf`/`tech.ttf`（逻辑/科技符号）转 Web 字体或精灵图。
3. **icons → Web 字体/精灵图**（归属 M1c）
   - `icons.properties` 映射图标名→icon.ttf 字形；转 CSS @font-face（icon.ttf→woff2）即可在 UI 用 `&#x...;`，比精灵图省事。
4. **sounds + music → 播放策略**（归属 M4）
   - 205 音效 + 16 音乐全为 .ogg。Chrome/Firefox/Edge 原生支持；**Safari 不支持 ogg**。
   - 决策：首发（Windows/Linux Chrome 基准）直接播 ogg；macOS/Safari 兼容目标加转码 `m4a` 备选（构建脚本用 ffmpeg 转一份，运行时 `canPlayType` 探测回退）。桌面壳（Tauri/WebView2）走同一 WebAudio 路径。
5. **maps + baseparts → 新格式转换**（归属 M3/M5）
   - 114 张 .msch + 210 baseparts 由 `tools/convert` 一次性转换到新格式（见 docs/formats/map-format.md）。
   - 转换器读原版 .msch（MapIO 语义），输出「版本化 JSON 头 + typed-array 二进制体」。
6. **sprites（程序化生成）→ 一次性导出 + TS 生成器**（归属 M4）
   - 大部分块/单位贴图由构建期代码生成（core/assets/sprites 只有 13 个杂项图）。
   - 决策：先用原版 Java packer 一次性导出 `sprites.atlas + json` 提交为静态资源解锁渲染；后续里程碑把 `tools/ImagePacker` 移植为 TS 程序化生成（因为 Draw 层已移植，同一绘制代码可跑进离屏 Canvas）。
7. **shaders → 原样携带**（归属 M4）
   - 33 个 GLSL 直搬（WebGL2 编译），注意 `#version`/uniform 差异小改。

## 依赖与工具
- 需要一次性工具：.properties→JSON（ts 内实现）、ogg→m4a 转码（外部 ffmpeg，构建脚本调用）、.msch→新格式（tools/convert）、sprites.atlas 一次性导出（原版 Java packer，一次性跑）。
- 版权：音乐/部分美术 CC BY-NC-SA，非商用；分发附原许可证。