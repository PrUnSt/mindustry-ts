// 源: arc-core/src/arc/math/geom/Rect.java
// 迁移说明: 逐字移植, 数值 float64。
import {Vec2} from './Vec2';
import {Circle} from './Circle';
import {Shape2D} from './Shape2D';
import {ArcRuntimeException} from '../ArcRuntimeException';

/**
 * Encapsulates a 2D rectangle defined by its corner point in the bottom left and its extents in x (width) and y (height).
 */
export class Rect implements Shape2D{
    /** Static temporary rectangle. Use with care! Use only when sure other code will not also use this. */
    static readonly tmp = new Rect();

    /** Static temporary rectangle. Use with care! Use only when sure other code will not also use this. */
    static readonly tmp2 = new Rect();

    x: number;
    y: number;
    width: number;
    height: number;

    /** Constructs a new rectangle with all values set to zero */
    constructor();
    /** Constructs a new rectangle with the given corner point in the bottom left and dimensions. */
    constructor(x: number, y: number, width: number, height: number);
    /** Constructs a rectangle based on the given rectangle */
    constructor(rect: Rect);
    constructor(x?: number | Rect, y?: number, width?: number, height?: number){
        if(x === undefined){
            this.x = 0; this.y = 0; this.width = 0; this.height = 0;
        }else if(typeof x === 'number'){
            this.x = x;
            this.y = y!;
            this.width = width!;
            this.height = height!;
        }else{
            this.x = x.x;
            this.y = x.y;
            this.width = x.width;
            this.height = x.height;
        }
    }

    setCentered(x: number, y: number, size: number): Rect;
    setCentered(x: number, y: number, width: number, height: number): Rect;
    setCentered(x: number, y: number, width: number, height?: number): Rect{
        if(height === undefined){
            return this.set(x - width / 2, y - width / 2, width, width);
        }
        return this.set(x - width / 2, y - height / 2, width, height);
    }

    /**
     * @return this rectangle for chaining
     */
    set(x: number, y: number, width: number, height: number): Rect;
    /** Sets the values of the given rectangle to this rectangle. */
    set(rect: Rect): Rect;
    set(x: number | Rect, y?: number, width?: number, height?: number): Rect{
        if(typeof x === 'number'){
            this.x = x;
            this.y = y!;
            this.width = width!;
            this.height = height!;
        }else{
            this.x = x.x;
            this.y = x.y;
            this.width = x.width;
            this.height = x.height;
        }
        return this;
    }

    /** @return the x-coordinate of the bottom left corner */
    getX(): number{
        return this.x;
    }

    /**
     * Sets the x-coordinate of the bottom left corner
     */
    setX(x: number): Rect{
        this.x = x;
        return this;
    }

    /** @return the y-coordinate of the bottom left corner */
    getY(): number{
        return this.y;
    }

    /**
     * Sets the y-coordinate of the bottom left corner
     */
    setY(y: number): Rect{
        this.y = y;
        return this;
    }

    /** @return the width */
    getWidth(): number{
        return this.width;
    }

    /**
     * Sets the width of this rectangle
     */
    setWidth(width: number): Rect{
        this.width = width;
        return this;
    }

    /** @return the height */
    getHeight(): number{
        return this.height;
    }

    /**
     * Sets the height of this rectangle
     */
    setHeight(height: number): Rect{
        this.height = height;
        return this;
    }

    /**
     * return the Vec2 with coordinates of this rectangle
     */
    getPosition(position: Vec2): Vec2{
        return position.set(this.x, this.y);
    }

    /**
     * Sets the x and y-coordinates of the bottom left corner from vector
     */
    setPosition(position: Vec2): Rect;
    /**
     * Sets the x and y-coordinates of the bottom left corner
     */
    setPosition(x: number, y: number): Rect;
    setPosition(position: Vec2 | number, y?: number): Rect{
        if(typeof position === 'number'){
            this.x = position;
            this.y = y!;
        }else{
            this.x = position.x;
            this.y = position.y;
        }
        return this;
    }

    move(cx: number, cy: number): Rect{
        this.x += cx;
        this.y += cy;
        return this;
    }

    /**
     * Sets the width and height of this rectangle
     */
    setSize(width: number, height: number): Rect;
    /**
     * Sets the squared size of this rectangle
     */
    setSize(sizeXY: number): Rect;
    setSize(width: number, height?: number): Rect{
        this.width = width;
        this.height = height === undefined ? width : height;
        return this;
    }

    /**
     * @return the Vec2 with size of this rectangle
     */
    getSize(size: Vec2): Vec2{
        return size.set(this.width, this.height);
    }

