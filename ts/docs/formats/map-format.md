# 新地图格式规范（mindustry-ts map, v1）

> 目的：替代原版 .msch/.msav（Java 二进制存档格式），统一为「版本化 JSON 头 + 二进制体」。由 `tools/convert` 一次性转换 114 张战役图 + 210 baseparts。

## 文件布局
```
magic:       4 bytes  "MTSM"
headerLen:   4 bytes  uint32 BE
header:      headerLen bytes JSON（见下）
body:        zlib(二进制体)（v1 为空，TODO）
```

## header（JSON）
```json
{
  "format": "mindustry-ts-map",
  "version": 1,
  "width": 300,
  "height": 300,
  "name": "archipelago",
  "description": "...",
  "author": "Anuken",
  "tags": { "width": "300", "height": "300", "name": "archipelago", ... }
}
```

## body（v1 TODO，规划）
- `u16 width` + `u16 height`（与 header 一致）
- floors：`u16[]`（长 width*height，RLE：u16 id + u8 连续数）
- overlays：同上
- blocks：`u16[]` + packed（u8 标志：entity/data）+ 可选 data（u8×3 + i32）+ 实体块 chunk
- 引用方式：body 存「内容名表」+ 索引（见 content-format），不存裸 id

## 从原版 .msch/.msav 转换（tools/convert）
1. `inflate`（zlib）
2. 校验 magic `MSAV` + `int version`
3. 按序读区域（`int length` + payload）：meta / patches(v≥12) / content / map / entities / markers(v≥8) / custom
4. `meta` 区 = StringMap（`u16` 数量 + UTF 对）→ width/height/name/description/author/tags
5. `map` 区 = readMap：`u16` 宽高 + floors（u16 floorid + u16 oreid + u8 连续）+ blocks（u16 blockid + u8 packed + ...）
6. 内容名表：解析 `content` 区（ContentType → name 列表），把 body 中的 id 映射为 name

## 版本策略
- header.version 递增；旧版本读器拒绝或迁移。
- 与 Writes/Reads 序列化抽象对接：header 用 JSON.stringify/parse，body 用 DataView 大端（与 Java 一致）。