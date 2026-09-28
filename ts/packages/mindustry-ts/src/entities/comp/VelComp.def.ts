import { Component } from "../../annotations.js";

/**
 * 速度组件：线速度与阻力。
 *
 * 对照 `core/src/mindustry/entities/comp/VelComp.java`。
 *
 * ⚠️ **`Vec2 vel` → 拆成 `velX` + `velY` 两个标量**：codegen 生成的接口/基类只自动
 * import「组件接口名 / `Groups` / 基类名」，无法 import arc 的 `Vec2`，所以 `Vec2` 字段
 * 一律拆成标量（本项目既定做法，见 `EntityComp.def.ts` 顶部）。
 *
 * ⚠️ Java `@SyncLocal Vec2 vel`：TS 同步层未实现 → 拆出的两个标量是**普通字段**。
 *
 * ⚠️ `update()` / `move()` / `solidity()` / `canPass()` 的方法体引用了 `Time` /
 * `Mathf` / `SolidPred`（arc 类型）→ 按 codegen 约束**有意留空（或只做纯计算）**，
 * 由手写子类实现。详见各方法注释。
 */
@Component()
export abstract class VelComp implements Posc{
  /** 线速度 x（Java `vel.x`）。 */
  velX: number = 0;
  /** 线速度 y（Java `vel.y`）。 */
  velY: number = 0;
  /** 线性阻力，0-1/秒（Java `transient float drag`）。 */
  drag: number = 0;

  /**
   * Java `VelComp.update()`（`@MethodPriority(-1)`：**最先**执行，因为速度会影响 delta 与
   * lastPosition）：
   * ```java
   * float px = x, py = y;
   * move(vel.x * Time.delta, vel.y * Time.delta);
   * if(Mathf.equal(px, x)) vel.x = 0;
   * if(Mathf.equal(py, y)) vel.y = 0;
   * vel.scl(Math.max(1f - drag * Time.delta, 0));
   * ```
   * ⚠️ 引用 `Time` / `Mathf` → 方法体留空，由手写子类实现。
   */
  update(): void{ }

  /**
   * Java `VelComp.moving()`：`!vel.isZero(0.01f)`。
   *
   * ⚠️ 精确内联了 arc 的语义：`Vec2.isZero(margin)` = `x*x + y*y < margin`（注意是
   * **len² 与 margin 比较**，不是 `len < margin` —— arc 的既有怪癖）。因此这里是
   * `!(velX² + velY² < 0.01)`，**不是**容差近似。
   */
  moving(): boolean{
    return !(this.velX * this.velX + this.velY * this.velY < 0.01);
  }

  /**
   * Java `VelComp.solidity()`：`@Nullable SolidPred`，基类返回 `null`（不做固体检测）。
   * `SolidPred` 尚未移植 → 返回类型放宽为 `any`（`null` 或一个带 `solid(tileX, tileY)` 的对象）。
   */
  solidity(): any{
    return null;
  }

  /** Java `VelComp.ignoreSolids()`：基类恒 `false`（纯计算）。 */
  ignoreSolids(): boolean{
    return false;
  }

  /**
   * Java `VelComp.canPass(int tileX, int tileY)`：
   * `SolidPred s = solidity(); return s == null || !s.solid(tileX, tileY);`
   *
   * `SolidPred` 未移植，故 `solidity()` 返回 `any`；这里按其「带 `solid` 方法的对象」形态实现，
   * 基类 `null` 分支恒返回 `true`。
   */
  canPass(tileX: number, tileY: number): boolean{
    const s = this.solidity();
    return s === null || s === undefined || !s.solid(tileX, tileY);
  }

  /**
   * Java `VelComp.move(float cx, float cy)`：有 `solidity()` 时走
   * `collisions.move(self(), cx, cy, check)`，否则直接 `x += cx; y += cy;`。
   * ⚠️ 引用 `Vars.collisions` / `SolidPred` → 方法体留空，由手写子类实现。
   */
  move(_cx: number, _cy: number): void{ }

  // 未移植（引用非组件类型 / 非本阶段能力）：
  //   - `move(Vec2 v)` 重载 —— TS 不能拆 `Vec2`，调用点直接用 `move(vx, vy)`。
  //   - `canPassOn()` —— 依赖 `tileX()` / `tileY()`（`Position` 的 tile 坐标方法，未移植）。
  //   - `velAddNet(Vec2)` / `velAddNet(float, float)` —— 网络同步路径（S3/S4 单机，计划 §9）。
}
