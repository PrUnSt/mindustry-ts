// 源: arc-core/src/arc/math/Mathf.java
// 迁移说明: 数值 float64; 类名/静态方法/静态字段与 Java 逐字对齐。sin/cos 使用查表 (sinTable, sinBits=14)。
// Java 的 int/long 与 float/double 重载在 TS 中无法区分, 按整数/非整数分派:
// 整数参数走 int/long 语义 (如 random(int) 返回整数), 非整数走 float 语义。详见 VERIFY.md。
import {Rand} from './Rand';
import {Time} from '../util/Time';
import {Vec2} from './geom/Vec2';
import {Position} from './geom/Position';

// ---- 私有查表常量 (对应 Java 私有静态字段) ----
const sinBits = 14; // 16KB. Adjust for accuracy.
const sinMask = ~(-1 << sinBits);
const sinCount = sinMask + 1;
const sinTable: number[] = new Array(sinCount);
const radFull = 3.1415927 * 2;
const degFull = 360;
const radToIndex = sinCount / radFull;
const degToIndex = sinCount / degFull;
const BIG_ENOUGH_INT = 16 * 1024;
const BIG_ENOUGH_FLOOR = BIG_ENOUGH_INT;
const CEIL = 0.9999999;
const BIG_ENOUGH_ROUND = BIG_ENOUGH_INT + 0.5;
const seedr = new Rand();
// 惰性初始化的共享临时向量 (对应 Java 私有静态 v1/v2/v3): 不能在模块顶层 new Vec2(),
// 否则 Mathf <-> Vec2 的 ESM 循环依赖会在本模块体执行时因 Vec2 绑定尚未初始化而抛
// "Vec2 is not a constructor" (Java 中类为惰性加载, 同样的循环无碍)。
let v1: Vec2 | null = null, v2: Vec2 | null = null, v3: Vec2 | null = null;

function tmp1(): Vec2{ if(v1 === null) v1 = new Vec2(); return v1; }
function tmp2(): Vec2{ if(v2 === null) v2 = new Vec2(); return v2; }
function tmp3(): Vec2{ if(v3 === null) v3 = new Vec2(); return v3; }

// 对应 Java static{} 初始化块
for(let i = 0; i < sinCount; i++){
    sinTable[i] = Math.sin((i + 0.5) / sinCount * radFull);
}
for(let i = 0; i < 360; i += 90){
    sinTable[(Math.trunc(i * degToIndex) | 0) & sinMask] = Math.sin(i * (3.1415927 / 180));
}

sinTable[0] = 0;
sinTable[(Math.trunc(90 * degToIndex) | 0) & sinMask] = 1;
sinTable[(Math.trunc(180 * degToIndex) | 0) & sinMask] = 0;
sinTable[(Math.trunc(270 * degToIndex) | 0) & sinMask] = -1;

/** 对应 Java Math.copySign(magnitude, sign). */
function copySign(magnitude: number, sign: number): number{
    return (sign < 0 || (sign === 0 && 1 / sign < 0)) ? -Math.abs(magnitude) : Math.abs(magnitude);
}

export class Mathf{
    static readonly signs: number[] = [-1, 1];
    static readonly zeroOne: number[] = [0, 1];
    static readonly booleans: boolean[] = [true, false];
    static readonly FLOAT_ROUNDING_ERROR = 0.000001; // 32 bits
    static readonly PI = 3.1415927;
    static readonly pi = Mathf.PI;
    static readonly halfPi = Mathf.PI / 2;
    static readonly PI2 = Mathf.PI * 2;
    static readonly E = 2.7182818;
    static readonly sqrt2 = Math.sqrt(2);
    static readonly sqrt3 = Math.sqrt(3);
    /** multiply by this to convert from radians to degrees */
    static readonly radiansToDegrees = 180 / Mathf.PI;
    static readonly radDeg = Mathf.radiansToDegrees;
    /** multiply by this to convert from degrees to radians */
    static readonly degreesToRadians = Mathf.PI / 180;
    static readonly degRad = Mathf.degreesToRadians;
    static readonly doubleDegRad = 0.017453292519943295;
    static readonly doubleRadDeg = 57.29577951308232;

