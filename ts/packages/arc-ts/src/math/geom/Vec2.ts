// 源: arc-core/src/arc/math/geom/Vec2.java
// 迁移说明: 全量移植。equals/hashCode 用 float32 位模式 (floatToIntBits) 对齐 Java 语义。
import {Mathf} from '../Mathf';
import {Angles} from '../Angles';
import {Interp} from '../Interp';
import {Mat} from '../Mat';
import {Rand} from '../Rand';
import {Time} from '../Time';
import {Position} from './Position';
import {Vector} from './Vector';
import {Vec3} from './Vec3';
import {ArcRuntimeException} from '../ArcRuntimeException';

const f32 = new Float32Array(1);
const i32 = new Int32Array(f32.buffer);

/** 对应 Java Float.floatToIntBits: 返回 float 的 IEEE-754 位模式 (int32). */
function floatToIntBits(v: number): number{
    f32[0] = v;
    return i32[0];
}

/**
 * Encapsulates a 2D vector. Allows chaining methods by returning a reference to itself
 */
export class Vec2 extends Position implements Vector<Vec2>{
    static readonly X = new Vec2(1, 0);
    static readonly Y = new Vec2(0, 1);
    static readonly ZERO = new Vec2(0, 0);

    /** the x-component of this vector **/
    x: number = 0;
    /** the y-component of this vector **/
    y: number = 0;

    /** Constructs a new vector at (0,0) */
    constructor();
    /** Constructs a vector with the given components */
    constructor(x: number, y: number);
    /** Constructs a vector from the given vector */
    constructor(v: Vec2);
    constructor(x?: number | Vec2, y?: number){
        super();
        if(x === undefined){
            this.x = 0;
            this.y = 0;
        }else if(typeof x === 'number'){
            this.x = x;
            this.y = y!;
        }else{
            this.set(x);
        }
    }

    trns(angle: number, amount: number): Vec2;
    trns(angle: number, x: number, y: number): Vec2;
    trns(angle: number, a: number, b?: number): Vec2{
        if(b === undefined){
            return this.set(a, 0).rotate(angle);
        }
        return this.set(a, b).rotate(angle);
    }

    trnsExact(angle: number, amount: number): Vec2{
        return this.set(amount, 0).rotateRadExact(angle * Mathf.degreesToRadians);
    }

    /**Snaps this vector's coordinates to integers.*/
    snap(): Vec2{
        return this.set(Math.trunc(this.x), Math.trunc(this.y));
    }

    div(other: Vec2): Vec2{
        this.x /= other.x;
        this.y /= other.y;
        return this;
    }

    cpy(): Vec2{
        return new Vec2(this);
    }

