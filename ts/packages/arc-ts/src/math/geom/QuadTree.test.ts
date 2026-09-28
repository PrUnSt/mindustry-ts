// QuadTree 单元测试.
// 重写说明 (W2): QuadTree.ts 已把内部存储从「文件内本地 Seq」切换为 struct 的正式 Seq,
// 谓词/回调从对象式 { get(t) } 切换为 arc.func 的函数式 Cons/Boolf。本测试同步改用正式类型。
// 断言尽量钉死具体数值或具体对象身份 (toBe 为引用相等), 避免 toBeTruthy/toBeDefined 之类弱断言。
import {describe, expect, it} from 'vitest';
import {QuadTree} from './QuadTree';
import {Rect} from './Rect';
import {Seq} from '../../struct/Seq';

class Box implements QuadTree.QuadTreeObject{
    x: number;
    y: number;
    w: number;
    h: number;
    name: string;

    constructor(x: number, y: number, w: number, h: number, name = ''){
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.name = name;
    }

    hitbox(out: Rect): void{
        out.set(this.x, this.y, this.w, this.h);
    }
}

function makeTree(): QuadTree<Box>{
    return new QuadTree(new Rect(0, 0, 100, 100));
}

/** 收集全树对象的辅助函数 (用正式 Seq 作为 out). */
function collectAll(tree: QuadTree<Box>): Seq<Box>{
    const out = new Seq<Box>();
    tree.intersect(new Rect(0, 0, 100, 100), out);
    return out;
}

describe('QuadTree insert / intersect(收集式)', () => {
    it('insert 后 intersects 收集到恰好 [a, c] 两个对象 (身份相等)', () => {
        const tree = makeTree();
        const a = new Box(0, 0, 10, 10, 'a');
        const c = new Box(0, 20, 10, 10, 'c');
        const b = new Box(0, 90, 10, 10, 'b'); // y 在 [90,100), 查询 [0,35) 不覆盖
        tree.insert(a);
        tree.insert(c);
        tree.insert(b);

        // 单叶节点 (3 < maxObjectsPerNode)
        expect(tree.leaf).toBe(true);
        expect(tree.totalObjects).toBe(3);

        const out = new Seq<Box>();
        tree.intersect(new Rect(0, 0, 15, 35), out);
        expect(out.size).toBe(2);
        expect(out.items[0]).toBe(a);
        expect(out.items[1]).toBe(c);

        // x/y/width/height 形式应给出同一结果
        const out2 = new Seq<Box>();
        tree.intersect(0, 0, 15, 35, out2);
        expect(out2.size).toBe(2);
        expect(out2.items[0]).toBe(a);
        expect(out2.items[1]).toBe(c);

        // 全量查询: 恰好 3 个, 且按插入顺序
        const all = collectAll(tree);
        expect(all.size).toBe(3);
        expect(all.items[0]).toBe(a);
        expect(all.items[1]).toBe(c);
        expect(all.items[2]).toBe(b);
    });

    it('超过 maxObjectsPerNode(5) 触发 split, 四象限分布为精确计数', () => {
        const tree = makeTree();
        // 全部远离 x/y=50 中线, 保证不被边界歧义影响
        const br1 = new Box(65, 5, 5, 5);
        const br2 = new Box(65, 15, 5, 5);
        const tr1 = new Box(65, 65, 5, 5);
        const tr2 = new Box(65, 75, 5, 5);
        const bl1 = new Box(5, 5, 5, 5);
        tree.insert(br1);
        tree.insert(br2);
        tree.insert(tr1);
        tree.insert(tr2);
        tree.insert(bl1);

        // 第 5 个插入后仍是叶子, 第 6 个触发 split
        expect(tree.leaf).toBe(true);
        const bl2 = new Box(5, 15, 5, 5);
        tree.insert(bl2);

        expect(tree.leaf).toBe(false);
        expect(tree.totalObjects).toBe(6);
        expect(tree.topLeft!.objects.size).toBe(0);
        expect(tree.topRight!.objects.size).toBe(2);
        expect(tree.botLeft!.objects.size).toBe(2);
        expect(tree.botRight!.objects.size).toBe(2);
        // 6 个对象全部下放到子节点, 根节点自身为空
        expect(tree.objects.size).toBe(0);
    });

    it('恰好落在中线 (y === horizontalMidpoint) 的对象留在父节点, 不下放子节点', () => {
        const tree = makeTree();
        tree.insert(new Box(65, 5, 5, 5));  // botRight
        tree.insert(new Box(65, 15, 5, 5)); // botRight
        tree.insert(new Box(65, 65, 5, 5)); // topRight
        tree.insert(new Box(65, 75, 5, 5)); // topRight
        tree.insert(new Box(5, 5, 5, 5));   // botLeft

        // P 的 y === 50 (中线), y+h=100; topQuadrant 需 y>50, bottomQuadrant 需 y+h<50, 二者皆假
        const p = new Box(5, 50, 5, 50);
        tree.insert(p); // 第 6 个, 触发 split

        expect(tree.leaf).toBe(false);
        expect(tree.totalObjects).toBe(6);
        // P 无法完整落入任一象限 => 留在根节点
        expect(tree.objects.size).toBe(1);
        expect(tree.objects.items[0]).toBe(p);
        expect(tree.topLeft!.objects.size).toBe(0);
        expect(tree.botLeft!.objects.size).toBe(1);
        expect(tree.topRight!.objects.size).toBe(2);
        expect(tree.botRight!.objects.size).toBe(2);
    });

    it('跨节点遍历顺序: topLeft -> topRight -> botLeft -> botRight -> 根自身', () => {
        const tree = makeTree();
        const p1 = new Box(5, 65, 5, 5);   // topLeft
        const p2 = new Box(5, 75, 5, 5);   // topLeft
        const p3 = new Box(65, 65, 5, 5);  // topRight
        const p4 = new Box(5, 5, 5, 5);    // botLeft
        const p5 = new Box(65, 5, 5, 5);   // botRight
        const p6 = new Box(65, 15, 5, 5);  // botRight, 第 6 个触发 split
        for(const b of [p1, p2, p3, p4, p5, p6]) tree.insert(b);

        expect(tree.leaf).toBe(false);
        const out = collectAll(tree);
        expect(out.size).toBe(6);
        expect(out.items[0]).toBe(p1);
        expect(out.items[1]).toBe(p2);
        expect(out.items[2]).toBe(p3);
        expect(out.items[3]).toBe(p4);
        expect(out.items[4]).toBe(p5);
        expect(out.items[5]).toBe(p6);
    });

    it('越界对象被忽略', () => {
        const tree = makeTree();
        const outside = new Box(200, 200, 10, 10);
        tree.insert(outside);
        expect(tree.totalObjects).toBe(0);
        expect(tree.any(0, 0, 100, 100)).toBe(false);
        expect(tree.objects.size).toBe(0);

        const inside = new Box(1, 1, 5, 5);
        tree.insert(inside);
        expect(tree.totalObjects).toBe(1);
        expect(tree.objects.items[0]).toBe(inside);
    });
});

