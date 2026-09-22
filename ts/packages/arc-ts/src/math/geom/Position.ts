// 源: arc-core/src/arc/math/geom/Position.java
// 迁移说明: Java 接口含默认方法 (angleTo/dst/within 等)。TS 接口不支持默认实现,
// 故用抽象类承载默认方法, getX/getY 为抽象方法; 语义与 Java 默认方法等价。
import {Angles} from '../Angles';
import {Mathf} from '../Mathf';

/** Represents a point in 2-D space. */
export abstract class Position{
    abstract getX(): number;

    abstract getY(): number;

    angleTo(other: Position): number;
    angleTo(x: number, y: number): number;
    angleTo(a: Position | number, b?: number): number{
        if(typeof a === 'number'){
            return Angles.angle(this.getX(), this.getY(), a, b!);
        }
        return Angles.angle(this.getX(), this.getY(), a.getX(), a.getY());
    }

    dst2(other: Position): number;
    dst2(x: number, y: number): number;
    dst2(a: Position | number, b?: number): number{
        if(typeof a === 'number'){
            const xd = this.getX() - a;
            const yd = this.getY() - b!;
            return xd * xd + yd * yd;
        }
        return this.dst2(a.getX(), a.getY());
    }

    dst(other: Position): number;
    dst(x: number, y: number): number;
    dst(a: Position | number, b?: number): number{
        if(typeof a === 'number'){
            const xd = this.getX() - a;
            const yd = this.getY() - b!;
            return Mathf.sqrt(xd * xd + yd * yd);
        }
        return this.dst(a.getX(), a.getY());
    }

    within(other: Position, dst: number): boolean;
    within(x: number, y: number, dst: number): boolean;
    within(a: Position | number, b: number, c?: number): boolean{
        if(typeof a === 'number'){
            return Mathf.dst2(this.getX(), this.getY(), a, b) < b * b;
        }
        return this.within(a.getX(), a.getY(), b);
    }
}