    static contains(x: number, y: number, width: number, height: number, px: number, py: number): boolean;
    static contains(x: number, y: number, width: number, height: number, rx: number, ry: number, rwidth: number, rheight: number): boolean;
    static contains(x: number, y: number, width: number, height: number, a: number, b: number, c?: number, d?: number): boolean{
        if(c === undefined){
            return x <= a && x + width >= a && y <= b && y + height >= b;
        }
        const xmax = a + c;
        const ymax = b + d!;

        return ((a > x && a < x + width) && (xmax > x && xmax < x + width))
        && ((b > y && b < y + height) && (ymax > y && ymax < y + height));
    }

    /**
     * @return whether the point is contained in the rectangle
     */
    contains(x: number, y: number): boolean;
    /** @param point The coordinates vector */
    contains(point: Vec2): boolean;
    /** @param circle the circle */
    contains(circle: Circle): boolean;
    /** @param rect the other {@link Rect}. */
    contains(rect: Rect): boolean;
    contains(a: number | Vec2 | Circle | Rect, b?: number): boolean{
        if(typeof a === 'number'){
            return this.x <= a && this.x + this.width >= a && this.y <= b! && this.y + this.height >= b!;
        }else if(a instanceof Circle){
            return (a.x - a.radius >= this.x) && (a.x + a.radius <= this.x + this.width)
                && (a.y - a.radius >= this.y) && (a.y + a.radius <= this.y + this.height);
        }else if(a instanceof Rect){
            const xmin = a.x;
            const xmax = xmin + a.width;
            const ymin = a.y;
            const ymax = ymin + a.height;

            return ((xmin > this.x && xmin < this.x + this.width) && (xmax > this.x && xmax < this.x + this.width))
                && ((ymin > this.y && ymin < this.y + this.height) && (ymax > this.y && ymax < this.y + this.height));
        }
        return this.contains(a.x, a.y);
    }

    /**
     * @return whether this rectangle overlaps the other rectangle.
     */
    overlaps(r: Rect): boolean;
    /** @return whether this rectangle overlaps the other rectangle. */
    overlaps(rx: number, ry: number, rwidth: number, rheight: number): boolean;
    overlaps(r: Rect | number, ry?: number, rwidth?: number, rheight?: number): boolean{
        if(typeof r === 'number'){
            return this.x < r + rwidth! && this.x + this.width > r && this.y < ry! + rheight! && this.y + this.height > ry!;
        }
        return this.x < r.x + r.width && this.x + this.width > r.x && this.y < r.y + r.height && this.y + this.height > r.y;
    }

    grow(amount: number): Rect;
    grow(amountX: number, amountY: number): Rect;
    grow(amountX: number, amountY?: number): Rect{
        const ay = amountY === undefined ? amountX : amountY;
        this.x -= amountX / 2;
        this.y -= ay / 2;
        this.width += amountX;
        this.height += ay;
        return this;
    }

    /**
     * Merges this rectangle with the other rectangle. The rectangle should not have negative width or negative height.
     */
    merge(rect: Rect): Rect;
    /**
     * Merges this rectangle with a point. The rectangle should not have negative width or negative height.
     */
    merge(x: number, y: number): Rect;
    /** Merges this rectangle with a point. */
    merge(vec: Vec2): Rect;
    /**
     * Merges this rectangle with a list of points.
     */
    merge(vecs: Vec2[]): Rect;
    merge(a: Rect | number | Vec2 | Vec2[], b?: number): Rect{
        if(typeof a === 'number'){
            let minX = Math.min(this.x, a);
            let maxX = Math.max(this.x + this.width, a);
            this.x = minX;
            this.width = maxX - minX;

            let minY = Math.min(this.y, b!);
            let maxY = Math.max(this.y + this.height, b!);
            this.y = minY;
            this.height = maxY - minY;
        }else if(Array.isArray(a)){
            let minX = this.x;
            let maxX = this.x + this.width;
            let minY = this.y;
            let maxY = this.y + this.height;
            for(let i = 0; i < a.length; ++i){
                const v = a[i];
                minX = Math.min(minX, v.x);
                maxX = Math.max(maxX, v.x);
                minY = Math.min(minY, v.y);
                maxY = Math.max(maxY, v.y);
            }
            this.x = minX;
            this.width = maxX - minX;
            this.y = minY;
            this.height = maxY - minY;
        }else if(a instanceof Rect){
            const minX = Math.min(this.x, a.x);
            const maxX = Math.max(this.x + this.width, a.x + a.width);
            this.x = minX;
            this.width = maxX - minX;

            const minY = Math.min(this.y, a.y);
            const maxY = Math.max(this.y + this.height, a.y + a.height);
            this.y = minY;
            this.height = maxY - minY;
        }else{
            return this.merge(a.x, a.y);
        }
        return this;
    }

