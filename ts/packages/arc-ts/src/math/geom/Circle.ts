// 源: arc-core/src/arc/math/geom/Circle.java
// 迁移说明: 逐字移植, 数值 float64。
import {Mathf} from '../Mathf';
import {Vec2} from './Vec2';
import {Shape2D} from './Shape2D';

/**
 * A convenient 2D circle class.
 */
export class Circle implements Shape2D{
    x: number;
    y: number;
    radius: number;

    /** Constructs a new circle with all values set to zero */
    constructor();
    /** Constructs a new circle with the given X and Y coordinates and the given radius. */
    constructor(x: number, y: number, radius: number);
    /** Constructs a new circle using a given {@link Vec2} that contains the desired X and Y coordinates, and a given radius. */
    constructor(position: Vec2, radius: number);
    /** Copy constructor */
    constructor(circle: Circle);
    /** Creates a new {@link Circle} in terms of its center and a point on its edge. */
    constructor(center: Vec2, edge: Vec2);
    constructor(a?: number | Vec2 | Circle, b?: number | Vec2, c?: number){
        if(a === undefined){
            this.x = 0; this.y = 0; this.radius = 0;
        }else if(typeof a === 'number'){
            this.x = a;
            this.y = b as number;
            this.radius = c!;
        }else if(a instanceof Circle){
            this.x = a.x;
            this.y = a.y;
            this.radius = a.radius;
        }else if(typeof b === 'number'){
            this.x = a.x;
            this.y = a.y;
            this.radius = b;
        }else{
            this.x = a.x;
            this.y = a.y;
            this.radius = Mathf.len(a.x - (b as Vec2).x, a.y - (b as Vec2).y);
        }
    }

    /**
     * Sets a new location and radius for this circle.
     */
    set(x: number, y: number, radius: number): Circle;
    /** Sets a new location and radius for this circle. */
    set(position: Vec2, radius: number): Circle;
    /** Sets a new location and radius for this circle, based upon another circle. */
    set(circle: Circle): Circle;
    /** Sets this {@link Circle}'s values in terms of its center and a point on its edge. */
    set(center: Vec2, edge: Vec2): Circle;
    set(a: number | Vec2 | Circle, b?: number | Vec2, c?: number): Circle{
        if(typeof a === 'number'){
            this.x = a;
            this.y = b as number;
            this.radius = c!;
        }else if(a instanceof Circle){
            this.x = a.x;
            this.y = a.y;
            this.radius = a.radius;
        }else if(typeof b === 'number'){
            this.x = a.x;
            this.y = a.y;
            this.radius = b;
        }else{
            this.x = a.x;
            this.y = a.y;
            this.radius = Mathf.len(a.x - (b as Vec2).x, a.y - (b as Vec2).y);
        }
        return this;
    }

    /**
     * Sets the x and y-coordinates of circle center from vector
     */
    setPosition(position: Vec2): Circle;
    /** Sets the x and y-coordinates of circle center */
    setPosition(x: number, y: number): Circle;
    setPosition(position: Vec2 | number, y?: number): Circle{
        if(typeof position === 'number'){
            this.x = position;
            this.y = y!;
        }else{
            this.x = position.x;
            this.y = position.y;
        }
        return this;
    }

    /**
     * Sets the x-coordinate of circle center
     */
    setX(x: number): void{
        this.x = x;
    }

    /**
     * Sets the y-coordinate of circle center
     */
    setY(y: number): void{
        this.y = y;
    }

    /**
     * Sets the radius of circle
     */
    setRadius(radius: number): void{
        this.radius = radius;
    }

    /**
     * Checks whether or not this circle contains a given point.
     */
    contains(x: number, y: number): boolean;
    /** Checks whether or not this circle contains a given point. */
    contains(point: Vec2): boolean;
    /** @return whether this circle contains the other circle. */
    contains(c: Circle): boolean;
    contains(a: number | Vec2 | Circle, b?: number): boolean{
        if(typeof a === 'number'){
            const dx = this.x - a;
            const dy = this.y - b!;
            return dx * dx + dy * dy <= this.radius * this.radius;
        }else if(a instanceof Circle){
            const radiusDiff = this.radius - a.radius;
            if(radiusDiff < 0) return false; // Can't contain bigger circle
            const dx = this.x - a.x;
            const dy = this.y - a.y;
            const dst = dx * dx + dy * dy;
            const radiusSum = this.radius + a.radius;
            return (!(radiusDiff * radiusDiff < dst) && (dst < radiusSum * radiusSum));
        }
        const dx = this.x - a.x;
        const dy = this.y - a.y;
        return dx * dx + dy * dy <= this.radius * this.radius;
    }

    /**
     * @return whether this circle overlaps the other circle.
     */
    overlaps(c: Circle): boolean{
        const dx = this.x - c.x;
        const dy = this.y - c.y;
        const distance = dx * dx + dy * dy;
        const radiusSum = this.radius + c.radius;
        return distance < radiusSum * radiusSum;
    }

    /** Returns a {@link String} representation of this {@link Circle} of the form {@code x,y,radius}. */
    toString(): string{
        return this.x + ',' + this.y + ',' + this.radius;
    }

    /** @return The circumference of this circle (as 2 * {@link Mathf#PI2}) * {@code radius} */
    circumference(): number{
        return this.radius * Mathf.PI2;
    }

    /** @return The area of this circle (as {@link Mathf#PI} * radius * radius). */
    area(): number{
        return this.radius * this.radius * Mathf.PI;
    }

    equals(o: any): boolean{
        if(o === this) return true;
        if(o === null || !(o instanceof Circle)) return false;
        const c = o as Circle;
        return this.x === c.x && this.y === c.y && this.radius === c.radius;
    }

    hashCode(): number{
        const f32 = new Float32Array(1);
        const i32 = new Int32Array(f32.buffer);
        const bits = (v: number): number => { f32[0] = v; return i32[0]; };
        let result = 1;
        result = 41 * result + bits(this.radius);
        result = 41 * result + bits(this.x);
        result = 41 * result + bits(this.y);
        return result | 0;
    }
}
