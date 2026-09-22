/**
 * Placeholder annotation definitions for codegen fixtures.
 *
 * These mirror the Java annotations consumed by the Mindustry annotation
 * processors (`mindustry.annotations.Annotations`): `@Component`, `@EntityDef`,
 * `@Remote`, `@Struct`, etc.
 *
 * At runtime these decorators are no-ops: all real behavior (interfaces,
 * merged entity classes, network calls, struct serialization) is *generated*
 * by `@mindustry-ts/codegen` and pasted into the build output. The final
 * definitions should eventually live in a shared runtime package
 * (e.g. `@mindustry-ts/core/annotations`).
 */

export interface ComponentOptions {
  /**
   * Mirrors Java `Component.base()`: when true, this component's fields are
   * emitted into a base class instead of the merged entity class.
   * Default false.
   */
  base?: boolean;

  /**
   * Mirrors Java `Component.genInterface()`: when false, no entity interface
   * is generated for this component. Default true.
   */
  genInterface?: boolean;
}

/**
 * Marks a class as an entity component.
 *
 * Naming convention: a component class `Posc` generates an entity interface
 * `Pos` (trailing `c` stripped) and a merged entity class `PosEntity`.
 *
 * No-op at runtime; consumed by `@mindustry-ts/codegen`.
 */
export function Component(options?: ComponentOptions): ClassDecorator {
  return () => {};
}

/**
 * Placeholder for the future `@EntityDef` decorator (multi-component merge).
 * Mirrors Java `EntityDef.value()`: the list of component interfaces the
 * merged entity class is built from.
 *
 * Not yet consumed by the generator; see README roadmap.
 */
export function EntityDef(components: readonly Function[]): ClassDecorator {
  return () => {};
}