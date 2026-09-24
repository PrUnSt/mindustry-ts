import { Component } from "../../annotations.js";

/**
 * 生命组件：血量与死亡处理。
 *
 * 对照 `core/src/mindustry/entities/comp/HealthComp.java`。
 *
 * 两处**有意收窄**（都因 codegen 约束，见 `EntityComp.def.ts` 顶部说明）：
 *  1. `update()` 的 Java 体是 `hitTime -= Time.delta / hitDuration`，而生成文件无法 import
 *     `Time`。时间相关的那一步放在具象方块子类（`src/world/blocks/defense/Wall.ts` 的
 *     `WallBuild.update()`）里，行为一致。
 *  2. Java 有 `heal()` / `heal(float)`、`damage(float)` / `damage(float, boolean)` 等重载；
 *     TS 一个名字只能有一个实现（`entityGen.assertNoOverloads`），且 codegen 会**丢掉默认参数**
 *     （签名由 `name + 参数类型` 重建），所以只保留带全参数的单个版本，调用点必须显式传参。
 */
@Component()
export abstract class HealthComp implements Entityc, Posc{
  /** 受击闪烁时长，单位 tick（Java `hitDuration`）。 */
  static readonly hitDuration: number = 9;

  /** 当前血量。 */
  health: number = 0;

  /** 受击闪烁计时，1 → 0。 */
  hitTime: number = 0;

  /** 血量上限。 */
  maxHealth: number = 1;

  /** `kill()` 后置 true。 */
  dead: boolean = false;

  isValid(): boolean{
    return !this.dead && this.isAdded();
  }

  healthf(): number{
    return this.health / this.maxHealth;
  }

  /**
   * Java `HealthComp.update()`：`hitTime -= Time.delta / hitDuration`。
   *
   * ⚠️ 有意留空 + 保留方法名。原因：对**建筑**，`BuildingComp.update()` 带 `@Replace`
   * （`BuildingComp.java:2267`），方法合并时取代本实现（`EntityProcess.java:439-462`），
   * 所以建筑的 `hitTime` **不会**随 tick 衰减 —— 这是 Java 的真实行为。
   * 生成文件也无法 import `Time`（codegen 约束）。若本方法体写成 `Time.delta`，
   * `Building.ts` 会直接编译不过。详见 `BuildingComp.def.ts` 的 `update()` 注释。
   */
  update(): void{ }

  /** 由需要死亡特效的组件覆写。 */
  killed(): void{ }

  kill(): void{
    if(this.dead) return;

    this.health = Math.min(this.health, 0);
    this.dead = true;
    this.killed();
    this.remove();
  }

  /** 直接治疗一个固定量（Java `heal(float)`）。 */
  heal(amount: number): void{
    this.health += amount;
    this.clampHealth();
  }

  damaged(): boolean{
    return this.health < this.maxHealth - 0.001;
  }

  damage(amount: number, withEffect: boolean): void{
    if(Number.isNaN(this.health)) this.health = 0;

    const pre = this.hitTime;
    this.health -= amount;
    this.hitTime = 1;
    if(!withEffect) this.hitTime = pre;

    if(this.health <= 0 && !this.dead){
      this.kill();
    }
  }

  clampHealth(): void{
    this.health = Math.min(this.health, this.maxHealth);
    if(Number.isNaN(this.health)) this.health = 0;
  }
}
