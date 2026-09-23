import {describe, expect, it} from 'vitest';
import {Vec2} from './Vec2';
import {Rand} from '../Rand';

describe('Vec2 basics', () => {
    it('constructs and exposes x/y', () => {
        const v = new Vec2(3, 4);
        expect(v.x).toBe(3);
        expect(v.y).toBe(4);
        expect(new Vec2().x).toBe(0);
        expect(new Vec2().y).toBe(0);
        const w = new Vec2(v);
        expect(w.x).toBe(3);
        expect(w.y).toBe(4);
    });

    it('len / len2', () => {
        const v = new Vec2(3, 4);
        expect(v.len()).toBe(5);
        expect(v.len2()).toBe(25);
        expect(new Vec2(5, 12).len()).toBe(13);
        expect(new Vec2().len()).toBe(0);
    });

    it('dst / dst2', () => {
        const v = new Vec2(0, 0);
        expect(v.dst(3, 4)).toBe(5);
        expect(v.dst2(3, 4)).toBe(25);
        expect(v.dst(new Vec2(3, 4))).toBe(5);
        expect(v.dst2(new Vec2(3, 4))).toBe(25);
    });

    it('set / setZero', () => {
        const v = new Vec2();
        expect(v.set(1, 2).x).toBe(1);
        expect(v.set(1, 2).y).toBe(2);
        v.set(new Vec2(5, 6));
        expect(v.x).toBe(5);
        expect(v.y).toBe(6);
        expect(v.setZero().x).toBe(0);
        expect(v.setZero().y).toBe(0);
    });

    it('angle() is CCW from x-axis', () => {
        // Java Vec2.java:393-397 的 angle() 走 Mathf.atan2 (近似算法, 非 Math.atan2)：
        // Mathf.java:140-141 注释 "Average error is 1.057E-6 radians; maximum error is 1.922E-6" (≈1.1E-4 度)。
        // 在 0 度处 atn(0) 返回 ≈1.663E-6 弧度, 乘 Mathf.radiansToDegrees 后 ≈9.53E-5, 与 Java 同样达不到 5e-5,
        // 故此处容差放宽到 3 位 (5e-4)。
        expect(new Vec2(1, 0).angle()).toBeCloseTo(0, 3);
        expect(new Vec2(0, 1).angle()).toBe(90);
        expect(new Vec2(-1, 0).angle()).toBeCloseTo(180, 3);
        expect(new Vec2(0, -1).angle()).toBe(270);
        expect(new Vec2(1, 1).angle()).toBeCloseTo(45, 4);
    });

    it('angle(reference) uses exact atan2 and returns signed [-180, 180]', () => {
        expect(new Vec2(1, 0).angle(new Vec2(1, 0))).toBe(0);
        // Java Vec2.java:403-404 用真 Math.atan2 (crs/dot), 非近似 Mathf.atan2 —— TS 实现一致。
        // 残余偏差来自常量精度: Mathf.java:11 `PI = 3.1415927f` 是 float32 圆周率,
        // Mathf.java:17 `radiansToDegrees = 180f / PI` 相对真值 180/π 偏小 ≈1.48E-8,
        // float64 移植下误差随角度线性放大 (180 度处 ≈2.7E-6 度); Java 是把结果窄化成 float32 才恰好得到 90/180。
        expect(new Vec2(1, 0).angle(new Vec2(0, 1))).toBeCloseTo(90, 4);
        expect(new Vec2(0, 1).angle(new Vec2(1, 0))).toBeCloseTo(-90, 4);
        expect(new Vec2(1, 0).angle(new Vec2(-1, 0))).toBeCloseTo(180, 4);
    });

    it('angleRad / setAngle / setAngleRad', () => {
        expect(new Vec2(1, 0).angleRad()).toBe(0);
        expect(new Vec2(0, 1).angleRad()).toBeCloseTo(Math.PI / 2, 12);
        const v = new Vec2(10, 0).setAngle(90);
        expect(v.x).toBeCloseTo(0, 8);
        expect(v.y).toBeCloseTo(10, 8);
    });
});

