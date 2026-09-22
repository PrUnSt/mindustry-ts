// 源: arc-core/src/arc/math/geom/QuadTree.java
// 迁移说明: 逐字移植。内部存储 Seq<T> 为文件内最小本地实现, 避免依赖 struct 包。
// TODO: 迁移到 struct 统一实现
import {Rect} from './Rect';

/** 对应 arc.struct.Seq 的最小本地实现. */
// TODO: 迁移到 struct 统一实现
export class Seq<T>{
    items: T[] = [];
    size = 0;

    get(i: number): T{
        return this.items[i];
    }

    add(t: T): void{
        if(this.size === this.items.length) this.items.push(t);
        else this.items[this.size] = t;
        this.size++;
    }

    addAll(seq: Seq<T>): void;
    addAll(array: T[]): void;
    addAll(a: Seq<T> | T[]): void{
        if(Array.isArray(a)){
            for(let i = 0; i < a.length; i++){
                this.add(a[i]);
            }
        }else{
            for(let i = 0; i < a.size; i++){
                this.add(a.items[i]);
            }
        }
    }

    remove(obj: T, identity: boolean): boolean{
        for(let i = 0; i < this.size; i++){
            if(this.items[i] === obj){
                this.size--;
                this.items[i] = this.items[this.size];
                this.items[this.size] = null as unknown as T;
                return true;
            }
        }
        return false;
    }

    clear(): void{
        this.size = 0;
    }
}

/** 对应 arc.func.Boolf (本地最小实现). */
// TODO: 迁移到 arc.func.Boolf 统一实现
export interface Boolf<T>{
    get(t: T): boolean;
}

/** 对应 arc.func.Cons (本地最小实现). */
// TODO: 迁移到 arc.func.Cons 统一实现
export interface Cons<T>{
    get(t: T): void;
}

/**
 * A basic quad tree.
 * <p>
 * This class represents any node, but you will likely only interact with the root node.
 * @param <T> The type of object this quad tree should contain. An object only requires some way of getting rough bounds.
 */
export class QuadTree<T extends QuadTree.QuadTreeObject>{
    protected readonly tmp = new Rect();
    //if many objects are stacked on a point, it may split infinitely, so floor the size
    protected static readonly minNodeSize = 10;
    protected static readonly maxObjectsPerNode = 5;

    bounds: Rect;
    objects = new Seq<T>();
    botLeft: QuadTree<T> | null = null;
    botRight: QuadTree<T> | null = null;
    topLeft: QuadTree<T> | null = null;
    topRight: QuadTree<T> | null = null;
    leaf = true;
    totalObjects = 0;

    //scratch partitioning lists reused across fill() calls to avoid allocating every rebuild
    private fillBL: Seq<T> | null = null;
    private fillBR: Seq<T> | null = null;
    private fillTL: Seq<T> | null = null;
    private fillTR: Seq<T> | null = null;

    constructor(bounds: Rect){
        this.bounds = bounds;
    }

    protected split(): void{
        if(!this.leaf || this.bounds.width <= QuadTree.minNodeSize || this.bounds.height <= QuadTree.minNodeSize) return;

        const subW = this.bounds.width / 2;
        const subH = this.bounds.height / 2;

        if(this.botLeft === null){
            this.botLeft = this.newChild(new Rect(this.bounds.x, this.bounds.y, subW, subH));
            this.botRight = this.newChild(new Rect(this.bounds.x + subW, this.bounds.y, subW, subH));
            this.topLeft = this.newChild(new Rect(this.bounds.x, this.bounds.y + subH, subW, subH));
            this.topRight = this.newChild(new Rect(this.bounds.x + subW, this.bounds.y + subH, subW, subH));
        }
        this.leaf = false;

        const items = this.objects.items;

        // Transfer objects to children if they fit entirely in one
        for(let i = 0; i < this.objects.size; i++){
            const obj = items[i];
            this.hitbox(obj);
            const child = this.getFittingChild(this.tmp);
            if(child !== null){
                child.insert(obj);
                this.objects.size--;
                items[i] = items[this.objects.size];
                items[this.objects.size] = null as unknown as T;
                i--;
            }
        }
    }

