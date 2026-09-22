// 源: arc-core/src/arc/math/geom/Intersector.java
// 迁移说明: 逐字移植。使用的 FloatSeq / Seq<Vec2> 为文件内最小本地实现, 避免依赖 struct 包。
// Java 的 int/float/对象重载在 TS 中合并为 重载签名 + 单一实现 (按实参类型/数量分派)。
// TODO: 迁移到 arc.struct.FloatSeq / arc.struct.Seq 统一实现
import {Vec2} from './Vec2';
import {Vec3} from './Vec3';
import {Rect} from './Rect';
import {Circle} from './Circle';
import {Polygon} from './Polygon';

/** 对应 arc.struct.FloatSeq 的最小本地实现. */
// TODO: 迁移到 struct 统一实现
class FloatSeq{
    items: number[] = [];
    size = 0;

    clear(): void{
        this.size = 0;
    }

    add(x: number, y?: number): void{
        if(y === undefined){
            if(this.size === this.items.length) this.items.push(x);
            else this.items[this.size] = x;
            this.size++;
        }else{
            if(this.size + 1 >= this.items.length){
                this.items.push(x, y);
            }else{
                this.items[this.size] = x;
                this.items[this.size + 1] = y;
            }
            this.size += 2;
        }
    }

    addAll(array: number[]): void;
    addAll(seq: FloatSeq): void;
    addAll(a: number[] | FloatSeq): void{
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

    get(i: number): number{
        return this.items[i];
    }

    toArray(): number[]{
        return this.items.slice(0, this.size);
    }
}

/** 对应 arc.struct.Seq 的最小本地实现 (仅 Vec2 元素). */
// TODO: 迁移到 struct 统一实现
export class Seq<U>{
    items: U[] = [];
    size = 0;

    add(t: U): void{
        if(this.size === this.items.length) this.items.push(t);
        else this.items[this.size] = t;
        this.size++;
    }

    get(i: number): U{
        return this.items[i];
    }

    peek(): U{
        return this.items[this.size - 1];
    }
}

/** 对应 arc.math.Mathf.sign (本地). */
function MathfSign(f: number): number{
    return (f < 0 ? -1 : 1);
}

/** Minimum translation required to separate two polygons. */
export class MinimumTranslationVector{
    /** Unit length vector that indicates the direction for the separation */
    normal = new Vec2();
    /** Distance of the translation required for the separation */
    depth = 0;
}

/**
 * Class offering various static methods for intersection testing between different geometric objects.
 */
export class Intersector{
    private static readonly v0 = new Vec3();
    private static readonly v1 = new Vec3();
    private static readonly v2 = new Vec3();
    private static readonly floatArray = new FloatSeq();
    private static readonly floatArray2 = new FloatSeq();
    private static readonly ip = new Vec2();
    private static readonly ep1 = new Vec2();
    private static readonly ep2 = new Vec2();
    private static readonly s = new Vec2();
    private static readonly e = new Vec2();
    private static readonly tmp = new Vec3();
    private static readonly tmp1 = new Vec3();
    private static readonly tmp2 = new Vec3();
    private static readonly tmp3 = new Vec3();
    private static readonly v2tmp = new Vec2();