describe('Vec2 arithmetic', () => {
    it('add', () => {
        expect(new Vec2(3, 4).add(1, 2)).toMatchObject({x: 4, y: 6});
        expect(new Vec2(3, 4).add(new Vec2(1, 2))).toMatchObject({x: 4, y: 6});
    });

    it('sub', () => {
        expect(new Vec2(3, 4).sub(1, 2)).toMatchObject({x: 2, y: 2});
        expect(new Vec2(3, 4).sub(new Vec2(1, 2))).toMatchObject({x: 2, y: 2});
    });

    it('scl', () => {
        expect(new Vec2(3, 4).scl(2)).toMatchObject({x: 6, y: 8});
        expect(new Vec2(3, 4).scl(2, 3)).toMatchObject({x: 6, y: 12});
        expect(new Vec2(3, 4).scl(new Vec2(2, 3))).toMatchObject({x: 6, y: 12});
    });

    it('dot / crs', () => {
        expect(new Vec2(1, 2).dot(3, 4)).toBe(11);
        expect(new Vec2(1, 2).dot(new Vec2(3, 4))).toBe(11);
        expect(new Vec2(1, 2).crs(3, 4)).toBe(-2);
        expect(new Vec2(1, 2).crs(new Vec2(3, 4))).toBe(-2);
        expect(new Vec2(1, 0).crs(new Vec2(0, 1))).toBe(1);
    });

    it('nor normalizes', () => {
        const v = new Vec2(3, 4).nor();
        expect(v.x).toBeCloseTo(0.6, 12);
        expect(v.y).toBeCloseTo(0.8, 12);
        expect(v.len()).toBeCloseTo(1, 12);
        const z = new Vec2().nor();
        expect(z.x).toBe(0);
        expect(z.y).toBe(0);
    });

    it('limit caps length', () => {
        const v = new Vec2(6, 8).limit(5);
        expect(v.x).toBe(3);
        expect(v.y).toBe(4);
        const w = new Vec2(3, 4).limit(10);
        expect(w.x).toBe(3);
        expect(w.y).toBe(4);
    });

    it('setLength / clamp length', () => {
        const v = new Vec2(3, 4).setLength(10);
        expect(v.x).toBe(6);
        expect(v.y).toBe(8);
        const c = new Vec2(10, 0).clamp(1, 5);
        expect(c.x).toBe(5);
        expect(c.y).toBe(0);
        const c2 = new Vec2(0.5, 0).clamp(1, 5);
        expect(c2.x).toBe(1);
    });

    it('lerp', () => {
        const v = new Vec2(0, 0).lerp(new Vec2(10, 10), 0.5);
        expect(v.x).toBe(5);
        expect(v.y).toBe(5);
        const w = new Vec2(0, 0).lerp(10, 20, 0.25);
        expect(w.x).toBe(2.5);
        expect(w.y).toBe(5);
    });

    it('rotate by 90/180 quadrant multiples is exact', () => {
        expect(new Vec2(1, 0).rotate(90)).toMatchObject({x: 0, y: 1});
        expect(new Vec2(1, 0).rotate(180)).toMatchObject({x: -1, y: 0});
        expect(new Vec2(3, 4).rotate(90)).toMatchObject({x: -4, y: 3});
        expect(new Vec2(1, 0).rotate(-90)).toMatchObject({x: 0, y: -1});
    });

    it('rotate by 45 matches lookup table', () => {
        const v = new Vec2(1, 0).rotate(45);
        expect(v.x).toBeCloseTo(0.7069711575416135, 12);
        expect(v.y).toBeCloseTo(0.7072423624184069, 12);
    });

    it('rotateRad / rotateRadExact', () => {
        // Java Vec2.java:473-484 的 rotateRad 走 Mathf.cos/Mathf.sin 查表 (Mathf.java:25-62, sinBits=14):
        // 单元分辨率 2π/16384, 半单元 ≈1.917E-4, 即查表结果自身只有 ~2E-4 精度。
        // Java 中 Math.PI/2 先窄化成 float32 (1.5707964f), 索引恰好落到被特判的 sinTable[8192]=0, 故 x 恰为 0;
        // float64 移植下 radian 保持 1.5707963267948966, 索引为 8191, x 取到半单元边界值 1.917E-4。
        // 偏差完全落在查表精度内, 故按查表精度取 3 位 (5e-4)。
        const a = new Vec2(1, 0).rotateRad(Math.PI / 2);
        expect(a.x).toBeCloseTo(0, 3);
        expect(a.y).toBeCloseTo(1, 3);
        // rotateRadExact (Java Vec2.java:486-497) 用真 Math.cos/Math.sin, 不受查表精度影响, 保留 12 位断言。
        const b = new Vec2(1, 0).rotateRadExact(Math.PI / 2);
        expect(b.x).toBeCloseTo(0, 12);
        expect(b.y).toBeCloseTo(1, 12);
    });

    it('rotate90 / rotateAround', () => {
        // Java Vec2.java:509-518 rotate90(dir>=0) 为 `this.x = -y; y = x;`; 本向量 y=+0.0 时 -y 得到 -0.0
        // (Java 同样是 -0.0f, 且 -0.0f == 0.0f 为 true); 但 vitest 的 toMatchObject 用 Object.is, -0 与 +0 不等,
        // 故这里改用数值相等断言, 语义与 Java 的 == 一致。
        const ccw = new Vec2(1, 0).rotate90(1);
        expect(ccw.x).toBeCloseTo(0, 12);
        expect(ccw.y).toBe(1);
        expect(new Vec2(1, 0).rotate90(-1)).toMatchObject({x: 0, y: -1});
        const v = new Vec2(2, 0).rotateAround(new Vec2(1, 0), 90);
        expect(v.x).toBeCloseTo(1, 8);
        expect(v.y).toBeCloseTo(1, 8);
    });
});

