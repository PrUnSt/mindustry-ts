import {describe, expect, it} from 'vitest';
import {Interp} from './Interp';

function apply3(i: Interp, start: number, end: number, a: number): number{
    return i.apply(start, end, a);
}

describe('Interp.linear / pow2 family', () => {
    it('linear', () => {
        expect(Interp.linear.apply(0)).toBe(0);
        expect(Interp.linear.apply(0.5)).toBe(0.5);
        expect(Interp.linear.apply(1)).toBe(1);
        expect(apply3(Interp.linear, 0, 100, 0.5)).toBe(50);
        expect(apply3(Interp.linear, 10, 20, 0)).toBe(10);
        expect(apply3(Interp.linear, 10, 20, 1)).toBe(20);
    });

    it('pow2', () => {
        expect(Interp.pow2.apply(0)).toBe(0);
        expect(Interp.pow2.apply(0.5)).toBe(0.5);
        expect(Interp.pow2.apply(1)).toBe(1);
        expect(Interp.pow2.apply(0.25)).toBe(0.125);
        expect(Interp.pow2.apply(0.75)).toBe(0.875);
    });

    it('pow2In', () => {
        expect(Interp.pow2In.apply(0)).toBe(0);
        expect(Interp.pow2In.apply(0.5)).toBe(0.25);
        expect(Interp.pow2In.apply(1)).toBe(1);
        expect(Interp.pow2In.apply(0.25)).toBe(0.0625);
    });

    it('pow2Out', () => {
        expect(Interp.pow2Out.apply(0)).toBe(0);
        expect(Interp.pow2Out.apply(0.5)).toBe(0.75);
        expect(Interp.pow2Out.apply(1)).toBe(1);
        expect(Interp.pow2Out.apply(0.25)).toBe(0.4375);
    });

    it('pow2InInverse / pow2OutInverse', () => {
        expect(Interp.pow2InInverse.apply(0)).toBe(0);
        expect(Interp.pow2InInverse.apply(0.25)).toBe(0.5);
        expect(Interp.pow2InInverse.apply(1)).toBe(1);
        expect(Interp.pow2OutInverse.apply(0)).toBe(0);
        expect(Interp.pow2OutInverse.apply(0.5)).toBe(1 - Math.sqrt(0.5));
        expect(Interp.pow2OutInverse.apply(1)).toBe(1);
    });

    it('pow3 / pow3In / pow3Out', () => {
        expect(Interp.pow3.apply(0)).toBe(0);
        expect(Interp.pow3.apply(0.5)).toBe(0.5);
        expect(Interp.pow3.apply(1)).toBe(1);
        expect(Interp.pow3.apply(0.25)).toBe(0.0625);
        expect(Interp.pow3In.apply(0.5)).toBe(0.125);
        expect(Interp.pow3Out.apply(0.5)).toBe(0.875);
    });

    it('pow4 / pow5 / pow10', () => {
        expect(Interp.pow4.apply(0.5)).toBe(0.5);
        expect(Interp.pow4In.apply(0.5)).toBe(0.0625);
        expect(Interp.pow4Out.apply(0.5)).toBeCloseTo(0.9375, 12);
        expect(Interp.pow5In.apply(0.5)).toBeCloseTo(0.03125, 12);
        expect(Interp.pow5Out.apply(0.5)).toBeCloseTo(0.96875, 12);
        expect(Interp.pow10In.apply(0.5)).toBeCloseTo(0.0009765625, 12);
        expect(Interp.pow10Out.apply(0.5)).toBeCloseTo(0.9990234375, 12);
    });
});

describe('Interp.smooth / fade / sine', () => {
    it('smooth (smoothstep)', () => {
        expect(Interp.smooth.apply(0)).toBe(0);
        expect(Interp.smooth.apply(0.5)).toBe(0.5);
        expect(Interp.smooth.apply(1)).toBe(1);
        expect(Interp.smooth.apply(0.25)).toBe(0.15625);
        expect(Interp.smooth.apply(0.75)).toBe(0.84375);
    });

    it('smoother/fade (Perlin)', () => {
        expect(Interp.fade.apply(0)).toBe(0);
        expect(Interp.fade.apply(0.5)).toBe(0.5);
        expect(Interp.fade.apply(1)).toBe(1);
        expect(Interp.fade.apply(0.25)).toBe(0.103515625);
        expect(Interp.fade.apply(0.75)).toBe(0.896484375);
        expect(Interp.smoother).toBe(Interp.fade);
    });

    it('sine', () => {
        expect(Interp.sine.apply(0)).toBe(0);
        expect(Interp.sine.apply(0.5)).toBe(0.5);
        expect(Interp.sine.apply(1)).toBe(1);
        expect(Interp.sine.apply(0.25)).toBeCloseTo(0.146514421229, 10);
        expect(Interp.sine.apply(0.75)).toBeCloseTo(0.853621197615, 10);
    });

    it('slope / reverse / one / zero', () => {
        expect(Interp.slope.apply(0.5)).toBe(1);
        expect(Interp.slope.apply(0)).toBe(0);
        expect(Interp.slope.apply(1)).toBe(0);
        expect(Interp.reverse.apply(0.25)).toBe(0.75);
        expect(Interp.one.apply(0.5)).toBe(1);
        expect(Interp.zero.apply(0.5)).toBe(0);
    });
});

