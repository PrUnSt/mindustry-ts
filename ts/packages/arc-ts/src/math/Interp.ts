// 源: arc-core/src/arc/math/Interp.java
// 迁移说明: Java 接口 + 静态实例 + 嵌套类 在 TS 中通过 interface + namespace 合并实现。
// 所有实例保持 Interp.xxx 的访问形式; apply(start, end, a) 为默认方法语义 start + (end-start)*apply(a)。
import {Mathf} from './Mathf';

/**
 * Takes a Linear value in the range of 0-1 and outputs a (usually) non-Linear, interpolated value.
 */
export interface Interp{
    /** @param a Alpha value between 0 and 1. */
    apply(a: number): number;

    /** @param a Alpha value between 0 and 1. */
    apply(start: number, end: number, a: number): number;
}

export namespace Interp{
    /** 包装纯一元插值函数, 补全默认的 (start, end, a) 重载. */
    function interp(fn: (a: number) => number): Interp{
        return {
            apply(a: number, end?: number, alpha?: number): number{
                if(end !== undefined && alpha !== undefined) return a + (end - a) * fn(alpha);
                return fn(a);
            }
        };
    }

    export class Pow implements Interp{
        readonly power: number;

        constructor(power: number){
            this.power = power;
        }

        apply(a: number, end?: number, alpha?: number): number{
            if(end !== undefined && alpha !== undefined) return a + (end - a) * this.apply(alpha);
            if(a <= 0.5) return Math.pow(a * 2, this.power) / 2;
            return Math.pow((a - 1) * 2, this.power) / (this.power % 2 === 0 ? -2 : 2) + 1;
        }
    }

    export class PowIn extends Pow{
        constructor(power: number){
            super(power);
        }

        apply(a: number, end?: number, alpha?: number): number{
            if(end !== undefined && alpha !== undefined) return a + (end - a) * this.apply(alpha);
            return Math.pow(a, this.power);
        }
    }

    export class PowOut extends Pow{
        constructor(power: number){
            super(power);
        }

        apply(a: number, end?: number, alpha?: number): number{
            if(end !== undefined && alpha !== undefined) return a + (end - a) * this.apply(alpha);
            return Math.pow(a - 1, this.power) * (this.power % 2 === 0 ? -1 : 1) + 1;
        }
    }

    export class Exp implements Interp{
        readonly value: number;
        readonly power: number;
        readonly min: number;
        readonly scale: number;

        constructor(value: number, power: number){
            this.value = value;
            this.power = power;
            this.min = Math.pow(value, -power);
            this.scale = 1 / (1 - this.min);
        }

        apply(a: number, end?: number, alpha?: number): number{
            if(end !== undefined && alpha !== undefined) return a + (end - a) * this.apply(alpha);
            if(a <= 0.5) return (Math.pow(this.value, this.power * (a * 2 - 1)) - this.min) * this.scale / 2;
            return (2 - (Math.pow(this.value, -this.power * (a * 2 - 1)) - this.min) * this.scale) / 2;
        }
    }

    export class ExpIn extends Exp{
        constructor(value: number, power: number){
            super(value, power);
        }

        apply(a: number, end?: number, alpha?: number): number{
            if(end !== undefined && alpha !== undefined) return a + (end - a) * this.apply(alpha);
            return (Math.pow(this.value, this.power * (a - 1)) - this.min) * this.scale;
        }
    }

    export class ExpOut extends Exp{
        constructor(value: number, power: number){
            super(value, power);
        }

        apply(a: number, end?: number, alpha?: number): number{
            if(end !== undefined && alpha !== undefined) return a + (end - a) * this.apply(alpha);
            return 1 - (Math.pow(this.value, -this.power * a) - this.min) * this.scale;
        }
    }

    export class Elastic implements Interp{
        readonly value: number;
        readonly power: number;
        readonly scale: number;
        readonly bounces: number;

        constructor(value: number, power: number, bounces: number, scale: number){
            this.value = value;
            this.power = power;
            this.scale = scale;
            this.bounces = bounces * Mathf.PI * (bounces % 2 === 0 ? 1 : -1);
        }

        apply(a: number, end?: number, alpha?: number): number{
            if(end !== undefined && alpha !== undefined) return a + (end - a) * this.apply(alpha);
            if(a <= 0.5){
                a *= 2;
                return Math.pow(this.value, this.power * (a - 1)) * Mathf.sin(a * this.bounces) * this.scale / 2;
            }
            a = 1 - a;
            a *= 2;
            return 1 - Math.pow(this.value, this.power * (a - 1)) * Mathf.sin(a * this.bounces) * this.scale / 2;
        }
    }

