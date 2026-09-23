import { Component, Import } from "../decorators.js";
import type { Posc } from "./Posc.js";

/**
 * Team component: which side an entity belongs to.
 *
 * Mirrors `core/src/mindustry/entities/comp/TeamComp.java`. Java imports `x`/`y`
 * from `PosComp` via `@Import`, so this fixture does too — imported fields emit no
 * member and are excluded from the duplicate-field check (`EntityProcess.java:344`).
 */
@Component()
export abstract class TeamComp implements Posc {
  /** Imported from {@link PosComp}; only used inside method bodies. */
  @Import() x!: number;

  /** Imported from {@link PosComp}. */
  @Import() y!: number;

  /** Team id; `Team.derelict` (which is `-1`) in Java. */
  team: number = -1;

  cheating(): boolean {
    return this.team === -1;
  }

  /** Whether the center of this entity is visible to the viewing team. */
  inFogTo(viewer: number): boolean {
    return this.team !== viewer && this.x > 0;
  }
}
