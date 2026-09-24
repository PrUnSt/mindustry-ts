// 源: core/src/mindustry/core/Logic.java (627 行)
//
// 移植范围（S3 tick 闭环）：`update()` 的 headless 可达主体、`updateEntities()`、
// `isWaitingWave()`，以及**构造器里 S3 可达的事件监听**。`/triggers`（`Trigger.update` 等）
// 逐点保留。
//
// ⚠️ 设计决定（相对 Java 的一处**有意偏离**，必须知道）:
//   Java 的 `Logic implements ApplicationListener`，由 launcher `Core.app.addListener(logic)`
//   后每帧 `update()`。`ts/apps/headless` 与 `ts/packages/mindustry-ts/src/harness.ts`
//   都没有真实的主循环，因此 **`Logic` 不实现 `ApplicationListener`、不依赖 launcher 调用** ——
//   它是一个**普通类**，由 `harness.runTicks()` 显式驱动 `logic.update()`。
//   这样做的收益：tick 数完全由调用方控制（虚拟时钟无 sleep），确定性可复现。
//   代价：若将来接入真实 launcher，需要一层 `ApplicationListener` 适配器（TODO）。
//
// ⚠️ 关于 `state.tick` 的数值锚点（硬断言 #5）:
//   `delta = Core.graphics.getDeltaTime()` —— headless 下是 `MockGraphics`，恒为 `1/60`
//   （见 `arc-ts/src/mock/MockGraphics.ts` 顶部说明）。`(1/60) * 60 === 1` 在 IEEE-754
//   double 下**精确成立**（已实测），因此每次 `update()` 的 `state.tick += 1`，
//   `Time.update()` 里 `Time.time += Time.delta`（`Time.delta = min((1/60)*60, 3) = 1`）
//   也每次 `+1`。→ 600 次 `update()` 后 `state.tick === 600 && Time.time === 600`。
//
// 未移植（逐条标注，避免静默丢失；这些都在 Java 原文里出现，不是遗忘）:
//   - `PerfCounter.*`（帧计时）—— 性能计数器，S3 无观测需求。
//   - `universe.updateGlobal()` —— `universe`（行星/扇区全局）未移植（计划 §9）。
//   - `if(Core.settings.modified() && !state.isPlaying()){ netServer.admins.forceSave(); ... }`
//     —— `netServer` 未移植；且 `MockSettings.modified()` 在 S3 恒为 false → 不可达。
//   - `state.enemies = Groups.unit.count(u -> u.team()==waveTeam && u.isEnemy())` 的
//     `isEnemy()` 部分 —— S3 的 `Unit`（最小集）没有该方法；保留 `count` 调用形状、
//     判据缩到 `u.team === waveTeam.id`。`Groups.unit` 在 S3 恒为空 → 结果恒 0（计划 §9：0 单位）。
//   - `MapPreviewLoader.checkPreviews()` —— 地图预览（渲染/UI）。
//   - `fogControl.update()` —— 战争迷雾；`state.rules.fog` 默认 false → 不可达。
//   - 两处 `if(state.isCampaign()){ state.rules.sector.info.update(); universe.update(); }` ——
//     战役/扇区（S5）；`Rules.sector` 恒 null → 不可达。
//   - `logicVars.update()` —— 全局逻辑处理器（`LogicVars`）未移植（计划 §9「逻辑编辑器不做」）。
//   - `updateWeather()` —— 天气（`WeatherEntry`/`Weather` 未移植）。**注意**：`state.rules.weather`
//     在 S3 是空 `Seq`，Java 原循环体也一次都不执行；跳过它只等价于「没有天气」，
//     且 S3 的 `runWave`/天气随机不参与任何断言。
//   - `Groups.weather.each(w -> state.envAttrs.add(w.weather.attrs, w.opacity))`（`update()` 内）——
//     同一个原因：`Weather` 未移植，最小集 `WeatherStatec` 没有 `weather` 字段，且
//     `Groups.weather` 恒为空（循环体不执行）。保留 `envAttrs.clear()` 与 `rules.attributes` 并入。
//   - `for(TeamData data : state.teams.getActive()){ ... fillItems / BaseBuilderAI / RtsAI /
//     prebuildAi ... }` —— 全部依赖核心物品、AI（S4/S5）与单位（计划 §9「AI/波次不做」）。
//   - `if(!net.client() && state.wavetime <= 0 && state.rules.waves){ runWave(); }` ——
//     `state.rules.waves` 默认 false → 不可达；`runWave()` 依赖 `spawner`（S5）。
//   - `if(runStateCheck){ checkGameState(); }` 与 `else if(netServer.isWaitingForPlayers()...)`
//     —— `netServer` 未移植；`checkGameState()` 依赖 `CoreBuild`/`Spawner`/`Call`（S4/S5）。
//     `runStateCheck` 在 S3 的取值见 `update()` 内注释。
//   - 构造器里 11 类事件监听（见构造器注释）—— 其事件类或消费方未移植。
//
// 已移植的构造器监听（S3 可达）:
//   - `WorldLoadEvent`：唯一在 S3 tick 闭环里可达的事件（`World.endMapLoad()` 会 fire）。
//     Java 处理器体只剩两段：① `if(state.isCampaign()){ ... }`（战役，不可达）；
//     ② `Core.settings.manualSave();`（headless 的 `MockSettings.manualSave` 是空实现，
//     但**保留调用点**以对齐 Java 的副作用顺序 —— 将来接入真实 Settings 时才有意义）。

