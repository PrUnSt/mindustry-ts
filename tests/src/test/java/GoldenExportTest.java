// ③ golden 快照导出器（Java 原版侧）。
//
// 目的：把**原版**的关键运行时行为录成确定性文本，固化进仓库（`ts/golden/`），
// 供 TS 侧对拍 —— 这样「Java 源码」就不再是 TS 唯一的参照系，ground truth 变成可执行的文件。
//
// 场景与 TS 侧 `ts/packages/mindustry-ts/src/__tests__/conveyor-router.test.ts` **完全同形**：
//   16×16 全 air 世界 → conveyor(1,2)r0 / conveyor(2,2)r0 / conveyor(3,2)r0 / router(4,2)r0
//   → 向 (2,2) 注入 1 个铜（source = (1,2)）→ 逐 tick 记录可观测状态。
//
// ⚠️ 三条必须知道的对齐约定（对拍能否成立全看它们）:
//
//  1. **步长对齐**：Java 的 `Time.delta` 由 `setDeltaProvider` 决定，这里固定为 `1f`；
//     TS 的 `Time.delta = min(graphics.getDeltaTime() * 60, 3)`，headless 下 MockGraphics
//     固定 `1/60` → 也是 `1`。两边一致，方块行为（`edelta = efficiency * Time.delta`）可比。
//
//  2. **不比较 `state.tick`**：`Logic.update()` 里两边都写
//     `state.tick += Core.graphics.getDeltaTime() * 60`，但 headless 的 `getDeltaTime()`
//     在两侧取值不同（TS 的 MockGraphics 恒 1/60 → 每帧 +1；Java 的 HeadlessGraphics
//     不是 1/60）。所以 golden **只记录 Time.delta 驱动的量**，不记录 tick。
//
//  3. **浮点会不同**：TS 的 number 是 64 位 double，Java 的 float 是 32 位。
//     `0.035` 累加 29 次的尾数必然分叉（TS 侧实测 `0.9450000000000006`）。
//     → golden 记录 Java 的原始 float 值，**TS 侧比对时必须带容差**（见 ts 侧对拍测试）。
//
// 跑法：./gradlew :tests:test --tests GoldenExportTest

import arc.math.Mathf;
import arc.struct.*;
import arc.util.*;
import mindustry.*;
import mindustry.content.*;
import mindustry.core.GameState.State;
import mindustry.entities.bullet.*;
import mindustry.game.*;
import mindustry.gen.*;
import mindustry.type.*;
import mindustry.world.*;
import mindustry.world.blocks.distribution.Conveyor.ConveyorBuild;
import mindustry.world.blocks.distribution.Router.RouterBuild;
import mindustry.world.blocks.production.Drill.DrillBuild;
import mindustry.world.blocks.storage.CoreBlock.CoreBuild;
import mindustry.world.blocks.defense.turrets.*;
import org.junit.jupiter.api.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;

import static mindustry.Vars.*;

public class GoldenExportTest{

    /**
     * 输出目录：TS 工作区的 golden 目录。
     *
     * ⚠️ `:tests` 的测试任务在根 `build.gradle:460` 设了 `workingDir = "../core/assets"`,
     * 所以这里要上溯两层（`core/assets` → `core` → 仓库根）才到 `ts/golden`。
     * 同一约定可见 `ApplicationTests` 的 `new Fi("../../tests/build/test_data")`。
     */
    static final Path OUT = Paths.get("..", "..", "ts", "golden").toAbsolutePath().normalize();

    @BeforeAll
    static void init(){
        // 复用原版自己的应用启动逻辑（Vars.init / createBaseContent / createModContent / content.init）
        ApplicationTests.launchApplication();
    }

    @BeforeEach
    void reset(){
        // 对齐 TS 的 Time.delta（见文件头第 1 条）
        Time.setDeltaProvider(() -> 1f);
    }

    /** 对应 `ts/packages/mindustry-ts/src/harness.ts` 的 `createWorld(w, h, seed)`。 */
    static void createWorld(int w, int h, long seed){
        logic.reset();
        state.set(State.playing);
        Time.clear();
        // ⚠️ `Time.clear()` 只清延时队列，**不重置 `Time.time`**；`Time.time` 是跨测试累积的全局量，
        // 部分行为（如 exportTurretFire 的首次开火时机）会受它影响。这里显式归零，
        // 让每个场景与「独立 JVM 运行」等价，从而与已入库 golden 逐字节一致。
        Time.setInternalTime(0);
        Mathf.rand.setSeed(seed);
        world.loadGenerator(w, h, tiles -> tiles.fill());
    }

    static ConveyorBuild putConveyor(int x, int y, int rot){
        Tile tile = world.tile(x, y);
        tile.setBlock(Blocks.conveyor, Team.sharded, rot);
        return (ConveyorBuild)tile.build;
    }