    /** Intersects two convex polygons with clockwise vertices and sets the overlap polygon resulting from the intersection. */
    static intersectPolygons(p1: number[], p2: number[]): boolean;
    static intersectPolygons(p1: Polygon, p2: Polygon, overlap: Polygon | null): boolean;
    static intersectPolygons(a: number[] | Polygon, b: number[] | Polygon, c?: Polygon | null): boolean{
        if(!Array.isArray(a)){
            const p1 = a, p2 = b as Polygon, overlap = c === undefined ? null : c;
            if(p1.getVertices().length === 0 || p2.getVertices().length === 0){
                return false;
            }
            const clip = p2.getTransformedVertices();
            const clipLen = clip.length;
            // reusable points to trace edges around polygon
            Intersector.floatArray2.clear();
            Intersector.floatArray.clear();
            Intersector.floatArray2.addAll(p1.getTransformedVertices());
            for(let i = 0; i < clipLen; i += 2){
                Intersector.ep1.set(clip[i], clip[i + 1]);
                // wrap around to beginning of array if index points to end;
                if(i < clipLen - 2){
                    Intersector.ep2.set(clip[i + 2], clip[i + 3]);
                }else{
                    Intersector.ep2.set(clip[0], clip[1]);
                }
                if(Intersector.floatArray2.size === 0){
                    return false;
                }
                Intersector.s.set(Intersector.floatArray2.get(Intersector.floatArray2.size - 2), Intersector.floatArray2.get(Intersector.floatArray2.size - 1));
                for(let j = 0; j < Intersector.floatArray2.size; j += 2){
                    Intersector.e.set(Intersector.floatArray2.get(j), Intersector.floatArray2.get(j + 1));
                    // determine if point is inside clip edge
                    if(Intersector.pointLineSide(Intersector.ep2, Intersector.ep1, Intersector.e) > 0){
                        if(!(Intersector.pointLineSide(Intersector.ep2, Intersector.ep1, Intersector.s) > 0)){
                            Intersector.intersectLines(Intersector.s, Intersector.e, Intersector.ep1, Intersector.ep2, Intersector.ip);
                            if(Intersector.floatArray.size < 2 || Intersector.floatArray.get(Intersector.floatArray.size - 2) !== Intersector.ip.x
                            || Intersector.floatArray.get(Intersector.floatArray.size - 1) !== Intersector.ip.y){
                                Intersector.floatArray.add(Intersector.ip.x);
                                Intersector.floatArray.add(Intersector.ip.y);
                            }
                        }
                        Intersector.floatArray.add(Intersector.e.x);
                        Intersector.floatArray.add(Intersector.e.y);
                    }else if(Intersector.pointLineSide(Intersector.ep2, Intersector.ep1, Intersector.s) > 0){
                        Intersector.intersectLines(Intersector.s, Intersector.e, Intersector.ep1, Intersector.ep2, Intersector.ip);
                        Intersector.floatArray.add(Intersector.ip.x);
                        Intersector.floatArray.add(Intersector.ip.y);
                    }
                    Intersector.s.set(Intersector.e.x, Intersector.e.y);
                }
                Intersector.floatArray2.clear();
                Intersector.floatArray2.addAll(Intersector.floatArray);
                Intersector.floatArray.clear();
            }
            if(Intersector.floatArray2.size !== 0){
                if(overlap !== null){
                    if(overlap.getVertices().length === Intersector.floatArray2.size){
                        for(let i = 0; i < Intersector.floatArray2.size; i++){
                            overlap.getVertices()[i] = Intersector.floatArray2.items[i];
                        }
                    }else{
                        overlap.setVertices(Intersector.floatArray2.toArray());
                    }
                }
                return true;
            }else{
                return false;
            }
        }
        const p1 = a, p2 = b as number[];
        // reusable points to trace edges around polygon
        Intersector.floatArray2.clear();
        Intersector.floatArray.clear();
        Intersector.floatArray2.addAll(p1);
        if(p1.length === 0 || p2.length === 0){
            return false;
        }
        for(let i = 0; i < p2.length; i += 2){
            Intersector.ep1.set(p2[i], p2[i + 1]);
            // wrap around to beginning of array if index points to end;
            if(i < p2.length - 2){
                Intersector.ep2.set(p2[i + 2], p2[i + 3]);
            }else{
                Intersector.ep2.set(p2[0], p2[1]);
            }
            if(Intersector.floatArray2.size === 0){
                return false;
            }
            Intersector.s.set(Intersector.floatArray2.get(Intersector.floatArray2.size - 2), Intersector.floatArray2.get(Intersector.floatArray2.size - 1));
            for(let j = 0; j < Intersector.floatArray2.size; j += 2){
                Intersector.e.set(Intersector.floatArray2.get(j), Intersector.floatArray2.get(j + 1));
                // determine if point is inside clip edge
                if(Intersector.pointLineSide(Intersector.ep2, Intersector.ep1, Intersector.e) > 0){
                    if(!(Intersector.pointLineSide(Intersector.ep2, Intersector.ep1, Intersector.s) > 0)){
                        Intersector.intersectLines(Intersector.s, Intersector.e, Intersector.ep1, Intersector.ep2, Intersector.ip);
                        if(Intersector.floatArray.size < 2 || Intersector.floatArray.get(Intersector.floatArray.size - 2) !== Intersector.ip.x
                        || Intersector.floatArray.get(Intersector.floatArray.size - 1) !== Intersector.ip.y){
                            Intersector.floatArray.add(Intersector.ip.x);
                            Intersector.floatArray.add(Intersector.ip.y);
                        }
                    }
                    Intersector.floatArray.add(Intersector.e.x);
                    Intersector.floatArray.add(Intersector.e.y);
                }else if(Intersector.pointLineSide(Intersector.ep2, Intersector.ep1, Intersector.s) > 0){
                    Intersector.intersectLines(Intersector.s, Intersector.e, Intersector.ep1, Intersector.ep2, Intersector.ip);
                    Intersector.floatArray.add(Intersector.ip.x);
                    Intersector.floatArray.add(Intersector.ip.y);
                }
                Intersector.s.set(Intersector.e.x, Intersector.e.y);
            }
            Intersector.floatArray2.clear();
            Intersector.floatArray2.addAll(Intersector.floatArray);
            Intersector.floatArray.clear();
        }

        return !(Intersector.floatArray2.size === 0);
    }