    len(): number{
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    len2(): number{
        return this.x * this.x + this.y * this.y;
    }

    set(v: Vec2): Vec2;
    set(v: Position): Vec2;
    /** Sets the components of this vector */
    set(x: number, y: number): Vec2;
    set(v: Vec3): Vec2;
    set(v: Vec2 | Position | Vec3 | number, y?: number): Vec2{
        if(typeof v === 'number'){
            this.x = v;
            this.y = y!;
        }else if(v instanceof Vec3){
            this.x = v.x;
            this.y = v.y;
        }else{
            this.x = v.getX();
            this.y = v.getY();
        }
        return this;
    }

    sub(v: Position): Vec2;
    sub(v: Vec2): Vec2;
    /** Substracts the other vector from this vector. */
    sub(x: number, y: number): Vec2;
    sub(v: Vec3): Vec2;
    sub(v: Vec2 | Position | Vec3 | number, y?: number): Vec2{
        if(typeof v === 'number'){
            this.x -= v;
            this.y -= y!;
        }else if(v instanceof Vec3){
            this.x -= v.x;
            this.y -= v.y;
        }else{
            this.x -= v.getX();
            this.y -= v.getY();
        }
        return this;
    }

    nor(): Vec2{
        const len = this.len();
        if(len !== 0){
            this.x /= len;
            this.y /= len;
        }
        return this;
    }

    add(v: Vec2): Vec2;
    add(v: Position): Vec2;
    add(v: Vec2, scl: number): Vec2;
    /** Adds the given components to this vector */
    add(x: number, y: number): Vec2;
    add(v: Vec2 | Position | number, scl?: number, y?: number): Vec2{
        if(typeof v === 'number'){
            this.x += v;
            this.y += scl!;
        }else if(typeof scl === 'number'){
            const vv = v as Vec2;
            this.x += vv.x * scl;
            this.y += vv.y * scl;
        }else{
            this.x += v.getX();
            this.y += v.getY();
        }
        return this;
    }

    dot(v: Vec2): number;
    dot(ox: number, oy: number): number;
    dot(v: Vec2 | number, oy?: number): number{
        if(typeof v === 'number'){
            return this.x * v + this.y * oy!;
        }
        return this.x * v.x + this.y * v.y;
    }

    scl(scalar: number): Vec2;
    /** Multiplies this vector by a scalar */
    scl(x: number, y: number): Vec2;
    scl(v: Vec2): Vec2;
    scl(a: number | Vec2, b?: number): Vec2{
        if(typeof a === 'number'){
            if(b === undefined){
                this.x *= a;
                this.y *= a;
            }else{
                this.x *= a;
                this.y *= b;
            }
        }else{
            this.x *= a.x;
            this.y *= a.y;
        }
        return this;
    }

    inv(): Vec2{
        return this.scl(-1);
    }

    mulAdd(vec: Vec2, scalar: number): Vec2;
    mulAdd(vec: Vec2, mulVec: Vec2): Vec2;
    mulAdd(vec: Vec2, a: number | Vec2): Vec2{
        if(typeof a === 'number'){
            this.x += vec.x * a;
            this.y += vec.y * a;
        }else{
            this.x += vec.x * a.x;
            this.y += vec.y * a.y;
        }
        return this;
    }

    dst(v: Vec2): number;
    /** @return the distance between this and the other vector */
    dst(x: number, y: number): number;
    dst(v: Vec2 | number, y?: number): number{
        if(typeof v === 'number'){
            const xd = v - this.x;
            const yd = y! - this.y;
            return Math.sqrt(xd * xd + yd * yd);
        }
        const xd = v.x - this.x;
        const yd = v.y - this.y;
        return Math.sqrt(xd * xd + yd * yd);
    }

    dst2(v: Vec2): number;
    /** @return the squared distance between this and the other vector */
    dst2(x: number, y: number): number;
    dst2(v: Vec2 | number, y?: number): number{
        if(typeof v === 'number'){
            const xd = v - this.x;
            const yd = y! - this.y;
            return xd * xd + yd * yd;
        }
        const xd = v.x - this.x;
        const yd = v.y - this.y;
        return xd * xd + yd * yd;
    }

    clampLength(min: number, max: number): Vec2{
        const len2 = this.len2();
        if(len2 >= max * max){
            return this.limit(max);
        }else if(len2 <= min * min){
            return this.setLength(min);
        }
        return this;
    }

    limit(limit: number): Vec2{
        return this.limit2(limit * limit);
    }

    limit2(limit2: number): Vec2{
        const len2 = this.len2();
        if(len2 > limit2){
            return this.scl(Math.sqrt(limit2 / len2));
        }
        return this;
    }

    clamp(min: number, max: number): Vec2;
    clamp(minx: number, miny: number, maxx: number, maxy: number): Vec2;
    clamp(a: number, b: number, c?: number, d?: number): Vec2{
        if(c === undefined){
            const len2 = this.len2();
            if(len2 === 0) return this;
            const max2 = b * b;
            if(len2 > max2) return this.scl(Math.sqrt(max2 / len2));
            const min2 = a * a;
            if(len2 < min2) return this.scl(Math.sqrt(min2 / len2));
            return this;
        }
        this.x = Mathf.clamp(this.x, a, c);
        this.y = Mathf.clamp(this.y, b, d!);
        return this;
    }

    setLength(len: number): Vec2{
        return this.setLength2(len * len);
    }

    setLength2(len2: number): Vec2{
        const oldLen2 = this.len2();
        return (oldLen2 === 0 || oldLen2 === len2) ? this : this.scl(Math.sqrt(len2 / oldLen2));
    }

    /**
     * Converts this {@code Vec2} to a string in the format {@code (x,y)}.
     */
    toString(): string{
        return '(' + this.x + ',' + this.y + ')';
    }

    tryFromString(v: string): Vec2{
        try{
            const s = v.indexOf(',', 1);
            if(s !== -1 && v.charAt(0) === '(' && v.charAt(v.length - 1) === ')'){
                const x = parseFloat(v.substring(1, s));
                const y = parseFloat(v.substring(s + 1, v.length - 1));
                return this.set(x, y);
            }
        }catch(t){
            // ignore
        }
        return this.setZero();
    }

    /**
     * Sets this {@code Vec2} to the value represented by the specified string according to the format of {@link #toString()}.
     */
    fromString(v: string): Vec2{
        const s = v.indexOf(',', 1);
        if(s !== -1 && v.charAt(0) === '(' && v.charAt(v.length - 1) === ')'){
            try{
                const x = parseFloat(v.substring(1, s));
                const y = parseFloat(v.substring(s + 1, v.length - 1));
                return this.set(x, y);
            }catch(ex){
                // throw below
            }
        }
        throw new ArcRuntimeException('Malformed Vec2: ' + v);
    }

    /**
     * Left-multiplies this vector by the given matrix
     */
    mul(mat: Mat): Vec2{
        const x = this.x * mat.val[0] + this.y * mat.val[3] + mat.val[6];
        const y = this.x * mat.val[1] + this.y * mat.val[4] + mat.val[7];
        this.x = x;
        this.y = y;
        return this;
    }

    /**
     * Calculates the 2D cross product between this and the given vector.
     */
    crs(v: Vec2): number;
    /** Calculates the 2D cross product between this and the given vector. */
    crs(x: number, y: number): number;
    crs(v: Vec2 | number, y?: number): number{
        if(typeof v === 'number'){
            return this.x * y! - this.y * v;
        }
        return this.x * v.y - this.y * v.x;
    }

    /**
     * @return the angle in degrees of this vector (point) relative to the x-axis. Angles are towards the positive y-axis
     * (typically counter-clockwise) and between 0 and 360.
     */
    angle(): number;
    angle(reference: Vec2): number;
    angle(reference?: Vec2): number{
        if(reference === undefined){
            let angle = Mathf.atan2(this.x, this.y) * Mathf.radiansToDegrees;
            if(angle < 0) angle += 360;
            return angle;
        }
        return Math.atan2(this.crs(reference), this.dot(reference)) * Mathf.radiansToDegrees;
    }

    /**
     * @return the angle in degrees of this vector (point) relative to the given vector. Angles are towards the positive y-axis
     * (typically counter-clockwise.) between -180 and +180
     */


    /**Sets this vector to a random direction with the specified length.*/
    rnd(length: number): Vec2{
        this.setToRandomDirection().scl(length);
        return this;
    }

    /**
     * @return the angle in radians of this vector (point) relative to the x-axis. Angles are towards the positive y-axis.
     * (typically counter-clockwise)
     */
    angleRad(): number;
    angleRad(reference: Vec2): number;
    angleRad(reference?: Vec2): number{
        if(reference === undefined){
            return Math.atan2(this.y, this.x);
        }
        return Math.atan2(this.crs(reference), this.dot(reference));
    }

    /**
     * @return the angle in radians of this vector (point) relative to the given vector. Angles are towards the positive y-axis.
     * (typically counter-clockwise.)
     */


    /**
     * Sets the angle of the vector in degrees relative to the x-axis, towards the positive y-axis (typically counter-clockwise).
     */
    setAngle(degrees: number): Vec2{
        return this.setAngleRad(degrees * Mathf.degreesToRadians);
    }

    /**
     * Sets the angle of the vector in radians relative to the x-axis, towards the positive y-axis (typically counter-clockwise).
     */
    setAngleRad(radians: number): Vec2{
        this.set(this.len(), 0);
        this.rotateRad(radians);

        return this;
    }

    rotateTo(angle: number, speed: number): Vec2{
        return this.setAngle(Angles.moveToward(this.angle(), angle, speed));
    }

    /**
     * Rotates the Vec2 by the given angle, counter-clockwise assuming the y-axis points up.
     */
    rotate(degrees: number): Vec2{
        return this.rotateRad(degrees * Mathf.degreesToRadians);
    }

    /**
     * Rotates the Vec2 by the given angle around reference vector, counter-clockwise assuming the y-axis points up.
     */
    rotateAround(reference: Vec2, degrees: number): Vec2{
        return this.sub(reference).rotate(degrees).add(reference);
    }

    /**
     * Rotates the Vec2 by the given angle, counter-clockwise assuming the y-axis points up.
     */
    rotateRad(radians: number): Vec2{
        const cos = Mathf.cos(radians);
        const sin = Mathf.sin(radians);

        const newX = this.x * cos - this.y * sin;
        const newY = this.x * sin + this.y * cos;

        this.x = newX;
        this.y = newY;

        return this;
    }

    rotateRadExact(radians: number): Vec2{
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);

        const newX = this.x * cos - this.y * sin;
        const newY = this.x * sin + this.y * cos;

        this.x = newX;
        this.y = newY;

        return this;
    }