describe('QuadTree intersect(谓词式) / find / any', () => {
    it('intersect(Boolf) 返回 false 时处理全部对象; 返回 true 时提前退出', () => {
        const tree = makeTree();
        const a = new Box(0, 0, 10, 10, 'a');
        const c = new Box(0, 20, 10, 10, 'c');
        const b = new Box(0, 90, 10, 10, 'b');
        tree.insert(a);
        tree.insert(c);
        tree.insert(b);

        const seenAll: string[] = [];
        const stopped0 = tree.intersect(new Rect(0, 0, 100, 100), (x: Box) => {
            seenAll.push(x.name);
            return false;
        });
        expect(seenAll).toEqual(['a', 'c', 'b']);
        expect(stopped0).toBe(false);

        const seen2: string[] = [];
        const stopped1 = tree.intersect(new Rect(0, 0, 100, 100), (x: Box) => {
            seen2.push(x.name);
            return x.name === 'c';
        });
        expect(seen2).toEqual(['a', 'c']); // 命中 c 后立即退出, 不再处理 b
        expect(stopped1).toBe(true);
    });

    it('intersect(Cons) 无返回值, 收集到全部 3 个对象 (身份序)', () => {
        const tree = makeTree();
        const a = new Box(0, 0, 10, 10, 'a');
        const c = new Box(0, 20, 10, 10, 'c');
        const b = new Box(0, 90, 10, 10, 'b');
        tree.insert(a);
        tree.insert(c);
        tree.insert(b);

        const collected: Box[] = [];
        tree.intersect(new Rect(0, 0, 100, 100), (x: Box) => {
            collected.push(x);
        });
        expect(collected.length).toBe(3);
        expect(collected[0]).toBe(a);
        expect(collected[1]).toBe(c);
        expect(collected[2]).toBe(b);
    });

    it('find 返回精确对象身份, 无匹配返回 null', () => {
        const tree = makeTree();
        const a = new Box(0, 0, 10, 10, 'a');
        const b = new Box(0, 90, 10, 10, 'b');
        tree.insert(a);
        tree.insert(b);

        expect(tree.find(0, 0, 100, 100, (x: Box) => x.name === 'b')).toBe(b);
        expect(tree.find(0, 0, 100, 100, (x: Box) => x.name === 'a')).toBe(a);
        expect(tree.find(0, 0, 100, 100, (x: Box) => x.name === 'nope')).toBeNull();
        // 查询区域不覆盖 b 时应返回 null (即便谓词匹配 b)
        expect(tree.find(0, 0, 50, 50, (x: Box) => x.name === 'b')).toBeNull();
    });

    it('any 精确判定', () => {
        const tree = makeTree();
        tree.insert(new Box(0, 0, 10, 10, 'a'));
        tree.insert(new Box(0, 90, 10, 10, 'b'));

        expect(tree.any(0, 0, 100, 100)).toBe(true);
        expect(tree.any(0, 90, 5, 5)).toBe(true);    // 命中 b (b 为 x[0,10] y[90,100])
        expect(tree.any(20, 20, 5, 5)).toBe(false);  // a[0,10] 与 b[90,100] 之间的空隙
    });
});