    protected unsplit(): void{
        if(this.leaf) return;
        this.objects.addAll(this.botLeft!.objects);
        this.objects.addAll(this.botRight!.objects);
        this.objects.addAll(this.topLeft!.objects);
        this.objects.addAll(this.topRight!.objects);
        this.botLeft!.clear();
        this.botRight!.clear();
        this.topLeft!.clear();
        this.topRight!.clear();
        this.leaf = true;
    }

    /**
     * Inserts an object into this node or its child nodes. This will split a leaf node if it exceeds the object limit.
     */
    insert(obj: T): void{
        this.hitbox(obj);
        if(!this.bounds.overlaps(this.tmp)){
            // New object not in quad tree, ignoring
            // throw an exception?
            return;
        }

        this.totalObjects++;

        if(this.leaf && this.objects.size + 1 > QuadTree.maxObjectsPerNode) this.split();

        if(this.leaf){
            // Leaf, so no need to add to children, just add to root
            this.objects.add(obj);
        }else{
            this.hitbox(obj);
            // Add to relevant child, or root if can't fit completely in a child
            const child = this.getFittingChild(this.tmp);
            if(child !== null){
                child.insert(obj);
            }else{
                this.objects.add(obj);
            }
        }
    }

    /** Rebuilds this tree from scratch using the given list of objects. */
    fill(list: Seq<T>): void{
        this.clear();
        this.totalObjects = list.size;

        if(list.size <= QuadTree.maxObjectsPerNode || this.bounds.width <= QuadTree.minNodeSize || this.bounds.height <= QuadTree.minNodeSize){
            this.objects.addAll(list);
            return;
        }

        if(this.botLeft === null){
            const subW = this.bounds.width / 2;
            const subH = this.bounds.height / 2;
            this.botLeft = this.newChild(new Rect(this.bounds.x, this.bounds.y, subW, subH));
            this.botRight = this.newChild(new Rect(this.bounds.x + subW, this.bounds.y, subW, subH));
            this.topLeft = this.newChild(new Rect(this.bounds.x, this.bounds.y + subH, subW, subH));
            this.topRight = this.newChild(new Rect(this.bounds.x + subW, this.bounds.y + subH, subW, subH));
        }
        this.leaf = false;

        if(this.fillBL === null){
            this.fillBL = new Seq<T>();
            this.fillBR = new Seq<T>();
            this.fillTL = new Seq<T>();
            this.fillTR = new Seq<T>();
        }
        this.fillBL!.clear();
        this.fillBR!.clear();
        this.fillTL!.clear();
        this.fillTR!.clear();

        const items = list.items;
        const size = list.size;

        //single partitioning pass instead of one split()-check per insert
        for(let i = 0; i < size; i++){
            const obj = items[i];
            this.hitbox(obj);
            const child = this.getFittingChild(this.tmp);

            if(child === this.botLeft) this.fillBL!.add(obj);
            else if(child === this.botRight) this.fillBR!.add(obj);
            else if(child === this.topLeft) this.fillTL!.add(obj);
            else if(child === this.topRight) this.fillTR!.add(obj);
            else this.objects.add(obj); //doesn't fit any quadrant, stays in this node
        }

        this.botLeft!.fill(this.fillBL!);
        this.botRight!.fill(this.fillBR!);
        this.topLeft!.fill(this.fillTL!);
        this.topRight!.fill(this.fillTR!);
    }

    /**
     * Removes an object from this node or its child nodes.
     */
    remove(obj: T): boolean{
        let result: boolean;
        if(this.leaf){
            // Leaf, no children, remove from root
            result = this.objects.remove(obj, true);
        }else{
            // Remove from relevant child
            this.hitbox(obj);
            const child = this.getFittingChild(this.tmp);

            if(child !== null){
                result = child.remove(obj);
            }else{
                // Or root if object doesn't fit in a child
                result = this.objects.remove(obj, true);
            }

            if(this.totalObjects <= QuadTree.maxObjectsPerNode) this.unsplit();
        }
        if(result){
            this.totalObjects--;
        }
        return result;
    }

