import { Struct, StructField } from "../decorators.js";

/**
 * Packed tile data for the map format: 16 bits each for `x`/`y`/`block` and 8 bits each
 * for `floor`/`overlay` — exactly 64 bits, so the whole tile fits in one value.
 *
 * Same shape as `world/Tile.java:937`'s `PackedTileDataStruct`; Java picks the storage
 * primitive from the total width (`long` here), TS picks `bigint`.
 */
@Struct()
export class TileStruct {
  /** Tile X in tile coordinates. */
  @StructField(16) x: number = 0;

  /** Tile Y in tile coordinates. */
  @StructField(16) y: number = 0;

  /** Block id, or 0 for `air`. */
  @StructField(16) block: number = 0;

  /** Floor id. */
  @StructField(8) floor: number = 0;

  /** Overlay id, or 0 for none. */
  @StructField(8) overlay: number = 0;
}