import { Core, Events, Time } from "@mindustry-ts/arc";
import { Vars } from "../Vars.js";
import { Groups } from "../gen/Groups.js";
import { Trigger, WorldLoadEvent } from "../game/EventType.js";

/** 对应 `mindustry.core.Logic`。 */
export class Logic{
  constructor(){
    // ---- 已移植：WorldLoadEvent（S3 可达）----
    Events.on(WorldLoadEvent, () => {
      // Java: if(state.isCampaign()){ coreIncinerates/infiniteResources/... 以及
      //       waveTeam.rules() 的倍率调整、enemyInfiniteItems 分支 }
      // S3 无战役（`Rules.sector` 恒 null）与 `Planet` → 整段不可达，跳过。
      Core.settings.manualSave();
    });

    // ---- 未移植（逐条标注；事件类或消费方不在 S3 范围）----
    // Java: Events.on(BlockDestroyEvent.class, e -> { ghostBlocks 队列 … });
    //       `BlockDestroyEvent` 在 S3 **没有任何 fire 点**（无战斗、无拆除结算），
    //       且 `build.addPlan` 依赖 `BlockPlan` 系统 → 不可达。
    // Java: Events.on(BlockBuildEndEvent.class, …) ×2 —— 事件类未移植（依赖 block plans/stats）。
    // Java: Events.on(PayloadDropEvent.class, …) —— 载荷系统（S4+）。
    // Java: Events.on(SaveLoadEvent.class, …) —— 存档读取（计划 §9 不做）。
    // Java: Events.on(PlayEvent.class, …) —— 事件类未移植；`PlayEvent` 由 `Logic.play()` fire，
    //       S3 的 harness 直接 `state.set(State.playing)`，不走 `play()`。
    // Java: Events.on(UnlockEvent.class, …) —— 科研解锁 + `Call.researched`（网络，S6）。
    // Java: Events.on(SectorCaptureEvent/SectorLoseEvent.class, …) —— 扇区（S5）。
    // Java: Events.on(BlockDestroyEvent.class, e -> coreDestroyClear …) —— 同 BlockDestroyEvent。
    // Java: Events.on(CoreChangeEvent.class, …) —— 核心方块（S5）。
    // Java: Events.on(UnitDestroyEvent/UnitCreateEvent.class, …) —— 单位（S4+）。
    // Java: Events.on(WaveEvent.class, …) —— `state.getPlanet()`（战役统计）。
    // Java: Events.on(GameOverEvent.class, …) —— 同上。
  }

  /** @return 波次计时器是否因敌人存在而暂停。对应 Java `isWaitingWave()`。 */
  isWaitingWave(): boolean{
    const state = Vars.state;
    return (
      (state.rules.waitEnemies || (state.wave >= state.rules.winWave && state.rules.winWave > 0)) &&
      state.enemies > 0
    );
  }

  /** 对应 Java `updateEntities()`（S3 的 `Groups.*` 大多为空组，见方法内注释）。 */
  updateEntities(): void{
    const editor = Vars.state.isEditor();

    // Java 原文逐行：
    //   Groups.updatePooling();  Groups.bullet.updatePhysics();  Groups.unit.updatePhysics();
    //   Groups.player.update();  Groups.effect.update();  if(!editor) Groups.all.update();
    //   if(!editor) Groups.powerGraph.update();
    //   if(!editor) Groups.build.update();
    //   if(!editor){ Groups.bullet.update(); Groups.bullet.collide(); }
    // TS 的 codegen 产物 `Groups.update()`（`gen/Groups.ts`，**勿改**）已把
    //   updatePooling + bullet/unit.updatePhysics + all.update + build.update + bullet.collide
    // 打包为一次调用。S3 中被它省略的 `player/effect/unit/powerGraph/bullet.update`
    // 对应的组**恒为空**（无单位/玩家/子弹/效果），故语义等价。
    // S3 无编辑器（`state.isEditor()` 恒 false），editor 分支不可达。
    if(!editor){
      Groups.update();
    }
  }