    /** Removes all objects. */
    clear(): void{
        this.objects.clear();
        this.totalObjects = 0;
        if(!this.leaf){
            this.topLeft!.clear();
            this.topRight!.clear();
            this.botLeft!.clear();
            this.botRight!.clear();
        }
        this.leaf = true;
    }

    protected getFittingChild(boundingBox: Rect): QuadTree<T> | null{
        const verticalMidpoint = this.bounds.x + (this.bounds.width / 2);
        const horizontalMidpoint = this.bounds.y + (this.bounds.height / 2);

        // Object can completely fit within the top quadrants
        const topQuadrant = boundingBox.y > horizontalMidpoint;
        // Object can completely fit within the bottom quadrants
        const bottomQuadrant = boundingBox.y < horizontalMidpoint && (boundingBox.y + boundingBox.height) < horizontalMidpoint;

        // Object can completely fit within the left quadrants
        if(boundingBox.x < verticalMidpoint && boundingBox.x + boundingBox.width < verticalMidpoint){
            if(topQuadrant){
                return this.topLeft;
            }else if(bottomQuadrant){
                return this.botLeft;
            }
        }else if(boundingBox.x > verticalMidpoint){ // Object can completely fit within the right quadrants
            if(topQuadrant){
                return this.topRight;
            }else if(bottomQuadrant){
                return this.botRight;
            }
        }

        // Else, object needs to be in parent cause it can't fit completely in a quadrant
        return null;
    }

    /**
     * Processes objects that may intersect the given rectangle.
     * <p>This will never result in false positives.
     */
    intersect(x: number, y: number, width: number, height: number, out: Cons<T>): void;
    /**
     * Processes objects that may intersect the given rectangle. Returning true will break out of the function.
     * <p>This will never result in false positives.
     */
    intersect(x: number, y: number, width: number, height: number, out: Boolf<T>): boolean;
    /**
     * Processes objects that may intersect the given rectangle.
     * <p>This will never result in false positives.
     */
    intersect(rect: Rect, out: Cons<T>): void;
    /**
     * Fills the out parameter with any objects that may intersect the given rectangle.
     * <p>This will result in false positives, but never a false negative.
     */
    intersect(toCheck: Rect, out: Seq<T>): void;
    /**
     * Fills the out parameter with any objects that may intersect the given rectangle.
     */
    intersect(x: number, y: number, width: number, height: number, out: Seq<T>): void;
    intersect(a: number | Rect, b: number | Cons<T> | Seq<T> | Rect, c?: number, d?: number, e?: number | Cons<T> | Seq<T>): void | boolean{
        if(typeof a === 'number'){
            const x = a, y = b as number, width = c!, height = d!;
            if(e instanceof Seq){
                this.intersectSeq(x, y, width, height, e);
                return;
            }
            return this.intersectPred(x, y, width, height, e as Cons<T> | Boolf<T>);
        }
        const second = b as Cons<T> | Seq<T> | Rect;
        if(second instanceof Rect){
            this.intersectPred(a.x, a.y, a.width, a.height, second as unknown as Cons<T>);
        }else if(second instanceof Seq){
            this.intersectSeq(a.x, a.y, a.width, a.height, second);
        }else{
            this.intersectPred(a.x, a.y, a.width, a.height, second as Cons<T>);
        }
    }

    /** 谓词遍历: 处理可能相交的对象; 当 out.get 返回 true 时提前退出并返回 true (Boolf 语义). */
    private intersectPred(x: number, y: number, width: number, height: number, out: Cons<T> | Boolf<T>): boolean{
        if(!this.leaf){
            if(this.topLeft!.bounds.overlaps(x, y, width, height) && this.intersectPred(x, y, width, height, out)) return true;
            if(this.topRight!.bounds.overlaps(x, y, width, height) && this.intersectPred(x, y, width, height, out)) return true;
            if(this.botLeft!.bounds.overlaps(x, y, width, height) && this.intersectPred(x, y, width, height, out)) return true;
            if(this.botRight!.bounds.overlaps(x, y, width, height) && this.intersectPred(x, y, width, height, out)) return true;
        }

        const objects = this.objects;

        for(let i = 0; i < objects.size; i++){
            const item = objects.items[i];
            this.hitbox(item);
            if(this.tmp.overlaps(x, y, width, height) && out.get(item)){
                return true;
            }
        }
        return false;
    }

