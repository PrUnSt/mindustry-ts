import { Component, SyncField } from "../../annotations.js";

/**
 * 位置组件：2D 世界坐标。
 *
 * 逐字对照 `core/src/mindustry/entities/comp/PosComp.java`（Java 里 `implements Position`，
 * 这里省略该外部接口：`Position` 在 arc-ts 中尚未移植，且生成文件无法 import 它）。
 */
@Component()
export abstract class PosComp{
  /** X 坐标，世界单位。 */
  @SyncField(true) x: number = 0;

  /** Y 坐标，世界单位。 */
  @SyncField(true) y: number = 0;

  /** 以原始坐标对设置位置。 */
  set(x: number, y: number): void{
    this.x = x;
    this.y = y;
  }

  /** 按增量平移。 */
  trns(x: number, y: number): void{
    this.x += x;
    this.y += y;
  }

  /** 到另一个有位置实体的距离。 */
  dst(other: Posc): number{
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