describe('Vec2 helpers', () => {
    it('trns', () => {
        const v = new Vec2().trns(90, 10);
        expect(v.x).toBeCloseTo(0, 8);
        expect(v.y).toBeCloseTo(10, 8);
        const w = new Vec2().trns(45, 10);
        expect(w.x).toBeCloseTo(7.069711575416136, 10);
        expect(w.y).toBeCloseTo(7.072423624184069, 10);
    });

    it('isUnit / isZero / isNaN / isInfinite', () => {
        expect(new Vec2(1, 0).isUnit()).toBe(true);
        expect(new Vec2(0.6, 0.8).isUnit()).toBe(true);
        expect(new Vec2(3, 4).isUnit()).toBe(false);
        expect(new Vec2(0, 0).isZero()).toBe(true);
        expect(new Vec2(0, 1).isZero()).toBe(false);
        expect(new Vec2(NaN, 0).isNaN()).toBe(true);
        expect(new Vec2(Infinity, 0).isInfinite()).toBe(true);
    });

    it('epsilonEquals', () => {
        expect(new Vec2(1, 2).epsilonEquals(1.0000001, 2, 0.001)).toBe(true);
        expect(new Vec2(1, 2).epsilonEquals(new Vec2(1.0000001, 2.0000001), 0.001)).toBe(true);
        expect(new Vec2(1, 2).epsilonEquals(1.1, 2, 0.001)).toBe(false);
    });

    it('isOnLine / isCollinear / isPerpendicular', () => {
        expect(new Vec2(2, 4).isOnLine(new Vec2(1, 2))).toBe(true);
        expect(new Vec2(1, 0).isPerpendicular(new Vec2(0, 1))).toBe(true);
        expect(new Vec2(2, 0).isCollinear(new Vec2(1, 0))).toBe(true);
        expect(new Vec2(-2, 0).isCollinearOpposite(new Vec2(1, 0))).toBe(true);
    });

    it('setToRandomDirection is deterministic with a seed', () => {
        const r1 = new Rand(99);
        const r2 = new Rand(99);
        const a = new Vec2().setToRandomDirection(r1);
        const b = new Vec2().setToRandomDirection(r2);
        expect(a.x).toBe(b.x);
        expect(a.y).toBe(b.y);
        // Java Vec2.java:591-599 setToRandomDirection 用 Mathf.cos/Mathf.sin 查表 (sinBits=14),
        // 查表半单元 ≈1.917E-4, 故 cos²+sin² 不等于精确的 1 (此处偏差 1.03E-8), 10 位 (5e-11) 容差不可达。
        expect(a.len()).toBeCloseTo(1, 6);
    });

    it('cpy / toString / fromString', () => {
        const v = new Vec2(1, 2);
        const c = v.cpy();
        expect(c).not.toBe(v);
        expect(c.x).toBe(1);
        expect(c.y).toBe(2);
        expect(v.toString()).toBe('(1,2)');
        expect(new Vec2().fromString('(3,4)')).toMatchObject({x: 3, y: 4});
    });
});
