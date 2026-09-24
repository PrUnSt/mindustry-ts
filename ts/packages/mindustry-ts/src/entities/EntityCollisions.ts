// 源: core/src/mindustry/entities/EntityCollisions.java
//
// ⚠️ 有意的窄化（S3）: 这个类的**全部**功能都是「单位/子弹 vs 地形」的物理与碰撞
//   （`move` / `moveDelta` / `overlapsTile` / `collide` / `legsSolid` / `waterSolid` / `solid`），
//   入口类型是 `Hitboxc`。S3 没有单位与子弹（`Groups.unit` / `Groups.bullet` 恒为空），
//   也没有 `Hitboxc` 接口，因此这里只保留两个**被 `Groups` / `Logic` 调用**的入口：
//     - `updatePhysics(EntityGroup<T>)`
//     - `collide(EntityGroup<T>)`
//   它们保持 no-op，并在交付说明里标注（不是静默省略）。
//
// `Vars.collisions` 必须存在且带身份，因为 `EntityGroup.collide()` / `updatePhysics()`
// 会委托给它（`EntityGroup.java:80-86`），以及 `Groups.update()` 会调用
// `Groups.bullet.updatePhysics()` / `Groups.unit.updatePhysics()` / `Groups.bullet.collide()`。
//
// TODO(S4): 移植 `Hitboxc` 与 `SolidPred` 后补全 `move` / `moveDelta` / `overlapsTile` /
// `collide(float,float,float,float,...)` / `legsSolid` / `waterSolid` / `solid`。

import type { EntityGroup } from "./EntityGroup.js";
import type { Entityc } from "../gen/Entityc.js";

/** 对应 `mindustry.entities.EntityCollisions`（S3 空实现，见文件头）。 */
export class EntityCollisions{
  /** 对应 Java `updatePhysics(EntityGroup<T extends Hitboxc>)`。 */
  updatePhysics<T extends Entityc>(_group: EntityGroup<T>): void{
    // 有意为空：S3 无单位物理（见文件头）。
  }

  /** 对应 Java `collide(EntityGroup<T extends Hitboxc>)`。 */
  collide<T extends Entityc>(_group: EntityGroup<T>): void{
    // 有意为空：S3 无子弹碰撞（见文件头）。
  }
}
