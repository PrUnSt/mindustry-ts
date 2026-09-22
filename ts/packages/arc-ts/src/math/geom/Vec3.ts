// 源: arc-core/src/arc/math/geom/Vec3.java
// 迁移说明: 全量移植, 数值 float64。
import {Mathf} from '../Mathf';
import {Mat} from '../Mat';
import {Rand} from '../Rand';
import {Interp} from '../Interp';
import {Vector} from './Vector';
import {Vec2} from './Vec2';
import {ArcRuntimeException} from '../ArcRuntimeException';

const f32 = new Float32Array(1);
const i32 = new Int32Array(f32.buffer);

/** 对应 Java Float.floatToIntBits: 返回 float 的 IEEE-754 位模式 (int32). */
function floatToIntBits(v: number): number{
    f32[0] = v;
    return i32[0];
}

/**
 * Encapsulates a 3D vector. Allows chaining operations by returning a reference to itself in all modification methods.
 */
export class Vec3 implements Vector<Vec3>{
    static readonly X = new Vec3(1, 0, 0);
    static readonly Y = new Vec3(0, 1, 0);
    static readonly Z = new Vec3(0, 0, 1);
    static readonly Zero = new Vec3(0, 0, 0);
    private static readonly tmpMat = new Mat();

    /** the x-component of this vector **/
    x: number = 0;
    /** the y-component of this vector **/
    y: number = 0;
    /** the z-component of this vector **/
    z: number = 0;

    /** Constructs a vector at (0,0,0) */
    constructor();
    /** Creates a vector with the given components */
    constructor(x: number, y: number, z: number);
    /** Creates a vector from the given vector */
    constructor(vector: Vec3);
    /** Creates a vector from the given array. The array must have at least 3 elements. */
    constructor(values: number[]);
    /** Creates a vector from the given vector and z-component */
    constructor(vector: Vec2, z: number);
    constructor(a?: number | number[] | Vec3 | Vec2, b?: number, c?: number){
        if(a === undefined){
            this.x = 0; this.y = 0; this.z = 0;
        }else if(typeof a === 'number'){
            this.set(a, b!, c!);
        }else if(Array.isArray(a)){
            this.set(a[0], a[1], a[2]);
        }else if(a instanceof Vec3){
            this.set(a);
        }else{
            this.set(a.x, a.y, b!);
        }
    }

    /** @return The euclidean length */
    static len(x: number, y: number, z: number): number{
        return Math.sqrt(x * x + y * y + z * z);
    }

    /** @return The squared euclidean length */
    static len2(x: number, y: number, z: number): number{
        return x * x + y * y + z * z;
    }