    static RouterBuild putRouter(int x, int y, int rot){
        Tile tile = world.tile(x, y);
        tile.setBlock(Blocks.router, Team.sharded, rot);
        return (RouterBuild)tile.build;
    }

    static DrillBuild putDrill(int x, int y, int rot){
        Tile tile = world.tile(x, y);
        tile.setBlock(Blocks.mechanicalDrill, Team.sharded, rot);
        return (DrillBuild)tile.build;
    }

    static CoreBuild putCore(Block block, int x, int y, int rot){
        Tile tile = world.tile(x, y);
        tile.setBlock(block, Team.sharded, rot);
        return (CoreBuild)tile.build;
    }

    /**
     * 铺铜矿 overlay。`countOre` 走的是 `tile.getLinkedTilesAs(block, ...)`，
     * 即方块 2×2 覆盖区（sizeOffset=0 时就是主格与 +x/+y 三格），所以必须铺满整个覆盖区。
     */
    static void setOre(int x, int y){
        world.tile(x, y).setOverlay(Blocks.oreCopper);
    }

    /** 场景 A/B 共用的 10 列行；`c1 == null` 表示「无出口」子场景，传送带三列恒为 0/null/0。 */
    static void appendDrillRow(StringBuilder sb, int t, DrillBuild d, ConveyorBuild c1, ConveyorBuild c2){
        sb.append(t).append('|')
          .append(itemName(d.dominantItem)).append('|')
          .append(d.dominantItems).append('|')
          .append(d.progress).append('|')
          .append(d.warmup).append('|')
          .append(d.lastDrillSpeed).append('|')
          .append(d.items.total()).append('|');
        if(c1 == null){
            sb.append(0).append("|null|").append(0);
        }else{
            sb.append(c1.len).append('|');
            if(c1.len > 0) sb.append(c1.ys[0]); else sb.append("null");
            sb.append('|').append(c2.len);
        }
        sb.append('\n');
    }

    /**
     * 核心入库共用的 6 列行。`acceptItem(null, item)` 是直接探针：
     * CoreBuild.acceptItem 只看 `items.get(item) < storageCapacity`，不使用 source，因此传 null 安全。
     */
    static void appendCoreRow(StringBuilder sb, int t, CoreBuild core){
        sb.append(t).append('|')
          .append(core.items.get(Items.copper)).append('|')
          .append(core.items.get(Items.lead)).append('|')
          .append(core.items.total()).append('|')
          .append(core.acceptItem(null, Items.copper)).append('|')
          .append(core.acceptItem(null, Items.lead)).append('\n');
    }

    static String itemName(Item item){
        return item == null ? "null" : item.name;
    }

    static void write(String name, String content) throws IOException{
        Files.createDirectories(OUT);
        Files.write(OUT.resolve(name), content.getBytes(StandardCharsets.UTF_8));
        System.out.println("[golden] wrote " + OUT.resolve(name));
    }

    /**
     * 场景 1：传送带链 + 路由器。
     * 对照 TS 的 `conveyor-router.test.ts > 「copper 在 tick 29 离开第 2 格、在 tick 57 进入路由器」`。
     */
    @Test
    void exportConveyorChain() throws IOException{
        createWorld(16, 16, 1);

        ConveyorBuild feeder = putConveyor(1, 2, 0);
        ConveyorBuild c1 = putConveyor(2, 2, 0);
        ConveyorBuild c2 = putConveyor(3, 2, 0);
        RouterBuild router = putRouter(4, 2, 0);

        // 首端放入 1 个铜（source 在正后方 → direction 0）
        c1.handleItem(feeder, Items.copper);

        StringBuilder sb = new StringBuilder();
        sb.append("# java golden · conveyor chain\n");
        sb.append("# world: 16x16 all-air, seed=1, Time.delta=1\n");
        sb.append("# layout: conveyor(1,2)r0 conveyor(2,2)r0 conveyor(3,2)r0 router(4,2)r0\n");
        sb.append("# item: copper, injected into (2,2) with source (1,2)\n");
        sb.append("# columns: tick|len1|ys1_0|xs1_0|item1|len2|ys2_0|xs2_0|item2|routerTotal\n");
        sb.append("0|").append(c1.len).append('|').append(c1.ys[0]).append('|').append(c1.xs[0]).append('|')
          .append(itemName(c1.ids[0])).append('|')
          .append(c2.len).append('|').append(c2.ys[0]).append('|').append(c2.xs[0]).append('|')
          .append(itemName(c2.ids[0])).append('|')
          .append(router.items.total()).append('\n');

        for(int t = 1; t <= 60; t++){
            logic.update();
            sb.append(t).append('|')
              .append(c1.len).append('|').append(c1.ys[0]).append('|').append(c1.xs[0]).append('|')
              .append(itemName(c1.ids[0])).append('|')
              .append(c2.len).append('|').append(c2.ys[0]).append('|').append(c2.xs[0]).append('|')
              .append(itemName(c2.ids[0])).append('|')
              .append(router.items.total()).append('\n');
        }

        write("java-conveyor-chain.txt", sb.toString());
    }

