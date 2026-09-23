import { EntityDef } from "../decorators.js";
import type { Mechc } from "./Mechc.js";
import type { Unitc } from "./Unitc.js";

/**
 * Unit type definitions, mirroring `core/src/mindustry/content/UnitTypes.java:34-71`.
 *
 * Java puts `@EntityDef` on *fields* here, and that is load-bearing: `type.isType()`
 * (`EntityProcess.java:294`) is false for a field, so the name does not have to end in
 * `Def`/`Comp` and comes from `createName` instead. All three ground-truth names are
 * reproduced exactly:
 *
 * | field  | components         | derived name                              |
 * |--------|--------------------|-------------------------------------------|
 * | `mace` | `{Unitc, Mechc}`   | `Mech` + `Unit` = `MechUnit`               |
 * | `flare`| `{Unitc}`          | `Unit` -> collides with base `Unit` -> `UnitEntity` |
 * | `nova` | `{Unitc, Mechc}` + legacy | `MechUnit` + `Legacy` + `Nova` = `MechUnitLegacyNova` |
 *
 * The `flare` case is the `Entity` suffix branch (`EntityProcess.java:303-305`): that is
 * why `mindustry.gen.Unit` and `mindustry.gen.UnitEntity` both exist.
 */
export class UnitTypes {
  /** Standard mech branch: `mace`, `dagger`, `crawler`, ... in Java. */
  @EntityDef({ name: "MechUnit", components: [Unitc, Mechc] })
  static mace!: unknown;

  /** Air branch: derives `Unit`, which collides with the base class name. */
  @EntityDef({ name: "UnitEntity", components: [Unitc] })
  static flare!: unknown;

  /** Legacy mech branch: `nova`, `pulsar`, `quasar` in Java. */
  @EntityDef({ name: "MechUnitLegacyNova", components: [Unitc, Mechc], legacy: true })
  static nova!: unknown;
}
