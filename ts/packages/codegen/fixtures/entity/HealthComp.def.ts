import { Component } from "../decorators.js";
import type { Entityc } from "./Entityc.js";
import type { Posc } from "./Posc.js";

/**
 * Health component: hp pool plus death handling.
 *
 * Mirrors `core/src/mindustry/entities/comp/HealthComp.java`. `update()` is declared
 * here *and* in `EntityComp`, which is what exercises method merging
 * (`EntityProcess.java:437-613`).
 */
@Component()
export abstract class HealthComp implements Entityc, Posc {
  /** Flat damage duration, in frames. */
  static readonly hitDuration = 9;

  /** Current health. */
  health: number = 0;

  /** Maximum health; health regen and `healthf()` are relative to this. */
  maxHealth: number = 1;

  /** Set once `kill()` runs. */
  dead: boolean = false;

  isValid(): boolean {
    return !this.dead && this.isAdded();
  }

  healthf(): number {
    return this.health / this.maxHealth;
  }

  update(): void {
    this.health = Math.min(this.health, this.maxHealth);
  }

  /** Overridden by components that need death effects. */
  killed(): void {}

  kill(): void {
    if (this.dead) return;
    this.health = Math.min(this.health, 0);
    this.dead = true;
    this.killed();
    this.remove();
  }

  heal(): void {
    this.dead = false;
    this.health = this.maxHealth;
  }
}
