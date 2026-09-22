// 源: arc-core/src/arc/math/geom/Bezier.java
// 迁移说明: 逐字移植。Seq<T> 为文件内最小本地实现, 避免依赖 struct 包。
// TODO: 迁移到 struct 统一实现
import {Mathf} from '../Mathf';
import {Path} from './Path';
import {Vector} from './Vector';
import {ArcRuntimeException} from '../ArcRuntimeException';

/** 对应 arc.struct.Seq 的最小本地实现. */
// TODO: 迁移到 struct 统一实现
export class Seq<T>{
    items: T[] = [];
    size = 0;

    get(i: number): T{
        return this.items[i];
    }

    add(t: T): void;
    add(t1: T, t2: T, t3: T): void;
    add(a: T, b?: T, c?: T): void{
        if(b === undefined){
            if(this.size === this.items.length) this.items.push(a);
            else this.items[this.size] = a;
            this.size++;
        }else{
            this.add(a);
            this.add(b);
            this.add(c!);
        }
    }

    addAll(items: T[]): void;
    addAll(items: T[], offset: number, length: number): void;
    addAll(seq: Seq<T>): void;
    addAll(seq: Seq<T>, offset: number, length: number): void;
    addAll(a: T[] | Seq<T>, offset?: number, length?: number): void{
        if(Array.isArray(a)){
            const off = offset ?? 0;
            const len = length ?? a.length;
            for(let i = off; i < off + len; i++){
                this.add(a[i]);
            }
        }else{
            for(let i = 0; i < a.size; i++){
                this.add(a.items[i]);
            }
        }
    }

    clear(): void{
        this.size = 0;
    }
}

/**
 * Implementation of the Bezier curve.
 */
export class Bezier<T extends Vector<T>> implements Path<T>{
    points = new Seq<T>();
    private tmp: T | null = null;
    private tmp2: T | null = null;
    private tmp3: T | null = null;

    constructor();
    constructor(points: T[]);
    constructor(points: T[], offset: number, length: number);
    constructor(points: Seq<T>);
    constructor(points: Seq<T>, offset: number, length: number);
    constructor(points?: T[] | Seq<T>, offset?: number, length?: number){
        if(points === undefined) return;
        if(Array.isArray(points)){
            if(offset === undefined){
                this.set(points);
            }else{
                this.set(points, offset, length!);
            }
        }else{
            if(offset === undefined){
                this.set(points);
            }else{
                this.set(points, offset, length!);
            }
        }
    }

    /**
     * Simple Linear interpolation
     */
    static linear<T extends Vector<T>>(out: T, t: number, p0: T, p1: T, tmp: T): T{
        // B1(t) = p0 + (p1-p0)*t
        return out.set(p0).scl(1 - t).add(tmp.set(p1).scl(t)); // Could just use lerp...
    }

    /**
     * Simple Linear interpolation derivative
     */
    static linearDerivative<T extends Vector<T>>(out: T, t: number, p0: T, p1: T, tmp: T): T{
        // B1'(t) = p1-p0
        return out.set(p1).sub(p0);
    }

    /**
     * Quadratic Bezier curve
     */
    static quadratic<T extends Vector<T>>(out: T, t: number, p0: T, p1: T, p2: T, tmp: T): T{
        // B2(t) = (1 - t) * (1 - t) * p0 + 2 * (1-t) * t * p1 + t*t*p2
        const dt = 1 - t;
        return out.set(p0).scl(dt * dt).add(tmp.set(p1).scl(2 * dt * t)).add(tmp.set(p2).scl(t * t));
    }

    /**
     * Quadratic Bezier curve derivative
     */
    static quadraticDerivative<T extends Vector<T>>(out: T, t: number, p0: T, p1: T, p2: T, tmp: T): T{
        // B2'(t) = 2 * (1 - t) * (p1 - p0) + 2 * t * (p2 - p1)
        const dt = 1 - t;
        return out.set(p1).sub(p0).scl(2).scl(1 - t).add(tmp.set(p2).sub(p1).scl(t).scl(2));
    }

    /**
     * Cubic Bezier curve
     */
    static cubic<T extends Vector<T>>(out: T, t: number, p0: T, p1: T, p2: T, p3: T, tmp: T): T{
        // B3(t) = (1-t) * (1-t) * (1-t) * p0 + 3 * (1-t) * (1-t) * t * p1 + 3 * (1-t) * t * t * p2 + t * t * t * p3
        const dt = 1 - t;
        const dt2 = dt * dt;
        const t2 = t * t;
        return out.set(p0).scl(dt2 * dt).add(tmp.set(p1).scl(3 * dt2 * t)).add(tmp.set(p2).scl(3 * dt * t2))
        .add(tmp.set(p3).scl(t2 * t));
    }

