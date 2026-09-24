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
import arc.util.*;
import mindustry.*;
import mindustry.content.*;
import mindustry.core.GameState.State;
import mindustry.game.*;
import mindustry.type.*;
import mindustry.world.*;
import mindustry.world.blocks.distribution.Conveyor.ConveyorBuild;
import mindustry.world.blocks.distribution.Router.RouterBuild;
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
}
