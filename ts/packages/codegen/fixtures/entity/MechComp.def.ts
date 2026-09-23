import { Component, Replace } from "../decorators.js";
import type { Mechc } from "./Mechc.js";
import type { Posc } from "./Posc.js";
import type { Unitc } from "./Unitc.js";

/**
 * Mech (walking) movement component.
 *
 * Mirrors `core/src/mindustry/entities/comp/MechComp.java`, including `@Replace` on
 * `drownFloor` — mechs override the base drown rule, so the merge step must pick this
 * implementation over any non-replacing one (`EntityProcess.java:440-466`).
 */
@Component()
export abstract class MechComp implements Posc, Unitc, Mechc {
  /** Body rotation; mechs rotate their legs, not their turret. */
  baseRotation: number = 0;

  /** Accumulated walk distance, in world units. */
  walkTime: number = 0;

  @Replace
  drownFloor(): number {
    return this.elevation > 0.5 ? -1 : 0;
  }

  /** Signed walk extension, wrapped around the stride. */
  walkExtend(scaled: boolean): number {
    const raw = this.walkTime % 4;
    return scaled ? raw : raw * 2;
  }
}
