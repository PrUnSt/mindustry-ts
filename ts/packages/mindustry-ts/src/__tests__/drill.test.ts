// S4 验收测试：采矿方块 `Drill`（`mechanical-drill` 配置）。
//
// 覆盖任务书的 6 条要求:
//   ① canMine 三条分支（铜矿 true / 空地 false / 静态墙 false）+ 硬度边界（coal==tier → true，
//      titanium>tier → false）;
//   ② getDrillTime 精确值（copper=650）+ 线性（coal=700、titanium=750）+ 字段级反事实;
//   ③ countOre 选取（2×2 全压铜矿 = 4 格 / 只压 1 格 = 1 / 混合选数量多的 / lowPriority 最低优先）;
//   ④ 端到端: 2×2 钻头压矿 + 相邻传送带 → **精确 tick**（实测 196）与逐 tick 精确浮点值;
//   ⑤ 反事实（见文件末 `反事实` 一节 + 交付报告里的「改坏 → 变红 → 复原」实测输出）;
//   ⑥ 确定性（两次同布景 → `snapshot()` 字符串相等）。
//
// ✅ **与 Java 基准的对拍（本文件交付时已核对）**: `ts/golden/java-drill.txt`（由
//    `GoldenExportTest.java` 导出的 mechanical-drill 逐 tick 表）与本文件实测值一致:
//      · `# [A] exact ticks: 1st item @ tick 196, 2nd @ tick 358, 3rd @ tick 521`
//        —— 本文件 `首个物品在 tick 196`（2 个物品在 tick 400 前产出）逐条吻合;
//      · tick 1 → `progress=0.06 warmup=0.015 lastDrillSpeed=0`（golden 同值）;
//      · tick 2 → `lastDrillSpeed=9.230769E-5`（golden，f32）＝ 本文件 f64 的
//        `(1 * 4 * 0.015) / 650` —— **这条同时证明 speed = 1**（若照抄 `optionalEfficiency`
//        会得到 1.6，即 1.4769E-4，与 golden 不符）;
//      · `# [B] c1 received its 1st item @ tick 196` + `c1ys0=0.035` —— 与 `conv.ys[0]` 吻合;
//      · footprint `(5,5)-(6,6)`（size 2 锚点 = 左上角）—— 与 `sizeOffset === 0` 的前提一致。
//    ⚠️ 唯一差异是精度: Java 全程 `float`（f32），本移植用 TS `number`（f64）→
//    `0.17999999` vs `0.18`、`2.659912` vs `2.660000000000082`。本文件钉的是 **f64** 值。
//
// ⚠️⚠️ 本文件有两处**必须知道**的地基状况（详见交付报告 item 6，编排方需要决策）:
//
//  A. **偶数尺寸 multiblock 无法用 `Tile.setBlock` 放置**（地基 bug）。
//     `Tile.setBlock`（`world/Tile.ts:560`）与 `Block.init`（`world/Block.ts:688`）、
//     `Tile.preChanged`（`:708-709`）把 Java 的**整数除法** `-((size-1)/2)` 写成了**浮点除法**:
//        Java: `int offset = -(block.size - 1) / 2;`  → size 2 ⇒ **0**
//        TS:   `const offset = -((this.blockRef.size - 1) / 2);` → size 2 ⇒ **-0.5**
//     于是 `placeBlock` 会对 `world.tile(x - 0.5, y - 0.5)` 取到 `undefined`，
//     紧接的 `other.setBlock(Blocks.air)` 抛
//     `TypeError: Cannot read properties of undefined (reading 'setBlock')`。
//     ⇒ **2×2 的机械钻根本无法放置**。故本文件用 `placeDrill()` **手工脚手架**复刻
//     Java `Tile.setBlock` 的多块第二趟（4 格共享同一 build 实体、`block` 均指向 drill），
//     再 `build.updateProximity()` 复刻 Java `Tile.changed()`。产出的 tile 状态与 Java 等价
//     （测试内显式断言了这一点）。地基修好后本脚手架依然有效（会成为冗余，可直接删掉换成
//     `placeBlock`）。**本文件刻意不断言那个 bug**（否则地基一修好测试就红）。
//
//  B. **本测试的 Drill 不调用 `drill.init()`**。生产路径（`Blocks.load()` 注册 + `content.init()`）
//     会调用它，而当前 `Block.ts:688` 会因此把 `sizeOffset` 写成 `-0.5`（应为 0）→
//     `countOre` 的 `getLinkedTilesAs` 也会取到 `undefined` 而崩。
//     不调用 `init()` 时 `sizeOffset` 保持字段默认值 **0**，恰好等于 Java 对 size 2 的值，
//     因此本测试能覆盖 2×2 的**真实取矿范围**。测试里用
//     `expect(drill.sizeOffset).toBe(0)` 把这个前提**显式钉住**（Java 值就是 0）。
//
// ⚠️ 另有一处与任务书推理**不符**的地方（已按源码修正实现，见 `Drill.ts` 文件头）:
//     任务书称「S4 无消费者 → `optionalEfficiency === 0` → `lerp(1, 1.6, 0) === 1`」，
//     但 `BuildingComp.def.ts:226` 的赋值是 `optionalEfficiency = shouldConsume() ? potentialEfficiency : 0`
//     → 钻头有矿时是 **1**；照抄会得到 1.6（比 Java 未接水的钻头快 1.6 倍）。
//     实现里把 boost 位显式写成字面 `0`（＝未接水），故本文件实测 `lastDrillSpeed` 对应 speed = 1。