    /**
     * 场景 2：路由器轮转投递（两个输出端 → A, B, A）。
     * 对照 TS 的 `conveyor-router.test.ts > 「两个输出端时轮流投递」`。
     */
    @Test
    void exportRouterRotation() throws IOException{
        createWorld(16, 16, 1);

        ConveyorBuild input = putConveyor(3, 2, 0);
        RouterBuild router = putRouter(4, 2, 0);
        putConveyor(4, 3, 1); // 输出 A
        putConveyor(4, 1, 3); // 输出 B

        ConveyorBuild outA = (ConveyorBuild)world.tile(4, 3).build;
        ConveyorBuild outB = (ConveyorBuild)world.tile(4, 1).build;

        StringBuilder sb = new StringBuilder();
        sb.append("# java golden · router rotation\n");
        sb.append("# world: 16x16 all-air, seed=1, Time.delta=1\n");
        sb.append("# layout: conveyor(3,2)r0[input] router(4,2)r0 conveyor(4,3)r1[outA] conveyor(4,1)r3[outB]\n");
        sb.append("# 3 copper fed one at a time; expected strict rotation A, B, A\n");
        sb.append("# columns: round|landedA|landedB\n");

        for(int round = 1; round <= 3; round++){
            router.handleItem(input, Items.copper);
            for(int t = 0; t < 40; t++){
                logic.update();
            }
            String landed = outA.len == 1 ? "A" : outB.len == 1 ? "B" : "none";
            sb.append(round).append('|').append(outA.len).append('|').append(outB.len)
              .append("  # landed=").append(landed).append('\n');

            // 清空，准备下一轮（与 TS 侧 feedOnce 的做法一致）
            outA.items.clear();
            outA.len = 0;
            for(int i = 0; i < outA.ids.length; i++) outA.ids[i] = null;
            outB.items.clear();
            outB.len = 0;
            for(int i = 0; i < outB.ids.length; i++) outB.ids[i] = null;
            router.items.clear();
            router.lastItem = null;
            logic.update();
        }

        write("java-router-rotation.txt", sb.toString());
    }

    /**
     * 场景 3：侧面输入 → xs 非零。
     * 对照 TS 的 `conveyor-router.test.ts > 「侧面输入给出非零 xs」`。
     */
    @Test
    void exportSideInput() throws IOException{
        createWorld(16, 16, 1);

        ConveyorBuild c1 = putConveyor(2, 2, 0);
        ConveyorBuild side = putConveyor(2, 3, 1);
        putConveyor(3, 2, 0);
        ConveyorBuild ahead = (ConveyorBuild)world.tile(3, 2).build;

        c1.handleItem(side, Items.copper);

        StringBuilder sb = new StringBuilder();
        sb.append("# java golden · side input (non-zero xs)\n");
        sb.append("# world: 16x16 all-air, seed=1, Time.delta=1\n");
        sb.append("# layout: conveyor(2,2)r0 conveyor(2,3)r1[side] conveyor(3,2)r0[ahead]\n");
        sb.append("# item: copper injected into (2,2) with source (2,3)\n");
        sb.append("# columns: tick|len1|ys1_0|xs1_0|aheadLen\n");
        sb.append("0|").append(c1.len).append('|').append(c1.ys[0]).append('|').append(c1.xs[0]).append('|')
          .append(ahead.len).append('\n');

        for(int t = 1; t <= 20; t++){
            logic.update();
            sb.append(t).append('|')
              .append(c1.len).append('|').append(c1.ys[0]).append('|').append(c1.xs[0]).append('|')
              .append(ahead.len).append('\n');
        }

        write("java-side-input.txt", sb.toString());
    }

    /**
     * 场景 4：内容表 —— 所有方块的 name 与 id，以及物品表。
     * 这是 ① 补玩法时的对照基准（TS 当前只有 15 个方块，差距一目了然）。
     */
    @Test
    void exportContentTable() throws IOException{
        StringBuilder sb = new StringBuilder();
        sb.append("# java golden · content table\n");
        sb.append("# blocks: ").append(content.blocks().size).append(", items: ").append(content.items().size)
          .append(", liquids: ").append(content.liquids().size).append('\n');
        sb.append("[items]\n");
        for(Item item : content.items()){
            sb.append(item.id).append('|').append(item.name).append('\n');
        }
        sb.append("[liquids]\n");
        for(Liquid liquid : content.liquids()){
            sb.append(liquid.id).append('|').append(liquid.name).append('\n');
        }
        sb.append("[blocks]\n");
        for(Block block : content.blocks()){
            sb.append(block.id).append('|').append(block.name)
              .append('|').append(block.health)
              .append('|').append(block.size).append('\n');
        }

        write("java-content-table.txt", sb.toString());
    }

