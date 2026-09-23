/**
 * Placeholder annotation definitions for codegen fixtures.
 *
 * These mirror the Java annotations consumed by Mindustry's annotation processors
 * (`mindustry.annotations.Annotations`, `annotations/src/main/java/mindustry/annotations/Annotations.java`).
 *
 * At runtime every decorator is a no-op: all real behavior (role interfaces, merged
 * entity classes, group indices, struct packing, network calls) is *generated* by
 * `@mindustry-ts/codegen`. The final definitions belong in a shared runtime package
 * (e.g. `@mindustry-ts/mindustry-ts/annotations`) — these copies exist so fixtures
 * and tests can be parsed without depending on that package.
 */

export interface ComponentOptions {
  /** Java `Component.base()`: fields move into a generated abstract base class. Default false. */
  base?: boolean;
  /**
   * Java `Component.genInterface()`: when false no interface file is emitted for
   * this component. Default true.
   *
   * Note: Java *does* emit an empty interface in this case (`EntityProcess.java:172`
   * writes the interface outside the `genInterface()` guard). S2 deliberately does
   * not, per plan §5.6.
   */
  genInterface?: boolean;
}

/** Marks a class as an entity component. */
export function Component(options?: ComponentOptions): ClassDecorator {
  return () => {};
}

export interface EntityOptions {
  /**
   * Entity class name. **Required** in TS.
   *
   * Java had to derive this from the component interface names because
   * `@EntityDef.value()` is a `Class[]` with no name slot; a TS decorator can carry
   * arbitrary data. `nameRule.deriveEntityName` still reproduces Java's rule and
   * `entityGen` asserts the declaration matches it.
   */
  name: string;
  /** Component interfaces the merged class is built from, e.g. `[Unitc, Mechc]`. */
  components: readonly unknown[];
  /** Java `EntityDef.isFinal()`. TS classes are never final; recorded only. */
  isFinal?: boolean;
  /** Java `EntityDef.pooled()`: entities are recycled through `Pools`. */
  pooled?: boolean;
  /** Value returned by the generated `serialize()`. Default true. */
  serialize?: boolean;
  /** Java `EntityDef.genio()`. S2 generates no IO regardless. Default true. */
  genio?: boolean;
  /**
   * Java `EntityDef.legacy()`: emits a branch class that keeps an old class id and
   * extends the non-legacy class of the same derived name.
   */
  legacy?: boolean;
  /** Groups to exclude by name, e.g. `["all"]`. */
  excludeGroups?: readonly string[];
}

/** Marks an entity definition. Usable on a class, or on a field for legacy types. */
export function EntityDef(options: EntityOptions): ClassDecorator & PropertyDecorator {
  return () => {};
}

export interface GroupDefOptions {
  /** Component interfaces that must all be present. */
  value: readonly unknown[];
  /** Component interfaces whose presence disqualifies membership. */
  exclude?: readonly unknown[];
  collide?: boolean;
  spatial?: boolean;
  mapping?: boolean;
  update?: boolean;
}

/** Declares an entity group. */
export function GroupDef(options: GroupDefOptions): ClassDecorator & PropertyDecorator {
  return () => {};
}

export interface SyncFieldOptions {
  /** Java `SyncField.clamped()`: clamp the interpolated value to 0-1. */
  clamped?: boolean;
}

/** Marks a field as synced. Java requires `float`; TS requires `number`. */
export function SyncField(value: boolean, options?: SyncFieldOptions): PropertyDecorator {
  return () => {};
}

/** Marks an implementation as replacing others with the same signature. */
export function Replace(target: object, propertyKey: string | symbol, descriptor?: PropertyDescriptor): void {
  void target;
  void propertyKey;
  void descriptor;
}

/** Priority for method merging; higher values win. */
export function MethodPriority(value: number): MethodDecorator {
  return () => {};
}

/** Emits the field as `readonly` and skips its setter. */
export function ReadOnly(): PropertyDecorator & MethodDecorator {
  return () => {};
}

/** Declares a field as owned by another component; no field is emitted. */
export function Import(): PropertyDecorator {
  return () => {};
}

/** Marks a class as a packed value type. The class name must end in `Struct`. */
export function Struct(): ClassDecorator {
  return () => {};
}

/** Overrides a struct field's bit width. */
export function StructField(bits: number): PropertyDecorator {
  void bits;
  return () => {};
}
