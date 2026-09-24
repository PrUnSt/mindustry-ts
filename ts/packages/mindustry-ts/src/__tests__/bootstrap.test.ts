// S3 子步 1（bootstrap）验收测试。
//
// 覆盖的陷阱:
//   #1  `Vars` 初始化顺序（`content` 必须先于任何 `Content` 构造）
//   #2  `Blocks.air` 自举（`air` 必须是第 0 条，且 `Floor.wall/decoration` 被纠正为自身）
//   #8  `ContentType` ordinal 顺序 + `ContentLoader` 按 ordinal 建表 + id 线性
//   #9  `Team` 的 `static{}` 块必须填满 `Team.all[0..255]`
//   #10 `Rules.env` 的默认值来自 `game/defaults.ts`（不形成 `Vars ↔ Rules` 环）
//
// 反事实测试（见文件末尾 `bootstrap: 同名内容必须被拒绝`）: 若 `handleMappableContent`
// 的重名检测失效，该用例会失败。

import { beforeAll, describe, expect, test } from "vitest";
import { Vars } from "../Vars.js";
import { Blocks } from "../content/Blocks.js";
import { Items } from "../content/Items.js";
import { Liquids } from "../content/Liquids.js";
import { ContentType } from "../ctype/ContentType.js";
import { Team } from "../game/Team.js";
import { defaultEnv } from "../game/defaults.js";
import { Groups } from "../gen/Groups.js";
import { Item } from "../type/Item.js";
import { Color } from "../arc-compat/Color.js";

/** 内容引导只跑一次（多个 `describe` 共享）。 */
beforeAll(() => {
  Vars.bootstrap();
});

describe("bootstrap: 全局模块就绪", () => {
  test("Vars.content / state / world / collisions / net 均已创建且非空", () => {
    expect(Vars.content).toBeDefined();
    expect(Vars.state).toBeDefined();
    expect(Vars.world).toBeDefined();
    expect(Vars.collisions).toBeDefined();
    expect(Vars.net.active()).toBe(false);
    expect(Vars.headless).toBe(true);
  });

  test("常量与 Java 逐字一致（陷阱 #1/#10）", () => {
    expect(Vars.tilesize).toBe(8);
    expect(Vars.darkRadius).toBe(4);
    expect(Vars.maxBlockSize).toBe(16);
    expect(Vars.finalWorldBounds).toBe(250);
    // 陷阱 #10: Rules.env 与 Vars.defaultEnv 都来自叶子模块 `game/defaults.ts`
    expect(Vars.defaultEnv).toBe(defaultEnv);
    expect(Vars.state.rules.env).toBe(defaultEnv);
    expect(defaultEnv).toBeTypeOf("number");
  });

  test("Groups.init() 已建好全部 10 个 group（`Groups.update()` 依赖它们非空）", () => {
    expect(Groups.all).toBeInstanceOf(Object);
    for(const group of [
      Groups.all,
      Groups.effect,
      Groups.player,
      Groups.bullet,
      Groups.unit,
      Groups.build,
      Groups.sync,
      Groups.draw,
      Groups.weather,
      Groups.powerGraph
    ]){
      expect(group).not.toBeNull();
      expect(group.size()).toBe(0);
    }
  });
});