    static rand: Rand = new Rand();

    /** Returns the sine in radians from a lookup table. */
    static sin(radians: number): number;
    static sin(scl: number, mag: number): number;
    static sin(radians: number, scl: number, mag: number): number;
    static sin(a: number, b?: number, c?: number): number{
        if(b === undefined){
            return sinTable[(Math.trunc(a * radToIndex) | 0) & sinMask];
        }
        if(c === undefined){
            return Mathf.sin(Time.time / a) * b;
        }
        return Mathf.sin(a / b) * c;
    }

    /** Returns the cosine in radians from a lookup table. */
    static cos(radians: number): number;
    static cos(radians: number, scl: number, mag: number): number;
    static cos(a: number, b?: number, c?: number): number{
        if(b === undefined){
            return sinTable[(Math.trunc((a + Mathf.PI / 2) * radToIndex) | 0) & sinMask];
        }
        return Mathf.cos(a / b) * c!;
    }

    /** Returns the sine in radians from a lookup table. */
    static sinDeg(degrees: number): number{
        return sinTable[(Math.trunc(degrees * degToIndex) | 0) & sinMask];
    }

    /** Returns the cosine in radians from a lookup table. */
    static cosDeg(degrees: number): number{
        return sinTable[(Math.trunc((degrees + 90) * degToIndex) | 0) & sinMask];
    }

    static absin(scl: number, mag: number): number;
    static absin(inp: number, scl: number, mag: number): number;
    static absin(a: number, b: number, c?: number): number{
        if(c === undefined){
            return Mathf.absin(Time.time, a, b);
        }
        return (Mathf.sin(a, b * 2, c) + c) / 2;
    }

    static tan(radians: number, scl: number, mag: number): number{
        return (Mathf.sin(radians / scl)) / (Mathf.cos(radians / scl)) * mag;
    }

    static angle(x: number, y: number): number{
        let result = Mathf.atan2(x, y) * Mathf.radDeg;
        if(result < 0) result += 360;
        return result;
    }

    static angleExact(x: number, y: number): number{
        let result = Math.atan2(y, x) * Mathf.radDeg;
        if(result < 0) result += 360;
        return result;
    }

    /** Wraps the given angle to the range [-PI, PI] */
    static wrapAngleAroundZero(a: number): number{
        if(a >= 0){
            let rotation = a % Mathf.PI2;
            if(rotation > Mathf.PI) rotation -= Mathf.PI2;
            return rotation;
        }else{
            let rotation = -a % Mathf.PI2;
            if(rotation > Mathf.PI) rotation -= Mathf.PI2;
            return -rotation;
        }
    }

    /** A variant on atan that does not tolerate infinite inputs for speed reasons (私有, 对应 Java atn). */
    private static atn(i: number): number{
        const n = Math.abs(i);
        const c = (n - 1.0) / (n + 1.0);
        const c2 = c * c, c3 = c * c2, c5 = c3 * c2, c7 = c5 * c2, c9 = c7 * c2, c11 = c9 * c2;
        return copySign((Math.PI * 0.25)
        + (0.99997726 * c - 0.33262347 * c3 + 0.19354346 * c5 - 0.11643287 * c7 + 0.05265332 * c9 - 0.0117212 * c11), i);
    }

    /** Close approximation of atan2, with higher precision than libGDX's atan2 approximation. */
    static atan2(x: number, y: number): number{
        let n = y / x;
        if(n !== n){
            n = (y === x ? 1 : -1); // if both y and x are infinite, n would be NaN
        }else if(n - n !== n - n){
            x = 0; // if n is infinite, y is infinitely larger than x.
        }

        if(x > 0){
            return Mathf.atn(n);
        }else if(x < 0){
            return y >= 0 ? Mathf.atn(n) + Mathf.PI : Mathf.atn(n) - Mathf.PI;
        }else if(y > 0){
            return x + Mathf.halfPi;
        }else if(y < 0){
            return x - Mathf.halfPi;
        }else{
            return x + y; // returns 0 for 0,0 or NaN if either y or x is NaN
        }
    }