    /**
     * Rotates the Vec2 by the given angle around reference vector, counter-clockwise assuming the y-axis points up.
     */
    rotateAroundRad(reference: Vec2, radians: number): Vec2{
        return this.sub(reference).rotateRad(radians).add(reference);
    }

    /** Rotates the Vec2 by 90 degrees in the specified direction, where >= 0 is counter-clockwise and < 0 is clockwise. */
    rotate90(dir: number): Vec2{
        const x = this.x;
        if(dir >= 0){
            this.x = -this.y;
            this.y = x;
        }else{
            this.x = this.y;
            this.y = -x;
        }
        return this;
    }

    approachDelta(target: Vec2, alpha: number): Vec2{
        return this.approach(target, Time.delta * alpha);
    }

    approach(target: Vec2, alpha: number): Vec2{
        let dx = this.x - target.x, dy = this.y - target.y;
        const alpha2 = alpha * alpha;
        const len2 = Mathf.len2(dx, dy);

        if(len2 > alpha2){
            const scl = Mathf.sqrt(alpha2 / len2);
            dx *= scl;
            dy *= scl;

            return this.sub(dx, dy);
        }else{
            return this.set(target);
        }
    }

    lerpPast(target: Vec2, alpha: number): Vec2{
        this.x = this.x + ((target.x - this.x) * alpha);
        this.y = this.y + ((target.y - this.y) * alpha);
        return this;
    }

