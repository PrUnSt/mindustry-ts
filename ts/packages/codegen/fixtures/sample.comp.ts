import { Component } from "./decorators.js";

/**
 * Position component: 2D coordinates plus a distance helper.
 */
@Component()
export class Posc {
  /** X coordinate. */
  x: number = 0;

  /** Y coordinate. */
  y: number = 0;

  /** Distance to another position. */
  dst(other: Posc): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}