describe('QuadTree remove / clear / fill / getObjects', () => {
    it('remove 身份匹配, 且无序移除使最后一个元素前移', () => {
        const tree = makeTree();
        const a = new Box(0, 0, 10, 10, 'a');
        const b = new Box(0, 20, 10, 10, 'b');
        const c = new Box(0, 40, 10, 10, 'c');
        tree.insert(a);
        tree.insert(b);
        tree.insert(c);
        expect(tree.totalObjects).toBe(3);

        expect(tree.remove(b)).toBe(true);
        expect(tree.totalObjects).toBe(2);
        const out = collectAll(tree);
        expect(out.size).toBe(2);
        expect(out.items[0]).toBe(a);
        expect(out.items[1]).toBe(c); // c 从末尾被移到 b 的位置

        expect(tree.remove(b)).toBe(false); // 已不在树中
        expect(tree.totalObjects).toBe(2);

        expect(tree.remove(a)).toBe(true);
        expect(tree.totalObjects).toBe(1);
        expect(tree.remove(c)).toBe(true);
        expect(tree.totalObjects).toBe(0);
        expect(collectAll(tree).size).toBe(0);
    });

    it('clear 清空内容并重置 leaf', () => {
        const tree = makeTree();
        // 6 个对象使其 split
        for(const b of [new Box(65, 5, 5, 5), new Box(65, 15, 5, 5), new Box(65, 65, 5, 5),
            new Box(65, 75, 5, 5), new Box(5, 5, 5, 5), new Box(5, 15, 5, 5)]) tree.insert(b);
        expect(tree.leaf).toBe(false);

        tree.clear();
        expect(tree.leaf).toBe(true);
        expect(tree.totalObjects).toBe(0);
        expect(tree.objects.size).toBe(0);
        expect(tree.topLeft!.objects.size).toBe(0);
        expect(tree.topRight!.objects.size).toBe(0);
        expect(tree.botLeft!.objects.size).toBe(0);
        expect(tree.botRight!.objects.size).toBe(0);
        expect(tree.any(0, 0, 100, 100)).toBe(false);
        expect(collectAll(tree).size).toBe(0);
    });

    it('fill 从列表重建, 12 个对象全部可被查询到', () => {
        const tree = makeTree();
        const list = new Seq<Box>();
        for(let i = 0; i < 12; i++){
            list.add(new Box(10 + i * 5, 10 + i * 5, 5, 5));
        }
        tree.fill(list);

        expect(tree.totalObjects).toBe(12);
        expect(tree.leaf).toBe(false);
        expect(collectAll(tree).size).toBe(12);

        const got = new Seq<Box>();
        tree.getObjects(got);
        expect(got.size).toBe(12);
        // getObjects 不保证顺序, 按身份集合校验
        for(const b of list.items.slice(0, list.size)){
            expect(got.contains(b, true)).toBe(true);
        }
    });

    it('getObjects 收集全部对象', () => {
        const tree = makeTree();
        const a = new Box(0, 0, 10, 10, 'a');
        const b = new Box(0, 90, 10, 10, 'b');
        tree.insert(a);
        tree.insert(b);
        const got = new Seq<Box>();
        tree.getObjects(got);
        expect(got.size).toBe(2);
        expect(got.contains(a, true)).toBe(true);
        expect(got.contains(b, true)).toBe(true);
    });

    it('大量堆叠在同一坐标的对象不无限分裂, 且全部可查', () => {
        const tree = makeTree();
        const boxes: Box[] = [];
        for(let i = 0; i < 30; i++){
            const b = new Box(50, 50, 5, 5);
            boxes.push(b);
            tree.insert(b);
        }
        expect(tree.totalObjects).toBe(30);
        const out = new Seq<Box>();
        tree.intersect(new Rect(45, 45, 20, 20), out);
        expect(out.size).toBe(30);
        const got = new Seq<Box>();
        tree.getObjects(got);
        expect(got.size).toBe(30);
        for(const b of boxes){
            expect(got.contains(b, true)).toBe(true);
        }
    });
});