    /** "fixes" negative size dimensions. */
    normalize(): Rect{
        if(this.width < 0){
            this.x += this.width;
            this.width = -this.width;
        }

        if(this.height < 0){
            this.y += this.height;
            this.height = -this.height;
        }
        return this;
    }

    /**
     * Calculates the aspect ratio ( width / height ) of this rectangle
     */
    getAspectRatio(): number{
        return (this.height === 0) ? Number.NaN : this.width / this.height;
    }

    /**
     * Calculates the center of the rectangle. Results are located in the given Vec2
     */
    getCenter(vector: Vec2): Vec2{
        vector.x = this.x + this.width / 2;
        vector.y = this.y + this.height / 2;
        return vector;
    }

    /**
     * Moves this rectangle so that its center point is located at a given position
     */
    setCenter(x: number, y: number): Rect;
    /** Moves this rectangle so that its center point is located at a given position */
    setCenter(position: Vec2): Rect;
    setCenter(position: Vec2 | number, y?: number): Rect{
        if(typeof position === 'number'){
            this.setPosition(position - this.width / 2, y! - this.height / 2);
        }else{
            this.setPosition(position.x - this.width / 2, position.y - this.height / 2);
        }
        return this;
    }

    /**
     * Fits this rectangle around another rectangle while maintaining aspect ratio.
     */
    fitOutside(rect: Rect): Rect{
        const ratio = this.getAspectRatio();

        if(ratio > rect.getAspectRatio()){
            // Wider than tall
            this.setSize(rect.height * ratio, rect.height);
        }else{
            // Taller than wide
            this.setSize(rect.width, rect.width / ratio);
        }

        this.setPosition((rect.x + rect.width / 2) - this.width / 2, (rect.y + rect.height / 2) - this.height / 2);
        return this;
    }

    /**
     * Fits this rectangle into another rectangle while maintaining aspect ratio.
     */
    fitInside(rect: Rect): Rect{
        const ratio = this.getAspectRatio();

        if(ratio < rect.getAspectRatio()){
            // Taller than wide
            this.setSize(rect.height * ratio, rect.height);
        }else{
            // Wider than tall
            this.setSize(rect.width, rect.width / ratio);
        }

        this.setPosition((rect.x + rect.width / 2) - this.width / 2, (rect.y + rect.height / 2) - this.height / 2);
        return this;
    }

    /**
     * Converts this {@code Rectangle} to a string in the format {@code [x,y,width,height]}.
     */
    toString(): string{
        return '[' + this.x + ',' + this.y + ',' + this.width + ',' + this.height + ']';
    }

    /**
     * Sets this {@code Rectangle} to the value represented by the specified string according to the format of {@link #toString()}.
     */
    fromString(v: string): Rect{
        const s0 = v.indexOf(',', 1);
        const s1 = v.indexOf(',', s0 + 1);
        const s2 = v.indexOf(',', s1 + 1);
        if(s0 !== -1 && s1 !== -1 && s2 !== -1 && v.charAt(0) === '[' && v.charAt(v.length - 1) === ']'){
            try{
                const x = parseFloat(v.substring(1, s0));
                const y = parseFloat(v.substring(s0 + 1, s1));
                const width = parseFloat(v.substring(s1 + 1, s2));
                const height = parseFloat(v.substring(s2 + 1, v.length - 1));
                return this.set(x, y, width, height);
            }catch(ex){
                // throw below
            }
        }
        throw new ArcRuntimeException('Malformed Rectangle: ' + v);
    }

    area(): number{
        return this.width * this.height;
    }

    perimeter(): number{
        return 2 * (this.width + this.height);
    }

    hashCode(): number{
        const f32 = new Float32Array(1);
        const i32 = new Int32Array(f32.buffer);
        const bits = (v: number): number => { f32[0] = v; return i32[0]; };
        let result = 1;
        result = 31 * result + bits(this.height);
        result = 31 * result + bits(this.width);
        result = 31 * result + bits(this.x);
        result = 31 * result + bits(this.y);
        return result | 0;
    }

    equals(obj: any): boolean{
        if(this === obj) return true;
        if(obj === null) return false;
        if(obj instanceof Rect){
            const other = obj as Rect;
            const f32 = new Float32Array(1);
            const i32 = new Int32Array(f32.buffer);
            const bits = (v: number): number => { f32[0] = v; return i32[0]; };
            if(bits(this.height) !== bits(other.height)) return false;
            if(bits(this.width) !== bits(other.width)) return false;
            if(bits(this.x) !== bits(other.x)) return false;
            return bits(this.y) === bits(other.y);
        }
        return false;
    }
}