describe('Interp.exp / circle', () => {
    it('exp10', () => {
        expect(Interp.exp10.apply(0)).toBe(0);
        expect(Interp.exp10.apply(0.5)).toBe(0.5);
        expect(Interp.exp10.apply(1)).toBe(1);
        expect(Interp.exp10.apply(0.25)).toBeCloseTo(0.015151515152, 8);
        expect(Interp.exp10.apply(0.75)).toBeCloseTo(0.984848484848, 8);
    });
    it('exp10In / exp10Out', () => {
        expect(Interp.exp10In.apply(0)).toBe(0);
        expect(Interp.exp10In.apply(1)).toBe(1);
        expect(Interp.exp10In.apply(0.5)).toBeCloseTo(0.030303030303, 8);
        expect(Interp.exp10Out.apply(0)).toBe(0);
        expect(Interp.exp10Out.apply(1)).toBe(1);
        expect(Interp.exp10Out.apply(0.5)).toBeCloseTo(0.969696969697, 8);
    });
    it('circle / circleIn / circleOut', () => {
        expect(Interp.circle.apply(0)).toBe(0);
        expect(Interp.circle.apply(0.5)).toBe(0.5);
        expect(Interp.circle.apply(1)).toBe(1);
        expect(Interp.circle.apply(0.25)).toBeCloseTo(0.066987298108, 10);
        expect(Interp.circleIn.apply(0.5)).toBeCloseTo(1 - Math.sqrt(0.75), 10);
        // Interp.java:68-71：circleOut(a) = sqrt(1 - (a-1)^2)；a=0.5 → sqrt(1 - 0.25) = sqrt(0.75) ≈ 0.8660254
        expect(Interp.circleOut.apply(0.5)).toBeCloseTo(Math.sqrt(0.75), 10);
    });
});

describe('Interp.elastic / swing / bounce', () => {
    it('elastic', () => {
        expect(Interp.elastic.apply(0)).toBe(0);
        expect(Interp.elastic.apply(0.5)).toBe(0);
        expect(Interp.elastic.apply(1)).toBe(1);
        expect(Interp.elastic.apply(0.25)).toBe(0.015625);
        expect(Interp.elastic.apply(0.75)).toBe(0.984375);
    });
    it('elasticIn / elasticOut', () => {
        expect(Interp.elasticIn.apply(0)).toBe(0);
        expect(Interp.elasticIn.apply(1)).toBe(1);
        expect(Interp.elasticIn.apply(0.5)).toBe(0);
        expect(Interp.elasticOut.apply(0)).toBe(0);
        expect(Interp.elasticOut.apply(1)).toBe(1);
        expect(Interp.elasticOut.apply(0.5)).toBe(0.96875);
    });
    it('swing overshoots', () => {
        // Interp.java:342-346：swing(0) 走 a<=0.5 分支，得 a*a*((scale+1)*a - scale)/2 = 0 * (负数) = -0.0f。
        // Java 与 TS 均返回 -0，而 `toBe` 按 Object.is 区分 -0/+0，故改用数值比较。
        expect(Interp.swing.apply(0)).toBeCloseTo(0, 10);
        expect(Interp.swing.apply(0.5)).toBe(0.5);
        expect(Interp.swing.apply(1)).toBe(1);
        expect(Interp.swing.apply(0.25)).toBe(-0.125);
        expect(Interp.swing.apply(0.75)).toBe(1.125);
    });
    it('swingIn / swingOut', () => {
        // Interp.java:374-377：swingIn(0) = 0 * 0 * ((scale+1)*0 - scale) = -0.0f（同为 -0 而非 +0）
        expect(Interp.swingIn.apply(0)).toBeCloseTo(0, 10);
        expect(Interp.swingIn.apply(1)).toBe(1);
        expect(Interp.swingIn.apply(0.5)).toBe(-0.125);
        expect(Interp.swingOut.apply(0)).toBe(0);
        expect(Interp.swingOut.apply(1)).toBe(1);
        expect(Interp.swingOut.apply(0.5)).toBe(1.125);
    });
    it('bounce', () => {
        expect(Interp.bounce.apply(0)).toBe(0);
        expect(Interp.bounce.apply(0.5)).toBe(0.5);
        expect(Interp.bounce.apply(1)).toBe(1);
        // 按 Interp.java:225-245（Bounce.out / apply）、276-284（BounceOut(4) 配置, widths[0]=0.34*2）、
        // 300-316（BounceOut.apply）逐字计算：bounce(0.25) = (1 - out(1-0.5))/2、bounce(0.75) = out(0.5)/2 + 0.5，
        // 其中 out(0.5) = BounceOut.apply(0.5) = 0.74089965…
        expect(Interp.bounce.apply(0.25)).toBeCloseTo(0.129550173010, 8);
        expect(Interp.bounce.apply(0.75)).toBeCloseTo(0.870449826990, 8);
    });
    it('bounceIn / bounceOut', () => {
        expect(Interp.bounceIn.apply(0)).toBe(0);
        expect(Interp.bounceIn.apply(1)).toBe(1);
        expect(Interp.bounceOut.apply(0)).toBe(0);
        expect(Interp.bounceOut.apply(1)).toBe(1);
        // Interp.java:300-316：BounceOut(4).apply(0.5) = 0.74089965…
        // （widths=[0.68,0.34,0.2,0.15], heights=[1,0.26,0.11,0.03]）；
        // Interp.java:328-331：BounceIn.apply(0.5) = 1 - BounceOut.apply(0.5) = 0.25910034…
        expect(Interp.bounceOut.apply(0.5)).toBeCloseTo(0.740899653979, 8);
        expect(Interp.bounceIn.apply(0.5)).toBeCloseTo(0.259100346021, 8);
    });
});

describe('Interp.Pow / custom instances', () => {
    it('Pow.apply 3-arg form', () => {
        expect(Interp.pow2.apply(0, 100, 0.5)).toBe(50);
        expect(Interp.pow2.apply(0, 100, 0.25)).toBe(12.5);
    });
    it('constructor validation for Bounce', () => {
        expect(() => new Interp.Bounce(1)).toThrow();
        expect(() => new Interp.Bounce(6)).toThrow();
    });
});
