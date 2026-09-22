# 新蓝图格式规范（mindustry-ts schematic, v1）

> 替代原版 base64 蓝图（`bXNjaA...`）。蓝图是轻量数据，新格式用 JSON 便于调试/版本化。

## 布局
```
文本：JSON（UTF-8）。为与原版交换，提供 base64url 封装。
```
```json
{
  "format": "mindustry-ts-schematic",
  "version": 1,
  "width": 5,
  "height": 5,
  "name": "My Blueprint",
  "description": "",
  "labels": ["early-game"],
  "tags": { "name": "My Blueprint" },
  "tiles": [
    { "x": 0, "y": 0, "block": "core-shard", "config": null, "rotation": 0 }
  ]
}
```

## 原版结构（对照参考，转换用）
- base64 解码 → zlib inflate → `"msch"` + version byte + `u16` width + `u16` height + tags(StringMap) + tiles。
- tile：`u16` x + `u16` y + `u16` blockId + `u8` config 类型 + config 数据 + `u8` rotation。
- `blockId` 经 content 表映射为名称。

## 转换
- `tools/convert` 增加 schematic 子命令：读原版 base64 → JSON。
- 编辑器/加载器直接读写 JSON；对外交换用 base64url 封装。

## 对接
- 与 Writes/Reads 兼容：若需紧凑二进制，可将 JSON 压缩后 base64，但 v1 直接 JSON。