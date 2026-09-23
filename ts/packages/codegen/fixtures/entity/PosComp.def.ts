import { Component, SyncField } from "../decorators.js";
import type { Posc } from "./Posc.js";

/**
 * Position component: 2D world coordinates.
 *
 * Mirrors `core/src/mindustry/entities/comp/PosComp.java`. The fixture names the
 * component `PosComp` (like Java) and its generated interface `Posc` — the name the
 * 502 ported call sites already use. The `import type` points at *generated* output,
 * which is exactly how real components consume their role interfaces.
 */
@Component()
export abstract class PosComp {
  /** X coordinate, in world units. */
  @SyncField(true) x: number = 0;

  /** Y coordinate, in world units. */
  @SyncField(true) y: number = 0;

  /** Sets the position from a raw pair. */
  set(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /** Translates by a delta. */
  trns(x: number, y: number): void {
    this.x += x;
    this.y += y;
  }

  /** Distance to another positioned entity. */
  dst(other: Posc): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
