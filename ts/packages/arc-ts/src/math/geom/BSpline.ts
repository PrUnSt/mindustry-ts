// 源: arc-core/src/arc/math/geom/BSpline.java
// 迁移说明: 逐字移植。Seq<T> 为文件内最小本地实现, 避免依赖 struct 包。
// Java 的 int/float 重载在 TS 中合并为 重载签名 + 单一实现 (按实参类型/数量分派)。
// TODO: 迁移到 struct 统一实现
import {Mathf} from '../Mathf';
import {Path} from './Path';
import {Vector} from './Vector';

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

    clear(): void{
        this.size = 0;
    }

    ensureCapacity(additionalCapacity: number): void{
        // 本地实现无需预分配
    }
}

export class BSpline<T extends Vector<T>> implements Path<T>{
    private static readonly d6 = 1 / 6;
    controlPoints: T[] = [];
    knots = new Seq<T>();
    degree = 0;
    continuous = false;
    spanCount = 0;
    private tmp: T | null = null;
    private tmp2: T | null = null;
    private tmp3: T | null = null;

    constructor();
    constructor(controlPoints: T[], degree: number, continuous: boolean);
    constructor(controlPoints?: T[], degree?: number, continuous?: boolean){
        if(controlPoints !== undefined){
            this.set(controlPoints, degree!, continuous!);
        }
    }

    /**
     * Calculates the cubic b-spline value for the given position (t).
     */
    static cubic<T extends Vector<T>>(out: T, t: number, points: T[], continuous: boolean, tmp: T): T;
    /**
     * Calculates the cubic b-spline value for the given span (i) at the given position (u).
     */
    static cubic<T extends Vector<T>>(out: T, i: number, u: number, points: T[], continuous: boolean, tmp: T): T;
    static cubic<T extends Vector<T>>(out: T, a: number, b: number | T[], c?: T[] | boolean, d?: boolean | T, e?: T): T{
        if(typeof b === 'number'){
            const i = a, u = b, points = c as T[], continuous = d as boolean, tmp = e as T;
            const n = points.length;
            const dt = 1 - u;
            const t2 = u * u;
            const t3 = t2 * u;
            out.set(points[i]).scl((3 * t3 - 6 * t2 + 4) * BSpline.d6);
            if(continuous || i > 0) out.add(tmp.set(points[(n + i - 1) % n]).scl(dt * dt * dt * BSpline.d6));
            if(continuous || i < (n - 1))
                out.add(tmp.set(points[(i + 1) % n]).scl((-3 * t3 + 3 * t2 + 3 * u + 1) * BSpline.d6));
            if(continuous || i < (n - 2)) out.add(tmp.set(points[(i + 2) % n]).scl(t3 * BSpline.d6));
            return out;
        }
        const t = a, points = b as T[], continuous = c as boolean, tmp = d as T;
        const n = continuous ? points.length : points.length - 3;
        let u = t * n;
        let i = (t >= 1) ? (n - 1) : Math.trunc(u);
        u -= i;
        return BSpline.cubic(out, i, u, points, continuous, tmp);
    }

    /**
     * Calculates the cubic b-spline derivative for the given position (t).
     */
    static cubic_derivative<T extends Vector<T>>(out: T, t: number, points: T[], continuous: boolean, tmp: T): T;
    /**
     * Calculates the cubic b-spline derivative for the given span (i) at the given position (u).
     */
    static cubic_derivative<T extends Vector<T>>(out: T, i: number, u: number, points: T[], continuous: boolean, tmp: T): T;
    static cubic_derivative<T extends Vector<T>>(out: T, a: number, b: number | T[], c?: T[] | boolean, d?: boolean | T, e?: T): T{
        if(typeof b === 'number'){
            const i = a, u = b, points = c as T[], continuous = d as boolean, tmp = e as T;
            const n = points.length;
            const dt = 1 - u;
            const t2 = u * u;
            const t3 = t2 * u;
            out.set(points[i]).scl(1.5 * t2 - 2 * u);
            if(continuous || i > 0) out.add(tmp.set(points[(n + i - 1) % n]).scl(-0.5 * dt * dt));
            if(continuous || i < (n - 1)) out.add(tmp.set(points[(i + 1) % n]).scl(-1.5 * t2 + u + 0.5));
            if(continuous || i < (n - 2)) out.add(tmp.set(points[(i + 2) % n]).scl(0.5 * t2));
            return out;
        }
        const t = a, points = b as T[], continuous = c as boolean, tmp = d as T;
        const n = continuous ? points.length : points.length - 3;
        let u = t * n;
        let i = (t >= 1) ? (n - 1) : Math.trunc(u);
        u -= i;
        return BSpline.cubic(out, i, u, points, continuous, tmp);
    }

    /**
     * Calculates the n-degree b-spline value for the given position (t).
     */
    static calculate<T extends Vector<T>>(out: T, t: number, points: T[], degree: number, continuous: boolean, tmp: T): T;
    /**
     * Calculates the n-degree b-spline value for the given span (i) at the given position (u).
     */
    static calculate<T extends Vector<T>>(out: T, i: number, u: number, points: T[], degree: number, continuous: boolean, tmp: T): T;
    static calculate<T extends Vector<T>>(out: T, a: number, b: number | T[], c?: T[] | number, d?: number | boolean, e?: boolean | T, f?: T): T{
        if(typeof b === 'number'){
            const i = a, u = b, points = c as T[], degree = d as number, continuous = e as boolean, tmp = f as T;
            if(degree === 3){
                return BSpline.cubic(out, i, u, points, continuous, tmp);
            }
            return out;
        }
        const t = a, points = b as T[], degree = c as number, continuous = d as boolean, tmp = e as T;
        const n = continuous ? points.length : points.length - degree;
        let u = t * n;
        let i = (t >= 1) ? (n - 1) : Math.trunc(u);
        u -= i;
        return BSpline.calculate(out, i, u, points, degree, continuous, tmp);
    }