    static digits(n: number): number{
        if(Number.isInteger(n)){
            return n < 100000 ? n < 100 ? n < 10 ? 1 : 2 : n < 1000 ? 3 : n < 10000 ? 4 : 5
                : n < 10000000 ? n < 1000000 ? 6 : 7 : n < 100000000 ? 8 : n < 1000000000 ? 9 : 10;
        }
        return n === 0 ? 1 : Math.trunc(Math.log10(n) + 1);
    }

    static sqrt(x: number): number{
        return Math.sqrt(x);
    }

    static sqr(x: number): number{
        return x * x;
    }

    static map(value: number, froma: number, toa: number, fromb: number, tob: number): number;
    /** Map value from [0, 1].*/
    static map(value: number, from: number, to: number): number;
    static map(value: number, a: number, b: number, c?: number, d?: number): number{
        if(c === undefined){
            return Mathf.map(value, 0, 1, a, b);
        }
        return c + (value - a) * (d! - c) / (b - a);
    }

    /**Returns -1 if f<0, 1 otherwise.*/
    static sign(f: number): number;
    /** Returns 1 if true, -1 if false. */
    static sign(b: boolean): number;
    static sign(v: number | boolean): number{
        return typeof v === 'boolean' ? (v ? 1 : -1) : (v < 0 ? -1 : 1);
    }

    /**Converts a boolean to an integer: 1 if true, 0, if false.*/
    static num(b: boolean): number{
        return b ? 1 : 0;
    }

    static pow(a: number, b: number): number{
        if(Number.isInteger(a) && Number.isInteger(b)){
            return Math.trunc(Math.ceil(Math.pow(a, b)));
        }
        return Math.pow(a, b);
    }

    static range(range: number): number;
    static range(min: number, max: number): number;
    static range(min: number, max?: number): number{
        if(max !== undefined){
            if(Mathf.chance(0.5)){
                return Mathf.random(min, max);
            }else{
                return -Mathf.random(min, max);
            }
        }
        return Mathf.random(-min, min);
    }

    static chanceDelta(d: number): boolean{
        return Mathf.rand.nextFloat() < d * Time.delta;
    }

    static chance(d: number): boolean{
        return d >= 1 || Mathf.rand.nextFloat() < d;
    }

    /** Returns a random number between 0.0 (inclusive) and 1.0 (exclusive). */
    static random(): number;
    /** Returns a random number between 0 (inclusive) and the specified value (inclusive). */
    static random(range: number): number;
    /** Returns a random number between start (inclusive) and end (inclusive). */
    static random(start: number, end: number): number;
    static random(start?: number, end?: number): number{
        if(start === undefined) return Mathf.rand.nextFloat();
        if(end === undefined){
            return Number.isInteger(start) ? Mathf.rand.nextInt(start + 1) : Mathf.rand.nextFloat() * start;
        }
        if(Number.isInteger(start) && Number.isInteger(end)){
            return start + Mathf.rand.nextInt(end - start + 1);
        }
        return start + Mathf.rand.nextFloat() * (end - start);
    }

    /** Returns a random boolean value. */
    static randomBoolean(): boolean;
    /** Returns true if a random value between 0 and 1 is less than the specified value. */
    static randomBoolean(chance: number): boolean;
    static randomBoolean(chance?: number): boolean{
        return chance === undefined ? Mathf.rand.nextBoolean() : Mathf.random() < chance;
    }

    

    /** Returns -1 or 1, randomly. */
    static randomSign(): number{
        return 1 | (Mathf.rand.nextInt() >> 31);
    }

    //TODO these can be optimized to a single function, setting the seed and getting a result may be expensive

    /** Inclusive. */
    static randomSeed(seed: number, min: number, max: number): number;
    static randomSeed(seed: number): number;
    static randomSeed(seed: number, max: number): number;
    static randomSeed(seed: number, a?: number, b?: number): number{
        if(a === undefined){
            seedr.setSeed(seed * 99999);
            return seedr.nextFloat();
        }
        if(b === undefined){
            seedr.setSeed(seed * 99999);
            return seedr.nextFloat() * a;
        }
        seedr.setSeed(seed);
        if(Number.isInteger(b) && Mathf.isPowerOfTwo(b)){
            seedr.nextInt();
        }
        if(Number.isInteger(a) && Number.isInteger(b)){
            return seedr.nextInt(b - a + 1) + a;
        }
        return a + seedr.nextFloat() * (b - a);
    }

