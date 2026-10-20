// 源: core/src/mindustry/entities/units/AIController.java (14740 字节)
//
// 移植范围（C27 · **收窄**）: 单位 AI 的「寻敌 + 移动 + 武器开火」最小闭环。
//   `updateUnit()` = `updateTargeting()`（找目标 + 开火）+ `updateMovement()`（走向目标）。
//   `moveTo()` / `findTarget()` 按 Java 语义收窄实现。
//
// ⚠️ 与 Java 的差异（写清）:
//   - **无 WeaponMount**: Java 每个武器一个 `WeaponMount`（旋转/瞄准/连射状态，
//     `WeaponMount.java`）；TS 简化为「每单位一个 `reload` 计时器 + 只打第一把武器」。
//   - `updateVisuals()` / `faceTarget()` / `lookAt` / `bomberTarget` / 轰炸分支 —— 渲染/姿态。
//   - `retarget` 定时器 / `noTargetTime` / `rotateBackTimer` —— 面向/旋转优化。
//   - `fallback` / `hasStance` / `stanceChanged` / `stopShooting` —— 指令/姿态系统。
//   - `findMainTarget` 的「优先核心」策略 → 简化为「最近敌方建筑/单位」（`findTarget`）。
//   - `shouldFire` / `canShoot` 的精确开火门限 → 简化为「在武器射程内即开火」。
//
// ⚠️ 驱动: 由 `UnitRuntime.update()` 开头调 `controller.updateUnit()`（Logic 已驱动
//   `Groups.unit.update()`，见 `Logic.ts:157`）。波次生成的单位由 `Spawner.createUnit` 装配。

import { Mathf, Time } from "@mindustry-ts/arc";
import { Groups } from "../../gen/Groups.js";
import type { UnitRuntime } from "../UnitRuntime.js";

/** 目标形状（Java `Teamc` 的最小面：位置 + 队伍 + 有效性）。 */
export interface AiTarget{
  x: number;
  y: number;
  team: number;
  isValid?: () => boolean;
}

/** 对应 `mindustry.entities.units.AIController`（收窄版）。 */
export class AIController{
  /** 被控制的单位。 */
  readonly unit: UnitRuntime;
  /** 当前主目标（Java `Teamc target`）。 */
  target: AiTarget | null = null;
  /** 武器装填计时（简化，见文件头）。 */
  reload = 0;

  constructor(unit: UnitRuntime){
    this.unit = unit;
  }

  /** 对应 Java `updateUnit()`（:66-74）。 */
  updateUnit(): void{
    this.updateTargeting();
    this.updateMovement();
  }

  /** 对应 Java `updateTargeting()`（:114-117）→ `updateWeapons()`（:172-…）的收窄版。 */
  updateTargeting(): void{
    if(this.target === null || (typeof this.target.isValid === "function" && !this.target.isValid())){
      this.target = null;
      this.findTarget();
    }

    this.tryFire();
  }

  /** 对应 Java `updateMovement()`（:110-112 基类空；子类各异的「走向目标」收窄版）。 */
  updateMovement(): void{
    if(this.target !== null){
      this.moveTo(this.target, this.range(), this.unit.speed());
    }else{
      // 无目标 → 减速停下（Java 各子类对无目标时都会趋零）
      this.unit.velX = Mathf.lerpDelta(this.unit.velX, 0, 0.4);
      this.unit.velY = Mathf.lerpDelta(this.unit.velY, 0, 0.4);
    }
  }

  /** 对应 Java `Unit.range()`（= `type.range`）。 */
  range(): number{
    return this.unit.type === null ? 0 : this.unit.type.range;
  }

  /**
   * 对应 Java `moveTo(Position, float, float)`（子类实现语义一致: 朝目标设速度，
   * 靠近到 `radius` 内停下，`vel().lerpDelta(vec, 0.4f)` 平滑）。
   */
  moveTo(target: { x: number; y: number }, radius: number, speed: number): void{
    const dx = target.x - this.unit.x;
    const dy = target.y - this.unit.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if(length <= radius){
      this.unit.velX = 0;
      this.unit.velY = 0;
      return;
    }
    const s = Math.min(speed, length - radius);
    const tx = dx / length * s;
    const ty = dy / length * s;
    this.unit.velX = Mathf.lerpDelta(this.unit.velX, tx, 0.4);
    this.unit.velY = Mathf.lerpDelta(this.unit.velY, ty, 0.4);
  }

  /** 最近敌方建筑/单位（Java `findTarget` 的收窄版，忽略「优先核心」策略）。 */
  findTarget(): void{
    const x = this.unit.x;
    const y = this.unit.y;
    let best: AiTarget | null = null;
    let bestDst = Infinity;
    for(const b of Groups.build){
      if(b.team !== this.unit.team){
        const d = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y);
        if(d < bestDst){
          bestDst = d;
          best = b;
        }
      }
    }
    for(const u of Groups.unit){
      if(u !== this.unit && u.team !== this.unit.team){
        const d = (u.x - x) * (u.x - x) + (u.y - y) * (u.y - y);
        if(d < bestDst){
          bestDst = d;
          best = u;
        }
      }
    }
    this.target = best;
  }

  /** 武器开火（收窄: 只打第一把可控武器，Java `updateWeapons` 的简化）。 */
  tryFire(): void{
    const type = this.unit.type;
    if(type === null || this.target === null) return;
    const weapon = type.weapons[0];
    if(weapon === undefined || weapon.bullet === null) return;

    const wrange = weapon.range();
    const dx = this.target.x - this.unit.x;
    const dy = this.target.y - this.unit.y;
    if(dx * dx + dy * dy > wrange * wrange) return;

    if(this.reload <= 0){
      const angle = Mathf.angle(dx, dy);
      weapon.bullet.create(this.unit, this.unit.team, this.unit.x, this.unit.y, angle, -1, 1, 1, this.target.x, this.target.y);
      this.unit.isShooting = true;
      this.reload = weapon.reload;
    }
    this.reload -= Time.delta;
  }
}
