// 源: arc-core/src/arc/math/geom/Point3.java
// 迁移说明: 逐字移植。

/**
 * A point in a 3D grid, with integer x, y and z coordinates
 */
export class Point3{
    x: number;
    y: number;
    z: number;

    /** Constructs a new 3D grid point with all coordinates pointing to the origin (0, 0, 0). */
    constructor();
    /** Constructs a 3D grid point. */
    constructor(x: number, y: number, z: number);
    /** Copy constructor */
    constructor(point: Point3);
    constructor(x?: number | Point3, y?: number, z?: number){
        if(x === undefined){
            this.x = 0; this.y = 0; this.z = 0;
        }else if(typeof x === 'number'){
            this.x = x;
            this.y = y!;
            this.z = z!;
        }else{
            this.x = x.x;
            this.y = x.y;
            this.z = x.z;
        }
    }

    /**
     * Sets the coordinates of this 3D grid point to that of another.
     */
    set(point: Point3): Point3;
    /** Sets the coordinates of this GridPoint3D. */
    set(x: number, y: number, z: number): Point3;
    set(point: Point3 | number, y?: number, z?: number): Point3{
        if(typeof point === 'number'){
            this.x = point;
            this.y = y!;
            this.z = z!;
        }else{
            this.x = point.x;
            this.y = point.y;
            this.z = point.z;
        }
        return this;
    }

    /**
     * @return the squared distance between this point and the other point.
     */
    dst2(other: Point3): number;
    dst2(x: number, y: number, z: number): number;
    dst2(other: Point3 | number, y?: number, z?: number): number{
        if(typeof other === 'number'){
            const xd = other - this.x;
            const yd = y! - this.y;
            const zd = z! - this.z;
            return xd * xd + yd * yd + zd * zd;
        }
        const xd = other.x - this.x;
        const yd = other.y - this.y;
        const zd = other.z - this.z;
        return xd * xd + yd * yd + zd * zd;
    }

    /**
     * @return the distance between this point and the other vector.
     */
    dst(other: Point3): number;
    dst(x: number, y: number, z: number): number;
    dst(other: Point3 | number, y?: number, z?: number): number{
        if(typeof other === 'number'){
            const xd = other - this.x;
            const yd = y! - this.y;
            const zd = z! - this.z;
            return Math.sqrt(xd * xd + yd * yd + zd * zd);
        }
        const xd = other.x - this.x;
        const yd = other.y - this.y;
        const zd = other.z - this.z;
        return Math.sqrt(xd * xd + yd * yd + zd * zd);
    }

    /**
     * Adds another 3D grid point to this point.
     */
    add(other: Point3): Point3;
    add(x: number, y: number, z: number): Point3;
    add(other: Point3 | number, y?: number, z?: number): Point3{
        if(typeof other === 'number'){
            this.x += other;
            this.y += y!;
            this.z += z!;
        }else{
            this.x += other.x;
            this.y += other.y;
            this.z += other.z;
        }
        return this;
    }

    /**
     * Subtracts another 3D grid point from this point.
     */
    sub(other: Point3): Point3;
    sub(x: number, y: number, z: number): Point3;
    sub(other: Point3 | number, y?: number, z?: number): Point3{
        if(typeof other === 'number'){
            this.x -= other;
            this.y -= y!;
            this.z -= z!;
        }else{
            this.x -= other.x;
            this.y -= other.y;
            this.z -= other.z;
        }
        return this;
    }

    /** @return a copy of this grid point */
    cpy(): Point3{
        return new Point3(this);
    }

    equals(o: any): boolean{
        if(this === o) return true;
        if(o === null || !(o instanceof Point3)) return false;
        const g = o as Point3;
        return this.x === g.x && this.y === g.y && this.z === g.z;
    }

    hashCode(): number{
        let result = 1;
        result = 17 * result + this.x;
        result = 17 * result + this.y;
        result = 17 * result + this.z;
        return result | 0;
    }

    toString(): string{
        return '(' + this.x + ', ' + this.y + ', ' + this.z + ')';
    }
}