    static randomSeedRange(seed: number, range: number): number{
        seedr.setSeed(seed * 99999);
        return range * (seedr.nextFloat() - 0.5) * 2;
    }

    /**
     * Returns a triangularly distributed random number between -1.0 (exclusive) and 1.0 (exclusive), where values around zero are
     * more likely.
     */
    static randomTriangular(): number;
    static randomTriangular(max: number): number;
    static randomTriangular(min: number, max: number): number;
    static randomTriangular(min: number, max: number, mode: number): number;
    static randomTriangular(a?: number, b?: number, c?: number): number{
        if(a === undefined){
            return Mathf.rand.nextFloat() - Mathf.rand.nextFloat();
        }
        if(b === undefined){
            return (Mathf.rand.nextFloat() - Mathf.rand.nextFloat()) * a;
        }
        if(c === undefined){
            return Mathf.randomTriangular(a, b, (a + b) * 0.5);
        }
        const u = Mathf.rand.nextFloat();
        const d = b - a;
        if(u <= (c - a) / d) return a + Math.sqrt(u * d * (c - a));
        return b - Math.sqrt((1 - u) * d * (b - c));
    }



    /** Returns the next power of two. Returns the specified value if the value is already a power of two. */
    static nextPowerOfTwo(value: number): number{
        if(value === 0) return 1;
        value--;
        value |= value >> 1;
        value |= value >> 2;
        value |= value >> 4;
        value |= value >> 8;
        value |= value >> 16;
        return value + 1;
    }

    static isPowerOfTwo(value: number): boolean{
        return value !== 0 && (value & value - 1) === 0;
    }

    static clamp(value: number, min: number, max: number): number;
    /** Clamps to [0, 1]. */
    static clamp(value: number): number;
    static clamp(value: number, min?: number, max?: number): number{
        if(min === undefined){
            return Math.max(Math.min(value, 1), 0);
        }
        return Math.max(Math.min(value, max!), min);
    }

    static maxZero(val: number): number{
        return Math.max(val, 0);
    }

    /** Approaches a value at linear speed. */
    static approach(from: number, to: number, speed: number): number{
        return from + Mathf.clamp(to - from, -speed, speed);
    }

    /** Approaches a value at linear speed. Multiplied by the delta. */
    static approachDelta(from: number, to: number, speed: number): number{
        return Mathf.approach(from, to, Time.delta * speed);
    }

    /** Linearly interpolates between fromValue to toValue on progress position. */
    static lerp(fromValue: number, toValue: number, progress: number): number{
        return fromValue + (toValue - fromValue) * progress;
    }

    /** Linearly interpolates between fromValue to toValue on progress position. Multiplied by Time.delta().*/
    static lerpDelta(fromValue: number, toValue: number, progress: number): number{
        return Mathf.lerp(fromValue, toValue, Mathf.clamp(progress * Time.delta));
    }

    /**
     * Linearly interpolates between two angles in radians. Takes into account that angles wrap at two pi and always takes the
     * direction with the smallest delta angle.
     */
    static slerpRad(fromRadians: number, toRadians: number, progress: number): number{
        const delta = ((toRadians - fromRadians + Mathf.PI2 + Mathf.PI) % Mathf.PI2) - Mathf.PI;
        return (fromRadians + delta * progress + Mathf.PI2) % Mathf.PI2;
    }

    /**
     * Linearly interpolates between two angles in degrees. Takes into account that angles wrap at 360 degrees and always takes
     * the direction with the smallest delta angle.
     */
    static slerp(fromDegrees: number, toDegrees: number, progress: number): number{
        const delta = ((toDegrees - fromDegrees + 360 + 180) % 360) - 180;
        return (fromDegrees + delta * progress + 360) % 360;
    }

    static slerpDelta(fromDegrees: number, toDegrees: number, progress: number): number{
        return Mathf.slerp(fromDegrees, toDegrees, Mathf.clamp(progress * Time.delta));
    }

