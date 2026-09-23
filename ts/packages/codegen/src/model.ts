/**
 * Source models produced by `codegen.ts` from `*.def.ts` files.
 *
 * Kept in its own module so the generators (`entity/*`, `struct/*`) can consume
 * the models without importing the collector back (which would be a cycle).
 */

export interface ComponentFieldModel {
  name: string;
  /** Source type text, with component class names rewritten to interface names. */
  type: string;
  initializer?: string;
  /** `@ReadOnly()` — `readonly` in the interface, no setter (Java `:161-162`). */
  readonly: boolean;
  /** `@Import()` — declared by another component, so no field is emitted (Java `:344`). */
  imported: boolean;
  /** `@SyncField(...)` — Java requires `float`; TS requires `number` (Java `:387`). */
  sync: boolean;
  static: boolean;
  private: boolean;
  doc?: string;
}

export interface ComponentMethodModel {
  name: string;
  /**
   * Erased signature key (`set(number, number):void`) used to merge same-shaped
   * methods across components — the TS analogue of Java's `descString()`.
   */
  signature: string;
  /** `void` when the declaration has no return type. */
  returnType: string;
  params: { name: string; type: string }[];
  /** Raw source text of the body, braces included; absent for abstract methods. */
  body?: string;
  /** `@Replace` — this implementation wins (Java `:450`). */
  replace: boolean;
  /** `@MethodPriority(n)` — higher wins (Java `:448`). */
  priority: number;
  static: boolean;
  private: boolean;
  /** Owning component class name. */
  owner: string;
  doc?: string;
}

/** One `@Component()` class (Java `PosComp.java`). */
export interface ComponentModel {
  sourceFile: string;
  /** Component class name, e.g. `PosComp`. The traceability anchor. */
  compName: string;
  /** Generated role interface, e.g. `Posc` (Java `:915-921`). */
  interfaceName: string;
  /** Generated abstract base class name, e.g. `Pos` (Java `:924-928`). */
  baseName: string;
  /** `@Component({base})` — fields move into the generated abstract base class. */
  base: boolean;
  /** `@Component({genInterface})` — when false no interface file is emitted. */
  genInterface: boolean;
  /** Raw supertype identifiers from `implements`. */
  implements: string[];
  fields: ComponentFieldModel[];
  methods: ComponentMethodModel[];
  doc?: string;
}

/** One `@EntityDef({...})` declaration. */
export interface EntityDefModel {
  sourceFile: string;
  /** Declared entity name. Required in TS; Java derived it (`:298-300`). */
  declaredName: string;
  /** Class name, or the field name for `UnitTypes.java:37`-style legacy defs. */
  elementName: string;
  /** Whether `@EntityDef` decorates a class (`type.isType()` in Java `:294`). */
  isType: boolean;
  /** Raw identifiers from `@EntityDef({components})`, e.g. `["Unitc", "Mechc"]`. */
  componentRefs: string[];
  legacy: boolean;
  pooled: boolean;
  serialize: boolean;
  genio: boolean;
  isFinal: boolean;
  excludeGroups: string[];
  doc?: string;
}
