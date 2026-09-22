# Mindustry TypeScript 迁移工作区

Java 源基准：D:\zjl\Mindustry（commit 3a54813513）
Arc 引擎源参考：D:\zjl\Arc\arc-core\src\arc

## 迁移约定（所有 sub-agent 必须遵守）
- 语义等价：类名/方法名/字段名/行为与 Java 版逐字对齐；数值一律 float64；不追求字节级一致。
- 命名映射：Java 公开字段 → TS 同名公开属性（保持 obj.field 访问形式）；方法 → 同名方法；静态 → 静态成员；构造器参数顺序一致；泛型 → TS 泛型。
- 目录对齐：packages/mindustry-ts 对齐 core/src/mindustry；packages/arc-ts 对齐 arc-core/src/arc。
- 序列化统一走 Writes/Reads 语义（packages/arc-ts/src/util/io）。
- 实体/Struct/Remote 由 packages/codegen 生成，不手写 mixin。
- 线程：Thread/AsyncCore → Web Worker（浏览器）/ worker_threads（Node）；世界模拟主线程单线程。
- 自包含优先：arc-ts 子模块间暂避免硬依赖，交叉需求用文件内最小实现 + "// TODO: 迁移到 <模块> 统一实现" 注释。
- 许可：代码 GPLv3；素材 CC BY-NC-SA 非商用。

## 命令
pnpm install
pnpm -r test
pnpm -r build