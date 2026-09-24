// 源: core/src/mindustry/content/Sounds.java (源码由注解处理器从 core/assets/sounds 生成)
//
// 为什么是「带身份的真实对象」而不是 undefined（计划 §11，陷阱表外的硬要求）:
//  - `Block.init()` 读 `Sounds.unset`（`Block.java:1360-1379`）并做 `== Sounds.unset` 判断；
//  - `Floor` 字段默认 `Sounds.none`（`Floor.java:38`），`Floor.init()` 做 `walkSound == Sounds.none` 判断；
//  - `BuildingComp.init()` 做 `block.ambientSound != Sounds.none` 判断（`BuildingComp.java:131`）。
// 若用 undefined/null，这些引用比较全部变成「真」，语义就错了。
//
// S3 不播放任何音频（计划 §9），所以只保留对象身份与 `id`。

/** 对应 `arc.audio.Sound`。S3 只保留身份。 */
export class Sound{
  /** 每个 Sound 的稳定序号，用于 `==` 之外的可读性检查。 */
  readonly id: number;

  constructor(id: number){
    this.id = id;
  }

  toString(): string{
    return "Sound#" + this.id;
  }
}

/** 对应 `arc.audio.RandomSound`（`Block.init` 会 `new RandomSound(...)`）。 */
export class RandomSound extends Sound{
  readonly sounds: readonly Sound[];

  constructor(id: number, ...sounds: Sound[]){
    super(id);
    this.sounds = sounds;
  }
}

let nextId = 0;

/**
 * 对应 `mindustry.content.Sounds`。S3 只需要被引用的那几个常量。
 * 用 `Object.freeze` 防止被误改写（Java 的 static final 语义）。
 */
export const Sounds = {
  /** Java `Sounds.unset`: 未设置音效的哨兵值。 */
  unset: new Sound(nextId++),
  /** Java `Sounds.none`: 明确表示「无音效」。 */
  none: new Sound(nextId++),
  click: new Sound(nextId++),
  /** 环境音默认值（`Block.ambientSound` 默认 `Sounds.none`）。 */
  blockExplode1: new Sound(nextId++),
  blockExplode2: new Sound(nextId++),
  blockExplode3: new Sound(nextId++),
  blockExplode1Alt: new Sound(nextId++),
  blockExplode2Alt: new Sound(nextId++),
  blockBreak1: new Sound(nextId++),
  blockBreak2: new Sound(nextId++),
  blockBreak3: new Sound(nextId++),
  blockPlace1: new Sound(nextId++),
  blockPlace2: new Sound(nextId++),
  blockPlace3: new Sound(nextId++),
  stepWater: new Sound(nextId++),
  /** `Prop` 构造器：`breakSound = Sounds.rockBreak`（`Prop.java:17`）。 */
  rockBreak: new Sound(nextId++),
  /** `Wall.init()`：`destroySound = Sounds.blockExplodeWall`（`Wall.java:88`）。 */
  blockExplodeWall: new Sound(nextId++),
  /** `Wall` 字段默认 `lightningSound = Sounds.shootArc`（`Wall.java:23`）。 */
  shootArc: new Sound(nextId++),
  /** `Conveyor` 构造器：`ambientSound = Sounds.loopConveyor`（`Conveyor.java:51`）。 */
  loopConveyor: new Sound(nextId++)
} as const;
