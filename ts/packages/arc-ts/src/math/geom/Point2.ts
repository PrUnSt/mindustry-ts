// 源: arc-core/src/arc/math/geom/Point2.java
// 迁移说明: 逐字移植。short 转换用位运算对齐 Java (short) 截断。
function toShort(v: number): number{
    return ((v & 0xFFFF) << 16) >> 16;
}

/**
 * A point in a 2D grid, with integer x and y coordinates
 */
export class Point2{
    x: number;
    y: number;

    /** Constructs a new 2D grid point. */
    constructor();
    /** Constructs a new 2D grid point. */
    constructor(x: number, y: number);
    /** Copy constructor */
    constructor(point: Point2);
    constructor(x?: number | Point2, y?: number){
        if(x === undefined){
            this.x = 0;
            this.y = 0;
        }else if(typeof x === 'number'){
            this.x = x;
            this.y = y!;
        }else{
            this.x = x.x;
            this.y = x.y;
        }
    }

    /** @return a point unpacked from an integer. */
    static unpack(pos: number): Point2{
        return new Point2(toShort(pos >>> 16), toShort(pos & 0xFFFF));
    }

    /** @return this point packed into a single int by casting its components to shorts. */
    static pack(x: number, y: number): number{
        return (((toShort(x) << 16) | (toShort(y) & 0xFFFF)) | 0);
    }

    /** @return the x component of a packed position. */
    static x(pos: number): number{
        return toShort(pos >>> 16);
    }

    /** @return the y component of a packed position. */
    static y(pos: number): number{
        return toShort(pos & 0xFFFF);
    }

    /** @return this point packed into a single int by casting its components to shorts. */
    pack(): number{
        return Point2.pack(this.x, this.y);
    }

    /**
     * Sets the coordinates of this 2D grid point to that of another.
     */
    set(point: Point2): Point2;
    /** Sets the coordinates of this 2D grid point. */
    set(x: number, y: number): Point2;
    set(point: Point2 | number, y?: number): Point2{
        if(typeof point === 'number'){
            this.x = point;
            this.y = y!;
        }else{
            this.x = point.x;
            this.y = point.y;
        }
        return this;
    }

    /**
     * @return the squared distance between this point and the other point.
     */
    dst2(other: Point2): number;
    dst2(x: number, y: number): number;
    dst2(other: Point2 | number, y?: number): number{
        if(typeof other === 'number'){
            const xd = other - this.x;
            const yd = y! - this.y;
            return xd * xd + yd * yd;
        }
        const xd = other.x - this.x;
        const yd = other.y - this.y;
        return xd * xd + yd * yd;
    }

    /**
     * @return the distance between this point and the other vector.
     */
    dst(other: Point2): number;
    dst(x: number, y: number): number;
    dst(other: Point2 | number, y?: number): number{
        if(typeof other === 'number'){
            const xd = other - this.x;
            const yd = y! - this.y;
            return Math.sqrt(xd * xd + yd * yd);
        }
        const xd = other.x - this.x;
        const yd = other.y - this.y;
        return Math.sqrt(xd * xd + yd * yd);
    }

    /**
     * Adds another 2D grid point to this point.
     */
    add(other: Point2): Point2;
    add(x: number, y: number): Point2;
    add(other: Point2 | number, y?: number): Point2{
        if(typeof other === 'number'){
            this.x += other;
            this.y += y!;
        }else{
            this.x += other.x;
            this.y += other.y;
        }
        return this;
    }

    /**
     * Subtracts another 2D grid point from this point.
     */
    sub(other: Point2): Point2;
    sub(x: number, y: number): Point2;
    sub(other: Point2 | number, y?: number): Point2{
        if(typeof other === 'number'){
            this.x -= other;
            this.y -= y!;
        }else{
            this.x -= other.x;
            this.y -= other.y;
        }
        return this;
    }

    /** @return a copy of this grid point */
    cpy(): Point2{
        return new Point2(this);
    }

    /** Rotates this point in 90-degree increments several times. */
    rotate(steps: number): Point2{
        for(let i = 0; i < Math.abs(steps); i++){
            const x = this.x;
            if(steps >= 0){
                this.x = -this.y;
                this.y = x;
            }else{
                this.x = this.y;
                this.y = -x;
            }
        }
        return this;
    }

    equals(x: number, y: number): boolean;
    equals(o: any): boolean;
    equals(a: any, b?: number): boolean{
        if(typeof a === 'number'){
            return this.x === a && this.y === b;
        }
        if(this === a) return true;
        if(a === null || !(a instanceof Point2)) return false;
        const g = a as Point2;
        return this.x === g.x && this.y === g.y;
    }

    static equals(x: number, y: number, ox: number, oy: number): boolean{
        return x === ox && y === oy;
    }

    hashCode(): number{
        return ((this.x * 0xC13F + this.y * 0x91E1) | 0);
    }

    toString(): string{
        return '(' + this.x + ', ' + this.y + ')';
    }
}
