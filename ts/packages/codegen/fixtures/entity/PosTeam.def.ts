import { EntityDef } from "../decorators.js";
import type { Teamc } from "./Teamc.js";

/**
 * Dummy team-target definition, mirroring `entities/comp/PosTeamDef.java`.
 *
 * The only class-based def in the fixture set, which exercises the `isType` naming
 * path: the element name must end in `Def`/`Comp` (`EntityProcess.java:294-296`) and
 * `Def` is stripped, giving `PosTeam` — present in the v160.5 ground truth. The
 * declared name is asserted equal to that derivation.
 */
@EntityDef({ name: "PosTeam", components: [Teamc], genio: false, isFinal: false })
export class PosTeamDef {}