    // -------------------------------------------------------------------------------------
    // 战斗基准（防御闭环：炮塔 → 子弹 → 单位 → 波次）
    // -------------------------------------------------------------------------------------

    /**
     * BulletType 不是 MappableContent、没有 name 字段（多数还是匿名内部类），
     * 因此用「第一个非匿名父类的简单名」作为稳定的类型标识（如 BasicBulletType）。
     */
    static String className(Object o){
        Class<?> c = o.getClass();
        while(c != null && c.getSimpleName().isEmpty()){
            c = c.getSuperclass();
        }
        return c == null ? "null" : c.getSimpleName();
    }

    /** 武器的 name 可能为 null（未命名武器），用 "null" 占位以保持列数固定。 */
    static String weaponName(Weapon w){
        return w.name == null ? "null" : w.name;
    }

    /**
     * 场景 5：单位表。
     * 对应 TS 侧「单位类型表」：TS 的 UnitType 需要逐字段复刻原版 `content.units()`（62 个）。
     * 比对注意：health/speed/hitSize/armor 是 32 位 float，TS 侧带容差；weapons 是初始化后的最终列表。
     */
    @Test
    void exportUnitTable() throws IOException{
        StringBuilder sb = new StringBuilder();
        sb.append("# java golden · unit table\n");
        sb.append("# source: content.units() (all UnitType), ").append(content.units().size).append(" units\n");
        sb.append("# columns: name|health|speed|hitSize|armor|flying|weaponCount|weaponNames(comma)\n");

        for(UnitType u : content.units()){
            sb.append(u.name).append('|')
              .append(u.health).append('|')
              .append(u.speed).append('|')
              .append(u.hitSize).append('|')
              .append(u.armor).append('|')
              .append(u.flying).append('|')
              .append(u.weapons.size).append('|');
            for(int i = 0; i < u.weapons.size; i++){
                if(i > 0) sb.append(',');
                sb.append(weaponName(u.weapons.get(i)));
            }
            sb.append('\n');
        }

        write("java-unit-table.txt", sb.toString());
    }

    /**
     * 场景 6：炮塔表。
     * 对应 TS 侧「炮塔定义」：TS 的炮塔方块需要复刻原版 name/health/size/range/reload/category，
     * 以及 ItemTurret 的 ammoTypes（弹药 → 子弹类型）。
     * 比对注意：range/reload 是 float；ammoBullets 仅供存在性/顺序对照。
     */
    @Test
    void exportTurretTable() throws IOException{
        StringBuilder sb = new StringBuilder();
        sb.append("# java golden · turret table\n");
        sb.append("# source: content.blocks() where attacks == true (all BaseTurret subclasses)\n");
        sb.append("# columns: name|health|size|range|reload|category|ammoBullets(comma, only ItemTurret)\n");

        int count = 0;
        for(Block b : content.blocks()){
            if(!b.attacks) continue;
            count++;

            float range = b instanceof BaseTurret bt ? bt.range : -1f;
            float reload = b instanceof ReloadTurret rt ? rt.reload : -1f;

            sb.append(b.name).append('|')
              .append(b.health).append('|')
              .append(b.size).append('|')
              .append(range).append('|')
              .append(reload).append('|')
              .append(b.category.name()).append('|');

            if(b instanceof ItemTurret it){
                boolean first = true;
                for(BulletType t : it.ammoTypes.values()){
                    if(!first) sb.append(',');
                    sb.append(className(t));
                    first = false;
                }
            }
            sb.append('\n');
        }

        sb.append("# total turrets: ").append(count).append('\n');
        write("java-turret-table.txt", sb.toString());
    }

