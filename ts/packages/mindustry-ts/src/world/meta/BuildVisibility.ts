// 源: core/src/mindustry/world/meta/BuildVisibility.java
//
// Java 用 `Boolp`（延迟求值的 lambda）承载「当前是否可见」。这里照抄成 `() => boolean`，
// **必须是函数而不是布尔字段** —— 这些条件依赖 `Vars.state.rules` 的实时值。
//
// 未移植（依赖 S3 范围外的系统，逐条标注，避免静默语义丢失）：
//   coreZoneOnly            —— 依赖 `Vars.indexer.isBlockPresent(Blocks.coreZone)`
//   legacyLaunchPadOnly     —— 依赖 `Blocks.advancedLaunchPad`
//   notLegacyLaunchPadOnly  —— 同上
// TODO(S5/后续): 上述三项在对应系统移植后补回。

import { Vars } from "../../Vars.js";

/** 对应 `mindustry.world.meta.BuildVisibility`。 */
export class BuildVisibility{
  private readonly visibleFunc: () => boolean;

  constructor(visibleFunc: () => boolean){
    this.visibleFunc = visibleFunc;
  }

  /** @return 当前是否可见。对应 Java `BuildVisibility.visible()`。 */
  visible(): boolean{
    return this.visibleFunc();
  }

  static readonly hidden = new BuildVisibility(() => false);
  static readonly shown = new BuildVisibility(() => true);
  static readonly debugOnly = new BuildVisibility(() => false);
  static readonly editorOnly = new BuildVisibility(() => Vars.state.rules.editor);
  static readonly worldProcessorOnly = new BuildVisibility(
    () => Vars.state.rules.editor || Vars.state.rules.allowEditWorldProcessors
  );
  static readonly sandboxOnly = new BuildVisibility(
    () => Vars.state === null || Vars.state.rules.infiniteResources
  );
  static readonly campaignOnly = new BuildVisibility(
    () => Vars.state === null || Vars.state.isCampaign() || !Vars.state.isGame()
  );
  static readonly lightingOnly = new BuildVisibility(
    () =>
      Vars.state === null ||
      Vars.state.rules.lighting ||
      Vars.state.isCampaign() ||
      !Vars.state.isGame() ||
      Vars.state.rules.infiniteResources
  );
  static readonly fogOnly = new BuildVisibility(
    () => Vars.state === null || Vars.state.rules.fog || Vars.state.rules.editor || !Vars.state.isGame()
  );
}