    export class ElasticIn extends Elastic{
        constructor(value: number, power: number, bounces: number, scale: number){
            super(value, power, bounces, scale);
        }

        apply(a: number, end?: number, alpha?: number): number{
            if(end !== undefined && alpha !== undefined) return a + (end - a) * this.apply(alpha);
            if(a >= 0.99) return 1;
            return Math.pow(this.value, this.power * (a - 1)) * Mathf.sin(a * this.bounces) * this.scale;
        }
    }

    export class ElasticOut extends Elastic{
        constructor(value: number, power: number, bounces: number, scale: number){
            super(value, power, bounces, scale);
        }

        apply(a: number, end?: number, alpha?: number): number{
            if(end !== undefined && alpha !== undefined) return a + (end - a) * this.apply(alpha);
            if(a === 0) return 0;
            a = 1 - a;
            return (1 - Math.pow(this.value, this.power * (a - 1)) * Mathf.sin(a * this.bounces) * this.scale);
        }
    }

    export class BounceOut implements Interp{
        readonly widths: number[];
        readonly heights: number[];

        constructor(widths: number[], heights: number[]);
        constructor(bounces: number);
        constructor(widths: number[] | number, heights?: number[]){
            if(typeof widths === 'number'){
                const bounces = widths;
                if(bounces < 2 || bounces > 5)
                    throw new Error('bounces cannot be < 2 or > 5: ' + bounces);
                this.widths = new Array<number>(bounces);
                this.heights = new Array<number>(bounces);
                this.heights[0] = 1;
                switch(bounces){
                    case 2:
                        this.widths[0] = 0.6;
                        this.widths[1] = 0.4;
                        this.heights[1] = 0.33;
                        break;
                    case 3:
                        this.widths[0] = 0.4;
                        this.widths[1] = 0.4;
                        this.widths[2] = 0.2;
                        this.heights[1] = 0.33;
                        this.heights[2] = 0.1;
                        break;
                    case 4:
                        this.widths[0] = 0.34;
                        this.widths[1] = 0.34;
                        this.widths[2] = 0.2;
                        this.widths[3] = 0.15;
                        this.heights[1] = 0.26;
                        this.heights[2] = 0.11;
                        this.heights[3] = 0.03;
                        break;
                    case 5:
                        this.widths[0] = 0.3;
                        this.widths[1] = 0.3;
                        this.widths[2] = 0.2;
                        this.widths[3] = 0.1;
                        this.widths[4] = 0.1;
                        this.heights[1] = 0.45;
                        this.heights[2] = 0.3;
                        this.heights[3] = 0.15;
                        this.heights[4] = 0.06;
                        break;
                }
                this.widths[0] *= 2;
            }else{
                if(widths.length !== heights!.length)
                    throw new Error('Must be the same number of widths and heights.');
                this.widths = widths;
                this.heights = heights!;
            }
        }

        apply(a: number, end?: number, alpha?: number): number{
            if(end !== undefined && alpha !== undefined) return a + (end - a) * this.apply(alpha);
            if(a === 1) return 1;
            a += this.widths[0] / 2;
            let width = 0, height = 0;
            for(let i = 0, n = this.widths.length; i < n; i++){
                width = this.widths[i];
                if(a <= width){
                    height = this.heights[i];
                    break;
                }
                a -= width;
            }
            a /= width;
            const z = 4 / width * height * a;
            return 1 - (z - z * a) * width;
        }
    }

    export class Bounce extends BounceOut{
        constructor(widths: number[], heights: number[]);
        constructor(bounces: number);
        constructor(a: number[] | number, b?: number[]){
            if(typeof a === 'number'){
                super(a);
            }else{
                super(a, b!);
            }
        }

        private out(a: number): number{
            const test = a + this.widths[0] / 2;
            if(test < this.widths[0]) return test / (this.widths[0] / 2) - 1;
            return super.apply(a);
        }

        apply(a: number, end?: number, alpha?: number): number{
            if(end !== undefined && alpha !== undefined) return a + (end - a) * this.apply(alpha);
            if(a <= 0.5) return (1 - this.out(1 - a * 2)) / 2;
            return this.out(a * 2 - 1) / 2 + 0.5;
        }
    }

    export class BounceIn extends BounceOut{
        constructor(widths: number[], heights: number[]);
        constructor(bounces: number);
        constructor(a: number[] | number, b?: number[]){
            if(typeof a === 'number'){
                super(a);
            }else{
                super(a, b!);
            }
        }

        apply(a: number, end?: number, alpha?: number): number{
            if(end !== undefined && alpha !== undefined) return a + (end - a) * this.apply(alpha);
            return 1 - super.apply(1 - a);
        }
    }