    /**
     * Returns whether the given point is inside the triangle. This assumes that the point is on the plane of the triangle.
     */
    static isInTriangle(point: Vec3, t1: Vec3, t2: Vec3, t3: Vec3): boolean;
    /** Returns true if the given point is inside the triangle. */
    static isInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean;
    /** Returns true if the given point is inside the triangle. */
    static isInTriangle(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean;
    static isInTriangle(a: Vec3 | Vec2 | number, b: Vec3 | Vec2 | number, c?: Vec3 | Vec2 | number, d?: Vec3 | Vec2 | number, e?: number, f?: number, g?: number, h?: number): boolean{
        if(a instanceof Vec3){
            const point = a, t1 = b as Vec3, t2 = c as Vec3, t3 = d as Vec3;
            Intersector.v0.set(t1).sub(point);
            Intersector.v1.set(t2).sub(point);
            Intersector.v2.set(t3).sub(point);

            const ab = Intersector.v0.dot(Intersector.v1);
            const ac = Intersector.v0.dot(Intersector.v2);
            const bc = Intersector.v1.dot(Intersector.v2);
            const cc = Intersector.v2.dot(Intersector.v2);

            if(bc * ac - cc * ab < 0) return false;
            const bb = Intersector.v1.dot(Intersector.v1);
            return !(ab * bc - ac * bb < 0);
        }
        if(typeof a === 'number'){
            const px = a, py = b as number, ax = c as number, ay = d as number, bx = e!, by = f!, cx = g!, cy = h!;
            const px1 = px - ax;
            const py1 = py - ay;
            const side12 = (bx - ax) * py1 - (by - ay) * px1 > 0;
            if((cx - ax) * py1 - (cy - ay) * px1 > 0 === side12) return false;
            return (cx - bx) * (py - by) - (cy - by) * (px - bx) > 0 === side12;
        }
        const p = a, aa = b as Vec2, bb = c as Vec2, cc = d as Vec2;
        const px1 = p.x - aa.x;
        const py1 = p.y - aa.y;
        const side12 = (bb.x - aa.x) * py1 - (bb.y - aa.y) * px1 > 0;
        if((cc.x - aa.x) * py1 - (cc.y - aa.y) * px1 > 0 === side12) return false;
        return (cc.x - bb.x) * (p.y - bb.y) - (cc.y - bb.y) * (p.x - bb.x) > 0 === side12;
    }

    /** @return whether x,y is inside the hexagon with radius d centered at cx, cy. */
    static isInsideHexagon(cx: number, cy: number, d: number, x: number, y: number): boolean{
        const dx = Math.abs(x - cx) / d;
        const dy = Math.abs(y - cy) / d;
        const a = 0.25 * 1.7320508075688772; // Mathf.sqrt3
        return (dy <= a) && (a * dx + 0.25 * dy <= 0.5 * a);
    }

    /** @return whether the specified x,y is inside a regular polygon. */
    static isInRegularPolygon(sides: number, cx: number, cy: number, radius: number, rotation: number, x: number, y: number): boolean{
        Intersector.floatArray.clear();
        for(let i = 0; i < sides; i++){
            Intersector.s.trns(i * 360 / sides + rotation, radius);
            Intersector.floatArray.add(cx + Intersector.s.x, cy + Intersector.s.y);
        }

        return Intersector.isInPolygon(Intersector.floatArray.items, 0, Intersector.floatArray.size, x, y);
    }

    /**
     * Determines on which side of the given line the point is. Returns -1 if the point is on the left side of the line, 0 if the
     * point is on the line and 1 if the point is on the right side of the line.
     */
    static pointLineSide(linePoint1: Vec2, linePoint2: Vec2, point: Vec2): number;
    static pointLineSide(linePoint1X: number, linePoint1Y: number, linePoint2X: number, linePoint2Y: number, pointX: number, pointY: number): number;
    static pointLineSide(a: Vec2 | number, b: Vec2 | number, c: Vec2 | number, d?: number, e?: number, f?: number): number{
        if(typeof a === 'number'){
            const val = (c as number - a) * (f! - (b as number)) - ((d! - (b as number)) * (e! - a));
            return Math.sign(val) | 0;
        }
        const l1 = a;
        const l2 = b as Vec2;
        const p = c as Vec2;
        const val = (l2.x - l1.x) * (p.y - l1.y) - (l2.y - l1.y) * (p.x - l1.x);
        return Math.sign(val) | 0;
    }

    /**
     * Checks whether the given point is in the polygon.
     */
    static isInPolygon(polygon: Seq<Vec2>, point: Vec2): boolean;
    /**
     * Returns true if the specified point is in the polygon.
     */
    static isInPolygon(polygon: number[], offset: number, count: number, x: number, y: number): boolean;
    static isInPolygon(a: Seq<Vec2> | number[], b: Vec2 | number, c?: number, d?: number, e?: number): boolean{
        if(Array.isArray(a)){
            const polygon = a, offset = b as number, count = c!, x = d!, y = e!;
            let oddNodes = false;
            let j = offset + count - 2;
            for(let i = offset, n = j; i <= n; i += 2){
                const yi = polygon[i + 1];
                const yj = polygon[j + 1];
                if((yi < y && yj >= y) || (yj < y && yi >= y)){
                    const xi = polygon[i];
                    if(xi + (y - yi) / (yj - yi) * (polygon[j] - xi) < x) oddNodes = !oddNodes;
                }
                j = i;
            }
            return oddNodes;
        }
        const polygon = a, point = b as Vec2;
        let lastVertice = polygon.peek();
        let oddNodes = false;
        for(let i = 0; i < polygon.size; i++){
            const vertice = polygon.get(i);
            if((vertice.y < point.y && lastVertice.y >= point.y) || (lastVertice.y < point.y && vertice.y >= point.y)){
                if(vertice.x + (point.y - vertice.y) / (lastVertice.y - vertice.y) * (lastVertice.x - vertice.x) < point.x){
                    oddNodes = !oddNodes;
                }
            }
            lastVertice = vertice;
        }
        return oddNodes;
    }

    /** Returns the distance between the given line and point. Note the specified line is not a line segment. */
    static distanceLinePoint(start: Vec2, end: Vec2, point: Vec2): number;
    static distanceLinePoint(startX: number, startY: number, endX: number, endY: number, pointX: number, pointY: number): number;
    static distanceLinePoint(a: Vec2 | number, b: Vec2 | number, c: Vec2 | number, d?: number, e?: number, f?: number): number{
        let startX: number, startY: number, endX: number, endY: number, pointX: number, pointY: number;
        if(typeof a === 'number'){
            startX = a; startY = b as number; endX = c as number; endY = d!; pointX = e!; pointY = f!;
        }else{
            startX = a.x; startY = a.y; endX = (b as Vec2).x; endY = (b as Vec2).y; pointX = (c as Vec2).x; pointY = (c as Vec2).y;
        }
        const normalLength = Math.sqrt((endX - startX) * (endX - startX) + (endY - startY) * (endY - startY));
        return Math.abs((pointX - startX) * (endY - startY) - (pointY - startY) * (endX - startX)) / normalLength;
    }

    /** Returns the distance between the given segment and point. */
    static distanceSegmentPoint(startX: number, startY: number, endX: number, endY: number, pointX: number, pointY: number): number;
    static distanceSegmentPoint(start: Vec2, end: Vec2, point: Vec2): number;
    static distanceSegmentPoint(a: Vec2 | number, b: Vec2 | number, c: Vec2 | number, d?: number, e?: number, f?: number): number{
        if(typeof a === 'number'){
            return Intersector.nearestSegmentPoint(a, b as number, c as number, d!, e!, f!, Intersector.v2tmp).dst(f!, e!);
        }
        return Intersector.nearestSegmentPoint(a, b as Vec2, c as Vec2, Intersector.v2tmp).dst(c as Vec2);
    }

    /** Returns a point on the segment nearest to the specified point. */
    static nearestSegmentPoint(start: Vec2, end: Vec2, point: Vec2, nearest: Vec2): Vec2;
    static nearestSegmentPoint(startX: number, startY: number, endX: number, endY: number, pointX: number, pointY: number, nearest: Vec2): Vec2;
    static nearestSegmentPoint(a: Vec2 | number, b: Vec2 | number, c: Vec2 | number, d: Vec2 | number, e?: Vec2 | number, f?: Vec2 | number, g?: Vec2): Vec2{
        if(typeof a === 'number'){
            const startX = a, startY = b as number, endX = c as number, endY = d as number;
            const pointX = e as number, pointY = f as number, nearest = g!;
            const xDiff = endX - startX;
            const yDiff = endY - startY;
            const length2 = xDiff * xDiff + yDiff * yDiff;
            if(length2 === 0) return nearest.set(startX, startY);
            const t = ((pointX - startX) * (endX - startX) + (pointY - startY) * (endY - startY)) / length2;
            if(t < 0) return nearest.set(startX, startY);
            if(t > 1) return nearest.set(endX, endY);
            return nearest.set(startX + t * (endX - startX), startY + t * (endY - startY));
        }
        const start = a, end = b as Vec2, point = c as Vec2, nearest = d as Vec2;
        const length2 = start.dst2(end);
        if(length2 === 0) return nearest.set(start);
        const t = ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / length2;
        if(t < 0) return nearest.set(start);
        if(t > 1) return nearest.set(end);
        return nearest.set(start.x + t * (end.x - start.x), start.y + t * (end.y - start.y));
    }

    /**
     * Returns whether the given line segment intersects the given circle.
     */
    static intersectSegmentCircle(start: Vec2, end: Vec2, center: Vec2, squareRadius: number): boolean{
        Intersector.tmp.set(end.x - start.x, end.y - start.y, 0);
        Intersector.tmp1.set(center.x - start.x, center.y - start.y, 0);
        const l = Intersector.tmp.len();
        const u = Intersector.tmp1.dot(Intersector.tmp.nor());
        if(u <= 0){
            Intersector.tmp2.set(start.x, start.y, 0);
        }else if(u >= l){
            Intersector.tmp2.set(end.x, end.y, 0);
        }else{
            Intersector.tmp3.set(Intersector.tmp.scl(u)); // remember tmp is already normalized
            Intersector.tmp2.set(Intersector.tmp3.x + start.x, Intersector.tmp3.y + start.y, 0);
        }

        const x = center.x - Intersector.tmp2.x;
        const y = center.y - Intersector.tmp2.y;

        return x * x + y * y <= squareRadius;
    }

    /**
     * Checks whether the line segment and the circle intersect and returns by how much and in what direction the line has to move
     * away from the circle to not intersect.
     */
    static intersectSegmentCircleDisplace(start: Vec2, end: Vec2, point: Vec2, radius: number, displacement: Vec2): number{
        let u = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
        let d = start.dst(end);
        u /= d * d;
        if(u < 0 || u > 1) return Number.POSITIVE_INFINITY;
        Intersector.tmp.set(end.x, end.y, 0).sub(start.x, start.y, 0);
        Intersector.tmp2.set(start.x, start.y, 0).add(Intersector.tmp.scl(u));
        d = Intersector.tmp2.dst(point.x, point.y, 0);
        if(d < radius){
            displacement.set(point).sub(Intersector.tmp2.x, Intersector.tmp2.y).nor();
            return d;
        }else{
            return Number.POSITIVE_INFINITY;
        }
    }

    /**
     * Intersect two 2D Rays and return the scalar parameter of the first ray at the intersection point.
     */
    static intersectRayRay(start1: Vec2, direction1: Vec2, start2: Vec2, direction2: Vec2): number{
        const difx = start2.x - start1.x;
        const dify = start2.y - start1.y;
        const d1xd2 = direction1.x * direction2.y - direction1.y * direction2.x;
        if(d1xd2 === 0.0){
            return Number.POSITIVE_INFINITY; // collinear
        }
        const d2sx = direction2.x / d1xd2;
        const d2sy = direction2.y / d1xd2;
        return difx * d2sy - dify * d2sx;
    }

    /**
     * Intersects the two lines and returns the intersection point in intersection.
     */
    static intersectLines(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2, intersection: Vec2 | null): boolean;
    /**
     * Intersects the two lines and returns the intersection point in intersection.
     */
    static intersectLines(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number, intersection: Vec2 | null): boolean;
    static intersectLines(a: Vec2 | number, b: Vec2 | number, c: Vec2 | number, d: Vec2 | number, e?: Vec2 | number | null, f?: Vec2 | number | null, g?: Vec2 | number | null, h?: Vec2 | number | null, intersection?: Vec2 | null): boolean{
        let x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number;
        let inter: Vec2 | null | undefined;
        if(typeof a === 'number'){
            x1 = a; y1 = b as number; x2 = c as number; y2 = d as number;
            x3 = e as number; y3 = f as number; x4 = g as number; y4 = h as number;
            inter = intersection;
        }else{
            x1 = a.x; y1 = a.y; x2 = (b as Vec2).x; y2 = (b as Vec2).y;
            x3 = (c as Vec2).x; y3 = (c as Vec2).y; x4 = (d as Vec2).x; y4 = (d as Vec2).y;
            inter = e as Vec2 | null | undefined;
        }

        const dd = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if(dd === 0) return false;

        if(inter !== null && inter !== undefined){
            const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / dd;
            inter.set(x1 + (x2 - x1) * ua, y1 + (y2 - y1) * ua);
        }
        return true;
    }

    /**
     * Check whether the given line and {@link Polygon} intersect.
     */
    static intersectLinePolygon(p1: Vec2, p2: Vec2, polygon: Polygon): boolean{
        const vertices = polygon.getTransformedVertices();
        const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
        const n = vertices.length;
        let x3 = vertices[n - 2], y3 = vertices[n - 1];
        for(let i = 0; i < n; i += 2){
            const x4 = vertices[i], y4 = vertices[i + 1];
            const d = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
            if(d !== 0){
                const yd = y1 - y3;
                const xd = x1 - x3;
                const ua = ((x4 - x3) * yd - (y4 - y3) * xd) / d;
                if(ua >= 0 && ua <= 1){
                    return true;
                }
            }
            x3 = x4;
            y3 = y4;
        }
        return false;
    }

    /**
     * Determines whether the given rectangles intersect and, if they do, sets the supplied {@code intersection} rectangle to the
     * area of overlap.
     */
    static intersectRectangles(rect1: Rect, rect2: Rect, intersection: Rect): boolean{
        if(rect1.overlaps(rect2)){
            intersection.x = Math.max(rect1.x, rect2.x);
            intersection.width = Math.min(rect1.x + rect1.width, rect2.x + rect2.width) - intersection.x;
            intersection.y = Math.max(rect1.y, rect2.y);
            intersection.height = Math.min(rect1.y + rect1.height, rect2.y + rect2.height) - intersection.y;
            return true;
        }
        return false;
    }

    /** Experimental method! May be inaccurate, do not use.*/
    static intersectSegmentRectangleFast(startx: number, starty: number, endx: number, endy: number, rectX: number, rectY: number, rectW: number, rectH: number): boolean{
        const deltax = endx - startx,
            deltay = endy - starty,
            x = rectX + rectW / 2,
            y = rectY + rectH / 2,
            halfx = rectW / 2,
            halfy = rectH / 2;

        const scaleX = 1.0 / deltax;
        const scaleY = 1.0 / deltay;
        const signX = MathfSign(scaleX);
        const signY = MathfSign(scaleY);
        const nearTimeX = (x - signX * (halfx) - startx) * scaleX;
        const nearTimeY = (y - signY * (halfy) - starty) * scaleY;
        const farTimeX = (x + signX * (halfx) - startx) * scaleX;
        const farTimeY = (y + signY * (halfy) - starty) * scaleY;

        return nearTimeX < farTimeY && nearTimeY < farTimeX && Math.max(nearTimeX, nearTimeY) < 1 && Math.min(farTimeX, farTimeY) > 0;
    }

    /**
     * Determines whether the given rectangle and segment intersect
     */
    static intersectSegmentRectangle(startX: number, startY: number, endX: number, endY: number, rectX: number, rectY: number, rectW: number, rectH: number): boolean;
    /**
     * Determines whether the given rectangle and segment intersect
     */
    static intersectSegmentRectangle(startX: number, startY: number, endX: number, endY: number, rect: Rect): boolean;
    /**
     * {@link intersectSegmentRectangle(float, float, float, float, Rect)}
     */
    static intersectSegmentRectangle(start: Vec2, end: Vec2, rect: Rect): boolean;
    static intersectSegmentRectangle(a: Vec2 | number, b: Vec2 | number, c: Vec2 | number, d?: Vec2 | number | Rect, e?: number | Rect, f?: number, g?: number, h?: number): boolean{
        if(typeof a === 'number'){
            if(typeof d === 'number'){
                const rectX = d, rectY = e as number, rectW = f!, rectH = g!;
                const rectangleEndX = rectX + rectW;
                const rectangleEndY = rectY + rectH;

                return Intersector.intersectSegments(a, b as number, c as number, d, rectX, rectY, rectX, rectangleEndY, null)
                    || Intersector.intersectSegments(a, b as number, c as number, d, rectX, rectY, rectangleEndX, rectY, null)
                    || Intersector.intersectSegments(a, b as number, c as number, d, rectangleEndX, rectY, rectangleEndX, rectangleEndY, null)
                    || Intersector.intersectSegments(a, b as number, c as number, d, rectX, rectangleEndY, rectangleEndX, rectangleEndY, null)
                    || Rect.contains(rectX, rectY, rectW, rectH, a, b as number);
            }else{
                const rect = d as Rect;
                const rectangleEndX = rect.x + rect.width;
                const rectangleEndY = rect.y + rect.height;

                if(Intersector.intersectSegments(a, b as number, c as number, e as number, rect.x, rect.y, rect.x, rectangleEndY, null))
                    return true;

                if(Intersector.intersectSegments(a, b as number, c as number, e as number, rect.x, rect.y, rectangleEndX, rect.y, null))
                    return true;

                if(Intersector.intersectSegments(a, b as number, c as number, e as number, rectangleEndX, rect.y, rectangleEndX, rectangleEndY, null))
                    return true;

                if(Intersector.intersectSegments(a, b as number, c as number, e as number, rect.x, rectangleEndY, rectangleEndX, rectangleEndY, null))
                    return true;

                return rect.contains(a, b as number);
            }
        }
        return Intersector.intersectSegmentRectangle(a.x, a.y, (b as Vec2).x, (b as Vec2).y, d as Rect);
    }

    /**
     * Check whether the given line segment and {@link Polygon} intersect.
     */
    static intersectSegmentPolygon(p1: Vec2, p2: Vec2, polygon: Polygon): boolean{
        const vertices = polygon.getTransformedVertices();
        const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
        const n = vertices.length;
        let x3 = vertices[n - 2], y3 = vertices[n - 1];
        for(let i = 0; i < n; i += 2){
            const x4 = vertices[i], y4 = vertices[i + 1];
            const d = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
            if(d !== 0){
                const yd = y1 - y3;
                const xd = x1 - x3;
                const ua = ((x4 - x3) * yd - (y4 - y3) * xd) / d;
                if(ua >= 0 && ua <= 1){
                    const ub = ((x2 - x1) * yd - (y2 - y1) * xd) / d;
                    if(ub >= 0 && ub <= 1){
                        return true;
                    }
                }
            }
            x3 = x4;
            y3 = y4;
        }
        return false;
    }

    /**
     * Intersects the two line segments and returns the intersection point in intersection.
     */
    static intersectSegments(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2, intersection: Vec2 | null): boolean;
    /** @param intersection May be null. */
    static intersectSegments(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number, intersection: Vec2 | null): boolean;
    static intersectSegments(a: Vec2 | number, b: Vec2 | number, c: Vec2 | number, d: Vec2 | number, e?: Vec2 | number | null, f?: Vec2 | number | null, g?: Vec2 | number | null, h?: Vec2 | number | null, intersection?: Vec2 | null): boolean{
        let x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number;
        let inter: Vec2 | null | undefined;
        if(typeof a === 'number'){
            x1 = a; y1 = b as number; x2 = c as number; y2 = d as number;
            x3 = e as number; y3 = f as number; x4 = g as number; y4 = h as number;
            inter = intersection;
        }else{
            x1 = a.x; y1 = a.y; x2 = (b as Vec2).x; y2 = (b as Vec2).y;
            x3 = (c as Vec2).x; y3 = (c as Vec2).y; x4 = (d as Vec2).x; y4 = (d as Vec2).y;
            inter = e as Vec2 | null | undefined;
        }

        const dd = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if(dd === 0) return false;

        const yd = y1 - y3;
        const xd = x1 - x3;
        const ua = ((x4 - x3) * yd - (y4 - y3) * xd) / dd;
        if(ua < 0 || ua > 1) return false;

        const ub = ((x2 - x1) * yd - (y2 - y1) * xd) / dd;
        if(ub < 0 || ub > 1) return false;

        if(inter !== null && inter !== undefined) inter.set(x1 + (x2 - x1) * ua, y1 + (y2 - y1) * ua);
        return true;
    }

    static det(a: number, b: number, c: number, d: number): number{
        return a * d - b * c;
    }

    static detd(a: number, b: number, c: number, d: number): number{
        return a * d - b * c;
    }

    static overlapsRect(x1: number, y1: number, w1: number, h1: number, x2: number, y2: number, w2: number, h2: number): boolean{
        return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
    }

    static overlaps(c1: Circle, c2: Circle): boolean;
    static overlaps(r1: Rect, r2: Rect): boolean;
    static overlaps(c: Circle, r: Rect): boolean;
    static overlaps(a: Circle | Rect, b: Circle | Rect): boolean{
        if(a instanceof Circle){
            if(b instanceof Circle){
                return a.overlaps(b);
            }
            const c = a, r = b as Rect;
            let closestX = c.x;
            let closestY = c.y;

            if(c.x < r.x){
                closestX = r.x;
            }else if(c.x > r.x + r.width){
                closestX = r.x + r.width;
            }

            if(c.y < r.y){
                closestY = r.y;
            }else if(c.y > r.y + r.height){
                closestY = r.y + r.height;
            }

            closestX = closestX - c.x;
            closestX *= closestX;
            closestY = closestY - c.y;
            closestY *= closestY;

            return closestX + closestY < c.radius * c.radius;
        }
        return (a as Rect).overlaps(b as Rect);
    }

    /**
     * Check whether specified counter-clockwise wound convex polygons overlap.
     */
    static overlapConvexPolygons(p1: Polygon, p2: Polygon): boolean;
    /**
     * Check whether specified counter-clockwise wound convex polygons overlap. If they do, optionally obtain a Minimum
     * Translation Vector.
     */
    static overlapConvexPolygons(p1: Polygon, p2: Polygon, mtv: MinimumTranslationVector | null): boolean;
    /** @see overlapConvexPolygons(float[], int, int, float[], int, int, MinimumTranslationVector) */
    static overlapConvexPolygons(verts1: number[], verts2: number[], mtv: MinimumTranslationVector | null): boolean;
    /**
     * Check whether polygons defined by the given counter-clockwise wound vertex arrays overlap.
     */
    static overlapConvexPolygons(verts1: number[], offset1: number, count1: number, verts2: number[], offset2: number, count2: number, mtv: MinimumTranslationVector | null): boolean;
    static overlapConvexPolygons(a: Polygon | number[], b?: Polygon | number[] | number, c?: MinimumTranslationVector | null | number, d?: number[] | number, e?: number | number[], f?: number | number[] | null, g?: number | null | MinimumTranslationVector, h?: MinimumTranslationVector | null): boolean{
        let verts1: number[], offset1: number, count1: number, verts2: number[], offset2: number, count2: number, mtv: MinimumTranslationVector | null;
        if(Array.isArray(a)){
            if(Array.isArray(d)){
                verts1 = a; offset1 = b as number; count1 = c as number;
                verts2 = d as number[]; offset2 = e as number; count2 = f as number;
                mtv = g as MinimumTranslationVector | null;
            }else{
                verts1 = a; offset1 = 0; count1 = a.length;
                verts2 = b as number[]; offset2 = 0; count2 = (b as number[]).length;
                mtv = c as MinimumTranslationVector | null;
            }
        }else{
            const p1 = a as Polygon, p2 = b as Polygon;
            verts1 = p1.getTransformedVertices();
            verts2 = p2.getTransformedVertices();
            offset1 = 0; count1 = verts1.length;
            offset2 = 0; count2 = verts2.length;
            mtv = c as MinimumTranslationVector | null;
        }

        let overlap = Number.MAX_VALUE;
        let smallestAxisX = 0;
        let smallestAxisY = 0;
        let numInNormalDir: number;

        const end1 = offset1 + count1;
        const end2 = offset2 + count2;

        // Get polygon1 axes
        for(let i = offset1; i < end1; i += 2){
            const x1 = verts1[i];
            const y1 = verts1[i + 1];
            const x2 = verts1[(i + 2) % count1];
            const y2 = verts1[(i + 3) % count1];

            let axisX = y1 - y2;
            let axisY = -(x1 - x2);

            const length = Math.sqrt(axisX * axisX + axisY * axisY);
            axisX /= length;
            axisY /= length;

            // -- Begin check for separation on this axis --//
            numInNormalDir = 0;

            // Project polygon1 onto this axis
            let min1 = axisX * verts1[0] + axisY * verts1[1];
            let max1 = min1;
            for(let j = offset1; j < end1; j += 2){
                const p = axisX * verts1[j] + axisY * verts1[j + 1];
                if(p < min1){
                    min1 = p;
                }else if(p > max1){
                    max1 = p;
                }
            }

            // Project polygon2 onto this axis
            numInNormalDir = 0;
            let min2 = axisX * verts2[0] + axisY * verts2[1];
            let max2 = min2;
            for(let j = offset2; j < end2; j += 2){
                // Counts the number of points that are within the projected area.
                numInNormalDir -= Intersector.pointLineSide(x1, y1, x2, y2, verts2[j], verts2[j + 1]);
                const p = axisX * verts2[j] + axisY * verts2[j + 1];
                if(p < min2){
                    min2 = p;
                }else if(p > max2){
                    max2 = p;
                }
            }

            if(!(min1 <= min2 && max1 >= min2 || min2 <= min1 && max2 >= min1)){
                return false;
            }else{
                let o = Math.min(max1, max2) - Math.max(min1, min2);
                if(min1 < min2 && max1 > max2 || min2 < min1 && max2 > max1){
                    const mins = Math.abs(min1 - min2);
                    const maxs = Math.abs(max1 - max2);
                    if(mins < maxs){
                        o += mins;
                    }else{
                        o += maxs;
                    }
                }
                if(o < overlap){
                    overlap = o;
                    // Adjusts the direction based on the number of points found
                    smallestAxisX = numInNormalDir >= 0 ? axisX : -axisX;
                    smallestAxisY = numInNormalDir >= 0 ? axisY : -axisY;
                }
            }
            // -- End check for separation on this axis --//
        }

        // Get polygon2 axes
        for(let i = offset2; i < end2; i += 2){
            const x1 = verts2[i];
            const y1 = verts2[i + 1];
            const x2 = verts2[(i + 2) % count2];
            const y2 = verts2[(i + 3) % count2];

            let axisX = y1 - y2;
            let axisY = -(x1 - x2);

            const length = Math.sqrt(axisX * axisX + axisY * axisY);
            axisX /= length;
            axisY /= length;

            // -- Begin check for separation on this axis --//
            numInNormalDir = 0;

            // Project polygon1 onto this axis
            let min1 = axisX * verts1[0] + axisY * verts1[1];
            let max1 = min1;
            for(let j = offset1; j < end1; j += 2){
                const p = axisX * verts1[j] + axisY * verts1[j + 1];
                // Counts the number of points that are within the projected area.
                numInNormalDir -= Intersector.pointLineSide(x1, y1, x2, y2, verts1[j], verts1[j + 1]);
                if(p < min1){
                    min1 = p;
                }else if(p > max1){
                    max1 = p;
                }
            }

            // Project polygon2 onto this axis
            let min2 = axisX * verts2[0] + axisY * verts2[1];
            let max2 = min2;
            for(let j = offset2; j < end2; j += 2){
                const p = axisX * verts2[j] + axisY * verts2[j + 1];
                if(p < min2){
                    min2 = p;
                }else if(p > max2){
                    max2 = p;
                }
            }

            if(!(min1 <= min2 && max1 >= min2 || min2 <= min1 && max2 >= min1)){
                return false;
            }else{
                let o = Math.min(max1, max2) - Math.max(min1, min2);

                if(min1 < min2 && max1 > max2 || min2 < min1 && max2 > max1){
                    const mins = Math.abs(min1 - min2);
                    const maxs = Math.abs(max1 - max2);
                    if(mins < maxs){
                        o += mins;
                    }else{
                        o += maxs;
                    }
                }

                if(o < overlap){
                    overlap = o;
                    // Adjusts the direction based on the number of points found
                    smallestAxisX = numInNormalDir < 0 ? axisX : -axisX;
                    smallestAxisY = numInNormalDir < 0 ? axisY : -axisY;
                }
            }
            // -- End check for separation on this axis --//
        }
        if(mtv !== null){
            mtv.normal.set(smallestAxisX, smallestAxisY);
            mtv.depth = overlap;
        }
        return true;
    }

    /** 嵌套类 Intersector.MinimumTranslationVector 的 TS 别名. */
    static readonly MinimumTranslationVector = MinimumTranslationVector;
}