    /** @return The euclidean distance between the two specified vectors */
    static dst(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number{
        const a = x2 - x1;
        const b = y2 - y1;
        const c = z2 - z1;
        return Math.sqrt(a * a + b * b + c * c);
    }

    /** @return the squared distance between the given points */
    static dst2(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number{
        const a = x2 - x1;
        const b = y2 - y1;
        const c = z2 - z1;
        return a * a + b * b + c * c;
    }

    /** @return The dot product between the two vectors */
    static dot(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number{
        return x1 * x2 + y1 * y2 + z1 * z2;
    }

    /**
     * Sets the vector to the given components
     */
    set(x: number, y: number, z: number): Vec3;
    set(vector: Vec3): Vec3;
    set(values: number[]): Vec3;
    set(values: number[], offset: number): Vec3;
    set(vector: Vec2, z: number): Vec3;
    set(a: number | Vec3 | number[] | Vec2, b?: number, c?: number): Vec3{
        if(typeof a === 'number'){
            this.x = a;
            this.y = b!;
            this.z = c!;
        }else if(Array.isArray(a)){
            this.set(a[b ?? 0], a[(b ?? 0) + 1], a[(b ?? 0) + 2]);
        }else if(a instanceof Vec3){
            this.set(a.x, a.y, a.z);
        }else{
            this.set(a.x, a.y, b!);
        }
        return this;
    }

    /**
     * Sets the components from the given spherical coordinate
     */
    setFromSpherical(azimuthalAngle: number, polarAngle: number): Vec3{
        const cosPolar = Mathf.cos(polarAngle);
        const sinPolar = Mathf.sin(polarAngle);

        const cosAzim = Mathf.cos(azimuthalAngle);
        const sinAzim = Mathf.sin(azimuthalAngle);

        return this.set(cosAzim * sinPolar, sinAzim * sinPolar, cosPolar);
    }

    setToRandomDirection(): Vec3;
    setToRandomDirection(rand: Rand): Vec3;
    setToRandomDirection(rand?: Rand): Vec3{
        const u = rand === undefined ? Mathf.random(1) : rand.random(1);
        const v = rand === undefined ? Mathf.random(1) : rand.random(1);

        const theta = Mathf.PI2 * u; // azimuthal angle
        const phi = Math.acos(2 * v - 1); // polar angle

        return this.setFromSpherical(theta, phi);
    }

    cpy(): Vec3;
    cpy(dest: Vec3): Vec3;
    cpy(dest?: Vec3): Vec3{
        if(dest === undefined) return new Vec3(this);
        return dest.set(this);
    }

    add(vector: Vec3): Vec3;
    add(vector: Vec3, scale: number): Vec3;
    /** Adds the given vector to this component */
    add(x: number, y: number, z: number): Vec3;
    /** Adds the given value to all three components of the vector. */
    add(values: number): Vec3;
    add(a: Vec3 | number, b?: number, c?: number): Vec3{
        if(typeof a === 'number'){
            if(b === undefined){
                return this.set(this.x + a, this.y + a, this.z + a);
            }
            return this.set(this.x + a, this.y + b, this.z + c!);
        }
        if(typeof b === 'number'){
            return this.add(a.x * b, a.y * b, a.z * b);
        }
        return this.add(a.x, a.y, a.z);
    }



    sub(vector: Vec3): Vec3;
    sub(vector: Vec3, scale: number): Vec3;
    /** Subtracts the other vector from this vector. */
    sub(x: number, y: number, z: number): Vec3;
    /** Subtracts the given value from all components of this vector */
    sub(value: number): Vec3;
    sub(a: Vec3 | number, b?: number, c?: number): Vec3{
        if(typeof a === 'number'){
            if(b === undefined){
                return this.set(this.x - a, this.y - a, this.z - a);
            }
            return this.set(this.x - a, this.y - b, this.z - c!);
        }
        if(typeof b === 'number'){
            return this.sub(a.x * b, a.y * b, a.z * b);
        }
        return this.sub(a.x, a.y, a.z);
    }

    scl(scalar: number): Vec3;
    scl(other: Vec3): Vec3;
    /** Scales this vector by the given values */
    scl(vx: number, vy: number, vz: number): Vec3;
    scl(a: number | Vec3, b?: number, c?: number): Vec3{
        if(typeof a === 'number'){
            if(b === undefined){
                return this.set(this.x * a, this.y * a, this.z * a);
            }
            return this.set(this.x * a, this.y * b, this.z * c!);
        }
        return this.set(this.x * a.x, this.y * a.y, this.z * a.z);
    }

    mulAdd(vec: Vec3, scalar: number): Vec3;
    mulAdd(vec: Vec3, mulVec: Vec3): Vec3;
    mulAdd(vec: Vec3, a: number | Vec3): Vec3{
        if(typeof a === 'number'){
            this.x += vec.x * a;
            this.y += vec.y * a;
            this.z += vec.z * a;
        }else{
            this.x += vec.x * a.x;
            this.y += vec.y * a.y;
            this.z += vec.z * a.z;
        }
        return this;
    }

    div(other: Vec3): Vec3{
        this.x /= other.x;
        this.y /= other.y;
        this.z /= other.z;
        return this;
    }

    len(): number{
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    len2(): number{
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    /**
     * @return Whether this and the other vector are equal
     */
    idt(vector: Vec3): boolean{
        return this.x === vector.x && this.y === vector.y && this.z === vector.z;
    }

    dst(vector: Vec3): number;
    /** @return the distance between this point and the given point */
    dst(x: number, y: number, z: number): number;
    dst(a: Vec3 | number, b?: number, c?: number): number{
        if(typeof a === 'number'){
            const dx = a - this.x;
            const dy = b! - this.y;
            const dz = c! - this.z;
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        const dx = a.x - this.x;
        const dy = a.y - this.y;
        const dz = a.z - this.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    dst2(point: Vec3): number;
    /** Returns the squared distance between this point and the given point */
    dst2(x: number, y: number, z: number): number;
    dst2(a: Vec3 | number, b?: number, c?: number): number{
        if(typeof a === 'number'){
            const dx = a - this.x;
            const dy = b! - this.y;
            const dz = c! - this.z;
            return dx * dx + dy * dy + dz * dz;
        }
        const dx = a.x - this.x;
        const dy = a.y - this.y;
        const dz = a.z - this.z;
        return dx * dx + dy * dy + dz * dz;
    }

    within(v: Vec3, dst: number): boolean{
        return this.dst2(v) < dst * dst;
    }

    nor(): Vec3{
        const len2 = this.len2();
        if(len2 === 0 || len2 === 1) return this;
        return this.scl(1 / Math.sqrt(len2));
    }

    dot(vector: Vec3): number;
    /** Returns the dot product between this and the given vector. */
    dot(x: number, y: number, z: number): number;
    dot(a: Vec3 | number, b?: number, c?: number): number{
        if(typeof a === 'number'){
            return this.x * a + this.y * b! + this.z * c!;
        }
        return this.x * a.x + this.y * a.y + this.z * a.z;
    }

    /** @return the angle to the other vector, in radians. */
    angleRad(vector: Vec3): number{
        const l = this.len();
        const l2 = vector.len();
        return Math.acos(Vec3.dot(this.x / l, this.y / l, this.z / l, vector.x / l2, vector.y / l2, vector.z / l2));
    }

    /** @return the angle to the other vector, in degrees. */
    angle(vector: Vec3): number{
        return this.angleRad(vector) * Mathf.radDeg;
    }

    /**
     * Sets this vector to the cross product between it and the other vector.
     */
    crs(vector: Vec3): Vec3;
    /** Sets this vector to the cross product between it and the other vector. */
    crs(x: number, y: number, z: number): Vec3;
    crs(a: Vec3 | number, b?: number, c?: number): Vec3{
        if(typeof a === 'number'){
            return this.set(this.y * c! - this.z * b!, this.z * a - this.x * c!, this.x * b! - this.y * a);
        }
        return this.set(this.y * a.z - this.z * a.y, this.z * a.x - this.x * a.z, this.x * a.y - this.y * a.x);
    }

    /**
     * Left-multiplies the vector by the given 4x3 column major matrix.
     */
    mul4x3(matrix: number[]): Vec3{
        return this.set(
            this.x * matrix[0] + this.y * matrix[3] + this.z * matrix[6] + matrix[9],
            this.x * matrix[1] + this.y * matrix[4] + this.z * matrix[7] + matrix[10],
            this.x * matrix[2] + this.y * matrix[5] + this.z * matrix[8] + matrix[11]);
    }

    /**
     * Left-multiplies the vector by the given matrix.
     */
    mul(matrix: Mat): Vec3{
        const l_mat = matrix.val;
        return this.set(
            this.x * l_mat[Mat.M00] + this.y * l_mat[Mat.M01] + this.z * l_mat[Mat.M02],
            this.x * l_mat[Mat.M10] + this.y * l_mat[Mat.M11] + this.z * l_mat[Mat.M12],
            this.x * l_mat[Mat.M20] + this.y * l_mat[Mat.M21] + this.z * l_mat[Mat.M22]);
    }

    /**
     * Multiplies the vector by the transpose of the given matrix.
     */
    traMul(matrix: Mat): Vec3{
        const l_mat = matrix.val;
        return this.set(
            this.x * l_mat[Mat.M00] + this.y * l_mat[Mat.M10] + this.z * l_mat[Mat.M20],
            this.x * l_mat[Mat.M01] + this.y * l_mat[Mat.M11] + this.z * l_mat[Mat.M21],
            this.x * l_mat[Mat.M02] + this.y * l_mat[Mat.M12] + this.z * l_mat[Mat.M22]);
    }

    /**
     * Rotates this vector by the given angle in degrees around the given axis.
     */
    rotate(axis: Vec3, degrees: number): Vec3{
        Vec3.tmpMat.setToRotation(axis, degrees);
        return this.mul(Vec3.tmpMat);
    }

    isUnit(): boolean;
    isUnit(margin: number): boolean;
    isUnit(margin?: number): boolean{
        return Math.abs(this.len2() - 1) < (margin === undefined ? 0.000000001 : margin);
    }

    isZero(): boolean;
    isZero(margin: number): boolean;
    isZero(margin?: number): boolean{
        return margin === undefined ? (this.x === 0 && this.y === 0 && this.z === 0) : this.len2() < margin;
    }

    isOnLine(other: Vec3, epsilon: number): boolean;
    isOnLine(other: Vec3): boolean;
    isOnLine(other: Vec3, epsilon?: number): boolean{
        return Vec3.len2(
            this.y * other.z - this.z * other.y,
            this.z * other.x - this.x * other.z,
            this.x * other.y - this.y * other.x) <= (epsilon === undefined ? Mathf.FLOAT_ROUNDING_ERROR : epsilon);
    }

    isCollinear(other: Vec3, epsilon: number): boolean;
    isCollinear(other: Vec3): boolean;
    isCollinear(other: Vec3, epsilon?: number): boolean{
        return this.isOnLine(other, epsilon as any) && this.hasSameDirection(other);
    }

    isCollinearOpposite(other: Vec3, epsilon: number): boolean;
    isCollinearOpposite(other: Vec3): boolean;
    isCollinearOpposite(other: Vec3, epsilon?: number): boolean{
        return this.isOnLine(other, epsilon as any) && this.hasOppositeDirection(other);
    }

    isPerpendicular(vector: Vec3): boolean;
    isPerpendicular(vector: Vec3, epsilon: number): boolean;
    isPerpendicular(vector: Vec3, epsilon?: number): boolean{
        return epsilon === undefined ? Mathf.zero(this.dot(vector)) : Mathf.zero(this.dot(vector), epsilon);
    }

    hasSameDirection(vector: Vec3): boolean{
        return this.dot(vector) > 0;
    }

    hasOppositeDirection(vector: Vec3): boolean{
        return this.dot(vector) < 0;
    }

    lerp(target: Vec3, alpha: number): Vec3{
        this.x += alpha * (target.x - this.x);
        this.y += alpha * (target.y - this.y);
        this.z += alpha * (target.z - this.z);
        return this;
    }

    interpolate(target: Vec3, alpha: number, interpolator: Interp): Vec3{
        return this.lerp(target, interpolator.apply(0, 1, alpha));
    }

    /**
     * Spherically interpolates between this vector and the target vector by alpha which is in the range [0,1].
     */
    slerp(target: Vec3, alpha: number): Vec3{
        const dot = this.dot(target);
        // If the inputs are too close for comfort, simply linearly interpolate.
        if(dot > 0.9995 || dot < -0.9995) return this.lerp(target, alpha);

        // theta0 = angle between input vectors
        const theta0 = Math.acos(dot);
        // theta = angle between this vector and result
        const theta = theta0 * alpha;

        const st = Math.sin(theta);
        const tx = target.x - this.x * dot;
        const ty = target.y - this.y * dot;
        const tz = target.z - this.z * dot;
        const l2 = tx * tx + ty * ty + tz * tz;
        const dl = st * ((l2 < 0.0001) ? 1 : 1 / Math.sqrt(l2));

        return this.scl(Math.cos(theta)).add(tx * dl, ty * dl, tz * dl).nor();
    }

    /**
     * Converts this {@code Vec3} to a string in the format {@code (x,y,z)}.
     */
    toString(): string{
        return '(' + this.x + ',' + this.y + ',' + this.z + ')';
    }

    /**
     * Sets this {@code Vec3} to the value represented by the specified string according to the format of {@link #toString()}.
     */
    fromString(v: string): Vec3{
        const s0 = v.indexOf(',', 1);
        const s1 = v.indexOf(',', s0 + 1);
        if(s0 !== -1 && s1 !== -1 && v.charAt(0) === '(' && v.charAt(v.length - 1) === ')'){
            try{
                const x = parseFloat(v.substring(1, s0));
                const y = parseFloat(v.substring(s0 + 1, s1));
                const z = parseFloat(v.substring(s1 + 1, v.length - 1));
                return this.set(x, y, z);
            }catch(ex){
                // throw below
            }
        }
        throw new ArcRuntimeException('Malformed Vec3: ' + v);
    }

    limit(limit: number): Vec3{
        return this.limit2(limit * limit);
    }

    limit2(limit2: number): Vec3{
        const len2 = this.len2();
        if(len2 > limit2){
            this.scl(Math.sqrt(limit2 / len2));
        }
        return this;
    }

    setLength(len: number): Vec3{
        return this.setLength2(len * len);
    }

    setLength2(len2: number): Vec3{
        const oldLen2 = this.len2();
        return (oldLen2 === 0 || oldLen2 === len2) ? this : this.scl(Math.sqrt(len2 / oldLen2));
    }

    clamp(min: number, max: number): Vec3{
        const len2 = this.len2();
        if(len2 === 0) return this;
        const max2 = max * max;
        if(len2 > max2) return this.scl(Math.sqrt(max2 / len2));
        const min2 = min * min;
        if(len2 < min2) return this.scl(Math.sqrt(min2 / len2));
        return this;
    }

    hashCode(): number{
        let result = 1;
        result = 31 * result + floatToIntBits(this.x);
        result = 31 * result + floatToIntBits(this.y);
        result = 31 * result + floatToIntBits(this.z);
        return result | 0;
    }

    equals(obj: any): boolean{
        if(this === obj) return true;
        if(obj === null) return false;
        if(obj instanceof Vec3){
            const other = obj as Vec3;
            return floatToIntBits(this.x) === floatToIntBits(other.x)
                && floatToIntBits(this.y) === floatToIntBits(other.y)
                && floatToIntBits(this.z) === floatToIntBits(other.z);
        }
        return false;
    }

    epsilonEquals(other: Vec3, epsilon: number): boolean;
    /** Compares this vector with the other vector, using the supplied epsilon for fuzzy equality testing. */
    epsilonEquals(x: number, y: number, z: number, epsilon: number): boolean;
    /** Compares this vector with the other vector using Mathf.FLOAT_ROUNDING_ERROR for fuzzy equality testing */
    epsilonEquals(other: Vec3): boolean;
    /** Compares this vector with the other vector using Mathf.FLOAT_ROUNDING_ERROR for fuzzy equality testing */
    epsilonEquals(x: number, y: number, z: number): boolean;
    epsilonEquals(a: Vec3 | number, b?: number, c?: number, d?: number): boolean{
        if(typeof a === 'number'){
            const eps = d === undefined ? Mathf.FLOAT_ROUNDING_ERROR : d;
            if(Math.abs(a - this.x) > eps) return false;
            if(Math.abs(b! - this.y) > eps) return false;
            return !(Math.abs(c! - this.z) > eps);
        }
        if(a === null) return false;
        const eps = b === undefined ? Mathf.FLOAT_ROUNDING_ERROR : b;
        if(Math.abs(a.x - this.x) > eps) return false;
        if(Math.abs(a.y - this.y) > eps) return false;
        return !(Math.abs(a.z - this.z) > eps);
    }

    setZero(): Vec3{
        this.x = 0;
        this.y = 0;
        this.z = 0;
        return this;
    }

    plus(other: Vec3): Vec3{
        return this.add(other);
    }

    minus(other: Vec3): Vec3{
        return this.sub(other);
    }

    unaryMinus(): Vec3{
        return this.scl(-1);
    }

    times(other: Vec3): Vec3{
        return this.scl(other);
    }
}