    export class Swing implements Interp{
        private readonly scale: number;

        constructor(scale: number){
            this.scale = scale * 2;
        }

        apply(a: number, end?: number, alpha?: number): number{
            if(end !== undefined && alpha !== undefined) return a + (end - a) * this.apply(alpha);
            if(a <= 0.5){
                a *= 2;
                return a * a * ((this.scale + 1) * a - this.scale) / 2;
            }
            a--;
            a *= 2;
            return a * a * ((this.scale + 1) * a + this.scale) / 2 + 1;
        }
    }

    export class SwingOut implements Interp{
        private readonly scale: number;

        constructor(scale: number){
            this.scale = scale;
        }

        apply(a: number, end?: number, alpha?: number): number{
            if(end !== undefined && alpha !== undefined) return a + (end - a) * this.apply(alpha);
            a--;
            return a * a * ((this.scale + 1) * a + this.scale) + 1;
        }
    }

    export class SwingIn implements Interp{
        private readonly scale: number;

        constructor(scale: number){
            this.scale = scale;
        }

        apply(a: number, end?: number, alpha?: number): number{
            if(end !== undefined && alpha !== undefined) return a + (end - a) * this.apply(alpha);
            return a * a * ((this.scale + 1) * a - this.scale);
        }
    }

    export const linear: Interp = interp(a => a);
    export const reverse: Interp = interp(a => 1 - a);
    /** Aka "smoothstep". */
    export const smooth: Interp = interp(a => a * a * (3 - 2 * a));

    export const smooth2: Interp = interp(a => {
        a = a * a * (3 - 2 * a);
        return a * a * (3 - 2 * a);
    });

    export const one: Interp = interp(() => 1);
    export const zero: Interp = interp(() => 0);
    export const slope: Interp = interp(a => Mathf.slope(a));

    /** By Ken Perlin. */
    export const smoother: Interp = interp(a => a * a * a * (a * (a * 6 - 15) + 10));
    export const fade = smoother;
    export const pow2 = new Pow(2);
    /** Slow, then fast. */
    export const pow2In = new PowIn(2);
    export const slowFast = pow2In;
    /** Fast, then slow. */
    export const pow2Out = new PowOut(2);
    export const fastSlow = pow2Out;
    export const pow2InInverse: Interp = interp(a => Math.sqrt(a));
    export const pow2OutInverse: Interp = interp(a => 1 - Math.sqrt(-(a - 1)));
    export const pow3 = new Pow(3);
    export const pow3In = new PowIn(3);
    export const pow3Out = new PowOut(3);
    export const pow3InInverse: Interp = interp(a => Math.cbrt(a));
    export const pow3OutInverse: Interp = interp(a => 1 - Math.cbrt(-(a - 1)));
    export const pow4 = new Pow(4);
    export const pow4In = new PowIn(4);
    export const pow4Out = new PowOut(4);
    export const pow5 = new Pow(5);
    export const pow5In = new PowIn(5);
    export const pow10In = new PowIn(10);
    export const pow10Out = new PowOut(10);
    export const pow5Out = new PowOut(5);
    export const sine: Interp = interp(a => (1 - Mathf.cos(a * Mathf.PI)) / 2);
    export const sineIn: Interp = interp(a => 1 - Mathf.cos(a * Mathf.PI / 2));
    export const sineOut: Interp = interp(a => Mathf.sin(a * Mathf.PI / 2));
    export const exp10 = new Exp(2, 10);
    export const exp10In = new ExpIn(2, 10);
    export const exp10Out = new ExpOut(2, 10);
    export const exp5 = new Exp(2, 5);
    export const exp5In = new ExpIn(2, 5);
    export const exp5Out = new ExpOut(2, 5);
    export const circle: Interp = interp(a => {
        if(a <= 0.5){
            a *= 2;
            return (1 - Math.sqrt(1 - a * a)) / 2;
        }
        a--;
        a *= 2;
        return (Math.sqrt(1 - a * a) + 1) / 2;
    });
    export const circleIn: Interp = interp(a => 1 - Math.sqrt(1 - a * a));
    export const circleOut: Interp = interp(a => {
        a--;
        return Math.sqrt(1 - a * a);
    });
    export const elastic = new Elastic(2, 10, 7, 1);
    export const elasticIn = new ElasticIn(2, 10, 6, 1);
    export const elasticOut = new ElasticOut(2, 10, 7, 1);
    export const swing = new Swing(1.5);
    export const swingIn = new SwingIn(2);
    export const swingOut = new SwingOut(2);
    export const bounce = new Bounce(4);
    export const bounceIn = new BounceIn(4);
    export const bounceOut = new BounceOut(4);
}