    lerpDelta(tx: number, ty: number, alpha: number): Vec2;
    lerpDelta(target: Position, alpha: number): Vec2;
    lerpDelta(a: number | Position, b: number, c?: number): Vec2{
        if(typeof a === 'number'){
            const alpha = Mathf.clamp(c! * Time.delta);
            const invAlpha = 1.0 - alpha;
            this.x = (this.x * invAlpha) + (a * alpha);
            this.y = (this.y * invAlpha) + (b * alpha);
            return this;
        }
        let alpha = Mathf.clamp(b * Time.delta);
        const invAlpha = 1.0 - alpha;
        this.x = (this.x * invAlpha) + (a.getX() * alpha);
        this.y = (this.y * invAlpha) + (a.getY() * alpha);
        return this;
    }

    lerp(target: Position, alpha: number): Vec2;
    lerp(tx: number, ty: number, alpha: number): Vec2;
    lerp(target: Vec2, alpha: number): Vec2;
    lerp(a: Position | number, b: number, c?: number): Vec2{
        if(typeof a === 'number'){
            const invAlpha = 1.0 - c!;
            this.x = (this.x * invAlpha) + (a * c!);
            this.y = (this.y * invAlpha) + (b * c!);
            return this;
        }
        const invAlpha = 1.0 - b;
        this.x = (this.x * invAlpha) + (a.getX() * b);
        this.y = (this.y * invAlpha) + (a.getY() * b);
        return this;
    }

    interpolate(target: Vec2, alpha: number, interpolation: Interp): Vec2{
        return this.lerp(target, interpolation.apply(alpha));
    }

    setToRandomDirection(): Vec2;
    setToRandomDirection(rand: Rand): Vec2;
    setToRandomDirection(rand?: Rand): Vec2{
        const theta = (rand === undefined ? Mathf.random(0, Mathf.PI2) : rand.random(0, Mathf.PI2));
        return this.set(Mathf.cos(theta), Mathf.sin(theta));
    }

    hashCode(): number{
        let result = 1;
        result = 31 * result + floatToIntBits(this.x);
        result = 31 * result + floatToIntBits(this.y);
        return result | 0;
    }

