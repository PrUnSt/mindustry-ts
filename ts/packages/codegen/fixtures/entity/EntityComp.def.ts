import { Component } from "../decorators.js";

/**
 * Base entity component: identity and add/remove bookkeeping.
 *
 * Mirrors `core/src/mindustry/entities/comp/EntityComp.java`. Java marks it
 * `@BaseComponent`, which injects it into every component's dependency set
 * (`EntityProcess.java:980-982`). That annotation is out of S2 scope, so fixtures
 * list `Entityc` in `implements` explicitly instead — same closure, explicit edges.
 */
@Component()
export abstract class EntityComp {
  /** Unique entity id (`EntityGroup.nextId()` in Java). */
  id: number = -1;

  /** Whether this entity is currently in its groups. */
  private added: boolean = false;

  isAdded(): boolean {
    return this.added;
  }

  update(): void {}

  add(): void {
    this.added = true;
  }

  remove(): void {
    this.added = false;
  }
}
