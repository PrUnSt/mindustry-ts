# @mindustry-ts/codegen

Mindustry Java 注解处理器在 TypeScript 侧的等价物。Java 版用 `mindustry.annotations` 的 `EntityProcess` / `RemoteProcess` / `StructProcess` / `LogicStatementProcessor` 在编译期生成代码；本包用 TypeScript compiler API 在构建期做同样的事，产物由构建管线直接引用（不手写 mixin）。

Java 参考实现（只读）：
- `annotations/src/main/java/mindustry/annotations/entity/EntityProcess.java`
- `annotations/src/main/java/mindustry/annotations/impl/StructProcess.java`
- `core/src/mindustry/entities/GroupDefs.java`
- `annotations/src/main/resources/classids.properties`

## 范围（S2）

已实现：

| Java 处理器 | TS 现状 | 产物 |
| --- | --- | --- |
| `EntityProcess` round 1（组件接口 + 抽象基类） | ✅ | `<Interface>c.ts`、base 组件的抽象基类 `<Base>.ts` |
| `EntityProcess` round 2（`@EntityDef` 合并） | ✅ | 合并实体类 `<Name>.ts` |
| `EntityProcess` round 2（`@GroupDef` 组表） | ✅ | `Groups.ts` + `IndexableEntity__<group>.ts` |
| `EntityProcess` round 3（class id → 名字映射） | ✅ | `EntityMapping.ts` |
| `StructProcess`（位打包值类型） | ✅ | `@Struct` 类的 `get`/setter/`bitMask*` |

未实现（本阶段有意排除）：

- `RemoteProcess`（`@Remote` → `Call*Packet`）。Java 会为每个远程方法生成 `Call*` 静态类；TS 侧网络层未定型，等运行时包就绪再做。
- `EntityIO` / `serialize()` / `read()`（存档与网络 revision 机制）。
- `LogicStatementProcessor`。

## 与 Java 的三处结构性差异

1. **单次运行、两趟发射**。Java 需要三轮注解处理（round 1 生成接口 → round 2 生成实体 → round 3 编译 `EntityMapping`），因为 `TypeElement` 的解析互相依赖。TS 侧 AST 是内存里的普通对象，所以一次 `generate()` 内部按「先接口/基类、后实体」的顺序渲染并写盘即可，不需要多轮。
2. **组件通过真实符号表解析**。Java 靠 `interfaceToComp` 把接口名尾字符切掉再 `elements.getTypeElement` 反查组件类；TS 侧维护 `Symbols`（`byName` 组件类名 → 模型、`byInterface` 接口名 → 模型、`resolveSupertype`），`PosComp ↔ Posc` 的配对由结构而非查表保证。`nameRule.ts` 里的字符加工函数只用于**断言 Java 规则**和渲染期给名字，不参与解析。
3. **实体名显式声明 + 派生结果校验**。Java `@EntityDef.value()` 是 `Class[]`，没有名字槽位，所以类名只能由组件名派生（`EntityProcess.java:996-1000`）。TS 装饰器可以携带任意数据，因此写成 `@EntityDef({ name: "MechUnit", components: [Unitc, Mechc] })`，`name` 必填；`deriveEntityName()` 仍完整移植 Java 的四条分支，并在生成时断言 `派生值 === 声明值`。规则从「机制」降级为「受检不变量」——一旦有人改了命名规则而 fixture 没跟上，测试会立刻报错。

## 目录结构

```
packages/codegen/
├── src/
│   ├── codegen.ts              # collect（AST -> SourceModel）+ generate（编排各生成器）
│   ├── model.ts                # ComponentModel / EntityDefModel 等中间模型
│   ├── config.ts               # 命名规则、10 个 Group 表、classids 读取
│   ├── cli.ts                  # node 入口：<inputDir> <outputDir> [--check]
│   ├── index.ts                # 包出口
│   ├── entity/
│   │   ├── nameRule.ts         # Java 命名规则的纯函数移植
│   │   ├── entityGen.ts        # 符号表 + 接口/基类/合并实体渲染 + 方法合并
│   │   ├── groupGen.ts         # Groups.ts 与 IndexableEntity__*.ts
│   │   ├── entityMappingGen.ts # class id 分配与 EntityMapping.ts
│   │   ├── nameRule.test.ts
│   │   ├── entityGen.test.ts
│   │   └── groupGen.test.ts
│   └── struct/
│       ├── structGen.ts        # 位打包结构体
│       └── structGen.test.ts
├── fixtures/
│   ├── decorators.ts           # 装饰器占位定义（运行时 no-op）
│   ├── entity/
│   │   ├── EntityComp.def.ts  PosComp.def.ts  HealthComp.def.ts
│   │   ├── TeamComp.def.ts    UnitComp.def.ts MechComp.def.ts
│   │   ├── BuildingComp.def.ts PosTeam.def.ts UnitTypes.def.ts
│   │   └── gen-classnames.txt  # ground truth：v160.5 jar 里 mindustry/gen/* 的类名
│   └── struct/Tile.def.ts
└── README.md
```