    /**
     * 场景 7：子弹表。
     * 对应 TS 侧「子弹类型」：TS 的 BulletType 需要复刻原版这些核心字段，
     * 决定命中判定与伤害（collidesAir/Ground、hitSize、pierce、lifetime、speed、damage）。
     * 比对注意：均为 32 位 float，TS 侧带容差；name 为空的匿名子弹以非匿名父类名代替。
     */
    @Test
    void exportBulletTable() throws IOException{
        // 收集所有炮塔实际使用的 BulletType（去重）；用 id 排序保证输出与哈希顺序无关、逐字节确定。
        Seq<BulletType> bullets = new Seq<>();
        ObjectSet<BulletType> seen = new ObjectSet<>();

        for(Block b : content.blocks()){
            if(!(b instanceof BaseTurret)) continue;
            if(b instanceof ItemTurret it){
                for(BulletType t : it.ammoTypes.values()) if(t != null && seen.add(t)) bullets.add(t);
            }
            if(b instanceof LiquidTurret lt){
                for(BulletType t : lt.ammoTypes.values()) if(t != null && seen.add(t)) bullets.add(t);
            }
            if(b instanceof ContinuousLiquidTurret lt){
                for(BulletType t : lt.ammoTypes.values()) if(t != null && seen.add(t)) bullets.add(t);
            }
            if(b instanceof PayloadAmmoTurret pt){
                for(BulletType t : pt.ammoTypes.values()) if(t != null && seen.add(t)) bullets.add(t);
            }
            if(b instanceof PowerTurret pt && pt.shootType != null && seen.add(pt.shootType)) bullets.add(pt.shootType);
            if(b instanceof ContinuousTurret ct && ct.shootType != null && seen.add(ct.shootType)) bullets.add(ct.shootType);
        }
        bullets.sort();

        StringBuilder sb = new StringBuilder();
        sb.append("# java golden · bullet table\n");
        sb.append("# source: dedup(ammoTypes/shootType of all BaseTurret blocks), sorted by content id\n");
        sb.append("# count: ").append(bullets.size).append('\n');
        sb.append("# columns: name|speed|damage|lifetime|hitSize|pierce|collidesAir|collidesGround\n");

        for(BulletType t : bullets){
            sb.append(className(t)).append('|')
              .append(t.speed).append('|')
              .append(t.damage).append('|')
              .append(t.lifetime).append('|')
              .append(t.hitSize).append('|')
              .append(t.pierce).append('|')
              .append(t.collidesAir).append('|')
              .append(t.collidesGround).append('\n');
        }

        write("java-bullet-table.txt", sb.toString());
    }

    /**
     * 场景 8：炮塔开火行为。
     * 对应 TS 侧「炮塔 → 子弹」闭环：一名 duo 在固定位置锁定射程内的 dagger 并逐 tick 生成子弹、造成伤害。
     * 世界 32x32 seed=1，duo 在 (16,16) sharded，dagger 在 (21,16) crux（距离 5 格 < range 160）。
     * 逐 tick 记录 Groups.bullet.size / 首颗子弹坐标 / 目标 health，用于 TS 侧对齐「何时开火、子弹如何飞、伤害如何结算」。
     * 比对注意：tick 从 0 起（先记录再 update）；坐标/health 为 32 位 float，带容差；random（inaccuracy）由 seed 决定。
     */
    @Test
    void exportTurretFire() throws IOException{
        createWorld(32, 32, 1);
        state.rules.canGameOver = false;
        state.rules.waves = false;

        int tx = 16, ty = 16;
        world.tile(tx, ty).setBlock(Blocks.duo, Team.sharded, 0);
        ItemTurret.ItemTurretBuild turret = (ItemTurret.ItemTurretBuild)world.tile(tx, ty).build;

        // 装弹：使用 duo 的第一个弹药类型（copper），填满弹仓
        Item ammo = ((ItemTurret)Blocks.duo).ammoTypes.keys().next();
        for(int i = 0; i < 20; i++) turret.handleItem(null, ammo);

        // 射程内的敌方单位
        Unit enemy = UnitTypes.dagger.spawn(Team.crux, (tx + 5) * 8f + 4f, ty * 8f + 4f);
        float startHealth = enemy.health;

        StringBuilder sb = new StringBuilder();
        sb.append("# java golden · turret fire (duo -> dagger)\n");
        sb.append("# world: 32x32 all-air, seed=1, Time.delta=1, waves=false, canGameOver=false\n");
        sb.append("# turret: duo @ (16,16) rot=0 team=sharded, ammo=copper, range=160, reload=20\n");
        sb.append("# target: dagger @ (21,16) team=crux, startHealth=").append(startHealth).append('\n');
        sb.append("# note: bulletCount/firstBullet are raw Groups.bullet (includes the dagger's own bullets too)\n");
        sb.append("# columns: tick|bulletCount|firstBulletX|firstBulletY|enemyHealth\n");

        for(int t = 0; t <= 120; t++){
            Bullet first = Groups.bullet.isEmpty() ? null : Groups.bullet.first();
            sb.append(t).append('|')
              .append(Groups.bullet.size()).append('|')
              .append(first == null ? -1f : first.x).append('|')
              .append(first == null ? -1f : first.y).append('|')
              .append(enemy.health).append('\n');

            if(t < 120) logic.update();
        }

        write("java-turret-fire.txt", sb.toString());
    }

