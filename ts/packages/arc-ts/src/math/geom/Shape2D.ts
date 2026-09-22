// 源: arc-core/src/arc/math/geom/Shape2D.java
// 迁移说明: 逐字移植。
import {Vec2} from './Vec2';

export interface Shape2D{
    /** Returns whether the given point is contained within the shape. */
    contains(point: Vec2): boolean;

    /** Returns whether a point with the given coordinates is contained within the shape. */
    contains(x: number, y: number): boolean;
}
