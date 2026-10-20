// 源: core/src/mindustry/world/blocks/heat/HeatBlock.java (8 行)
//
// 移植范围: 接口定义（`heat()` / `heatFrac()`）。反应堆（NuclearReactor /
//   ImpactReactor）实现它，供将来的 HeatConductor 传导网络读取。
//   HeatConductor / HeatProducer 的传导求解依赖 `calculateHeat`（BuildingComp.java:412-416）
//   与 `sideHeat`/`cameFrom`/`lastHeatUpdate`，本阶段（C29）只做反应堆自带的热循环，
//   传导网络（HeatConductor/HeatProducer）随「需要散热的生产方块」一起做。

/** 对应 `mindustry.world.blocks.heat.HeatBlock`。 */
export interface HeatBlock{
  /** 当前热量（绝对单位）。 */
  heat(): number;
  /** 当前热量占最大热量的比例（0..1）。 */
  heatFrac(): number;
}
