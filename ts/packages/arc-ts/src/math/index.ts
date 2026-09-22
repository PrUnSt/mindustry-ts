// 源: arc-core/src/arc/math/*.java 与 arc-core/src/arc/math/geom/*.java (arc.math 包统一导出)
// 注意: 本包另含最小本地 Time / ArcRuntimeException (不在此导出, 避免与 arc.util 重复)。

// ---- arc.math ----
export {Mathf} from './Mathf';
export {Rand} from './Rand';
export {Angles} from './Angles';
export type {Floatc2, ParticleConsumer} from './Angles';
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
export type {Boolf, Cons} from './geom/QuadTree';
export type {Path} from './geom/Path';
export {Bezier} from './geom/Bezier';
export {CatmullRomSpline} from './geom/CatmullRomSpline';
export {BSpline} from './geom/BSpline';