    equals(obj: any): boolean{
        if(this === obj) return true;
        if(obj === null) return false;
        if(obj instanceof Vec2){
            const other = obj as Vec2;
            if(floatToIntBits(this.x) !== floatToIntBits(other.x)) return false;
            return floatToIntBits(this.y) === floatToIntBits(other.y);
        }
        return false;
    }

    epsilonEquals(other: Vec2, epsilon: number): boolean;
    /** Compares this vector with the other vector, using the supplied epsilon for fuzzy equality testing. */
    epsilonEquals(x: number, y: number, epsilon: number): boolean;
    /** Compares this vector with the other vector using Mathf.FLOAT_ROUNDING_ERROR for fuzzy equality testing */
    epsilonEquals(other: Vec2): boolean;
    /** Compares this vector with the other vector using Mathf.FLOAT_ROUNDING_ERROR for fuzzy equality testing */
    epsilonEquals(x: number, y: number): boolean;
    epsilonEquals(a: Vec2 | number, b?: number, c?: number): boolean{
        if(typeof a === 'number'){
            const eps = c === undefined ? Mathf.FLOAT_ROUNDING_ERROR : c;
            if(Math.abs(a - this.x) > eps) return false;
            return !(Math.abs(b! - this.y) > eps);
        }
        if(a === null) return false;
        const eps = b === undefined ? Mathf.FLOAT_ROUNDING_ERROR : b;
        if(Math.abs(a.x - this.x) > eps) return false;
        return !(Math.abs(a.y - this.y) > eps);
    }

    isNaN(): boolean{
        return Number.isNaN(this.x) || Number.isNaN(this.y);
    }

    isInfinite(): boolean{
        return this.x === Number.POSITIVE_INFINITY || this.x === Number.NEGATIVE_INFINITY
            || this.y === Number.POSITIVE_INFINITY || this.y === Number.NEGATIVE_INFINITY;
    }

    isUnit(): boolean;
    isUnit(margin: number): boolean;
    isUnit(margin?: number): boolean{
        return Math.abs(this.len2() - 1) < (margin === undefined ? 0.000000001 : margin);
    }

    isZero(): boolean;
    isZero(margin: number): boolean;
    isZero(margin?: number): boolean{
        return margin === undefined ? (this.x === 0 && this.y === 0) : this.len2() < margin;
    }

    isOnLine(other: Vec2): boolean;
    isOnLine(other: Vec2, epsilon: number): boolean;
    isOnLine(other: Vec2, epsilon?: number): boolean{
        return epsilon === undefined
            ? Mathf.zero(this.x * other.y - this.y * other.x)
            : Mathf.zero(this.x * other.y - this.y * other.x, epsilon);
    }

    isCollinear(other: Vec2): boolean;
    isCollinear(other: Vec2, epsilon: number): boolean;
    isCollinear(other: Vec2, epsilon?: number): boolean{
        return this.isOnLine(other, epsilon as any) && this.dot(other) > 0;
    }

    isCollinearOpposite(other: Vec2): boolean;
    isCollinearOpposite(other: Vec2, epsilon: number): boolean;
    isCollinearOpposite(other: Vec2, epsilon?: number): boolean{
        return this.isOnLine(other, epsilon as any) && this.dot(other) < 0;
    }

    isPerpendicular(vector: Vec2): boolean;
    isPerpendicular(vector: Vec2, epsilon: number): boolean;
    isPerpendicular(vector: Vec2, epsilon?: number): boolean{
        return epsilon === undefined ? Mathf.zero(this.dot(vector)) : Mathf.zero(this.dot(vector), epsilon);
    }

    hasSameDirection(vector: Vec2): boolean{
        return this.dot(vector) > 0;
    }

    hasOppositeDirection(vector: Vec2): boolean{
        return this.dot(vector) < 0;
    }

    setZero(): Vec2{
        this.x = 0;
        this.y = 0;
        return this;
    }

    getX(): number{
        return this.x;
    }

    getY(): number{
        return this.y;
    }

    plus(other: Vec2): Vec2{
        return this.add(other);
    }

    minus(other: Vec2): Vec2{
        return this.sub(other);
    }

    unaryMinus(): Vec2{
        return this.scl(-1);
    }

    times(other: Vec2): Vec2{
        return this.scl(other);
    }
}
