import { Component } from "../../annotations.js";

/**
 * 天气状态组件（**S3 最小集**）。
 *
 * Java 的 `WeatherStatec` 由 `mindustry.type.Weather.WeatherState` 提供（不在 `entities/comp` 下）。
 * S3 不生成天气（计划 §9），保留它只为让 `Groups.weather` 的 `EntityGroup<WeatherStatec>` 成立。
 */
@Component()
export abstract class WeatherStateComp implements Entityc, Posc{
  /** 天气强度 0-1（Java `opacity`）。 */
  opacity: number = 0;
}
