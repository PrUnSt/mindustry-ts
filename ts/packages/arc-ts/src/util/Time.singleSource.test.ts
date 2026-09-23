// 反事实测试: TS-1「双 Time 源」收敛。
//
// 修复前: math/Mathf.ts:6 引用的是 math/Time.ts 存根 ({time, delta} 两个字段, 且无人推进),
//         而真实时间基准在 util/Time.ts。于是调用 util.Time.update() / 修改 util.Time.delta
//         对 Mathf 毫无影响 —— 下面第 2、3 条断言在修复前必然变红。
// 修复后: 全仓只有一个 Time (util/Time), 且它的 delta 取样自 Core.graphics。
//
// 本文件特意从桶文件 ../index 导入, 顺带覆盖「struct/index + math/index + util/index + Core + mock」
// 的循环依赖加载顺序 (struct/Seq -> struct/Mathf -> math/Mathf -> util/Time -> Core -> mock/*)。
import { describe, expect, it, beforeEach } from "vitest";
import { Core, Mathf, Time, MockGraphics, ApplicationType } from "../index";

/** 用确定性 seed 采样 chanceDelta, 返回逐次结果。 */
function sampleChanceDelta(delta: number, draws: number): boolean[]{
  Time.delta = delta;
  Mathf.rand.setSeed(42);
  const out: boolean[] = [];
  for(let i = 0; i < draws; i++) out.push(Mathf.chanceDelta(0.5));
  return out;
}

describe("Time 单一时间源 (TS-1)", () => {
  beforeEach(() => {
    Time.delta = 1;
    Time.setInternalTime(0);
    Time.globalTime = 0;
  });

  it("确定性锚点: Core.graphics.getDeltaTime() 固定 1/60 → Time.delta 恒为 1", () => {
    expect(MockGraphics.fixedDeltaTime).toBe(1 / 60);
    expect(Core.graphics).toBeInstanceOf(MockGraphics);
    expect(Core.graphics.getDeltaTime()).toBe(1 / 60);

    Core.defaultUpdate();                       // settings.autosave() + Time.updateGlobal()
    expect(Time.delta).toBe(1);

    for(let i = 0; i < 1000; i++) Core.defaultUpdate();
    expect(Time.delta).toBe(1);                 // 推 1000 帧后仍是 1: 不读真实时间
    expect(Time.globalTime).toBeGreaterThan(0);
  });

  it("反事实: 改 Time.delta 后 Mathf.chanceDelta 结果必须随之改变", () => {
    const never = sampleChanceDelta(0, 64);     // d * delta = 0 → 概率恒 0
    const half = sampleChanceDelta(1, 64);      // d * delta = 0.5

    expect(never.every(hit => hit === false)).toBe(true);
    expect(half.filter(hit => hit).length).toBe(34);   // seed=42 下钉死命中数
    expect(half).not.toEqual(never);
  });

  it("反事实: Mathf 的时间曲线随 Time.time 变化 (修复前存根的 time 恒为 0)", () => {
    Time.setInternalTime(0);
    const atZero = Mathf.absin(4, 1);           // absin(Time.time, 4, 1)

    Time.setInternalTime(1);
    const atOne = Mathf.absin(4, 1);

    expect(atZero).toBe(0.5);                   // (sin(0/8) * 1 + 1) / 2
    expect(atOne).not.toBe(atZero);
  });

  it("Time.update() 只推进 tick; delta 由 updateGlobal() 从 Core.graphics 重算", () => {
    Time.update();
    expect(Time.time).toBe(1);
    expect(Time.delta).toBe(1);

    Core.defaultUpdate();                       // 重新取样 delta (Core.graphics)
    expect(Time.delta).toBe(Math.min(Core.graphics.getDeltaTime() * 60, 3));
    expect(Time.delta).toBe(1);
  });

  it("Core 的降级层装配: app/graphics/settings/bundle 都是稳定对象且为 headless", () => {
    expect(Core.app.getType()).toBe(ApplicationType.headless);
    expect(Core.app.isHeadless()).toBe(true);
    expect(Core.app.isDesktop()).toBe(false);

    // MockBundle.get(key, default) 必须返回 default 而不是抛错
    // (core/src/mindustry/ctype/UnlockableContent.java:87-92 的构造器依赖此行为)
    expect(Core.bundle.get("block.router.name", "router-fallback")).toBe("router-fallback");
    expect(Core.bundle.getOrNull("block.router.name")).toBeNull();
    expect(Core.bundle.get("block.router.name")).toBe("???block.router.name???");

    expect(Core.settings.getBool("unknown-key", true)).toBe(true);
    expect(Core.settings.getInt("unknown-key", 5)).toBe(5);
    expect(Core.settings.getString("unknown-key", null)).toBeNull();
  });
});
