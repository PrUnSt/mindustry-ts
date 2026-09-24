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

## 铁律

**这些文件不允许手改。** 它们必须由 Java 侧重新运行导出。手改 golden 等于伪造基准，
会让 ④ 的整个验收链路失去意义。
