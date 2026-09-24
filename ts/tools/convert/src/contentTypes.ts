/**
 * FROZEN copy of Mindustry's `ContentType` enum ordinal order.
 *
 * Why a frozen copy instead of importing `@mindustry-ts/game`?
 *  - The `content` region of a `.msav`/`.msch` file stores a `u8 ContentType.ordinal` before each
 *    name list (`SaveVersion.java:627-642`, `MapIO.java:196-206`). Resolving those ordinals requires
 *    the *exact* enum order of the Java `ContentType` enum.
 *  - Adding a workspace dependency on `@mindustry-ts/game` would pull the entire game package (and its
 *    build cost) into this tiny converter tool, and that package is being edited concurrently by another
 *    agent — making our tests non-deterministic.
 *  - The order is a permanent contract: `ContentType.java` carries the comment "Do not rearrange, ever!".
 *    So a frozen table is safe and is pinned by `msch.full.test.ts`.
 *
 * Upstream source of truth: `core/src/mindustry/ctype/ContentType.java` (18 enum constants, in order).
 * Baseline commit: fd29b08412110ce93bb65f2750c9e3f325b41e75 (file last changed in 536e460fce).
 */
export const CONTENT_TYPE_NAMES = [
  "item",             // 0
  "block",            // 1
  "mech_UNUSED",      // 2
  "bullet",           // 3
  "liquid",           // 4
  "status",           // 5
  "unit",             // 6
  "weather",          // 7
  "effect_UNUSED",    // 8
  "sector",           // 9
  "loadout_UNUSED",   // 10
  "typeid_UNUSED",    // 11
  "error",            // 12
  "planet",           // 13
  "ammo_UNUSED",      // 14
  "team",             // 15
  "unitCommand",      // 16
  "unitStance",       // 17
] as const;

/** `ContentType.all.length` in Java. */
export const CONTENT_TYPE_COUNT = CONTENT_TYPE_NAMES.length;

/** Enum ordinal of the `block` content type — the one used for floors, overlays (ore) and blocks. */
export const CONTENT_TYPE_BLOCK = CONTENT_TYPE_NAMES.indexOf("block");

/** Returns the frozen name for a raw ordinal, or `undefined` when out of range. */
export function contentTypeName(ordinal: number): string | undefined{
  return CONTENT_TYPE_NAMES[ordinal];
}
