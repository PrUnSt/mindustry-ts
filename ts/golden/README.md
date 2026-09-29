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
| `java-crafter.txt` | 石墨压机冶炼（见下） | `tick\|progress\|warmup\|totalProgress\|coal\|graphite\|efficiency\|potentialEfficiency\|shouldConsumePower` |
| `java-power.txt` | 电力网 coverage（见下） | `tick\|powerNeeded\|powerProduced\|coverage\|efficiency\|genProductionEfficiency\|genCoal\|smelterProgress\|smelterSilicon` |

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

### `java-crafter.txt`（场景 12 · 工厂冶炼）

`graphite-press`（`GenericCrafter`，size=2、`craftTime=90f`、`consumeItem(coal, 2)`、`outputItem=graphite×1`、
`itemCapacity=10`）孤立放置在 24×24 all-air 世界里 —— **四周没有邻居**，所以 `craft()` 里的
`offload(graphite)` 会退回 `items.add`，产物留在自己库存里可见。

⚠️ **本文件的重点是 `updateConsumption()` 的慢路径**：`consumeItem` 让 `block.hasConsumers == true`，
于是 `efficiency` 走 `BuildingComp.updateConsumption()` 的慢分支：

```
efficiency          = min(所有非可选消费者) = ConsumeItems.efficiency = items.has(coal,2) ? 1 : 0
potentialEfficiency = efficiency 在「未被 shouldConsume() 清零之前」的值
shouldConsumePower  = false ⟺ 某个**非电力**消费者 efficiency <= 1e-7
```

最后一条正是「缺料工厂不计入电网负荷」的判据：`PowerGraph.getPowerNeeded()` 会跳过 `shouldConsumePower == false` 的消费者。
对照：**缺电**不算缺料 —— 孤立冶炼炉 `shouldConsumePower` 仍为 `true`，照旧计入需求（见 `java-power.txt` `[1]`）。

- 该方块**没有** `consumePower` → `hasPower=false`、`consPower=null`、`power` 模块是 null，**不要**读它的 `power`。
- `[A]` coal=20：progress `1/90` 每 tick → 第 90、180 tick 各一次 `craft()`（每次 coal -2、graphite +1）。
- `[B]` coal=1（需要 2）：`efficiency=potentialEfficiency=0`、`shouldConsumePower=false`，progress/warmup 恒为 0，coal 永不消耗。
- `[probe]` 末尾的独立小节：直接调一次 `updateConsumption()`，列是 `coal|efficiency|potentialEfficiency|shouldConsumePower`，
  两行分别对应 coal=1 与 coal=2。
- `coal`/`graphite` 整数严格相等；其余浮点列（`progress`/`warmup`/`totalProgress`/`efficiency`/`potentialEfficiency`）带 `1e-4` 容差。

### `java-power.txt`（场景 13 · 电力网 coverage）

`combustion-generator`（size=1、`powerProduction=1f`、`itemDuration=120f`、`consume(ConsumeItemFlammable)`）给
`silicon-smelter`（size=2、`consumePower(0.50f)`、`craftTime=40`、`consumeItems(coal 1, sand 2)`、`outputItem=silicon×1`）供电。
冶炼炉**预先上好料**，于是 min(消费者) 里唯一可能掉下来的就是 `ConsumePower.efficiency == power.status`，
`efficiency` 列可直接当作 coverage 的镜像来断言。

原版公式（TS 侧要逐条复刻）：

```
getPowerNeeded()   = Σ_consumers (consPower.requestedPower(c) * c.delta())   // 只数 shouldConsumePower 的
getPowerProduction()= enabled ? powerProduction * productionEfficiency : 0   // coal.flammability=1 -> prodEff = efficiency
getPowerProduced() = Σ_producers (getPowerProduction() * delta())
coverage           = zero(needed)&&zero(produced) ? 0 : zero(needed) ? 1 : min(1, produced/needed)
每个非 buffered 消费者的 power.status = coverage
```

- ⚠️ 驱动方式：`PowerGraph.update()` 由 `Logic.updateEntities()` 里的 `Groups.powerGraph.update()` 驱动，且排在 `Groups.build.update()` **之前**。
  所以每 tick 是「电网先结算 → 方块随后用这个 coverage 更新」。这导致 tick 1 的 `powerNeeded` 仍是 `0.0`
  （此时 building 还没跑过 `updateConsumption()`，`shouldConsumePower` 仍是初始 `false`），tick 2 起才是稳态值。
- ⚠️ `Block.conductivePower` 默认 **false**：冶炼炉之间彼此不导通，`[3]` 必须用 `powerNode` 竖链（6,5)..(6,10) 把它们串进同一张图。
  powerNode 是 `consumesPower=false, outputsPower=false`，因此**按邻接就导通**且自己不进 producers/consumers。
- `[1]` 孤立冶炼炉：produced=0 < needed=0.5 → coverage/efficiency 恒 0，**120 tick 内一个 silicon 都没产出**（coal/sand 保持 10）。
- `[2]` 一台机供一个炉：produced=1、needed=0.5 → coverage=1，每 40 tick 一个 silicon（第 42 tick 首次入账）。
- `[3]` 一台机供三个炉：produced=1、needed=1.5 → coverage=`min(1, 1/1.5)`=`0.6666667`，**图中每个消费者 status 都是它**；
  效率折半后 `40/0.6666667 = 60` tick 一个 silicon（第 62 tick 首次入账）。
- `powerNeeded`/`powerProduced` 是**图级**量（`getLastPowerNeeded()`/`getLastPowerProduced()`）；`coverage` 是被观测炉子的 `power.status`。
- 没有发电机的子场景里，`genProductionEfficiency`/`genCoal` 两列写 `null`（与 `java-drill.txt` 的 `c1ys0` 同约定）。
- 浮点列带 `1e-4` 容差；`genCoal`/`smelterSilicon` 整数严格相等。

## 铁律

**这些文件不允许手改。** 它们必须由 Java 侧重新运行导出。手改 golden 等于伪造基准，
会让 ④ 的整个验收链路失去意义。