  /** 对应 Java `update()`（headless 可达主体）。 */
  update(): void{
    const state = Vars.state;

    Events.fireTrigger(Trigger.update);

    // Java: boolean runStateCheck = !net.client() && !world.isInvalidMap() && !state.isEditor()
    //                              && state.rules.canGameOver;
    // S3: net.client() === false（MockNet）、world.isInvalidMap() 恒 false、
    //     state.isEditor() 恒 false、canGameOver 默认 true → runStateCheck === true。
    // ⚠️ Java 在此值下会调用 `checkGameState()`（会把 playerCores 为空判为 gameOver）。
    //    该分支依赖 CoreBuild/Spawner/Call（S4/S5），S3 按计划逐条标注跳过（见 `update` 尾部）。
    const runStateCheck =
      !Vars.net.client() &&
      !Vars.world.isInvalidMap() &&
      !state.isEditor() &&
      state.rules.canGameOver;

    if(state.isGame()){
      // Java: if(!net.client()) state.enemies = Groups.unit.count(u -> …);
      // S3 的 Groups.unit 恒为空（0 单位类型）→ 恒 0。判据中的 `u.isEnemy()` 属 S4，见文件头。
      state.enemies = Groups.unit.count((u) => u.team === state.rules.waveTeam.id);

      if(!state.isPaused()){
        Events.fireTrigger(Trigger.beforeGameUpdate);

        const delta = Core.graphics.getDeltaTime();
        state.tick += Number.isNaN(delta) || !Number.isFinite(delta) ? 0 : delta * 60;
        state.updateId++;
        state.teams.updateTeamStats();
        // Java: MapPreviewLoader.checkPreviews();           —— 地图预览（渲染），跳过。
        // Java: if(state.rules.fog) fogControl.update();    —— fog 默认 false，跳过。
        // Java: if(state.isCampaign()){ sector.info.update(); universe.update(); } —— 战役，跳过。

        Time.update();

        // Java: logicVars.update();                          —— 逻辑处理器，跳过。
        // Java: if(!net.client() && !state.isEditor()){ updateWeather(); for(TeamData …){ AI } }
        //       —— 天气（未移植，rules.weather 空）与 AI/核心填充（S4/S5），整体跳过。

        if(!state.isEditor()){
          state.rules.objectives.update();
        }

        if(state.rules.waves && state.rules.waveTimer && !state.gameOver){
          if(!this.isWaitingWave()){
            state.wavetime = Math.max(state.wavetime - Time.delta, 0);
          }
        }
        // Java: if(!net.client() && state.wavetime <= 0 && state.rules.waves){ runWave(); }
        //       —— rules.waves 默认 false → 不可达；runWave 依赖 spawner（S5），跳过。

        // 应用天气属性。Java: `Groups.weather.each(w -> state.envAttrs.add(w.weather.attrs, w.opacity));`
        //   —— `Weather`/`WeatherState` 未移植（见文件头「未移植」清单：`updateWeather()` 一条）。
        //      最小集的 `WeatherStatec` 只保留了 `opacity` 与 `Entityc`/`Posc`，没有 `weather` 字段；
        //      同时 `Groups.weather` 在 S3/S4/S5 恒为空（不生成天气实体）→ 该循环体一次都不执行。
        //      因此这里只保留 Java 的 `envAttrs` 重置与 `rules.attributes` 并入，语义等价。
        state.envAttrs.clear();
        state.envAttrs.add(state.rules.attributes);

        this.updateEntities();

        Events.fireTrigger(Trigger.afterGameUpdate);
      }

      if(runStateCheck){
        // Java: checkGameState(); —— 依赖 CoreBuild/Spawner/Call（S4/S5），按计划逐条跳过。
      }
    }
    // else if(netServer.isWaitingForPlayers() && runStateCheck){ checkGameState(); }
    //   —— netServer 未移植，跳过。

    // Java: PerfCounter.stateUpdate.end(...); —— 性能计数器，跳过。
  }
}