    /**
     * Calculates the n-degree b-spline derivative for the given position (t).
     */
    static derivative<T extends Vector<T>>(out: T, t: number, points: T[], degree: number, continuous: boolean, tmp: T): T;
    /**
     * Calculates the n-degree b-spline derivative for the given span (i) at the given position (u).
     */
    static derivative<T extends Vector<T>>(out: T, i: number, u: number, points: T[], degree: number, continuous: boolean, tmp: T): T;
    static derivative<T extends Vector<T>>(out: T, a: number, b: number | T[], c?: T[] | number, d?: number | boolean, e?: boolean | T, f?: T): T{
        if(typeof b === 'number'){
            const i = a, u = b, points = c as T[], degree = d as number, continuous = e as boolean, tmp = f as T;
            if(degree === 3){
                return BSpline.cubic_derivative(out, i, u, points, continuous, tmp);
            }
            return out;
        }
        const t = a, points = b as T[], degree = c as number, continuous = d as boolean, tmp = e as T;
        const n = continuous ? points.length : points.length - degree;
        let u = t * n;
        let i = (t >= 1) ? (n - 1) : Math.trunc(u);
        u -= i;
        return BSpline.derivative(out, i, u, points, degree, continuous, tmp);
    }

    set(controlPoints: T[], degree: number, continuous: boolean): BSpline<T>{
        if(this.tmp === null) this.tmp = controlPoints[0].cpy();
        if(this.tmp2 === null) this.tmp2 = controlPoints[0].cpy();
        if(this.tmp3 === null) this.tmp3 = controlPoints[0].cpy();
        this.controlPoints = controlPoints;
        this.degree = degree;
        this.continuous = continuous;
        this.spanCount = continuous ? controlPoints.length : controlPoints.length - degree;
        this.knots.clear();
        this.knots.ensureCapacity(this.spanCount);
        for(let i = 0; i < this.spanCount; i++){
            this.knots.add(BSpline.calculate(controlPoints[0].cpy(), continuous ? i : Math.trunc(i + 0.5 * degree), 0, controlPoints, degree, continuous, this.tmp));
        }
        return this;
    }

    valueAt(out: T, t: number): T;
    /** @return The value of the spline at position u of the specified span */
    valueAt(out: T, span: number, u: number): T;
    valueAt(out: T, a: number, b?: number): T{
        if(b === undefined){
            const n = this.spanCount;
            let u = a * n;
            let i = (a >= 1) ? (n - 1) : Math.trunc(u);
            u -= i;
            return this.valueAt(out, i, u);
        }
        return BSpline.calculate(out, this.continuous ? a : (a + Math.trunc(this.degree * 0.5)), b, this.controlPoints, this.degree, this.continuous, this.tmp!);
    }

    derivativeAt(out: T, t: number): T;
    /** @return The derivative of the spline at position u of the specified span */
    derivativeAt(out: T, span: number, u: number): T;
    derivativeAt(out: T, a: number, b?: number): T{
        if(b === undefined){
            const n = this.spanCount;
            let u = a * n;
            let i = (a >= 1) ? (n - 1) : Math.trunc(u);
            u -= i;
            return this.derivativeAt(out, i, u);
        }
        return BSpline.derivative(out, this.continuous ? a : (a + Math.trunc(this.degree * 0.5)), b, this.controlPoints, this.degree, this.continuous, this.tmp!);
    }

    /** @return The span closest to the specified value */
    nearest(inp: T): number;
    /** @return The span closest to the specified value, restricting to the specified spans. */
    nearest(inp: T, start: number, count: number): number;
    nearest(inp: T, start?: number, count?: number): number{
        if(start === undefined) return this.nearest(inp, 0, this.spanCount);
        let s = start;
        while(s < 0)
            s += this.spanCount;
        let result = s % this.spanCount;
        let dst = inp.dst2(this.knots.get(result));
        for(let i = 1; i < count!; i++){
            const idx = (s + i) % this.spanCount;
            const d = inp.dst2(this.knots.get(idx));
            if(d < dst){
                dst = d;
                result = idx;
            }
        }
        return result;
    }

    approximate(v: T): number;
    approximate(inp: T, start: number, count: number): number;
    approximate(inp: T, near: number): number;
    approximate(inp: T, a?: number, b?: number): number{
        if(a === undefined) return this.approximate(inp, this.nearest(inp));
        if(b === undefined){
            let n = a;
            const nearest = this.knots.get(n);
            const previous = this.knots.get(n > 0 ? n - 1 : this.spanCount - 1);
            const next = this.knots.get((n + 1) % this.spanCount);
            const dstPrev2 = inp.dst2(previous);
            const dstNext2 = inp.dst2(next);
            let P1: T, P2: T, P3: T;
            if(dstNext2 < dstPrev2){
                P1 = nearest;
                P2 = next;
                P3 = inp;
            }else{
                P1 = previous;
                P2 = nearest;
                P3 = inp;
                n = n > 0 ? n - 1 : this.spanCount - 1;
            }
            const L1Sqr = P1.dst2(P2);
            const L2Sqr = P3.dst2(P2);
            const L3Sqr = P3.dst2(P1);
            const L1 = Math.sqrt(L1Sqr);
            const s = (L2Sqr + L1Sqr - L3Sqr) / (2 * L1);
            const u = Mathf.clamp((L1 - s) / L1, 0, 1);
            return (n + u) / this.spanCount;
        }
        return this.approximate(inp, this.nearest(inp, a, b));
    }

    locate(v: T): number{
        // TODO Add a precise method
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
