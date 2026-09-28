import { Component } from "../../annotations.js";

/**
 * 朝向组件：实体的旋转角（度）。
 *
 * 逐字对照 `core/src/mindustry/entities/comp/RotComp.java`。
 *
 * ⚠️ Java 字段是 `@SyncField(false) @SyncLocal float rotation`。TS 侧同步层尚未实现
 * （codegen README「未实现」：`EntityIO` / `serialize` / `readSync`），因此这里写成**普通字段**，
 * 并在此标注其同步属性：不参与服务端→客户端的常规同步，只在本地写入。
 */
@Component()
export abstract class RotComp implements Entityc{
  /** 旋转角，单位度（Java `rotation`）。 */
  rotation: number = 0;
}
