// 源: arc-core/src/arc/math/geom/Path.java
// 迁移说明: 逐字移植。

/**
 * Interface that specifies a path of type T within the window 0.0<=t<=1.0.
 */
export interface Path<T>{
    derivativeAt(out: T, t: number): T;

    /** @return The value of the path at t where 0<=t<=1 */
    valueAt(out: T, t: number): T;

    /**
     * @return The approximated value (between 0 and 1) on the path which is closest to the specified value.
     */
    approximate(v: T): number;

    /**
     * @return The precise location (between 0 and 1) on the path which is closest to the specified value.
     */
    locate(v: T): number;

    /**
     * @param samples The amount of divisions used to approximate length. Higher values will produce more precise results,
     * but will be more CPU intensive.
     * @return An approximated length of the spline through sampling the curve and accumulating the euclidean distances between
     * the sample points.
     */
    approxLength(samples: number): number;
}