## 输入写法

组件源文件后缀 `.def.ts`（`config.sourceExtension`），用 `fixtures/decorators.ts` 里的占位装饰器：

```ts
import { Component, EntityDef, Replace, SyncField } from "../../decorators.js";
import { Entityc } from "./EntityComp.def.js";

@Component()
export class PosComp {
  x = 0;
  y = 0;
  dst(other: Posc): number { /* ... */ }
}

@Component({ base: true, genInterface: false })
@EntityDef({ name: "Building", components: [Buildingc], excludeGroups: ["all"] })
export class BuildingComp { /* ... */ }

// 非类型元素上的 @EntityDef：走字段分支（对应 UnitTypes.java:34-93）
@EntityDef({ name: "MechUnit", components: [Unitc, Mechc] })
export const mace = 0;
```

支持的装饰器：

| 装饰器 | 语义 | Java 对应 |
| --- | --- | --- |
| `@Component()` | 标记组件类 | `Annotations.Component` |
| `@Component({ base, genInterface })` | `base` → 生成抽象基类；`genInterface: false` → 不生成接口 | 同上 |
| `@EntityDef({ name, components, legacy, pooled, serialize, genio, isFinal, excludeGroups })` | 声明合并实体 | `Annotations.EntityDef` |
| `@GroupDef(value, exclude, spatial, mapping, collide, update)` | 声明组（生成器目前用 `config.ts` 里的表） | `Annotations.GroupDef` |
| `@SyncField` | 同步字段（本阶段仅记录） | `Annotations.SyncField` |
| `@Replace` | 合并时替换同签名方法 | `Annotations.Replace` |
| `@MethodPriority(n)` | 合并优先级，数字大者胜 | `Annotations.MethodPriority` |
| `@ReadOnly` / `@Import` | 字段/导入控制 | 同名注解 |
| `@Struct` / `@StructField(bits)` | 位打包值类型 | 同名注解 |

## 命名规则

全部来自 `EntityProcess.java:915-935,996-1000`，实现在 `src/entity/nameRule.ts`：

| 规则 | 结果 | Java 行号 |
| --- | --- | --- |
| `interfaceNameFor` | `PosComp` → `Posc` | `:915-921` |
| `baseNameFor` | `PosComp` → `Pos` | `:924-928` |
| `interfaceToCompName` | `Posc` → `PosComp`（仅用于断言，不参与解析） | `:931-935` |
| `createName` | `{Unitc, Mechc}` → 排序去 `Comp` 拼接 → `UnitMech` | `:996-1000` |
| `deriveEntityName`（类型元素） | `PosTeamDef` → 去 `Def`/`Comp` → `PosTeam` | `:294-301` |
| `deriveEntityName`（字段元素） | 走 `createName`（`UnitTypes.java:37` 的 `nova`） | `:294-301` |
| `Entity` 后缀 | 派生名与 base 类同名时追加，得到 `Unit`（基类）/`UnitEntity`（实体） | `:303-305` |
| `Legacy` 中缀 | `legacy: true` → `name + "Legacy" + capitalize(elementName)` → `MechUnitLegacyNova` | `:307-309` |

接口名保留尾 `c`（`Posc`/`Unitc`/`Buildingc`）是**刻意**的：Java 侧有 502 处 `*c` 调用点，改名收益为零、迁移成本极高。组件源类名则统一成 `PosComp` 形式，作为「Java 类 ↔ TS 类」的溯源锚点。

## 组表

`config.ts` 的 `DEFAULT_GROUPS` 逐行对应 `GroupDefs.java:6-17`，共 10 个组：