import { describe, expect, test } from "vitest";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Items } from "../content/Items.js";
import { Team } from "../game/Team.js";
import { createWorld, placeBlock, runTicks, snapshot } from "../harness.js";
import { Drill, DrillBuild } from "../world/blocks/production/Drill.js";
import { BlockGroup } from "../world/meta/BlockGroup.js";
import { Env } from "../world/meta/Env.js";
import type { Item } from "../type/Item.js";
import type { Tile } from "../world/Tile.js";

/** 传送带建筑的**最小结构视图**（只为读它的库存与平行数组）。 */
type ConveyorView = {
  items: { total(): number };
  ys: number[];
  xs: number[];
  ids: (Item | null)[];
};

/** 需要 `items.total()` 的行为（钻头与传送带都满足）。 */
type ItemSink = { items: { total(): number } };

// ---------------------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------------------

/**
 * 建一个 `mechanical-drill` 参数配置的钻头（**不**依赖 `content/Blocks.ts` 的注册 ——
 * 编排方会在收口阶段统一注册；这里自己 `new`，见任务书「禁止修改 Blocks.ts」）。
 *
 * 参数逐条对应 `Blocks.java:2884-2894`:
 *   `tier = 2; drillTime = 600; size = 2; envEnabled ^= Env.space;`
 */
/**
 * ⚠️ 名字必须**固定且不等于 `"mechanical-drill"`**。
 *
 * 背景：`ContentLoader.handleMappableContent`（`ContentLoader.ts:110-124`）不允许两个内容对象同名，
 * 撞名会 `list.pop()` 后抛 `Two content objects defined with the same name: 'xxx'`。
 * 本文件原先直接用 `"mechanical-drill"` 是可行的（那时 `Blocks.load()` 还没注册它）；
 * **收口阶段它已在 `content/Blocks.ts` 注册**，所以测试自建实例必须换名。
 *
 * 又因为本文件**每个用例开头都 `createWorld()`**，而 `Vars.bootstrap()` 会
 * `Vars.content = new ContentLoader()`（`Vars.ts:152`）**重建内容表**，所以换名后
 * **每次 bootstrap 内同名只会出现一次** —— 用固定的 `"d-xxx"` 即可，不需要唯一计数器。
 * （用递增计数器反而会破坏确定性用例：方块名会进 `snapshot()` 的 `block=` 列，
 * 两次「相同布景」拿到不同名字 → 比较必然失败。）
 */
function makeMechanicalDrill(name: string = "d-default"): Drill{
  const drill = new Drill(name);
  drill.tier = 2;
  drill.drillTime = 600;
  drill.size = 2;
  // Java `Blocks.java:2890`: `envEnabled ^= Env.space;` —— 机械钻**不在太空**工作。
  drill.envEnabled ^= Env.space;
  return drill;
}

/** 给 `(x,y)` 贴矿石覆盖层（`OreBlock.itemDrop` 是 `Tile.drop()` 的唯一来源）。 */
function setOre(x: number, y: number, ore: typeof Blocks.oreCopper): void{
  Vars.world.tile(x, y)!.setOverlay(ore);
}

/** 读取 `Drill` 的取矿结果（Java 的 `returnItem` / `returnCount`，见 `Drill.java:47-48`）。 */
function oreResult(drill: Drill): { item: Item | null; count: number }{
  return { item: drill.returnItem, count: drill.returnCount };
}

/**
 * 放置一个多块钻头。见文件头说明 A: 当前地基无法用 `Tile.setBlock` 放置偶数尺寸多块结构，
 * 因此这里以「临时 size=1 放置（避开多块分支）→ 恢复 size → 手工把其余格打成代理 →
 * `updateProximity()`」复刻 Java `Tile.setBlock` 的第二趟与 `Tile.changed()`。
 */
function placeDrill(x: number, y: number, drill: Drill): DrillBuild{
  const size = drill.size;
  const offset = -Math.trunc((size - 1) / 2); // Java 的 `-(block.size - 1) / 2`（整数除法）

  drill.size = 1;
  placeBlock(x, y, drill, 0);
  drill.size = size;

  const anchor = Vars.world.tile(x, y)!;
  const build = anchor.build as DrillBuild;

  // 第二趟: 其余格共享同一实体与方块（Java `other.build = entity; other.block = block;`）
  for(let dx = 0; dx < size; dx++){
    for(let dy = 0; dy < size; dy++){
      const other = Vars.world.tile(x + dx + offset, y + dy + offset);
      if(other === null || other === anchor) continue;
      other.build = build;
      other.updateBlockReference(drill);
    }
  }

  // Java `Tile.changed()` → `build.updateProximity()`（此时 block.size 已恢复为 size）
  build.updateProximity();
  return build;
}

/** 每 tick 推进一次并收集「首个物品进入 sink」的 tick。 */
function firstItemTick(sink: ItemSink, maxTicks: number): number{
  for(let t = 1; t <= maxTicks; t++){
    runTicks(1);
    if(sink.items.total() === 1) return t;
  }
  return -1;
}

// ---------------------------------------------------------------------------------------
// ① 方块级数据 / 构造器 / Env 位运算
// ---------------------------------------------------------------------------------------