    /**
     * Cubic Bezier curve derivative
     */
    static cubicDerivative<T extends Vector<T>>(out: T, t: number, p0: T, p1: T, p2: T, p3: T, tmp: T): T{
        // B3'(t) = 3 * (1-t) * (1-t) * (p1 - p0) + 6 * (1 - t) * t * (p2 - p1) + 3 * t * t * (p3 - p2)
        const dt = 1 - t;
        const dt2 = dt * dt;
        const t2 = t * t;
        return out.set(p1).sub(p0).scl(dt2 * 3).add(tmp.set(p2).sub(p1).scl(dt * t * 6)).add(tmp.set(p3).sub(p2).scl(t2 * 3));
    }

    set(points: T[]): Bezier<T>;
    set(points: T[], offset: number, length: number): Bezier<T>;
    set(p1: T, p2: T, p3: T): Bezier<T>;
    set(points: Seq<T>): Bezier<T>;
    set(points: Seq<T>, offset: number, length: number): Bezier<T>;
    set(a: T[] | Seq<T> | T, b?: number | T, c?: number | T): Bezier<T>{
        if(Array.isArray(a)){
            const offset = (typeof b === 'number') ? b : 0;
            const length = (typeof b === 'number') ? c as number : a.length;
            if(length < 2 || length > 4)
                throw new ArcRuntimeException('Only first, second and third degree Bezier curves are supported.');
            if(this.tmp === null) this.tmp = a[0].cpy();
            if(this.tmp2 === null) this.tmp2 = a[0].cpy();
            if(this.tmp3 === null) this.tmp3 = a[0].cpy();
            this.points.clear();
            this.points.addAll(a, offset, length);
        }else if(a instanceof Seq){
            const offset = (typeof b === 'number') ? b : 0;
            const length = (typeof b === 'number') ? c as number : a.size;
            if(length < 2 || length > 4)
                throw new ArcRuntimeException('Only first, second and third degree Bezier curves are supported.');
            if(this.tmp === null) this.tmp = a.get(0).cpy();
            if(this.tmp2 === null) this.tmp2 = a.get(0).cpy();
            if(this.tmp3 === null) this.tmp3 = a.get(0).cpy();
            this.points.clear();
            this.points.addAll(a, offset, length);
        }else{
            const p1 = a as T, p2 = b as T, p3 = c as T;
            if(this.tmp === null) this.tmp = p1.cpy();
            if(this.tmp2 === null) this.tmp2 = p2.cpy();
            if(this.tmp3 === null) this.tmp3 = p3.cpy();
            this.points.clear();
            this.points.add(p1, p2, p3);
        }
        return this;
    }

    valueAt(out: T, t: number): T{
        const n = this.points.size;
        if(n === 2)
            Bezier.linear(out, t, this.points.get(0), this.points.get(1), this.tmp!);
        else if(n === 3)
            Bezier.quadratic(out, t, this.points.get(0), this.points.get(1), this.points.get(2), this.tmp!);
        else if(n === 4) Bezier.cubic(out, t, this.points.get(0), this.points.get(1), this.points.get(2), this.points.get(3), this.tmp!);
        return out;
    }

    derivativeAt(out: T, t: number): T{
        const n = this.points.size;
        if(n === 2)
            Bezier.linearDerivative(out, t, this.points.get(0), this.points.get(1), this.tmp!);
        else if(n === 3)
            Bezier.quadraticDerivative(out, t, this.points.get(0), this.points.get(1), this.points.get(2), this.tmp!);
        else if(n === 4) Bezier.cubicDerivative(out, t, this.points.get(0), this.points.get(1), this.points.get(2), this.points.get(3), this.tmp!);
        return out;
    }

    approximate(v: T): number{
        // TODO: make a real approximate method
        const p1 = this.points.get(0);
        const p2 = this.points.get(this.points.size - 1);
        const l1Sqr = p1.dst2(p2);
        const l2Sqr = v.dst2(p2);
        const l3Sqr = v.dst2(p1);
        const l1 = Math.sqrt(l1Sqr);
        const s = (l2Sqr + l1Sqr - l3Sqr) / (2 * l1);
        return Mathf.clamp((l1 - s) / l1, 0, 1);
    }

    locate(v: T): number{
        // TODO implement a precise method
        return this.approximate(v);
    }

    approxLength(samples: number): number{
        let tempLength = 0;
        for(let i = 0; i < samples; ++i){
            this.tmp2!.set(this.tmp3!);
            this.valueAt(this.tmp3!, (i) / (samples - 1));
            if(i > 0) tempLength += this.tmp2!.dst(this.tmp3!);
        }
        return tempLength;
    }
}
