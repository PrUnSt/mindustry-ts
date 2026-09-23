import { Component, EntityDef } from "../decorators.js";
import type { Buildingc } from "./Buildingc.js";
import type { Healthc } from "./Healthc.js";
import type { Teamc } from "./Teamc.js";

/**
 * Building base component, mirroring `core/src/mindustry/entities/comp/BuildingComp.java`.
 *
 * Three Java traits are pinned here:
 *  - `@EntityDef` on the base component itself: the generated class *is* the base, so
 *    there is no separate abstract class (`typeIsBase`, `EntityProcess.java:292`).
 *  - `genInterface: false`: Java still emits an empty interface; S2 emits none (plan §5.6).
 *  - `excludeGroups: ["all"]` (`BuildingComp.java:53`): buildings have `Entityc` in their
 *    closure but stay out of `Groups.all` nonetheless.
 */
@EntityDef({
  name: "Building",
  components: [Buildingc],
  isFinal: false,
  genio: false,
  serialize: false,
  excludeGroups: ["all"],
})
@Component({ base: true, genInterface: false })
export abstract class BuildingComp implements Healthc, Teamc {
  /** Block id this building was placed from. */
  block: number = 0;

  /** Item capacity, in items. */
  itemCapacity: number = 10;

  healthf(): number {
    return this.maxHealth === 0 ? 0 : this.health / this.maxHealth;
  }
}