    /**
     * Returns the largest integer less than or equal to the specified float. This method will only properly floor floats from
     * -(2^14) to (Float.MAX_VALUE - 2^14).
     */
    static floor(value: number): number{
        return Math.trunc(value + BIG_ENOUGH_FLOOR) - BIG_ENOUGH_INT;
    }

    /**
     * Returns the largest integer less than or equal to the specified float. This method will only properly floor floats that are
     * positive. Note this method simply casts the float to int.
     */
    static floorPositive(value: number): number{
        return Math.trunc(value);
    }

    /**
     * Returns the smallest integer greater than or equal to the specified float. This method will only properly ceil floats from
     * -(2^14) to (Float.MAX_VALUE - 2^14).
     */
    static ceil(value: number): number{
        return BIG_ENOUGH_INT - Math.trunc(BIG_ENOUGH_FLOOR - value);
    }

    /**
     * Returns the smallest integer greater than or equal to the specified float. This method will only properly ceil floats that
     * are positive.
     */
    static ceilPositive(value: number): number{
        return Math.trunc(value + CEIL);
    }

    /**
     * Returns the closest integer to the specified float. This method will only properly round floats from -(2^14) to
     * (Float.MAX_VALUE - 2^14).
     */
    static round(value: number): number;
    static round(value: number, step: number): number;
    static round(value: number, step?: number): number{
        return step === undefined ? (Math.trunc(value + BIG_ENOUGH_ROUND) - BIG_ENOUGH_INT) : (Math.trunc(value / step) * step);
    }

    /** Returns the closest integer to the specified float. This method will only properly round floats that are positive. */
    static roundPositive(value: number): number{
        return Math.trunc(value + 0.5);
    }

    /** Returns true if the value is zero (using the default tolerance as upper bound) */
    static zero(value: number): boolean;
    /**
     * Returns true if the value is zero.
     * @param tolerance represent an upper bound below which the value is considered zero.
     */
    static zero(value: number, tolerance: number): boolean;
    static zero(value: number, tolerance?: number): boolean{
        return Math.abs(value) <= (tolerance === undefined ? Mathf.FLOAT_ROUNDING_ERROR : tolerance);
    }

    /**
     * Returns true if a is nearly equal to b. The function uses the default floating error tolerance.
     */
    static equal(a: number, b: number): boolean;
    /**
     * Returns true if a is nearly equal to b.
     * @param tolerance represent an upper bound below which the two values are considered equal.
     */
    static equal(a: number, b: number, tolerance: number): boolean;
    static equal(a: number, b: number, tolerance?: number): boolean{
        return Math.abs(a - b) <= (tolerance === undefined ? Mathf.FLOAT_ROUNDING_ERROR : tolerance);
    }

    /** @return the logarithm of value with base a */
    static log(a: number, value: number): number{
        return Math.log(value) / Math.log(a);
    }

    /** @return the logarithm of value with base 2 */
    static log2(value: number): number{
        return Number.isInteger(value) ? (value === 0 ? 0 : 31 - Math.clz32(value)) : Mathf.log(2, value);
    }

    /** Mod function that works properly for negative numbers. */
    static mod(x: number, n: number): number;
    static mod(x: number, n: number): number{
        return ((x % n) + n) % n;
    }

    /** @return a sampled value based on position in an array of float values. */
    static sample(values: number[], time: number): number{
        time = Mathf.clamp(time);
        const pos = time * (values.length - 1);
        const cur = Math.min(Math.trunc(time * (values.length - 1)), values.length - 1);
        const next = Math.min(cur + 1, values.length - 1);
        const mod = pos - cur;
        return Mathf.lerp(values[cur], values[next], mod);
    }

    /** @return the input 0-1 value scaled to 0-1-0. */
    static slope(fin: number): number{
        return 1 - Math.abs(fin - 0.5) * 2;
    }

    /**Converts a 0-1 value to 0-1 when it is in [offset, 1].*/
    static curve(f: number, offset: number): number;
    /**Converts a 0-1 value to 0-1 when it is in [offset, to].*/
    static curve(f: number, from: number, to: number): number;
    static curve(f: number, a: number, b?: number): number{
        if(b === undefined){
            if(f < a){
                return 0;
            }else{
                return (f - a) / (1 - a);
            }
        }
        if(f < a){
            return 0;
        }else if(f > b){
            return 1;
        }else{
            return (f - a) / (b - a);
        }
    }

