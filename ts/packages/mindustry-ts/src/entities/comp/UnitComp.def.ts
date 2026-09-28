import { Component } from "../../annotations.js";

/**
 * 单位基组件（**S4 起的扩展**）。
 *
 * Java 的 `UnitComp`（1007 行）实现 `Healthc, Physicsc, Hitboxc, Statusc, Teamc, Itemsc,
 * Rotc, Unitc, Weaponsc, Drawc, Syncc, Shieldc, ...`。本阶段（S0）只补齐**纯数据字段 +
 * 组件接口**，让「炮塔 → 子弹 → 单位 → 波次」闭环里的单位系统能编译。
 *
 * 相对 Java 的处置：
 *  - **`rotation` / `hitSize` / `velX` / `velY` / `drag`** 由本阶段新增的
 *    `Rotc` / `Hitboxc` / `Velc` 三个组件的闭包提供（Java 里用 `@Import` 引入同一批字段，
 *    语义等价），此处**不重复声明**（重复会触发 codegen 字段重定义检查）。
 *  - **`Vec2 vel` 拆标量**：`Vec2` 无法被生成文件 import → 由 `VelComp` 拆成 `velX`/`velY`
 *    （见 `VelComp.def.ts`）。
 *  - **未加 `speed`**：Java `UnitComp.speed()` 是**方法**（`UnitComp.java:190`，依赖
 *    `UnitType type` 与 `Mathf`），不是字段。生成文件无法 import 这些类型 → 不加伪字段
 *    （加了反而会与后续移植的 `speed()` 方法同名冲突），留由手写子类实现。
 *  - **未 `implements Weaponsc`**：武器系统归另一 agent；若单位侧确需 `Weaponsc`，
 *    届时只补接口引用（本次不加，`Unit` 目前不含武器字段/方法）。
 *
 * 保留 `base: true` 是为了让 codegen 发射抽象基类 `Unit.ts`（对应 Java 的 `mindustry.gen.Unit`）。
 */
@Component({ base: true })
export abstract class UnitComp implements Entityc, Posc, Teamc, Healthc, Rotc, Hitboxc, Velc{
  /** 高于地面的偏移量（Java `elevation`，`@SyncLocal`）。TS 同步层未实现 → 普通字段。 */
  elevation: number = 0;

  /** 该单位是否是无法飞行且正浸在液体中（Java `drowned`）。 */
  drowned: boolean = false;

  // 经 implements 闭包带上的字段（不在此重复声明）：
  //   Rotc:    rotation          Hitboxc: hitSize（外加 lastX/lastY/deltaX/deltaY）
  //   Velc:    velX, velY, drag  Healthc: health, hitTime, maxHealth, dead
  //   Posc:    x, y              Teamc:   team            Entityc: id, added
}
