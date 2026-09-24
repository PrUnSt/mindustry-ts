import { Component } from "../../annotations.js";

/**
 * 同步组件（**S3 最小集**）。
 *
 * Java `SyncComp` 负责网络读写的插值记账（`readSync`/`writeSync`/`lastUpdated` 等）。
 * S3 是单机（`Vars.net.active() === false`，计划 §9「网络不做」），因此这里只保留
 * `Groups.sync` 的 `EntityGroup<Syncc>` 所需的空接口。
 */
@Component()
export abstract class SyncComp implements Entityc{
  /** 同步记账的占位方法（Java 有 `readSync`/`writeSync`/`snapSync` 等）。 */
  updateSync(): void{ }
}
