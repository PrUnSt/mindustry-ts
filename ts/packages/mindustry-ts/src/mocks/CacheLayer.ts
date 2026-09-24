// 源: core/src/mindustry/graphics/CacheLayer.java
//
// 计划 §11: 渲染层不移植，但 `Block.cacheLayer`（`Block.java:236`）与 `Floor` 的绘制分组
// 都会引用它，所以需要一个带身份的常量对象（`StaticWall` 会赋值 `CacheLayer.walls`）。
// S3 的 `setBars()` / 绘制路径是空实现，缓存层不会被真正消费。

/** 对应 `mindustry.graphics.CacheLayer`（S3 只保留 tick 路径会读到的几个）。 */
export class CacheLayer{
  readonly id: number;
  /** 是否为液体层（Java `liquid`）。 */
  readonly liquid: boolean;

  private constructor(id: number, liquid: boolean){
    this.id = id;
    this.liquid = liquid;
  }

  static readonly water = new CacheLayer(0, true);
  static readonly mud = new CacheLayer(1, true);
  static readonly cryofluid = new CacheLayer(2, true);
  static readonly tar = new CacheLayer(3, true);
  static readonly slag = new CacheLayer(4, true);
  static readonly arkycite = new CacheLayer(5, true);
  static readonly space = new CacheLayer(6, false);
  /** 普通层（Java `normal`）。 */
  static readonly normal = new CacheLayer(7, false);
  /** 墙体层（Java `walls`）。 */
  static readonly walls = new CacheLayer(8, false);

  toString(): string{
    return "CacheLayer#" + this.id;
  }
}
