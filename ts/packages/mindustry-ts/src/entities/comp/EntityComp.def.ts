import { Component } from "../../annotations.js";

/**
 * 实体基组件：身份与加入/移出 group 的记账。
 *
 * 逐字对照 `core/src/mindustry/entities/comp/EntityComp.java`。Java 标了
 * `@BaseComponent`，注解处理器会把它注入每个组件的依赖闭包（`EntityProcess.java:980-982`）；
 * TS 侧让需要的组件在 `implements` 里显式列出 `Entityc` —— 闭包相同，边更显式。
 *
 * 注意（codegen 约束）: 生成文件只会自动 import「组件接口名 / `Groups` / 基类名」，
 * 所以**方法体内不得引用 arc-ts 或 mindustry 的类型**。`id` 因此不能写成
 * `EntityGroup.nextId()`（Java 的写法），改由 `EntityGroup.add/addIndex` 在实体入组时分配，
 * 这样仍然是**同一个全局计数器**，语义等价（见 `src/entities/EntityGroup.ts` 的说明）。
 */
@Component()
export abstract class EntityComp{
  /** 唯一实体 id。入组时由 `EntityGroup.nextId()` 分配。 */
  id: number = -1;

  /** 该实体当前是否在其各个 group 中。 */
  protected added: boolean = false;

  isAdded(): boolean{
    return this.added;
  }

  /** 由具象方块子类覆写（Java 是 `@Final`，这里保持空实现）。 */
  update(): void{ }

  add(): void{
    this.added = true;
  }

  remove(): void{
    this.added = false;
  }
}
