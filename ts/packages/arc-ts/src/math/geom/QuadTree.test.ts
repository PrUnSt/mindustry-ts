import {describe, expect, it} from 'vitest';
import {QuadTree, Seq} from './QuadTree';
import {Rect} from './Rect';

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

describe('QuadTree insert / query', () => {
    it('inserts and queries objects by rect', () => {
        const tree = makeTree();
        const a = new Box(10, 10, 10, 10, 'a');
        const b = new Box(50, 50, 10, 10, 'b');
        const c = new Box(80, 80, 10, 10, 'c');
        tree.insert(a);
        tree.insert(b);
        tree.insert(c);

        const out = new Seq<Box>();
        tree.intersect(new Rect(5, 5, 30, 30), out);
        const names = out.items.filter((_, i) => i < out.size).map(x => x.name);
        expect(names).toContain('a');
        expect(names).not.toContain('b');
        expect(names).not.toContain('c');

        const all = new Seq<Box>();
        tree.intersect(new Rect(0, 0, 100, 100), all);
        expect(all.size).toBe(3);
    });

    it('queries by x/y/width/height form', () => {
        const tree = makeTree();
        tree.insert(new Box(10, 10, 10, 10, 'a'));
        const out = new Seq<Box>();
        tree.intersect(0, 0, 25, 25, out);
        expect(out.size).toBe(1);
    });

    it('intersect with callback processes each match', () => {
        const tree = makeTree();
        tree.insert(new Box(10, 10, 10, 10, 'a'));
        tree.insert(new Box(50, 50, 10, 10, 'b'));
        let seen = 0;
        tree.intersect(new Rect(0, 0, 100, 100), { get: () => { seen++; } });
        expect(seen).toBe(2);
    });

    it('intersect with Boolf can early-exit', () => {
        const tree = makeTree();
        tree.insert(new Box(10, 10, 10, 10, 'a'));
        tree.insert(new Box(50, 50, 10, 10, 'b'));
        let seen = 0;
        const stopped = tree.intersect(new Rect(0, 0, 100, 100), { get: () => { seen++; return true; } });
        expect(stopped).toBe(true);
        expect(seen).toBe(1);
    });

    it('any / find', () => {
        const tree = makeTree();
        tree.insert(new Box(10, 10, 10, 10, 'a'));
        expect(tree.any(0, 0, 25, 25)).toBe(true);
        expect(tree.any(90, 90, 10, 10)).toBe(false);
        const found = tree.find(0, 0, 25, 25, { get: (b: Box) => b.name === 'a' });
        expect(found).not.toBeNull();
        expect(found!.name).toBe('a');
        expect(tree.find(0, 0, 25, 25, { get: (b: Box) => b.name === 'nope' })).toBeNull();
    });
});

describe('QuadTree remove / clear / fill', () => {
    it('removes objects', () => {
        const tree = makeTree();
        const a = new Box(10, 10, 10, 10, 'a');
        const b = new Box(50, 50, 10, 10, 'b');
        tree.insert(a);
        tree.insert(b);

        expect(tree.remove(a)).toBe(true);
        const out = new Seq<Box>();
        tree.intersect(new Rect(0, 0, 100, 100), out);
        expect(out.size).toBe(1);
        expect(out.items[0]).toBe(b);

        expect(tree.remove(a)).toBe(false);
        expect(tree.remove(b)).toBe(true);
    });

    it('clear empties the tree', () => {
        const tree = makeTree();
        tree.insert(new Box(10, 10, 10, 10));
        tree.insert(new Box(50, 50, 10, 10));
        tree.clear();
        expect(tree.any(0, 0, 100, 100)).toBe(false);
        const out = new Seq<Box>();
        tree.intersect(new Rect(0, 0, 100, 100), out);
        expect(out.size).toBe(0);
    });

    it('fill rebuilds from a list', () => {
        const tree = makeTree();
        const list = new Seq<Box>();
        for(let i = 0; i < 12; i++){
            list.add(new Box(10 + i * 5, 10 + i * 5, 5, 5));
        }
        tree.fill(list);
        const out = new Seq<Box>();
        tree.intersect(new Rect(0, 0, 100, 100), out);
        expect(out.size).toBe(12);
    });

    it('getObjects collects everything', () => {
        const tree = makeTree();
        const a = new Box(10, 10, 10, 10);
        const b = new Box(50, 50, 10, 10);
        tree.insert(a);
        tree.insert(b);
        const out = new Seq<Box>();
        tree.getObjects(out);
        expect(out.size).toBe(2);
    });
});

describe('QuadTree bounds', () => {
    it('ignores objects fully outside the tree bounds', () => {
        const tree = makeTree();
        const outside = new Box(200, 200, 10, 10);
        tree.insert(outside);
        expect(tree.any(0, 0, 100, 100)).toBe(false);
        expect(tree.totalObjects).toBe(0);
    });

    it('handles many stacked objects without infinite split', () => {
        const tree = makeTree();
        for(let i = 0; i < 30; i++){
            tree.insert(new Box(50, 50, 5, 5));
        }
        const out = new Seq<Box>();
        tree.intersect(new Rect(45, 45, 20, 20), out);
        expect(out.size).toBe(30);
    });
});
