import { Component } from "../../annotations.js";

/**
 * 碰撞盒组件：上一 tick 位置 + 外接盒尺寸。
 *
 * 对照 `core/src/mindustry/entities/comp/HitboxComp.java`。
 *
 * ⚠️ 有意省略的 Java 接口：`Sized` / `QuadTreeObject` 都**不是组件接口**（不在
 * `entities/comp/` 下），写进 `implements` 会让生成文件 import 失败（codegen 约束）。
 * 只保留 `Posc`。
 *
 * ⚠️ **命名冲突（与 `Block.requirements` 同一判据）**：Java 的 `hitSize` 同时是字段名
 * 与方法名，TS 一个类不允许同名成员。处置：**保留字段名 `hitSize`**（它是被大量字段级
 * 引用的纯数据），方法改名为 `hitSizeValue()`。Java 调用点 `hitSize()` → TS `hitSizeValue()`。
 *
 * ⚠️ 参数/返回值放宽：`Rect` / `Hitboxc` 是 arc-ts / 生成接口，生成文件虽能 import
 * `Hitboxc`（组件接口），但 `Rect` 不能；为统一，`rect` 参数一律写成 `any`（与
 * `BuildingComp` 的 `tile: any` 同处置）。
 */
@Component()
export abstract class HitboxComp implements Posc{
  /** 上一 tick 的 x（Java `lastX`）。 */
  lastX: number = 0;
  /** 上一 tick 的 y（Java `lastY`）。 */
  lastY: number = 0;
  /** 本 tick 相对上一 tick 的 x 位移（Java `deltaX`）。 */
  deltaX: number = 0;
  /** 本 tick 相对上一 tick 的 y 位移（Java `deltaY`）。 */
  deltaY: number = 0;
  /** 碰撞盒尺寸（Java `hitSize`）。 */
  hitSize: number = 0;

  /** Java `HitboxComp.update()`：空实现（Java 原文就是空体）。 */
  update(): void{ }

  /** Java `HitboxComp.add()`：入组时刷新上一 tick 位置。 */
  add(): void{
    this.updateLastPosition();
  }

  /**
   * Java `HitboxComp.hitSize()`。
   * ⚠️ 因与字段 `hitSize` 同名而改名为 `hitSizeValue()`（见文件头）。
   */
  hitSizeValue(): number{
    return this.hitSize;
  }

  /** Java `HitboxComp.updateLastPosition()`（纯计算，原样移植）。 */
  updateLastPosition(): void{
    this.deltaX = this.x - this.lastX;
    this.deltaY = this.y - this.lastY;
    this.lastX = this.x;
    this.lastY = this.y;
  }

  /**
   * Java `HitboxComp.deltaLen()`：`Mathf.len(deltaX, deltaY)`。
   * `Mathf` 无法 import → 内联其等价实现 `Math.sqrt(x*x + y*y)`（纯计算，数值等价）。
   */
  deltaLen(): number{
    return Math.sqrt(this.deltaX * this.deltaX + this.deltaY * this.deltaY);
  }

  /**
   * Java `HitboxComp.deltaAngle()`：`Mathf.angle(deltaX, deltaY)`。
   *
   * ⚠️ `Mathf.angle(x, y)` 的语义容易记错：arc 里它 = `atan2(y, x) * radDeg`，
   * 结果是**角度（0..360）**，不是弧度；`radDeg = 180 / Mathf.PI`，`Mathf.PI = 3.1415927`。
   * 这里内联同一公式（纯计算），避免 import `Mathf`。
   */
  deltaAngle(): number{
    let result = Math.atan2(this.deltaY, this.deltaX) * (180 / 3.1415927);
    if(result < 0) result += 360;
    return result;
  }

  /**
   * Java `HitboxComp.collides(Hitboxc other)`：基类恒 `true`（纯计算，原样移植）。
   * 参数类型放宽为 `any`（`Hitboxc` 可 import，但保持与其它放宽点一致）。
   */
  collides(_other: any): boolean{
    return true;
  }

  /**
   * Java `HitboxComp.hitbox(Rect rect)`：`rect.setCentered(x, y, hitSize, hitSize)`。
   * `out` 放宽为 `any`（`Rect` 无法 import），调用点必须传一个有 `setCentered` 的对象。
   */
  hitbox(out: any): void{
    out.setCentered(this.x, this.y, this.hitSize, this.hitSize);
  }

  /**
   * Java `HitboxComp.hitboxTile(Rect rect)`：`size = min(hitSize * 0.66, 7.8)` 的居中盒
   * （注释里 Java 写明「tile 碰撞盒不能大于一格，否则单位会卡住」）。`out` 放宽为 `any`。
   */
  hitboxTile(out: any): void{
    const size = Math.min(this.hitSize * 0.66, 7.8);
    out.setCentered(this.x, this.y, size, size);
  }

  /** Java `HitboxComp.collision(Hitboxc other, float x, float y)`：空实现（原文就是空体）。 */
  collision(_other: any, _x: number, _y: number): void{ }

  // 未移植（都引用非组件类型 / 非本阶段能力，留由手写子类实现）：
  //   - `getCollisions(Cons<QuadTree> consumer)` —— 需要 `Cons` / `QuadTree`（arc 类型）。
  //     S4 的子弹碰撞会覆写它，届时由具象类实现。
  //   - `afterRead()` —— 需要 IO 生命周期（S3/S4 无存档/网络，见 codegen README 的未实现清单）。
}