| 组 | 基类型 | 备注 |
| --- | --- | --- |
| `all` | `Entityc` | `exclude = [Unitc, PowerGraphUpdaterc, Bulletc, EffectStatec, Playerc]`（`GroupDefs.java:7`） |
| `effect` | `EffectStatec` | |
| `player` | `Player` | `mapping` |
| `bullet` | `Bulletc` | `spatial`, `collide` |
| `unit` | `Unit` | `spatial`, `mapping` |
| `build` | `Building` | |
| `sync` | `Syncc` | `mapping` |
| `draw` | `Drawc` | |
| `weather` | `WeatherStatec` | |
| `powerGraph` | `PowerGraphUpdaterc` | |

基类型 = `repr.base() ? baseName(repr) : interfaceName(repr)`（`EntityProcess.java:251`），所以 base 组件解析到抽象类（`Unit`/`Building`/`Player`），其余解析到接口。全部名称已对 v160.5 jar 校验（`groupGen.test.ts`）。

## API

```ts
import { generate } from "@mindustry-ts/codegen";

const outputs: Map<string, string> = generate(["fixtures/entity"]);
// => Map { "Posc.ts" => "...", "Building.ts" => "...", "MechUnit.ts" => ..., "Groups.ts" => ..., "EntityMapping.ts" => ... }
```

`generate()` 一次跑完全部生成器：`collectModels` 解析 AST → 建符号表 → `resolveEntities`（组件闭包、base 判定、派生名断言）→ 按「接口/基类 → 实体 → 组 → 映射」写盘。

## CLI

```sh
pnpm --filter @mindustry-ts/codegen build
node dist/cli.js <inputDir> <outputDir>          # 递归扫描 *.def.ts，写生成结果
node dist/cli.js <inputDir> <outputDir> --check  # 只比较不写盘；有漂移退出 1
```

`--check` 在内存里生成后与 `outputDir` 逐文件比对，任何缺失或内容不一致都返回 1，用于 CI 防止生成物过期。

## ground truth

`fixtures/entity/gen-classnames.txt` 是从官方 `server-release.jar`（v160.5）用纯 Python `zipfile` 抽出的 `mindustry/gen/` 下全部 **305** 个类名。本地源码为 `v160.5-9-g0c1acdf537`，但

```
git diff --stat v160.5..HEAD -- annotations/ core/src/mindustry/entities/ core/src/mindustry/resources/
```

输出为空：v160.5 之后虽然还有若干提交（`Fixed #12697` 等）以及全部 `ts/` 迁移提交，但都没有触及 `annotations/`、`core/src/mindustry/entities/`、`core/src/mindustry/resources/`。因此 jar 里的类名对本地源码是权威的。每个 fixture 的派生名都已逐条对照该清单。

## 与 Java 的偏差（已知，均有原因）

| 偏差 | 原因 |
| --- | --- |
| `genInterface: false` 时**不生成**接口；Java 会生成一个空接口 | 空接口在 TS 里还要求实现类声明 `implements`，徒增噪音；S2 验收明确要求「不产接口」 |
| 方法重载被显式拒绝（`assertNoOverloads` 抛错），而不是静默合并 | TS 的类只能有一个同名实现，Java 的 `descString()` 按签名分别合并。静默生成会产出不能编译的文件，宁可直接报错 |
| 基类上的组索引成员取**所有子类组的并集**；Java 取第一个子类的列表 | Java 该处依赖子类扫描顺序，属于实现细节；并集是更安全的超集 |
| 不再自动注入 `EntityComp`（Java 的 `@BaseComponent` 隐式注入） | 显式写出 `implements Entityc` 更符合 TS 显式风格；fixture 已照此书写 |
| 不生成 `Buildingc`（Java 总会生成这个空接口） | 与 `genInterface: false` 同源 |
| `@Remote` / `Call*Packet` 不生成 | 本阶段范围外 |
| `serialize()` / `read()` / `toString()` 未生成 | 依赖 `EntityIO`，属于后续阶段 |
| `EntityGroup` 从 `@mindustry-ts/mindustry-ts` 入口 import，而该模块尚不存在 | S3 范围；从入口 re-export 后无需改生成器（见 `config.entityGroupImport`） |

## 测试

```sh
cd ts
TEMP='D:\zjl\Mindustry\.workbuddy\tmp' TMP='D:\zjl\Mindustry\.workbuddy\tmp' \
  pnpm --filter @mindustry-ts/codegen test
```

`TEMP`/`TMP` 必须指到工作区内的目录：vitest 会把 SSR 缓存写到 `os.tmpdir()`，若该路径被沙箱拒绝，**对应的测试文件会被静默丢弃**（没有 FAIL，只是文件数变少）。所以验收必须同时核对「文件数 + 用例数 + 退出码」，不能只看 "Tests passed"。
