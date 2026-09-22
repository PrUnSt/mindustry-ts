// 源: arc-core/src/arc/math/geom/CatmullRomSpline.java
// 迁移说明: 逐字移植。Java 的 int/float 重载在 TS 中合并为 重载签名 + 单一实现 (按实参类型/数量分派)。
import {Mathf} from '../Mathf';
import {Path} from './Path';
import {Vector} from './Vector';

export class CatmullRomSpline<T extends Vector<T>> implements Path<T>{
    controlPoints: T[] = [];
    continuous = false;
    spanCount = 0;
    private tmp: T | null = null;
    private tmp2: T | null = null;
    private tmp3: T | null = null;

    constructor();
    constructor(controlPoints: T[], continuous: boolean);
    constructor(controlPoints?: T[], continuous?: boolean){
        if(controlPoints !== undefined){
            this.set(controlPoints, continuous!);
        }
    }

    /**
     * Calculates the catmullrom value for the given position (t).
     */
    static calculate<T extends Vector<T>>(out: T, t: number, points: T[], continuous: boolean, tmp: T): T;
    /**
     * Calculates the catmullrom value for the given span (i) at the given position (u).
     */
    static calculate<T extends Vector<T>>(out: T, i: number, u: number, points: T[], continuous: boolean, tmp: T): T;
    static calculate<T extends Vector<T>>(out: T, a: number, b: number | T[], c?: T[] | boolean, d?: boolean | T, e?: T): T{
        if(typeof b === 'number'){
            // span 形式: (out, i, u, points, continuous, tmp)
            const i = a, u = b, points = c as T[], continuous = d as boolean, tmp = e as T;
            const n = points.length;
            const u2 = u * u;
            const u3 = u2 * u;
            out.set(points[i]).scl(1.5 * u3 - 2.5 * u2 + 1.0);
            if(continuous || i > 0) out.add(tmp.set(points[(n + i - 1) % n]).scl(-0.5 * u3 + u2 - 0.5 * u));
            if(continuous || i < (n - 1)) out.add(tmp.set(points[(i + 1) % n]).scl(-1.5 * u3 + 2 * u2 + 0.5 * u));
            if(continuous || i < (n - 2)) out.add(tmp.set(points[(i + 2) % n]).scl(0.5 * u3 - 0.5 * u2));
            return out;
        }
        // t 形式: (out, t, points, continuous, tmp)
        const t = a, points = b as T[], continuous = c as boolean, tmp = d as T;
        const n = continuous ? points.length : points.length - 3;
        let u = t * n;
        let i = (t >= 1) ? (n - 1) : Math.trunc(u);
        u -= i;
        return CatmullRomSpline.calculate(out, i, u, points, continuous, tmp);
    }

    /**
     * Calculates the derivative of the catmullrom spline for the given position (t).
     */
    static derivative<T extends Vector<T>>(out: T, t: number, points: T[], continuous: boolean, tmp: T): T;
    /**
     * Calculates the derivative of the catmullrom spline for the given span (i) at the given position (u).
     */
    static derivative<T extends Vector<T>>(out: T, i: number, u: number, points: T[], continuous: boolean, tmp: T): T;
    static derivative<T extends Vector<T>>(out: T, a: number, b: number | T[], c?: T[] | boolean, d?: boolean | T, e?: T): T{
        /*
         * catmull'(u) = 0.5 *((-p0 + p2) + 2 * (2*p0 - 5*p1 + 4*p2 - p3) * u + 3 * (-p0 + 3*p1 - 3*p2 + p3) * u * u)
         */
        if(typeof b === 'number'){
            const i = a, u = b, points = c as T[], continuous = d as boolean, tmp = e as T;
            const n = points.length;
            const u2 = u * u;
            out.set(points[i]).scl(-u * 5 + u2 * 4.5);
            if(continuous || i > 0) out.add(tmp.set(points[(n + i - 1) % n]).scl(-0.5 + u * 2 - u2 * 1.5));
            if(continuous || i < (n - 1)) out.add(tmp.set(points[(i + 1) % n]).scl(0.5 + u * 4 - u2 * 4.5));
            if(continuous || i < (n - 2)) out.add(tmp.set(points[(i + 2) % n]).scl(-u + u2 * 1.5));
            return out;
        }
        const t = a, points = b as T[], continuous = c as boolean, tmp = d as T;
        const n = continuous ? points.length : points.length - 3;
        let u = t * n;
        let i = (t >= 1) ? (n - 1) : Math.trunc(u);
        u -= i;
        return CatmullRomSpline.derivative(out, i, u, points, continuous, tmp);
    }

    set(controlPoints: T[], continuous: boolean): CatmullRomSpline<T>{
        if(this.tmp === null) this.tmp = controlPoints[0].cpy();
        if(this.tmp2 === null) this.tmp2 = controlPoints[0].cpy();
        if(this.tmp3 === null) this.tmp3 = controlPoints[0].cpy();
        this.controlPoints = controlPoints;
        this.continuous = continuous;
        this.spanCount = continuous ? controlPoints.length : controlPoints.length - 3;
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
        return CatmullRomSpline.calculate(out, this.continuous ? a : (a + 1), b, this.controlPoints, this.continuous, this.tmp!);
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
        return CatmullRomSpline.derivative(out, this.continuous ? a : (a + 1), b, this.controlPoints, this.continuous, this.tmp!);
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
        let dst = inp.dst2(this.controlPoints[result]);
        for(let i = 1; i < count!; i++){
            const idx = (s + i) % this.spanCount;
            const d = inp.dst2(this.controlPoints[idx]);
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
            const nearest = this.controlPoints[n];
            const previous = this.controlPoints[n > 0 ? n - 1 : this.spanCount - 1];
            const next = this.controlPoints[(n + 1) % this.spanCount];
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