    /**
     * 场景 9：波次推进。
     * 对应 TS 侧「Spawner / 波次系统」：固定世界 + 固定 SpawnGroup，手动调用 logic.runWave() 推进 3 波，
     * 记录每波之后的 state.wave、场上单位数、单位类型聚合。
     * 注意：原版 runWave() 先 spawnEnemies() 再用 `state.wave - 1` 取缩放（state.wave 初始为 1），
     * 因此首波记录到的 wave 号是 2 —— 这是原版真实行为，TS 侧必须一致。
     * 比对注意：单位数为整数；聚合按类型名排序后统计，保证文本确定。
     */
    @Test
    void exportWave() throws IOException{
        createWorld(32, 32, 1);
        state.rules.canGameOver = false;
        state.rules.waves = true;
        state.rules.waveTimer = false;

        // 固定刷怪配置：每波 3 个 dagger
        state.rules.spawns.clear();
        SpawnGroup group = new SpawnGroup(UnitTypes.dagger);
        group.begin = 0;
        group.spacing = 1;
        group.unitAmount = 3;
        group.max = 100;
        state.rules.spawns.add(group);

        // 一个刷怪点（overlay=spawn），并让 spawner 重新扫描
        world.tile(2, 2).setOverlay(Blocks.spawn);
        spawner.reset();

        // 阻止 update() 里的自动 runWave 干扰手动推进
        state.wavetime = 99999f;

        StringBuilder sb = new StringBuilder();
        sb.append("# java golden · wave progression\n");
        sb.append("# world: 32x32 all-air, seed=1, Time.delta=1, canGameOver=false, waveTimer=false\n");
        sb.append("# spawn: overlay at (2,2); group = dagger x3 every wave, max=100\n");
        sb.append("# driver: logic.runWave() x3, 130 logic.update() between waves (spawn effects resolve)\n");
        sb.append("# note: vanilla runWave() spawns scaled by (state.wave - 1), so first recorded wave is 2\n");
        sb.append("# columns: wave|unitCount|unitTypes(name:count, sorted)\n");

        for(int i = 0; i < 3; i++){
            logic.runWave();
            for(int t = 0; t < 130; t++){
                logic.update();
            }

            // 按类型聚合并排序，保证输出确定
            Seq<String> names = new Seq<>();
            for(Unit u : Groups.unit) names.add(u.type.name);
            names.sort();

            StringBuilder agg = new StringBuilder();
            for(int k = 0; k < names.size; ){
                int j = k;
                while(j < names.size && names.get(j).equals(names.get(k))) j++;
                if(agg.length() > 0) agg.append(',');
                agg.append(names.get(k)).append(':').append(j - k);
                k = j;
            }

            sb.append(state.wave).append('|').append(Groups.unit.size()).append('|').append(agg).append('\n');
        }

        write("java-wave.txt", sb.toString());
    }

    // -------------------------------------------------------------------------------------
    // 生产闭环（采矿 → 传送 → 核心入库）
    // -------------------------------------------------------------------------------------