    /** 收集遍历: 把所有可能相交的对象加入 out. */
    private intersectSeq(x: number, y: number, width: number, height: number, out: Seq<T>): void{
        if(!this.leaf){
            if(this.topLeft!.bounds.overlaps(x, y, width, height)) this.intersectSeq(x, y, width, height, out);
            if(this.topRight!.bounds.overlaps(x, y, width, height)) this.intersectSeq(x, y, width, height, out);
            if(this.botLeft!.bounds.overlaps(x, y, width, height)) this.intersectSeq(x, y, width, height, out);
            if(this.botRight!.bounds.overlaps(x, y, width, height)) this.intersectSeq(x, y, width, height, out);
        }

        const objects = this.objects;

        for(let i = 0; i < objects.size; i++){
            const item = objects.items[i];
            this.hitbox(item);
            if(this.tmp.overlaps(x, y, width, height)){
                out.add(item);
            }
        }
    }

    /**
     * Tries to find any object matching the predicate in this tree.
     * <p>This will never result in false positives.
     */
    find(x: number, y: number, width: number, height: number, out: Boolf<T>): T | null{
        if(!this.leaf){
            let result: T | null;
            if(this.topLeft!.bounds.overlaps(x, y, width, height) && (result = this.topLeft!.find(x, y, width, height, out)) !== null) return result;
            if(this.topRight!.bounds.overlaps(x, y, width, height) && (result = this.topRight!.find(x, y, width, height, out)) !== null) return result;
            if(this.botLeft!.bounds.overlaps(x, y, width, height) && (result = this.botLeft!.find(x, y, width, height, out)) !== null) return result;
            if(this.botRight!.bounds.overlaps(x, y, width, height) && (result = this.botRight!.find(x, y, width, height, out)) !== null) return result;
        }

        const objects = this.objects;

        for(let i = 0; i < objects.size; i++){
            const item = objects.items[i];
            this.hitbox(item);
            if(this.tmp.overlaps(x, y, width, height) && out.get(item)){
                return item;
            }
        }
        return null;
    }

    /**
     * @return whether an object overlaps this rectangle.
     * This will never result in false positives.
     */
    any(x: number, y: number, width: number, height: number): boolean{
        if(!this.leaf){
            if(this.topLeft!.bounds.overlaps(x, y, width, height) && this.topLeft!.any(x, y, width, height)) return true;
            if(this.topRight!.bounds.overlaps(x, y, width, height) && this.topRight!.any(x, y, width, height)) return true;
            if(this.botLeft!.bounds.overlaps(x, y, width, height) && this.botLeft!.any(x, y, width, height)) return true;
            if(this.botRight!.bounds.overlaps(x, y, width, height) && this.botRight!.any(x, y, width, height)) return true;
        }

        const objects = this.objects;

        for(let i = 0; i < objects.size; i++){
            const item = objects.items[i];
            this.hitbox(item);
            if(this.tmp.overlaps(x, y, width, height)){
                return true;
            }
        }
        return false;
    }

    /** Adds all quadtree objects to the specified Seq. */
    getObjects(out: Seq<T>): void{
        out.addAll(this.objects);

        if(!this.leaf){
            this.topLeft!.getObjects(out);
            this.topRight!.getObjects(out);
            this.botLeft!.getObjects(out);
            this.botRight!.getObjects(out);
        }
    }

    protected newChild(rect: Rect): QuadTree<T>{
        return new QuadTree<T>(rect);
    }

    protected hitbox(t: T): void{
        t.hitbox(this.tmp);
    }
}

export namespace QuadTree{
    /**Represents an object in a QuadTree.*/
    export interface QuadTreeObject{
        /**Fills the out parameter with this element's rough bounding box. This should never be smaller than the actual object, but may be larger.*/
        hitbox(out: Rect): void;
    }
}
