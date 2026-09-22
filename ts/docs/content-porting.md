# Mindustry 内容层移植清单（M2 阶段用）

> 作用：指导 packages/mindustry-ts 从 core/src/mindustry/content/** 逐文件移植。本文件只做清单与模板，不含实现。

## 1. 概述
内容定义在 Java 里约 1.5 万行（14 个文件），全部是「注册式」代码：静态初始化里 `new XxxBlock(name){ ... }` 并设置字段。TS 侧对齐到 `packages/mindustry-ts/src/content/`。

## 2. 目标模块映射
| Java 文件 | 行数 | TS 目标模块 |
|---|---|---|
| Items.java | 122 | src/content/Items.ts |
| Liquids.java | 82 | src/content/Liquids.ts |
| StatusEffects.java | 184 | src/content/StatusEffects.ts |
| Bullets.java | 43 | src/content/Bullets.ts |
| Blocks.java | 6003 | src/content/blocks/*.ts（拆分，见 §6） |
| UnitTypes.java | 4081 | src/content/units/*.ts（拆分） |
| Fx.java | 2380 | src/content/Fx.ts |
| Loadouts.java | 15 | src/content/Loadouts.ts |
| Weathers.java | 110 | src/content/Weathers.ts |
| Planets.java | 190 | src/content/Planets.ts |
| SectorPresets.java | 189 | src/content/SectorPresets.ts |
| TechTree.java | 169 | src/content/TechTree.ts（基类/辅助） |
| SerpuloTechTree.java | 624 | src/content/tech/SerpuloTechTree.ts |
| ErekirTechTree.java | 359 | src/content/tech/ErekirTechTree.ts |
| TeamEntries.java | 11 | src/content/TeamEntries.ts |

被内容引用的类型类（非内容文件，须先于内容移植）：
- `world/Block.java` + `world/blocks/**`（170 文件，14 个子类）→ `src/world/blocks/**`
- `type/UnitType.java`、`type/StatusEffect.java` 等 → `src/type/**`
- `entities/bullet/BulletType.java` → `src/entities/bullet/**`
- `core/ContentLoader.java` → `src/core/ContentLoader.ts`
- `ctype/ContentType.java` → `src/ctype/ContentType.ts`

## 3. 移植顺序（依赖序）
依据 `ContentLoader.createBaseContent()` 的注册顺序 + 类型依赖：
0. `ctype`（ContentType 枚举 + Content 基类：contentType/name/id 注册机制）+ `core/ContentLoader.ts`。
1. type 基类骨架：Item / Liquid / StatusEffect / BulletType / UnitType / Weather / Planet（不实例化）。
2. 叶子数据：Items → Liquids → StatusEffects → Bullets。
3. UnitTypes（依赖 2 + world/blocks 部分类型 + Fx）。
4. Blocks（依赖 1-3 + world/blocks 全部 Block 子类已移植）。
5. Loadouts / Weathers / Planets / SectorPresets。
6. TechTree 基类 → Serpulo / Erekir 树（依赖 Blocks/UnitTypes 已注册）。
7. 前置依赖：`world/blocks/**`（170 个 Block 子类）与 `entities/units` 行为需与内容定义同步推进——建议先移植「数据字段初始化」，再补「行为方法（update/draw）」。

理由：Java 用静态初始化顺序保证依赖；TS 改用显式 `load()` 顺序调用（把 createBaseContent 移植为 ContentLoader.loadAll()，手动按序调用），避免 ES 模块加载顺序问题。

## 4. 公共结构模板
### ContentType 注册
Java：`ContentType.item("items", Item.class)` → TS：枚举 + 数组/Map 维护 `contentMap[type]` / `nameMap`。ContentLoader 用 `ObjectMap<String,MappableContent>[]`；TS 用 `Map<string, MappableContent>[]` 等价。

### Block 子类体系（world/blocks/** 14 类）
campaign / defense / distribution / environment / heat / liquid / logic / payloads / power / production / sandbox / storage / units / legacy。
模板：`export class SomeBlock extends Block { constructor(name: string){ super(name); } }`；实例化在 Blocks 子文件：`const wall = new Wall("copper-wall"); wall.health = 100; ... `。

### Java 匿名类 → TS（最大改写点）
Java：`new Wall("x"){ @Override update(){} }` → TS 用命名子类（`class CopperWall extends Wall { update(){} }`）或「new + 赋值」；匿名 Effect/Bullet 同理。建议统一「先 new 再字段赋值/方法覆盖」风格，避免大段匿名类改写错误。

### UnitType / Fx / TechTree
- UnitType 关键字段：从 `type/UnitType.java` 提取（字段很多，移植时单独生成字段清单）。
- Fx.java：大量静态 `new Effect(...)` → TS 静态字段 + Effect 类型（依赖 `entities/effect`）。
- TechTree：`TechTree.node(...)` 递归构建 → TS 构建函数；Serpulo/Erekir 分开。

## 5. 风险点
- 匿名类/匿名 Effect：最大风险，需改写为命名类或 new+赋值。
- 巨型文件拆分：Blocks.java 按类别拆；静态 import 顺序要小心（TS 用 load() 显式排序规避）。
- `@LoadRegion` / region 引用：贴图区域名，归属 M4 渲染。
- 静态初始化顺序 → 显式 load() 顺序。
- 构造器里设置字段 → 统一 new+赋值 风格。
- 跨文件引用（Blocks 引用 UnitTypes 的 unitType 字段、Fx 的 effect 实例）。

## 6. Blocks.java 拆分建议
按 world/blocks 子类类别 + 资源线拆分：
- blocks/items.ts（物品相关）· blocks/distribution.ts（传送带/分流）
- blocks/liquid.ts（管道/泵）· blocks/power.ts（发电/电网）
- blocks/production.ts（钻机/工厂/冶炼）· blocks/defense.ts（墙/门/护盾）
- blocks/turrets.ts（炮塔）· blocks/units.ts（单位工厂/陆港）
- blocks/storage.ts（容器/核心）· blocks/environment.ts（地形/矿脉）
- blocks/logic.ts · blocks/heat.ts · blocks/payloads.ts · blocks/sandbox.ts · blocks/campaign.ts
每个子文件导出 `load()`，Blocks.ts 汇总按序调用。UnitTypes 按阵营（Serpulo/Erekir）或兵种拆分，同样用 load() 汇总。

## 7. 验收
- headless 加载全部内容（ContentLoader.loadAll）无错。
- 数值快照：每内容条目字段导出 JSON，与原版一次性导出值做 epsilon 比对（防移植走样）。