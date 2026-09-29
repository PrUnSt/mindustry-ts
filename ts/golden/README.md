# golden/ —— 原版行为基准快照

这里存放 **Java 原版 Mindustry 的真实运行结果**，由原版自身跑出来后序列化固化。

## 为什么存在

在 ③ 之前，TS 的行为断言全靠「读 Java 源码 → 人工推导期望值」。这有三个问题：

1. **推导可能出错** —— 而且错了不会有人发现（断言和实现是同一个人写的）
2. **Java 源码成了不可删除的依赖** —— 删掉就失去了参照系
3. **对「实现看起来对但行为不对」的情况完全无感**

golden 把「参照系」从**源码**变成**可执行的数据文件**：Java 只要跑过一次，结果就固化在这里。
之后 TS 直接对这些数据对拍 —— **即使把 Java 全部删掉，验收依然成立**。

## 怎么生成

```bash
cd /d/zjl/Mindustry
export JAVA_HOME='D:\WorkBuddy\tools\jdk-17.0.20.1+1'
export GRADLE_USER_HOME='D:\WorkBuddy\Cache\gradle'
env -u http_proxy -u https_proxy ./gradlew :tests:test --tests GoldenExportTest
```

导出器源码：`tests/src/test/java/GoldenExportTest.java`

## 谁在消费

`ts/packages/mindustry-ts/src/__tests__/golden-parity.test.ts` —— 加载这些文件，
跑**完全同形**的 TS 场景，逐字段对拍。

## 比对约定（改动前务必先读）

| 约定 | 原因 |
|---|---|
| 浮点量带 `1e-4` 容差 | Java `float` 是 32 位，TS `number` 是 64 位 double。`0.035` 累加 29 次后尾数必然分叉 |
| 离散量严格相等 | `len` / 物品名 / `items.total()` 不该有任何误差 |
| 不比较 `state.tick` | 两边都写 `state.tick += getDeltaTime()*60`，但 headless 下 `getDeltaTime()` 取值不同（TS 的 MockGraphics 恒 `1/60`）。文件里的 `tick` 列是**迭代序号** |
| 两边 `Time.delta` 都 = 1 | Java 侧 `setDeltaProvider(() -> 1f)`；TS 侧 `min((1/60)*60, 3) = 1`。方块行为 `edelta = efficiency * Time.delta` 因此可比 |
| 绝对值钟归零 | `Time.clear()` 只清延时队列，**不重置 `Time.time`**；导出器在 `createWorld` 里显式 `Time.setInternalTime(0)`。否则同一测试类中先跑的场景会把 `Time.time` 顶高，令后面的场景（`java-turret-fire` 的首次开火时机）输出漂移 |

## 场景文件与列说明

所有文件均为「`#` 头注释 + `|` 分隔数据行」，`  # …` 行尾注释由 TS 侧剥掉。`tick` 一律是**迭代序号**。

| 文件 | 场景 | 列 |
|---|---|---|
| `java-conveyor-chain.txt` | 传送带链 + 路由器 | `tick\|len1\|ys1_0\|xs1_0\|item1\|len2\|ys2_0\|xs2_0\|item2\|routerTotal` |
| `java-side-input.txt` | 侧面输入（xs 非零） | `tick\|len1\|ys1_0\|xs1_0\|aheadLen` |
| `java-router-rotation.txt` | 路由器轮转投递 | `round\|landedA\|landedB` |
| `java-content-table.txt` | 内容表（items/liquids/blocks） | 分段：`id\|name`、`id\|name\|health\|size` |
| `java-unit-table.txt` | 单位表 | `name\|health\|speed\|hitSize\|armor\|flying\|weaponCount\|weaponNames` |
| `java-turret-table.txt` | 炮塔表 | `name\|health\|size\|range\|reload\|category\|ammoBullets` |
| `java-bullet-table.txt` | 子弹表 | `name\|speed\|damage\|lifetime\|hitSize\|pierce\|collidesAir\|collidesGround` |
| `java-turret-fire.txt` | duo 开火 → dagger | `tick\|bulletCount\|firstBulletX\|firstBulletY\|enemyHealth` |
| `java-wave.txt` | 波次推进 | `wave\|unitCount\|unitTypes` |
| `java-drill.txt` | 机械钻采矿（见下） | `tick\|dominantItem\|dominantItems\|progress\|warmup\|lastDrillSpeed\|itemsTotal\|c1len\|c1ys0\|c2len` |
| `java-core.txt` | 核心入库（见下） | `tick\|copper\|lead\|coreTotal\|acceptCopper\|acceptLead` |

### `java-drill.txt`（场景 10）

`mechanical-drill`（tier=2, drillTime=600, size=2）压在 2×2 铜矿上，`countOre` 得 `dominantItem=copper`、`dominantItems=4`。
因 `getDrillTime = (drillTime + hardnessDrillMultiplier*hardness)/mult = (600+50*1)/1 = 650`。

- 同一份列包含两条子场景：`[A]` 无出口（`c1len/c1ys0/c2len` 恒为 `0/null/0`，`itemsTotal` 单调增，受 `itemCapacity=10` 封顶）；
  `[B]` `drill → conveyor(7,5) → conveyor(8,5)`（产出即 offload 进 c1，`c1len`/`c1ys0` 是 c1 首格状态，`c2len` 是下一格）。
- `c1ys0` = c1 内物品位置 `0..1`；c1 为空时写 `null`。
- 浮点列（`progress`/`warmup`/`lastDrillSpeed`/`c1ys0`）带 `1e-4` 容差；`dominantItems`/`itemsTotal`/`c1len`/`c2len`/物品名严格相等。

### `java-core.txt`（场景 11）

`core-shard`（size=3, `itemCapacity=4000`）经 `conveyor(9,10)r0` 入库。
⚠️ 必须 `state.rules.coreIncinerates = false`：**原版默认是 `true`**，此时 `CoreBuild.acceptItem` 恒为 `true`
（`getMaximumAccepted` 返回 `Integer.MAX_VALUE/2`），超容物品被焚烧而非拒收 —— 只有关掉它才能观测到「按类型封顶 + 拒收」。

- `[A]` 正常接收：tick 0 注 copper、tick 60 注 lead，逐 tick 记录核心库存。
- `[B]` 容量封顶：先用真实 `handleItem` 把 copper 填满到 `storageCapacity=4000`，再验证额外 `handleItem` 被焚烧（不再入账）、
  `acceptItem(copper)=false`、且封顶是**按物品类型**的（lead 仍可入库）、被拒的 copper 堵在传送带末端。
- `copper`/`lead`/`coreTotal` 是整数严格相等；`acceptCopper`/`acceptLead` 是 `CoreBuild.acceptItem(null, item)` 的布尔值。

## 铁律

**这些文件不允许手改。** 它们必须由 Java 侧重新运行导出。手改 golden 等于伪造基准，
会让 ④ 的整个验收链路失去意义。
