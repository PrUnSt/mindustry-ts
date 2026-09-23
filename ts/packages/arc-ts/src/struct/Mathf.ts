// 源: arc-core/src/arc/math/Mathf.java, arc-core/src/arc/math/Rand.java
//
// 迁移说明 (TS-2): 本文件曾是 struct 包自带的「最小等价实现」, 其中 Rand 用 Math.random 生成随机数,
// 不满足确定性模拟 (同一 seed 必须复现同一序列)。现整体改为 re-export, 让 struct 全库统一走
// math/ 下的逐字移植版 (xorshift128+ 的 Rand 与查表版 Mathf)。
//
// ⚠️ 不要 把 Mathf / Rand 加进 struct/index.ts:
//    src/index.ts 同时 `export *` 了 struct/index 与 math/index, 重名会导致歧义导出。
//    本文件只作为 struct 包内部的转发入口 (struct/Seq.ts、IntSeq.ts、ArrayMap.ts 等引用 './Mathf')。
export {Mathf} from '../math/Mathf';
export {Rand} from '../math/Rand';
