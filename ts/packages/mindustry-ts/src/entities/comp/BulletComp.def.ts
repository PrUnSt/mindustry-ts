import { Component, Import } from "../../annotations.js";

/**
 * 子弹基组件（**S4 起的扩展**）。
 *
 * Java `BulletComp`（408 行）实现 `Timedc, Damagec, Hitboxc, Teamc, Posc, Drawc, Shielderc,
 * Ownerc, Bulletc, Timerc, Senseable, Settable`。
 *
 * 本阶段（S0，防御闭环的共同地基）只补齐**纯数据字段 + 组件接口**，让子弹/单位系统能编译：
 * Java 的字段区（`BulletComp.java:29-58`）按项目铁律做了三类处置：
 *  1. **已实现的组件接口**：`Timedc` / `Damagec` / `Hitboxc` / `Ownerc` / `Rotc` / `Velc`
 *     —— 对应的 `time` / `lifetime` / `damage` / `lastX` / `lastY` / `hitSize` / `owner` /
 *     `rotation` / `velX` / `velY` / `drag` 由这些组件的闭包带上，**此处不重复声明**
 *     （重复声明会触发 codegen 的字段重定义检查）。
 *  2. **`Vec2 vel` 拆标量**：`Vec2` 无法被生成文件 import → `VelComp` 拆成 `velX` / `velY`
 *     （见 `VelComp.def.ts`）。
 *  3. **引用类型字段一律不移植**（留由手写子类持有）：`BulletType type`、`Tile aimTile`、
 *     `Mover mover`、`Trail trail`、`Posc stickyTarget`、`IntSeq collided`、`Object data`。
 *
 * ⚠️ 未列出 `Drawc` / `Shielderc` / `Timerc` / `Senseable` / `Settable`：除 `Drawc` 外都不是
 * 本阶段的组件；`Drawc`（`clipSize()`）只用于渲染裁剪，headless 不需要，留待 S4 需要时补。
 *
 * 保留 `base: true`：codegen 会发射抽象基类 `Bullet.ts`（对应 Java `mindustry.gen.Bullet`），
 * 供后续具象子弹类继承。
 */
@Component({ base: true })
export abstract class BulletComp implements Entityc, Posc, Teamc, Timedc, Damagec, Hitboxc, Ownerc, Rotc, Velc{
  /** 伤害量；由 {@link DamageComp} 提供（Java `@Import float damage`）。 */
  @Import() damage: number = 0;

  /**
   * 速度。
   * ⚠️ **这是 S3 留下的桩字段，Java `BulletComp` 并没有它**（Java 的子弹速度是
   * `BulletType.speed`）。保留以避免破坏既有引用，S4 若改用 `type.speed` 可删除。
   */
  speed: number = 0;

  // 经 implements 闭包带上的字段（不在此重复声明）：
  //   Timedc: time, lifetime        Hitboxc: lastX, lastY, deltaX, deltaY, hitSize
  //   Velc:   velX, velY, drag      Rotc:    rotation
  //   Ownerc: owner                 Posc:    x, y        Teamc: team

  /** 置 true 可让 `lifetime` 在**本帧**不衰减（Java `keepAlive`）。 */
  keepAlive: boolean = false;

  /** 刚生成的一帧内不移动（Java `justSpawned = true`）：避免低 FPS 下视觉上从武器口偏移。 */
  justSpawned: boolean = true;

  /**
   * 原始发射者。与 `owner` 不同：二阶导弹的 `shooter` 是炮塔，`owner` 是上一级导弹
   * （Java `shooter`）。
   */
  shooter: Entityc | null = null;

  /** 是否命中目标/方块（Java `hit`）；`remove()` 时据此决定是否计 `despawned`。 */
  hit: boolean = false;

  /** 是否被护盾吸收（Java `absorbed`）。 */
  absorbed: boolean = false;

  /** 已分裂出的子弹数（Java `frags`）。 */
  frags: number = 0;

  // ---- 以下为 Java 的 transient 纯数据字段，一并移植（全部 number/boolean，无外部类型） ----

  /** 瞄准点 x（Java `aimX`）。 */
  aimX: number = 0;
  /** 瞄准点 y（Java `aimY`）。 */
  aimY: number = 0;
  /** 生成点 x（Java `originX`）。 */
  originX: number = 0;
  /** 生成点 y（Java `originY`）。 */
  originY: number = 0;
  /** 建筑伤害倍率（Java `buildingDamageMultiplier`）。 */
  buildingDamageMultiplier: number = 0;
  /** 粘附目标相对本弹的 x 偏移（Java `stickyX`）。 */
  stickyX: number = 0;
  /** 粘附目标相对本弹的 y 偏移（Java `stickyY`）。 */
  stickyY: number = 0;
  /** 粘附时的目标朝向（Java `stickyRotation`）。 */
  stickyRotation: number = 0;
  /** 粘附时本弹自身的朝向（Java `stickyRotationOffset`）。 */
  stickyRotationOffset: number = 0;
}
