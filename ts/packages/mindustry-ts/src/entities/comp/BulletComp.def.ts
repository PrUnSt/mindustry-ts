import { Component } from "../../annotations.js";

/**
 * 子弹基组件（**S3 最小集**）。
 *
 * Java `BulletComp`（408 行）实现 `Timedc, Damagec, Hitboxc, Teamc, Posc, Drawc, Shielderc,
 * Ownerc, Bulletc, Timerc, ...`。S3 不发射任何子弹，这里只让 `Groups.bullet` 的
 * `EntityGroup<Bulletc>` 与 `Bullet` 抽象基类成立。
 */
@Component({ base: true })
export abstract class BulletComp implements Entityc, Posc, Teamc{
  /** 伤害量（Java `damage`）。 */
  damage: number = 0;

  /** 速度（Java `speed`）。 */
  speed: number = 0;
}
