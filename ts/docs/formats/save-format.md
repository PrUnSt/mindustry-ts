# 新存档格式规范（mindustry-ts save, v1）

> 替代原版 .msav 存档。单机存档存 IndexedDB（浏览器）/ 文件（Node/Tauri）。

## 布局
```
magic:     4 bytes  "MTSS"
headerLen: 4 bytes  uint32 BE
header:    JSON
body:      zlib(二进制体)
```

## header（JSON）
```json
{
  "format": "mindustry-ts-save",
  "version": 1,
  "gameVersion": "146",
  "savedAt": 1690000000000,
  "playtime": 123,
  "mapName": "ground-zero",
  "wave": 5,
  "tick": 12345,
  "width": 300,
  "height": 300,
  "playerTeam": 1,
  "mods": []
}
```

## body（区域设计，对齐原版语义但用新结构）
按固定顺序的区域，每区 = `u32 length` + payload：
1. `meta`：JSON 字符串（Rules/GameStats/MapLocales 等，直接 JSON 而非 Java 反射序列化）
2. `patches`：数据补丁/外部资源清单
3. `content`：内容名表（ContentType 顺序 → 名称数组）
4. `map`：同新地图格式 body（floors/overlays/blocks）
5. `entities`：实体二进制（复用 arc-ts Writes/Reads + 生成的 Struct/Remote 序列化）
6. `markers`：JSON
7. `custom`：mod/自定义块（JSON）

## 迁移
- 原版 .msav 通过 `tools/convert` 读 meta + 各区域 → 新结构（内容 id→name 需 content 区）。
- 版本迁移：SaveVersion 1..13 的历史字段差异不再需要逐版兼容（新格式 v1 起步），但保留 migration 钩子。

## 对接
- 序列化统一走 arc-ts 的 `Writes/Reads`（DataView 大端）。
- 存档原子性：先写临时 key/file 再替换；IndexedDB 用事务。