    /**
     * 场景 10：机械钻采矿（mechanical-drill 压铜矿）。
     * 对应 TS 侧「Drill / DrillBuild」：TS 需要复刻 countOre（dominantItem/dominantItems）、
     * warmup 爬升、progress 累积与满进度产出，以及产出时 offload 到邻居的行为。
     *
     * 布景：24x24 all-air seed=1；在 2×2 覆盖区 {(5,5),(6,5),(5,6),(6,6)} 铺 oreCopper overlay，
     * 使 countOre 得到确定的 dominantItem=copper、dominantItems=4。
     * ⚠️ countOre 遍历 tile.getLinkedTilesAs(block, ...)（sizeOffset=0 时即这 4 格），必须整块覆盖。
     *
     * 两条子场景（同一份列）：
     *  [A] 无出口：钻头没有任何收物品的邻居 → dump() 因 proximity 为空而 no-op，
     *      items.total() 单调累计（Block.itemCapacity=10）。任务要求记录到达 1/2/3 的精确 tick。
     *  [B] drill → conveyor(7,5)r0 → conveyor(8,5)r0：产出即被 offload 进 c1，
     *      记录 c1 收到物品的 tick 与「物品离开 c1 首格进入 c2」的精确 tick。
     */
    @Test
    void exportDrill() throws IOException{
        StringBuilder sb = new StringBuilder();
        sb.append("# java golden · mechanical drill (copper)\n");
        sb.append("# world: 24x24 all-air, seed=1, Time.delta=1, waves=false, canGameOver=false\n");
        sb.append("# drill: mechanical-drill @ (5,5) size=2 tier=2 drillTime=600 team=sharded, footprint (5,5)-(6,6)\n");
        sb.append("# ore: oreCopper overlay over the whole 2x2 footprint -> countOre: dominantItem=copper, dominantItems=4\n");
        sb.append("# delay: real drill time = (drillTime + hardnessDrillMultiplier*hardness) / drillMultiplier = (600 + 50*1) / 1 = 650\n");
        sb.append("# columns: tick|dominantItem|dominantItems|progress|warmup|lastDrillSpeed|itemsTotal|c1len|c1ys0|c2len\n");
        sb.append("#   c1 = conveyor(7,5)r0, c2 = conveyor(8,5)r0; c1ys0 = position 0..1 of c1's item, \"null\" when c1 is empty\n");

        // ---- [A] 无出口：items.total() 单调累计 ----
        createWorld(24, 24, 1);
        state.rules.waves = false;
        state.rules.canGameOver = false;
        for(int x = 5; x <= 6; x++){
            for(int y = 5; y <= 6; y++) setOre(x, y);
        }
        DrillBuild drillA = putDrill(5, 5, 0);

        sb.append("# [A] no outlet: nothing accepts items -> itemsTotal grows monotonically (Block.itemCapacity=10)\n");
        int[] firstAt = {-1, -1, -1, -1};
        for(int t = 0; t <= 600; t++){
            int total = drillA.items.total();
            for(int k = 1; k <= 3; k++){
                if(firstAt[k] < 0 && total >= k) firstAt[k] = t;
            }
            appendDrillRow(sb, t, drillA, null, null);
            if(t < 600) logic.update();
        }
        sb.append("# [A] exact ticks: 1st item @ tick ").append(firstAt[1])
          .append(", 2nd @ tick ").append(firstAt[2])
          .append(", 3rd @ tick ").append(firstAt[3])
          .append("; itemsTotal @ tick 600 = ").append(drillA.items.total()).append('\n');
        sb.append("#\n");

        // ---- [B] 接传送带：产出即 offload 进 c1 ----
        createWorld(24, 24, 1);
        state.rules.waves = false;
        state.rules.canGameOver = false;
        for(int x = 5; x <= 6; x++){
            for(int y = 5; y <= 6; y++) setOre(x, y);
        }
        DrillBuild drillB = putDrill(5, 5, 0);
        ConveyorBuild c1 = putConveyor(7, 5, 0);
        ConveyorBuild c2 = putConveyor(8, 5, 0);

        sb.append("# [B] drill -> conveyor(7,5)r0 -> conveyor(8,5)r0: the item is offloaded into c1 the same tick it is produced\n");
        int arrived = -1, departed = -1;
        for(int t = 0; t <= 600; t++){
            if(arrived < 0 && c1.len > 0) arrived = t;
            if(departed < 0 && c2.len > 0) departed = t;
            appendDrillRow(sb, t, drillB, c1, c2);
            if(t < 600) logic.update();
        }
        sb.append("# [B] c1 received its 1st item @ tick ").append(arrived)
          .append("; that item left c1 for c2 @ tick ").append(departed)
          .append(" (c1 is empty afterwards: the drill is far slower than the belt)\n");

        write("java-drill.txt", sb.toString());
    }