describe("drill: 方块级数据与构造器（Drill.java:27-97）", () => {
  test("基类默认值与 Java 逐字段一致", () => {
    createWorld(8, 8, 1);
    const drill = new Drill("drill-defaults");

    expect(drill.hardnessDrillMultiplier).toBe(50); // Drill.java:28
    expect(drill.tier).toBe(0); // Drill.java:34
    expect(drill.drillTime).toBe(300); // Drill.java:36
    expect(drill.liquidBoostIntensity).toBe(1.6); // Drill.java:38（Java 的 1.6f → TS 的 f64 1.6）
    expect(drill.warmupSpeed).toBe(0.015); // Drill.java:40
    expect(drill.blockedItem).toBeNull();
    expect(drill.blockedItems).toBeNull();
    expect(drill.drillMultipliers.size).toBe(0);

    // `Drill(String)` 构造器（Drill.java:76-88）—— 除已被有意省略的音效/BlockFlag 外逐条
    expect(drill.update).toBe(true);
    expect(drill.solid).toBe(true);
    expect(drill.hasItems).toBe(true);
    expect(drill.group).toBe(BlockGroup.drills);
    expect(drill.envEnabled).toBe(Env.terrestrial | Env.space); // `envEnabled |= Env.space`
    expect(drill.supportsEnv(Env.terrestrial)).toBe(true);
    expect(drill.supportsEnv(Env.space)).toBe(true);
    // `Env.any` 是全 1 位掩码 → 「任意一位满足」恒成立
    expect(drill.supportsEnv(Env.any)).toBe(true);
    // 有意省略（见 Drill.ts 文件头）: `hasLiquids = true`（无 Consume 体系 → 无 LiquidModule）
    expect(drill.hasLiquids).toBe(false);
  });

  test("mechanical-drill 配置: tier/drillTime/size + `envEnabled ^= Env.space`", () => {
    createWorld(8, 8, 1);
    const drill = makeMechanicalDrill();

    expect(drill.tier).toBe(2); // Blocks.java:2886
    expect(drill.drillTime).toBe(600); // Blocks.java:2887
    expect(drill.size).toBe(2); // Blocks.java:2888
    // `Org` 默认 terrestrial(1) | space(2) = 3，异或掉 space → 1（机械钻不在太空工作）
    expect(drill.envEnabled).toBe(Env.terrestrial);
    expect(drill.supportsEnv(Env.terrestrial)).toBe(true);
    expect(drill.supportsEnv(Env.space)).toBe(false);
    expect(drill.supportsEnv(Env.underwater)).toBe(false);
  });

  test("`buildType` 注册生效: 放下去的建筑是 DrillBuild（陷阱 #6）", () => {
    createWorld(8, 8, 1);
    const drill = makeMechanicalDrill();
    drill.size = 1;
    placeBlock(3, 3, drill, 0);

    const build = Vars.world.tile(3, 3)!.build;
    expect(build).toBeInstanceOf(DrillBuild);
    expect(build!.block).toBe(drill);
    expect(build!.rotation).toBe(0);
    expect(build!.team).toBe(Team.sharded.id);
    // 未接矿时 `dominantItem === null`、`dominantItems === 0`（`onProximityUpdate` 的产物）
    expect((build as DrillBuild).dominantItem).toBeNull();
    expect((build as DrillBuild).dominantItems).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------
// ① canMine: 三条分支 + 硬度边界
// ---------------------------------------------------------------------------------------

describe("drill: canMine —— 三条分支 + 硬度边界（Drill.java:231-235）", () => {
  test("铜矿 true / 空地 false / 静态墙 false（含「墙压在矿上」这个判别性用例）", () => {
    createWorld(16, 16, 1);
    const drill = makeMechanicalDrill("d-canmine");
    const t = (x: number, y: number): Tile => Vars.world.tile(x, y)! as Tile;

    // 分支 ①: 有矿 + 硬度足够 → true
    setOre(2, 2, Blocks.oreCopper);
    expect(t(2, 2).drop()).toBe(Items.copper);
    expect(drill.canMine(t(2, 2))).toBe(true);

    // 分支 ②: 空地（无 overlay，stone 地板无 itemDrop）→ drop() 为 null → false
    expect(t(9, 9).drop()).toBeNull();
    expect(drill.canMine(t(9, 9))).toBe(false);

    // 分支 ③: 静态墙 → false。判别性做法: 先把**铜矿**贴在 (2,6)，再压 stoneWall —— 此时
    // `tile.drop()` 仍是 copper（`Tile.drop()` 读 overlay/floor，与 block 无关），
    // 所以 `false` **只能**来自 `block().isStatic()` 这一支（而不是 `drops === null`）。
    setOre(2, 6, Blocks.oreCopper);
    placeBlock(2, 6, Blocks.stoneWall, 0);
    expect(t(2, 6).block().isStatic()).toBe(true);
    expect(t(2, 6).drop()).toBe(Items.copper);
    expect(drill.canMine(t(2, 6))).toBe(false);

    // 纯静态墙（无矿）同样 false
    placeBlock(2, 5, Blocks.stoneWall, 0);
    expect(drill.canMine(t(2, 5))).toBe(false);

    // null 入参 → false（Java 首行 `tile == null`）
    expect(drill.canMine(null)).toBe(false);
  });

  test("硬度边界: hardness == tier 可挖（`<=`），hardness > tier 不可挖", () => {
    createWorld(16, 16, 1);
    const drill = makeMechanicalDrill("d-tier");
    const t = (x: number, y: number): Tile => Vars.world.tile(x, y)! as Tile;

    // copper hardness = 1 < tier 2
    setOre(2, 2, Blocks.oreCopper);
    expect(Items.copper.hardness).toBe(1);
    expect(drill.canMine(t(2, 2))).toBe(true);

    // coal hardness = 2 == tier 2 —— 这一条钉死 `<=`（写成 `<` 立即变红，见交付报告的反事实证据）
    setOre(2, 3, Blocks.oreCoal);
    expect(Items.coal.hardness).toBe(2);
    expect(drill.canMine(t(2, 3))).toBe(true);

    // titanium hardness = 3 > tier 2
    setOre(2, 4, Blocks.oreTitanium);
    expect(Items.titanium.hardness).toBe(3);
    expect(drill.canMine(t(2, 4))).toBe(false);

    // lead hardness = 1 → true（第二个低硬度样本）
    setOre(2, 5, Blocks.oreLead);
    expect(Items.lead.hardness).toBe(1);
    expect(drill.canMine(t(2, 5))).toBe(true);
  });

  test("blockedItems 排除表（含 blockedItem → init() 的自动填充）", () => {
    createWorld(16, 16, 1);
    const drill = makeMechanicalDrill("d-block");
    const t = (x: number, y: number): Tile => Vars.world.tile(x, y)! as Tile;
    setOre(2, 2, Blocks.oreCopper);
    setOre(2, 3, Blocks.oreLead);

    expect(drill.canMine(t(2, 2))).toBe(true);

    // Java `Drill.init()`（:93-95）: `blockedItems == null && blockedItem != null` → 包成单元素表
    drill.blockedItem = Items.copper;
    expect(drill.blockedItems).toBeNull();
    drill.init();
    expect(drill.blockedItems).not.toBeNull();
    expect(drill.blockedItems!.length).toBe(1);
    expect(drill.blockedItems![0]).toBe(Items.copper);

    expect(drill.canMine(t(2, 2))).toBe(false); // copper 被排除
    expect(drill.canMine(t(2, 3))).toBe(true); // lead 不受影响

    // 显式 blockedItems 表（多元素）
    drill.blockedItems = [Items.copper, Items.lead];
    expect(drill.canMine(t(2, 2))).toBe(false);
    expect(drill.canMine(t(2, 3))).toBe(false);
    expect(drill.canMine(t(9, 9))).toBe(false); // 空地仍 false
  });
});

// ---------------------------------------------------------------------------------------
// ② getDrillTime 精确值 / 线性 / 乘法器
// ---------------------------------------------------------------------------------------

describe("drill: getDrillTime（Drill.java:170-172）", () => {
  test("mechanical-drill 在 copper 上精确等于 650；三种矿严格线性", () => {
    createWorld(8, 8, 1);
    const drill = makeMechanicalDrill("d-time");

    // (600 + 50 * hardness) / 1
    expect(drill.getDrillTime(Items.copper)).toBe(650); // hardness 1 → 600 + 50 * 1
    expect(drill.getDrillTime(Items.coal)).toBe(700); // hardness 2
    expect(drill.getDrillTime(Items.titanium)).toBe(750); // hardness 3

    // 线性关系: 每 +1 硬度恰好多 50
    expect(drill.getDrillTime(Items.coal) - drill.getDrillTime(Items.copper)).toBe(50);
    expect(drill.getDrillTime(Items.titanium) - drill.getDrillTime(Items.coal)).toBe(50);

    // pneumatic-drill 配置（Blocks.java:2896-2902）: tier 3, drillTime 400
    const pneumatic = new Drill("pneumatic-drill");
    pneumatic.tier = 3;
    pneumatic.drillTime = 400;
    pneumatic.size = 2;
    expect(pneumatic.getDrillTime(Items.copper)).toBe(450);
    expect(pneumatic.getDrillTime(Items.titanium)).toBe(550);
  });

  test("`drillMultipliers`（ObjectFloatMap 的默认值 1）参与除法", () => {
    createWorld(8, 8, 1);
    const drill = makeMechanicalDrill("d-mult");

    expect(drill.getDrillTime(Items.copper)).toBe(650); // 缺省 1f
    drill.drillMultipliers.set(Items.copper, 2);
    expect(drill.getDrillTime(Items.copper)).toBe(325); // 650 / 2
    drill.drillMultipliers.set(Items.titanium, 1.3);
    expect(drill.getDrillTime(Items.titanium)).toBe(750 / 1.3);
    // 未登记的物品仍走缺省值
    expect(drill.getDrillTime(Items.coal)).toBe(700);
  });

  test("（字段级反事实）`hardnessDrillMultiplier = 0` → 650 这条断言不再成立，复原后重新成立", () => {
    createWorld(8, 8, 1);
    const drill = makeMechanicalDrill("d-counter");

    expect(drill.getDrillTime(Items.copper)).toBe(650);

    // 改坏: 硬度加成归零 → 结果退化为基础 drillTime
    drill.hardnessDrillMultiplier = 0;
    expect(drill.getDrillTime(Items.copper)).toBe(600);
    expect(drill.getDrillTime(Items.copper)).not.toBe(650); // 判别性: 650 真的把这个字段算进去了
    expect(drill.getDrillTime(Items.coal)).toBe(600);
    expect(drill.getDrillTime(Items.titanium)).toBe(600);

    // 复原
    drill.hardnessDrillMultiplier = 50;
    expect(drill.getDrillTime(Items.copper)).toBe(650);
  });
});

// ---------------------------------------------------------------------------------------
// ③ countOre 选取
// ---------------------------------------------------------------------------------------

describe("drill: countOre 选取（Drill.java:198-229）", () => {
  test("2×2 覆盖范围恰为 4 格；全压铜矿 → 4 格铜；只压 1 格 → 1 格", () => {
    createWorld(16, 16, 1);
    const drill = makeMechanicalDrill("d-ore4");
    const anchor = Vars.world.tile(4, 4)! as Tile;

    // ⚠️ 前提: `sizeOffset` 必须是 Java 对 size 2 的值 **0**（见文件头说明 B）
    expect(drill.sizeOffset).toBe(0);

    // 覆盖范围 **且仅** 4 格: (4,4) (5,4) (4,5) (5,5)
    const linked = anchor.getLinkedTilesAsInto(drill, []).map((t) => t.x + "," + t.y);
    expect(linked).toEqual(["4,4", "4,5", "5,4", "5,5"]);

    // 全压铜矿 → returnCount = 4，returnItem = copper
    for(const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5]] as const){
      setOre(x, y, Blocks.oreCopper);
    }
    drill.countOre(anchor);
    expect(oreResult(drill)).toEqual({ item: Items.copper, count: 4 });

    // 只压 1 格 → returnCount = 1
    for(const [x, y] of [[5, 4], [4, 5], [5, 5]] as const){
      Vars.world.tile(x, y)!.clearOverlay();
    }
    drill.countOre(anchor);
    expect(oreResult(drill)).toEqual({ item: Items.copper, count: 1 });
  });

  test("一格的真实建筑: dominantItems 精确等于 returnCount（onProximityUpdate 的拷贝链）", () => {
    createWorld(16, 16, 1);
    const drill = makeMechanicalDrill("d-1x1");
    drill.size = 1;
    setOre(3, 3, Blocks.oreCopper);
    placeBlock(3, 3, drill, 0);

    const build = Vars.world.tile(3, 3)!.build as DrillBuild;
    expect(build.dominantItem).toBe(Items.copper);
    expect(build.dominantItems).toBe(1);

    // 换成 2 格矿（size 1 的建筑只有 1 格）→ 计数不变
    setOre(4, 3, Blocks.oreCopper);
    build.onProximityUpdate();
    expect(build.dominantItems).toBe(1);

    // 无矿 → dominantItem 归零、dominantItems 归零
    Vars.world.tile(3, 3)!.clearOverlay();
    build.onProximityUpdate();
    expect(build.dominantItem).toBeNull();
    expect(build.dominantItems).toBe(0);
  });

  test("混合矿石: 选数量多的（3 铜 + 1 煤 → 铜）", () => {
    createWorld(16, 16, 1);
    const drill = makeMechanicalDrill("d-mix");
    const anchor = Vars.world.tile(4, 4)! as Tile;

    setOre(4, 4, Blocks.oreCopper);
    setOre(5, 4, Blocks.oreCopper);
    setOre(4, 5, Blocks.oreCopper);
    setOre(5, 5, Blocks.oreCoal);

    drill.countOre(anchor);
    expect(oreResult(drill)).toEqual({ item: Items.copper, count: 3 });

    // 2 铜 + 2 煤: 数量相同 → 落到第三条规则 `item.id` **升序**，而 `peek()` 取**最后一个**
    // → id 大的胜出。copper.id = 0、coal.id = 5（Items.load 的创建顺序）→ coal 胜。
    setOre(4, 5, Blocks.oreCoal);
    drill.countOre(anchor);
    expect(Items.copper.id).toBe(0);
    expect(Items.coal.id).toBe(5);
    expect(oreResult(drill)).toEqual({ item: Items.coal, count: 2 });
  });

  test("`lowPriority` 是最低优先级（3 废料 + 3 铜 → 铜）", () => {
    createWorld(16, 16, 1);
    const drill = makeMechanicalDrill("d-lowpri");
    const anchor = Vars.world.tile(4, 4)! as Tile;
    const scrap = Vars.content.item("scrap")!;

    // 2 废料 + 2 铜（数量相同）
    setOre(4, 4, Blocks.oreCopper);
    setOre(4, 5, Blocks.oreCopper);
    setOre(5, 4, Blocks.oreScrap);
    setOre(5, 5, Blocks.oreScrap);

    // 未标 lowPriority 时: 数量相同 → 第二条规则平 → `item.id` 大者胜（scrap.id = 8 > copper.id = 0）
    expect(scrap.lowPriority).toBe(false);
    expect(scrap.id).toBe(8);
    drill.countOre(anchor);
    expect(oreResult(drill)).toEqual({ item: scrap, count: 2 });

    // 标上 `lowPriority = true`（Java 的 `Boolean.compare(!a.lowPriority, !b.lowPriority)` 首条规则）
    // → 即使 id 更大也必须让位给非 lowPriority 的铜矿
    scrap.lowPriority = true;
    drill.countOre(anchor);
    expect(oreResult(drill)).toEqual({ item: Items.copper, count: 2 });

    // 复原（避免污染后续用例/其它测试文件）
    scrap.lowPriority = false;
    drill.countOre(anchor);
    expect(oreResult(drill)).toEqual({ item: scrap, count: 2 });
  });

  test("无可挖格 → returnItem 为 null、returnCount 为 0", () => {
    createWorld(16, 16, 1);
    const drill = makeMechanicalDrill("d-empty");
    const anchor = Vars.world.tile(4, 4)! as Tile;

    drill.countOre(anchor);
    expect(oreResult(drill)).toEqual({ item: null, count: 0 });

    // 只有硬度超标的矿 → 同样为空
    setOre(4, 4, Blocks.oreTitanium);
    drill.countOre(anchor);
    expect(oreResult(drill)).toEqual({ item: null, count: 0 });
  });

  test("canPlaceOn: 多块「压住 ≥1 格可挖矿」即可，单块只看自己（Drill.java:125-137）", () => {
    createWorld(16, 16, 1);
    const big = makeMechanicalDrill("d-place-2");
    const small = makeMechanicalDrill("d-place-1");
    small.size = 1;
    const anchor = Vars.world.tile(4, 4)! as Tile;
    const team = Vars.state.rules.defaultTeam;

    // 全是空地 → 两边都不可放
    expect(big.canPlaceOn(anchor, team, 0)).toBe(false);
    expect(small.canPlaceOn(anchor, team, 0)).toBe(false);

    // 4 格里只压 1 格铜（(5,5) 在 2×2 覆盖内、不在 size-1 的覆盖内）
    setOre(5, 5, Blocks.oreCopper);
    expect(big.canPlaceOn(anchor, team, 0)).toBe(true); // 多块: 只要有 1 格可挖
    expect(small.canPlaceOn(anchor, team, 0)).toBe(false); // 单块: 只看自己那一格

    setOre(4, 4, Blocks.oreCopper);
    expect(small.canPlaceOn(anchor, team, 0)).toBe(true);

    // 只有硬度超标的矿（titanium 3 > tier 2）→ 不可放
    Vars.world.tile(4, 4)!.clearOverlay();
    Vars.world.tile(5, 5)!.clearOverlay();
    setOre(5, 5, Blocks.oreTitanium);
    expect(big.canPlaceOn(anchor, team, 0)).toBe(false);
    expect(small.canPlaceOn(anchor, team, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------
// ④ 端到端: 2×2 钻头 + 相邻传送带（精确 tick）
// ---------------------------------------------------------------------------------------

describe("drill: 端到端 2×2 压矿 + 传送带（精确 tick，实测后钉死）", () => {
  /**
   * 标准布景: 2×2 钻头锚点 (4,4)（覆盖 (4,4)-(5,5)，4 格全压铜矿）+ 传送带 (6,4) 朝 +x。
   *
   * `(6,4)` 在钻头的 `Edges.getEdges(2)` 邻环里（`(4,4)` 的环 = (4,3)(5,3)(4,6)(5,6)(3,4)(3,5)(6,4)(6,5)），
   * 因此会进 `build.proximity` → `offload` 能把产物直接推给传送带。
   */
  function buildRig(name: string = "d-rig"): { build: DrillBuild; conv: DrillBuild & ConveyorView }{
    createWorld(20, 20, 1);
    const drill = makeMechanicalDrill(name);
    for(const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5]] as const){
      setOre(x, y, Blocks.oreCopper);
    }
    const build = placeDrill(4, 4, drill);
    placeBlock(6, 4, Blocks.conveyor, 0);
    build.updateProximity(); // 传送带就位后重建邻接（block.size 已是 2）

    return { build, conv: Vars.world.tile(6, 4)!.build as DrillBuild & ConveyorView };
  }

  test("多块脚手架产出的 tile 状态与 Java `Tile.setBlock` 等价（4 格共享同一实体）", () => {
    const { build } = buildRig("d-rig-shape");

    expect(Vars.world.tile(4, 4)!.build).toBe(build);
    expect(Vars.world.tile(5, 4)!.build).toBe(build);
    expect(Vars.world.tile(4, 5)!.build).toBe(build);
    expect(Vars.world.tile(5, 5)!.build).toBe(build);
    // 代理格的 `block()` 也必须是钻头本身（Java 第二趟 `other.block = block`）
    expect(Vars.world.tile(5, 4)!.block()).toBe(build!.block);
    expect(Vars.world.tile(5, 5)!.block()).toBe(build!.block);
    // 邻接: 钻头只与 (6,4) 的传送带相邻
    expect(build.proximity.length).toBe(1);
    expect((build.proximity[0] as DrillBuild).tile.x).toBe(6);
  });

  test("初始状态: dominantItem/dominantItems + efficiency（无消费者快路径 = 1）", () => {
    const { build } = buildRig("d-rig-init");

    expect(build.dominantItem).toBe(Items.copper);
    expect(build.dominantItems).toBe(4); // 2×2 全压矿 → 每 tick 4 倍速
    expect(build.progressRef).toBe(0);
    expect(build.warmup).toBe(0);
    expect(build.timeDrilled).toBe(0);
    expect(build.lastDrillSpeed).toBe(0);
    expect(build.items.total()).toBe(0);
    expect(build.block.itemCapacity).toBe(10); // Block 默认值（Java 同）

    // `updateConsumption()` 在第一次 tick 时才写 efficiency（放置期它还是初值 0）
    expect(build.efficiency).toBe(0);

    // tick 1 后: shouldConsume=true → efficiency=1（`optionalEfficiency` 同样是 1——
    // 这正是任务书推理与源码不符之处，见文件头）
    runTicks(1);
    expect(build.efficiency).toBe(1);
    expect(build.optionalEfficiency).toBe(1);
    // lastDrillSpeed 用**旧的** warmup 计算 → 第 1 tick 时 warmup 还是 0 → 0
    expect(build.lastDrillSpeed).toBe(0);
    // progress 累加: delta * dominantItems * speed * warmup（warmup 已推进到 0.015）
    // speed = lerp(1, 1.6, 0) * efficiency = 1（boost 位刻意写 0，见 Drill.ts 文件头）
    expect(build.progressRef).toBe(0.06);
    expect(build.timeDrilled).toBe(0);
    expect(build.warmup).toBe(0.015);

    // tick 2: 这次 lastDrillSpeed 用 warmup = 0.015 → (1 * 4 * 0.015) / 650
    runTicks(1);
    expect(build.lastDrillSpeed).toBe((1 * 4 * 0.015) / 650);
    expect(build.progressRef).toBe(0.18);
    expect(build.timeDrilled).toBe(0.015);
  });

  test("首个物品在 **tick 196** 进入传送带（逐 tick 实测后钉死）", () => {
    const { build, conv } = buildRig("d-rig-e2e");

    expect(conv.items.total()).toBe(0);

    const first = firstItemTick(conv, 250);
    expect(first).toBe(196);

    // 精确状态（tick 196 的实测值，见交付报告「怎么测出来的」一节）
    expect(String(build.progressRef)).toBe("2.660000000000082"); // 650 取模后的余数
    expect(build.progress()).toBe(2.660000000000082 / 650);
    expect(build.warmup).toBe(1);
    expect(String(build.timeDrilled)).toBe("162.16500000000002");
    expect(String(build.lastDrillSpeed)).toBe("0.006153846153846154"); // (1 * 4 * 1) / 650
    // 产出**没有**留在钻头里（`offload` 优先推给邻居）
    expect(build.items.total()).toBe(0);
    // 传送带收到 1 个铜，且是**正后方输入**（`direction === 0` → ys 从 0 起、xs 恒 0）
    expect(conv.items.total()).toBe(1);
    expect(conv.ids[0]).toBe(Items.copper);
    expect(String(conv.ys[0])).toBe("0.035"); // 同 tick 内传送带自己也跑了 1 帧
    expect(conv.xs[0]).toBe(0);
  });

  test("累积量的精确采样点（warmup 在 tick 67 达到 1；progress 在 tick 195/196 跨界）", () => {
    const { build, conv } = buildRig("d-rig-samples");

    // tick 1..3
    runTicks(1);
    expect(String(build.progressRef)).toBe("0.06");
    expect(String(build.warmup)).toBe("0.015");
    runTicks(1);
    expect(String(build.progressRef)).toBe("0.18");
    expect(String(build.warmup)).toBe("0.03");
    runTicks(1);
    expect(String(build.progressRef)).toBe("0.36");
    expect(String(build.warmup)).toBe("0.045");

    // tick 65 / 66 / 67 —— warmup 从 0.975 → 0.99 → **1**（0.015 * 67 = 1.005 → clamp）
    runTicks(62); // 共 65
    expect(String(build.warmup)).toBe("0.9750000000000008");
    expect(String(build.progressRef)).toBe("128.70000000000007");
    runTicks(1); // 66
    expect(String(build.warmup)).toBe("0.9900000000000008");
    expect(String(build.progressRef)).toBe("132.66000000000008");
    runTicks(1); // 67
    expect(build.warmup).toBe(1);
    expect(String(build.progressRef)).toBe("136.66000000000008");

    // tick 194 / 195 / 196 —— 最后一次「未达标」与达标那一 tick
    runTicks(127); // 共 194
    expect(String(build.progressRef)).toBe("644.6600000000001");
    expect(conv.items.total()).toBe(0);
    runTicks(1); // 195
    expect(String(build.progressRef)).toBe("648.6600000000001");
    expect(build.progressRef).toBeLessThan(650);
    expect(conv.items.total()).toBe(0);
    // `progress()` 归一化（Drill.java:327-330）
    expect(build.progress()).toBe(648.6600000000001 / 650);
    runTicks(1); // 196 —— 达标并 `progressRef %= delay`
    expect(conv.items.total()).toBe(1);
  });

  test("`dump` 定时器与 `offload` 的配合: 钻头库存始终为 0（产物全部给邻居）", () => {
    const { build, conv } = buildRig("d-rig-dump");

    runTicks(400);
    // tick 196 与 tick 358（+162.5 = 650/4）共 2 个物品产出
    expect(conv.items.total()).toBe(2);
    expect(build.items.total()).toBe(0);
    expect(build.timeDrilled).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------
// ④b `offload` 的回退分支: 没有邻居时进自己库存
// ---------------------------------------------------------------------------------------

describe("drill: 无邻居时 `offload` 回退到自身库存（BuildingComp.java:1006-1020）", () => {
  test("孤立的 2×2 钻头: tick 196 把第一个铜矿收进自己的 `items`", () => {
    createWorld(20, 20, 1);
    const drill = makeMechanicalDrill("d-alone");
    for(const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5]] as const){
      setOre(x, y, Blocks.oreCopper);
    }
    const build = placeDrill(4, 4, drill);

    expect(build.proximity.length).toBe(0);
    expect(build.items.total()).toBe(0);

    runTicks(195);
    expect(build.items.total()).toBe(0);

    runTicks(1); // tick 196
    expect(build.items.total()).toBe(1);
    expect(build.items.first()).toBe(Items.copper);

    // 库存上限: itemCapacity = 10；持续产出到满之后 `shouldConsume()` 变 false → 停摆
    runTicks(2000);
    expect(build.items.total()).toBe(10);
    expect(build.shouldConsume()).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------
// ⑤ 确定性
// ---------------------------------------------------------------------------------------

describe("drill: 确定性（硬断言 #6）", () => {
  test("两次相同布景 + 相同 tick → `snapshot()` 与关键状态串都完全相等", () => {
    /** 把钻头的**关键状态**也串进比较（否则「相等」可能只是因为两边都空）。 */
    function stateString(build: DrillBuild, conv: ConveyorView): string{
      return [
        build.dominantItems,
        build.dominantItem?.name ?? "null",
        build.progressRef,
        build.warmup,
        build.timeDrilled,
        build.lastDrillSpeed,
        build.items.total(),
        conv.items.total(),
        conv.ys[0],
        conv.xs[0],
        conv.ids[0]?.name ?? "null"
      ].join("|");
    }

    function runFresh(): { snap: string; state: string }{
      const { build, conv } = buildRigFresh();
      runTicks(200);
      return { snap: snapshot(), state: stateString(build, conv) };
    }

    const a = runFresh();
    const b = runFresh();

    expect(a.snap).toBe(b.snap);
    expect(a.state).toBe(b.state);
    // 状态串不是「两边都是空」的假相等: 200 tick 后传送带确实持有 1 个铜
    expect(a.state).toContain("copper");
    expect(a.state).toContain("|1|");
    // 快照不是空的: 200 tick 已生效、2 个建筑在组里、双方块名都进了快照
    expect(a.snap).toContain("tick=200");
    expect(a.snap).toContain("build=2");
    // ⚠️ 名字是测试专用的 `"d-fresh"`（不能叫 `"mechanical-drill"` —— 会与 `Blocks.load()`
    //    注册的真实内容撞名，见 `makeMechanicalDrill` 上方的说明）。
    expect(a.snap).toContain("block=d-fresh");
    expect(a.snap).toContain("block=conveyor");
  });
});

/** 与 `buildRig` 同构，但每次都是**全新**的世界（供确定性用例使用）。 */
function buildRigFresh(): { build: DrillBuild; conv: DrillBuild & ConveyorView }{
  createWorld(20, 20, 1);
  const drill = makeMechanicalDrill("d-fresh");
  for(const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5]] as const){
    setOre(x, y, Blocks.oreCopper);
  }
  const build = placeDrill(4, 4, drill);
  placeBlock(6, 4, Blocks.conveyor, 0);
  build.updateProximity();
  return { build, conv: Vars.world.tile(6, 4)!.build as DrillBuild & ConveyorView };
}

// ---------------------------------------------------------------------------------------
// ⑥ 反事实（字段级；源码级「改坏 → 变红 → 复原」的实测输出见交付报告）
// ---------------------------------------------------------------------------------------

describe("drill: 反事实（突变必须被观测到）", () => {
  test("`tier` 从 2 降为 1 → coal(2)/titanium(3) 都不可挖，copper(1) 仍可挖", () => {
    createWorld(16, 16, 1);
    const drill = makeMechanicalDrill("d-cf-tier");
    const t = (x: number, y: number): Tile => Vars.world.tile(x, y)! as Tile;
    setOre(2, 2, Blocks.oreCopper);
    setOre(2, 3, Blocks.oreCoal);
    setOre(2, 4, Blocks.oreTitanium);

    expect(drill.canMine(t(2, 2))).toBe(true);
    expect(drill.canMine(t(2, 3))).toBe(true); // hardness 2 <= tier 2
    expect(drill.canMine(t(2, 4))).toBe(false);

    drill.tier = 1;
    expect(drill.canMine(t(2, 2))).toBe(true);
    expect(drill.canMine(t(2, 3))).toBe(false); // 变红点
    expect(drill.canMine(t(2, 4))).toBe(false);

    drill.tier = 2; // 复原
    expect(drill.canMine(t(2, 3))).toBe(true);
  });

  test("`warmupSpeed` 改值 → 首个物品的 tick 必须前移（证明它真的参与时序）", () => {
    // 基线: warmupSpeed = 0.015（Java 默认）→ tick 196
    const baseline = (() => {
      const { conv } = buildRigFresh();
      return firstItemTick(conv, 300);
    })();
    expect(baseline).toBe(196);

    // 改坏: 把 warmupSpeed 翻倍 → 转速更快 → 提前达标（且 tick 数必须严格减小）
    const faster = (() => {
      createWorld(20, 20, 1);
      const drill = makeMechanicalDrill("d-cf-warm");
      drill.warmupSpeed = 0.03;
      for(const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5]] as const){
        setOre(x, y, Blocks.oreCopper);
      }
      const build = placeDrill(4, 4, drill);
      placeBlock(6, 4, Blocks.conveyor, 0);
      build.updateProximity();
      return firstItemTick(Vars.world.tile(6, 4)!.build as unknown as ItemSink, 300);
    })();

    expect(faster).toBeLessThan(baseline);
    expect(faster).toBeGreaterThan(0);

    // 复原验证: 再用默认值跑一次，仍是 196
    const again = (() => {
      const { conv } = buildRigFresh();
      return firstItemTick(conv, 300);
    })();
    expect(again).toBe(196);
  });

  test("`drillTime` 改值 → 首个物品的 tick 近似线性前移（650 → 325 应约减半）", () => {
    const half = (() => {
      createWorld(20, 20, 1);
      const drill = makeMechanicalDrill("d-cf-time");
      drill.drillTime = 275; // 与默认 600 一起使 delay = 275 + 50 = 325（恰为 650 的一半）
      for(const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5]] as const){
        setOre(x, y, Blocks.oreCopper);
      }
      const build = placeDrill(4, 4, drill);
      placeBlock(6, 4, Blocks.conveyor, 0);
      build.updateProximity();
      return firstItemTick(Vars.world.tile(6, 4)!.build as unknown as ItemSink, 300);
    })();

    expect(half).toBeLessThan(196);
    expect(half).toBeGreaterThan(0);
  });
});
