# VERIFY.md — arc-ts struct 包编译修复结果

## 结论

执行 `npx tsc -p tsconfig.json --noEmit` 后 **struct 零错误**（EXIT=0，整个包 0 个 error TS）。

起始状态约 303 个错误；修复后 0 个。

## 修复文件清单（全部位于 src/struct/）

| 文件 | 修复要点 |
| --- | --- |
| Bits.ts | 新增 `get(index)` 方法（对应 Java `Bits.get(int)`），供 GridBits 使用 |
| GridBits.ts | 无改动（依赖 Bits.get 修复后自动通过） |
| IntSeq.ts | 合并 shuffle、toString 重载 |
| FloatSeq.ts | 合并 toString 重载 |
| LongSeq.ts | 合并 toString 重载 |
| Queue.ts | 合并 contains/indexOf 重载；iterator() 用非空别名修复 null 收窄 |
| ObjectSet.ts | 新增 `addAll(array: T[])` 重载；合并 toSeq；`const i`→`let i`（remove）；toString 的 `key === this` 改 `(this as any)` |
| ArrayMap.ts | TS2300: 字段 `keys/values` 改名 `keysArr/valuesArr`（保留与兄弟 map 一致的 `keys()/values()/entries()` 迭代器方法）；合并 put/clear/toSeq；entries/values/keys 迭代器 null 修复 |
| IntSet.ts | 合并多构造器、clear；新增 `addAll(number[])` 重载；iterator null 修复；mask/place 改为 public（供 IntSetIterator 访问） |
| ObjectMap.ts | 合并多构造器、toSeq；get 的 Prov 分支 put 用 `val as V`；toString 比较用 `(this as any)` |
| OrderedSet.ts | 合并多构造器（super 根级 + 直接拷贝哈希表）、add/addAll/clear/iterator/toString/toSeq；addAll 重载与基类一致（TS2416） |
| Seq.ts | 合并 asMap/mapInt/each/contains/indexOf/set/removeAll/pop/random/toString 重载；asSet 用 `ObjectSet.with<T>(this)` |
| IntMap.ts | 合并多构造器、get/clear；iterator null 修复；mask/place public；toSeq 合并 |
| LongMap.ts | 合并多构造器、get/clear；iterator null 修复；mask/place public；toSeq 合并 |
| ObjectIntMap.ts | 合并多构造器、put/putMissing/putAll/get/increment/remove/clear/toSeq；iterator null 修复；mask/place public；toString 重载 |
| OrderedMap.ts | 合并多构造器、putAll/clear/toSeq；keyList 改 public（供迭代器类访问）；iterator null 修复；toString 比较修复 |

## 修复模式（对照 Java 源语义）

1. **TS2393/TS2392/TS2391（重复实现/多构造器）**：同名方法合并为「签名重载声明 + 单一实现体」，用可选参数（`x?: number`）或 `arguments.length`/`typeof`/`instanceof` 分发，保留每个重载语义。多构造器合并为一个构造器，`super()` 提升为根级语句（含初始化属性的派生类要求），拷贝构造直接拷贝哈希表字段。
2. **TS2300（重复标识符）**：ArrayMap 的字段 `keys/values` 与迭代器方法同名 → 字段改名 `keysArr/valuesArr`，保留方法名（与 ObjectMap/IntMap/LongMap 一致）。
3. **TS2531/TS2322（null 可能）**：迭代器懒初始化后，用 `const it = this.iterator1!` 局部非空别名访问。
4. **TS2445（protected 访问）**：`mask`/`place` 由 protected 改 public（TS 顶层类无法像 Java 内部类那样访问外层 protected）。
5. **TS2416（派生类覆盖不兼容）**：重载方法在派生类中重新声明与基类一致的签名组（如 OrderedSet.addAll、OrderedMap.putAll/clear/toSeq）。
6. **TS2339（Bits.get 不存在）**：在 Bits.ts 补上 Java 语义的 `get(index)`。
7. **TS2367（`key === this` 类型无重叠）**：比较改为 `key === (this as any)`（Java 中 key/value 可以是集合自身）。