describe("bootstrap: 内容 id 与注册表（陷阱 #2/#8）", () => {
  test("Blocks.air.id === 0 且是第 0 个 block", () => {
    expect(Blocks.air.id).toBe(0);
    expect(Vars.content.blocks().get(0)).toBe(Blocks.air);
    expect(Vars.content.block(0)).toBe(Blocks.air);
    expect(Vars.content.block("air")).toBe(Blocks.air);
  });

  test("每个类型内的 id 严格等于下标（ContentLoader.logContent 的硬校验）", () => {
    // 直接用生产代码的自检：id 不线性会抛错。
    expect(() => Vars.content.logContent()).not.toThrow();
  });

  test("`ContentType` 共 18 项且顺序与 Java 一致（陷阱 #8）", () => {
    expect(ContentType.all.length).toBe(18);
    expect(ContentType.all[0]).toBe(ContentType.item);
    expect(ContentType.all[1]).toBe(ContentType.block);
    expect(ContentType.all[4]).toBe(ContentType.liquid);
    expect(ContentType.all[17]).toBe(ContentType.unitStance);
  });

  test("air 的自举纠正是显式的：wall / decoration 都指向自身（陷阱 #2）", () => {
    expect(Blocks.air.isFloor()).toBe(true);
    expect(Blocks.air.wall).toBe(Blocks.air);
    expect(Blocks.air.decoration).toBe(Blocks.air);
    expect(Blocks.air.isHidden()).toBe(true);
  });

  test("Floor.init() 的 name+'-wall' 查表真的命中（stone -> stone-wall）", () => {
    expect(Blocks.stone.wall).toBe(Blocks.stoneWall);
    // 查不到的保持 air（Java: `if(wall == null) wall = Blocks.air;`）
    expect(Blocks.air.wall).toBe(Blocks.air);
  });

  test("22 个物品已按 Java 顺序创建；11 种液体已按 Java 的 load 顺序创建（S4）", () => {
    expect(Vars.content.items().size).toBe(22);
    expect(Items.copper.id).toBe(0);
    expect(Vars.content.item("copper")).toBe(Items.copper);

    // ⚠️ S3 这里断言的是 `liquids().size === 0`（当时 `Liquids.load()` 是空的）。
    // S4 起液体是真实内容（见 `content/Liquids.ts`），**不能**把断言改成另一个写死的
    // 数字了事 —— 那样只能抓「数量变了」而抓不到「注册表坏了」。改为钉死三条真正的不变量:
    //   ① 每个液体的 id 严格等于下标（`ContentLoader.logContent()` 的同一判据）；
    //   ② 名字表与索引表**双向一致**（重复注册 / 漏注册 / 顺序错位都会红）；
    //   ③ Java `load()` 的**顺序锚点**: water 必须是 0、cyanogen 必须是 10
    //      （顺序错了 → 液体的 id 全部错位，而 `ContentType.liquid` 的 id 是线性语义）。
    const liquids = Vars.content.liquids();
    expect(liquids.size).toBeGreaterThanOrEqual(11);
    for(let i = 0; i < liquids.size; i++){
      const liquid = liquids.get(i)!;
      expect(liquid.id, "liquid[" + i + "]").toBe(i);
      expect(Vars.content.liquid(liquid.name), liquid.name).toBe(liquid);
    }
    expect(Liquids.water.id).toBe(0);
    expect(Vars.content.liquid("water")).toBe(Liquids.water);
    expect(Liquids.cyanogen.id).toBe(10);
    expect(Vars.content.liquid("cyanogen")).toBe(Liquids.cyanogen);
  });

  test("方块集合覆盖 S3/S4 的最小集；air 在第 0 位，且 id / 名字表双向一致", () => {
    // ⚠️ S3 这里是一个写死的 `blocks().size === 6`。S4 新增了 4 个环境地板 + 6 个矿石
    //    （见 `content/Blocks.ts` 的文件头），数量会持续增长 → 断言改成「下限 + 不变量」:
    //      ① `air.id === 0` 且在索引 0（硬约束，`Tile` 构造器与 `Floor` 初值都依赖它）；
    //      ② 每个方块 id === 下标、名字表与索引表双向一致 —— 这才是「注册表坏了」的判据
    //         （重复注册会被 `ContentLoader` 拒绝，但「漏调 load()」「顺序写错」只有它能抓）；
    //      ③ 逐名列举 S3/S4 的全部方块，确保不是「数量对但内容错」。
    const blocks = Vars.content.blocks();
    expect(blocks.size).toBeGreaterThanOrEqual(15);
    expect(Blocks.air.id).toBe(0);
    expect(blocks.get(0)).toBe(Blocks.air);

    for(let i = 0; i < blocks.size; i++){
      const block = blocks.get(i)!;
      expect(block.id, "block[" + i + "]").toBe(i);
      expect(Vars.content.block(block.name), block.name).toBe(block);
    }

    for(const name of [
      // S3 的 6 个
      "air", "stone", "stone-wall", "copper-wall", "conveyor", "router",
      // S4 的 9 个（4 个环境地板 + 6 个矿石；注意沙地的内部名是 "sand-floor"）
      "sand-floor", "grass", "snow",
      "ore-copper", "ore-lead", "ore-scrap", "ore-coal", "ore-titanium", "ore-thorium"
    ]){
      expect(Vars.content.block(name), name).not.toBeNull();
    }
  });

  test("getByID 越界返回 null（Java `id >= size || id < 0`）", () => {
    expect(Vars.content.block(-1)).toBeNull();
    expect(Vars.content.block(9999)).toBeNull();
    expect(Vars.content.getByID(ContentType.block, 1)).toBe(Blocks.stone);
  });
});

