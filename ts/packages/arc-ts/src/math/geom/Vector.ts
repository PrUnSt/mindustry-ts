// 源: arc-core/src/arc/math/geom/Vector.java
// 迁移说明: Java 接口 + 默认方法 (plus/minus/unaryMinus/times) 在 TS 接口中声明为普通方法,
// 由 Vec2/Vec3 各自实现。
import {Interp} from '../Interp';

/**
 * Encapsulates a general vector. Allows chaining operations by returning a reference to itself in all modification methods.
 */
export interface Vector<T extends Vector<T>>{
    /** @return a copy of this vector */
    cpy(): T;

    /** @return The euclidean length */
    len(): number;

    /** @return The squared euclidean length */
    len2(): number;

    /** Limits the length of this vector, based on the desired maximum length. */
    limit(limit: number): T;

    /** Limits the length of this vector, based on the desired maximum length squared. */
    limit2(limit2: number): T;

    /** Sets the length of this vector. Does nothing if this vector is zero. */
    setLength(len: number): T;

    /** Sets the length of this vector, based on the square of the desired length. */
    setLength2(len2: number): T;

    /** Clamps this vector's length to given min and max values */
    clamp(min: number, max: number): T;

    /** Sets this vector from the given vector */
    set(v: T): T;

    /** Subtracts the given vector from this vector. */
    sub(v: T): T;

    /** Normalizes this vector. Does nothing if it is zero. */
    nor(): T;

    /** Adds the given vector to this vector */
    add(v: T): T;

    /** @return the dot product between this and the other vector */
    dot(v: T): number;

    /** Multiplies this vector by a scalar */
    scl(scalar: number): T;

    /** Multiplies this vector by the given vector */
    scl(v: T): T;

    /** Divides this vector by the given vector */
    div(v: T): T;

    /** @return the distance between this and the other vector */
    dst(v: T): number;

    /** @return the squared distance between this and the other vector */
    dst2(v: T): number;

    /** Linearly interpolates between this vector and the target vector by alpha which is in the range [0,1]. */
    lerp(target: T, alpha: number): T;

    /** Interpolates between this vector and the given target vector by alpha (within range [0,1]) using the given Interpolation method. */
    interpolate(target: T, alpha: number, interpolator: Interp): T;

    /** Sets this vector to the unit vector with a random direction */
    setToRandomDirection(): T;

    /** @return Whether this vector is a unit length vector */
    isUnit(): boolean;

    /** @return Whether this vector is a unit length vector within the given margin. */
    isUnit(margin: number): boolean;

    /** @return Whether this vector is a zero vector */
    isZero(): boolean;

    /** @return Whether the length of this vector is smaller than the given margin */
    isZero(margin: number): boolean;

    /** @return true if this vector is in line with the other vector (either in the same or the opposite direction) */
    isOnLine(other: T, epsilon: number): boolean;

    /** @return true if this vector is in line with the other vector (either in the same or the opposite direction) */
    isOnLine(other: T): boolean;

    /** @return true if this vector is collinear with the other vector. */
    isCollinear(other: T, epsilon: number): boolean;

    /** @return true if this vector is collinear with the other vector. */
    isCollinear(other: T): boolean;

    /** @return true if this vector is opposite collinear with the other vector. */
    isCollinearOpposite(other: T, epsilon: number): boolean;

    /** @return true if this vector is opposite collinear with the other vector. */
    isCollinearOpposite(other: T): boolean;

    /** @return Whether this vector is perpendicular with the other vector. True if the dot product is 0. */
    isPerpendicular(other: T): boolean;

    /** @return Whether this vector is perpendicular with the other vector. True if the dot product is 0. */
    isPerpendicular(other: T, epsilon: number): boolean;

    /** @return Whether this vector has similar direction compared to the other vector. True if the normalized dot product is > 0. */
    hasSameDirection(other: T): boolean;

    /** @return Whether this vector has opposite direction compared to the other vector. True if the normalized dot product is < 0. */
    hasOppositeDirection(other: T): boolean;

    /** Compares this vector with the other vector, using the supplied epsilon for fuzzy equality testing. */
    epsilonEquals(other: T, epsilon: number): boolean;

    /** First scale a supplied vector, then add it to this vector. */
    mulAdd(v: T, scalar: number): T;

    /** First scale a supplied vector, then add it to this vector. */
    mulAdd(v: T, mulVec: T): T;

    /** Sets the components of this vector to 0 */
    setZero(): T;

    plus(other: T): T;

    minus(other: T): T;

    unaryMinus(): T;

    times(other: T): T;
}