    /** Transforms a 0-1 value to a value with a 0.5 plateau in the middle. When margin = 0.5, this method doesn't do anything. */
    static curveMargin(f: number, margin: number): number;
    static curveMargin(f: number, marginLeft: number, marginRight: number): number;
    static curveMargin(f: number, marginLeft: number, marginRight?: number): number{
        if(marginRight === undefined) marginRight = marginLeft;
        if(f < marginLeft) return f / marginLeft * 0.5;
        if(f > 1 - marginRight) return (f - 1 + marginRight) / marginRight * 0.5 + 0.5;
        return 0.5;
    }

    static len(x: number, y: number): number{
        return Math.sqrt(x * x + y * y);
    }

    static len2(x: number, y: number): number{
        return x * x + y * y;
    }

    static dot(x1: number, y1: number, x2: number, y2: number): number{
        return x1 * x2 + y1 * y2;
    }

    static dst(x1: number, y1: number): number;
    static dst(x1: number, y1: number, x2: number, y2: number): number;
    static dst(x1: number, y1: number, x2?: number, y2?: number): number{
        if(x2 === undefined || y2 === undefined) return Math.sqrt(x1 * x1 + y1 * y1);
        const xd = x2 - x1;
        const yd = y2 - y1;
        return Math.sqrt(xd * xd + yd * yd);
    }

    static dst2(x1: number, y1: number): number;
    static dst2(x1: number, y1: number, x2: number, y2: number): number;
    static dst2(x1: number, y1: number, x2?: number, y2?: number): number{
        if(x2 === undefined || y2 === undefined) return x1 * x1 + y1 * y1;
        const xd = x2 - x1;
        const yd = y2 - y1;
        return xd * xd + yd * yd;
    }

    /** Manhattan distance. */
    static dstm(x1: number, y1: number, x2: number, y2: number): number{
        return Math.abs(x1 - x2) + Math.abs(y1 - y2);
    }

    static arrive(pos: Position, target: Position, curVel: Vec2, radius: number, tolerance: number, speed: number, smoothTime: number): Vec2;
    static arrive(x: number, y: number, destX: number, destY: number, curVel: Vec2, radius: number, tolerance: number, speed: number, accel: number): Vec2;
    static arrive(a: Position | number, b: Position | number, c: number | Vec2, d: number, e: Vec2 | number, f: number, g: number, h?: number, i?: number): Vec2{
        if(typeof a !== "number"){
            // 7-arg form: (pos, target, curVel, radius, tolerance, speed, smoothTime)
            return Mathf.arrive((a as Position).getX(), (a as Position).getY(), (b as Position).getX(), (b as Position).getY(), c as Vec2, d, e as number, f, g);
        }
        // 9-arg form: (x, y, destX, destY, curVel, radius, tolerance, speed, accel)
        const x = a, y = b as number, destX = c as number, destY = d, curVel = e as Vec2, radius = f, tolerance = g, speed = h!, accel = i!;
        const toTarget = tmp1().set(destX, destY).sub(x, y);
        const distance = toTarget.len();

        if(distance <= tolerance) return tmp3().setZero();
        let targetSpeed = speed;
        if(distance <= radius) targetSpeed *= distance / radius;

        return toTarget.sub(curVel.x / accel, curVel.y / accel).limit(targetSpeed);
    }

    /** @return whether dst(x1, y1, x2, y2) < dst */
    static within(x1: number, y1: number, x2: number, y2: number, dst: number): boolean;
    /** @return whether dst(x, y, 0, 0) < dst */
    static within(x1: number, y1: number, dst: number): boolean;
    static within(x1: number, y1: number, x2?: number, y2?: number, dst?: number): boolean{
        if(dst === undefined){
            const d = x2!;
            return (x1 * x1 + y1 * y1) < d * d;
        }
        return Mathf.dst2(x1, y1, x2!, y2!) < dst * dst;
    }
}