describe("bootstrap: Vars.init() 的收尾（陷阱 #1）", () => {
  test("emptyTile 由 ContentInitEvent 监听器赋值（Java `Short.MAX_VALUE - 20`）", () => {
    expect(Vars.emptyTile).not.toBeNull();
    expect(Vars.emptyTile!.x).toBe(32767 - 20);
    expect(Vars.emptyTile!.y).toBe(32767 - 20);
    // emptyTile 是 air tile，且它的地板/方块都指向 Blocks.air
    expect(Vars.emptyTile!.block()).toBe(Blocks.air);
    expect(Vars.emptyTile!.floor()).toBe(Blocks.air.asFloor());
  });

  test("world 还是 0x0（未 loadGenerator），tile() 恒 null", () => {
    expect(Vars.world.width()).toBe(0);
    expect(Vars.world.height()).toBe(0);
    expect(Vars.world.tile(0, 0)).toBeNull();
    expect(Vars.world.build(0, 0)).toBeNull();
  });
});

describe("bootstrap: Team 的 static{} 块（陷阱 #9）", () => {
  test("Team.all 的 256 个槽位全部被填满", () => {
    expect(Team.all.length).toBe(256);
    for(let i = 0; i < 256; i++){
      expect(Team.all[i], "Team.all[" + i + "]").toBeDefined();
    }
  });

  test("Team.get(id) 对任意 id 都返回一个队伍（含负数与 >255 的截断语义）", () => {
    expect(Team.get(0)).toBe(Team.derelict);
    expect(Team.get(1)).toBe(Team.sharded);
    expect(Team.get(2)).toBe(Team.crux);
    // Java: `all[((byte)id) & 0xff]` —— -1 → (byte)-1 = -1 → & 0xff = 255
    expect(Team.get(-1)).toBe(Team.all[255]);
    expect(Team.get(256)).toBe(Team.all[0]);
    expect(Team.get(7)).toBe(Team.all[7]);
  });

  test("占位队伍存在（id 7..255），且队伍名与 Java 规则一致", () => {
    expect(Team.all[7]!.name).toBe("team#7");
    expect(Team.all[255]!.name).toBe("team#255");
    expect(Team.neoplastic.ignoreUnitCap).toBe(true);
  });

  test("baseTeams[0..5] 已被前 6 支队伍填满", () => {
    expect(Team.baseTeams.length).toBe(6);
    expect(Team.baseTeams[0]).toBe(Team.derelict);
    expect(Team.baseTeams[1]).toBe(Team.sharded);
    expect(Team.baseTeams[5]).toBe(Team.blue);
  });
});

describe("bootstrap: 反事实测试 —— 同名内容必须被拒绝", () => {
  test("重复注册 'copper' 抛错，且不污染注册表（Java `handleMappableContent`）", () => {
    const before = Vars.content.items().size;

    expect(() => new Item("copper", Color.valueOf("ffffff"))).toThrowError(
      /Two content objects defined with the same name: 'copper'/
    );

    // Java 的语义：非法内容会从 contentMap 里被 pop 掉，名字表也不会写入。
    expect(Vars.content.items().size).toBe(before);
    expect(Vars.content.item("copper")).toBe(Items.copper);
  });
});