    /**
     * 场景 11：核心入库（conveyor → core-shard）。
     * 对应 TS 侧「CoreBuild / ItemModule 库存」：TS 需要复刻核心按物品类型分别计数的库存、
     * 以及 acceptItem 的「达到 storageCapacity 即拒收」语义。
     *
     * 布景：24x24 all-air seed=1；core-shard（size=3，sizeOffset=-1 → 主格是**中心**格）
     * 放在 (11,11)，footprint=(10,10)-(12,12)，team=sharded。
     * block.itemCapacity=4000，无 storage 邻居 → storageCapacity=4000。
     * 进料：feeder conveyor(8,10)r0 → conveyor(9,10)r0 → core（物品注入 (9,10)）。
     *
     * 两条子场景（同一份列）：
     *  [A] 正常接收：tick 0 注入 copper，tick 60 注入 lead，逐 tick 记录核心库存；
     *      物品先随传送带走 ~29 tick 才被核心接收。
     *  [B] 容量封顶：先用真实 handleItem 把 copper 填满到 storageCapacity，
     *      再验证 (1) 额外 handleItem 被 incinerate（不再入账）、(2) acceptItem(copper)=false，
     *      (3) 容量是「按物品类型」的 → lead 仍可入库，(4) 被拒的 copper 会堵在传送带上。
     *
     * ⚠️ 原版 `Rules.coreIncinerates` **默认 true**：此时 `CoreBuild.acceptItem` 恒为 true
     *    （`getMaximumAccepted` 返回 Integer.MAX_VALUE/2），超容量物品被焚烧而非拒收。
     *    因此两个子场景都显式 `coreIncinerates=false`，才能观测到「按类型封顶 + 拒收」。
     */
    @Test
    void exportCore() throws IOException{
        StringBuilder sb = new StringBuilder();
        sb.append("# java golden · core item intake (core-shard)\n");
        sb.append("# world: 24x24 all-air, seed=1, Time.delta=1, waves=false, canGameOver=false\n");
        sb.append("# rule: state.rules.coreIncinerates=false. Vanilla default is true: then CoreBuild.acceptItem always\n");
        sb.append("#       returns true (getMaximumAccepted returns Integer.MAX_VALUE/2) and overflow is incinerated.\n");
        sb.append("#       With it false, acceptItem(item) == (items.get(item) < storageCapacity); the cap is PER ITEM TYPE.\n");
        sb.append("# core: core-shard size=3 team=sharded, main tile (11,11) -> footprint (10,10)-(12,12);\n");
        sb.append("#       block.itemCapacity=4000, storageCapacity=4000 (no storage neighbours)\n");
        sb.append("# feed: feeder conveyor(8,10)r0 -> conveyor(9,10)r0 -> core; items injected into (9,10)\n");
        sb.append("# columns: tick|copper|lead|coreTotal|acceptCopper|acceptLead\n");

        // ---- [A] 正常接收 ----
        createWorld(24, 24, 1);
        state.rules.waves = false;
        state.rules.canGameOver = false;
        state.rules.coreIncinerates = false;
        CoreBuild coreA = putCore(Blocks.coreShard, 11, 11, 0);
        ConveyorBuild feedA = putConveyor(8, 10, 0);
        ConveyorBuild inA = putConveyor(9, 10, 0);
        inA.handleItem(feedA, Items.copper);

        sb.append("# [A] normal intake: copper injected @ tick 0, lead @ tick 60; each rides c(9,10) for ~29 ticks before the core takes it\n");
        int copperAt = -1, leadAt = -1;
        for(int t = 0; t <= 140; t++){
            if(copperAt < 0 && coreA.items.get(Items.copper) > 0) copperAt = t;
            if(leadAt < 0 && coreA.items.get(Items.lead) > 0) leadAt = t;
            if(t == 60) inA.handleItem(feedA, Items.lead);
            appendCoreRow(sb, t, coreA);
            if(t < 140) logic.update();
        }
        sb.append("# [A] core received copper @ tick ").append(copperAt).append(", lead @ tick ").append(leadAt).append('\n');
        sb.append("#\n");

        // ---- [B] 容量封顶 ----
        createWorld(24, 24, 1);
        state.rules.waves = false;
        state.rules.canGameOver = false;
        state.rules.coreIncinerates = false;
        CoreBuild coreB = putCore(Blocks.coreShard, 11, 11, 0);
        ConveyorBuild feedB = putConveyor(8, 10, 0);
        ConveyorBuild inB = putConveyor(9, 10, 0);

        int cap = coreB.storageCapacity;
        // 用真实路径把 copper 一件一件填到 storageCapacity（每次 handleItem 只加 1）
        for(int i = 0; i < cap; i++){
            coreB.handleItem(inB, Items.copper);
        }
        int filled = coreB.items.get(Items.copper);
        // 已达容量后再 handleItem 一件：CoreBuild.handleItem 命中 incinerate 分支，不再入账
        coreB.handleItem(inB, Items.copper);
        int afterOverflow = coreB.items.get(Items.copper);

        sb.append("# [B] capacity: storageCapacity=").append(cap)
          .append("; handleItem(copper) x").append(cap).append(" -> copper=").append(filled)
          .append("; one extra handleItem -> copper=").append(afterOverflow)
          .append(" (incinerated, no add); acceptCopper=").append(coreB.acceptItem(null, Items.copper)).append('\n');
        sb.append("# [B] the cap is per item type: lead injected @ tick 0 is accepted although copper is already full\n");
        sb.append("# [B] copper injected @ tick 60 is rejected by the core and parks at the end of c(9,10)\n");
        inB.handleItem(feedB, Items.lead);

        int leadAtB = -1, clogAt = -1;
        for(int t = 0; t <= 140; t++){
            if(leadAtB < 0 && coreB.items.get(Items.lead) > 0) leadAtB = t;
            if(t == 60) inB.handleItem(feedB, Items.copper);
            if(clogAt < 0 && t > 60 && inB.len > 0 && inB.ys[0] >= 1f) clogAt = t;
            appendCoreRow(sb, t, coreB);
            if(t < 140) logic.update();
        }
        sb.append("# [B] lead accepted @ tick ").append(leadAtB)
          .append("; copper held at ").append(coreB.items.get(Items.copper))
          .append(" (== cap), rejected copper parked on c(9,10) @ tick ").append(clogAt)
          .append(" with ys=").append(inB.len > 0 ? inB.ys[0] : -1f).append('\n');

        write("java-core.txt", sb.toString());
    }
}
