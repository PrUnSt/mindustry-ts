import { Component, Import } from "../decorators.js";
import type { Healthc } from "./Healthc.js";
import type { Teamc } from "./Teamc.js";

/**
 * Unit base component. `base: true` means its fields are emitted into a generated
 * *abstract* class (`Unit`) rather than into each concrete unit class — Java's window
 * for hand-written base behavior (`EntityProcess.java:176-213`, `UnitComp.java`).
 */
@Component({ base: true })
export abstract class UnitComp implements Healthc, Teamc {
  /** Imported from {@link HealthComp}. */
  @Import() health!: number;

  /** Vertical offset above the ground. */
  elevation: number = 0;

  /** Whether the unit cannot fly and is currently in liquid. */
  drowned: boolean = false;

  isGrounded(): boolean {
    return this.elevation <= 0.001;
  }

  /** Default drown rule, replaced by movement components (`MechComp.drownFloor`). */
  drownFloor(): number {
    return this.drowned ? 0 : -1;
  }
}
