// 源: arc-core/src/arc/math/*.java 与 arc-core/src/arc/math/geom/*.java (arc.math 包统一导出)
// 注意: 本包另含 ArcRuntimeException (不在此导出, 避免与 arc.util 重复)。
// 时间基准只有一处: arc.math 一律引用 ../util/Time (TS-1, 原 math/Time.ts 存根已删除)。

// ---- arc.math ----
export {Mathf} from './Mathf';
export {Rand} from './Rand';
export {Angles} from './Angles';

export {Interp} from './Interp';
export {WindowedMean} from './WindowedMean';
export {Scaling} from './Scaling';
export {Mat, Affine2} from './Mat';

// ---- arc.math.geom ----
export {Vec2} from './geom/Vec2';
export {Vec3} from './geom/Vec3';
export {Rect} from './geom/Rect';
export {Circle} from './geom/Circle';
export {Polygon} from './geom/Polygon';
export {Polyline} from './geom/Polyline';
export {Point2} from './geom/Point2';
export {Point3} from './geom/Point3';
export {Position} from './geom/Position';
export type {Vector} from './geom/Vector';
export type {Shape2D} from './geom/Shape2D';
export {Intersector, MinimumTranslationVector} from './geom/Intersector';
export {QuadTree} from './geom/QuadTree';

export type {Path} from './geom/Path';
export {Bezier} from './geom/Bezier';
export {CatmullRomSpline} from './geom/CatmullRomSpline';
export {BSpline} from './geom/BSpline';
