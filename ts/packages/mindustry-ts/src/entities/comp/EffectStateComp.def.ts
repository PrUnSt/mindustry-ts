import { Component } from "../../annotations.js";

/**
 * 特效状态基组件（**S3 最小集**）。
 *
 * Java `EffectStateComp` 实现 `Posc, Drawc, Timedc, Rotc, Childc`。S3 不渲染、不生成特效，
 * 这里只让 `Groups.effect` 的 `EntityGroup<EffectStatec>` 成立。
 */
@Component({ base: true })
export abstract class EffectStateComp implements Entityc, Posc{
  /** 总存活时间，单位 tick（Java `lifetime`）。 */
  lifetime: number = 0;

  /** 已经过时间，单位 tick（Java `time`）。 */
  time: number = 0;
}
