// 源: arc-core/src/arc/math/geom/Polygon.java
// 迁移说明: 逐字移植。area() 使用 Geometry.polygonArea 的最小本地等价实现。
import {Mathf} from '../Mathf';
import {Rect} from './Rect';
import {Vec2} from './Vec2';
import {Shape2D} from './Shape2D';

/** 对应 arc.math.geom.Geometry.polygonArea(float[], int, int) (本地最小实现). */
function polygonArea(polygon: number[], offset: number, count: number): number{
    let area = 0;
    for(let i = offset, n = offset + count; i < n; i += 2){
        const y1 = i + 1;
        let x2 = (i + 2) % n;
        if(x2 < offset) x2 += offset;
        let y2 = (i + 3) % n;
        if(y2 < offset) y2 += offset;
        area += polygon[i] * polygon[y2];
        area -= polygon[x2] * polygon[y1];
    }
    area *= 0.5;
    return area;
}

/** Encapsulates a 2D polygon defined by it's vertices relative to an origin point (default of 0, 0). */
export class Polygon implements Shape2D{
    private localVertices: number[];
    private worldVertices: number[] | null = null;
    private x = 0;
    private y = 0;
    private originX = 0;
    private originY = 0;
    private rotation = 0;
    private scaleX = 1;
    private scaleY = 1;
    private dirtyFlag = true;
    private bounds: Rect | null = null;

    /** Constructs a new polygon with no vertices. */
    constructor();
    /**
     * Constructs a new polygon from a float array of parts of vertex points.
     * @throws IllegalArgumentException if less than 6 elements, representing 3 points, are provided
     */
    constructor(vertices: number[]);
    constructor(vertices?: number[]){
        if(vertices === undefined){
            this.localVertices = new Array<number>(0);
        }else{
            if(vertices.length < 6) throw new Error('polygons must contain at least 3 points.');
            this.localVertices = vertices;
        }
    }

    /** Returns the polygon's local vertices without scaling or rotation and without being offset by the polygon position. */
    getVertices(): number[]{
        return this.localVertices;
    }

    /**
     * Sets the polygon's local vertices relative to the origin point, without any scaling, rotating or translations being applied.
     * @throws IllegalArgumentException if less than 6 elements, representing 3 points, are provided
     */
    setVertices(vertices: number[]): void{
        if(vertices.length < 6) throw new Error('polygons must contain at least 3 points.');
        this.localVertices = vertices;
        this.dirtyFlag = true;
    }

    /**
     * Calculates and returns the vertices of the polygon after scaling, rotation, and positional translations have been applied,
     * as they are position within the world.
     */
    getTransformedVertices(): number[]{
        if(!this.dirtyFlag) return this.worldVertices!;
        this.dirtyFlag = false;

        const localVertices = this.localVertices;
        if(this.worldVertices === null || this.worldVertices.length !== localVertices.length){
            this.worldVertices = new Array<number>(localVertices.length);
        }

        const worldVertices = this.worldVertices!;
        const positionX = this.x;
        const positionY = this.y;
        const originX = this.originX;
        const originY = this.originY;
        const scaleX = this.scaleX;
        const scaleY = this.scaleY;
        const scale = scaleX !== 1 || scaleY !== 1;
        const rotation = this.rotation;
        const cos = Mathf.cosDeg(rotation);
        const sin = Mathf.sinDeg(rotation);

        for(let i = 0, n = localVertices.length; i < n; i += 2){
            let x = localVertices[i] - originX;
            let y = localVertices[i + 1] - originY;

            // scale if needed
            if(scale){
                x *= scaleX;
                y *= scaleY;
            }

            // rotate if needed
            if(rotation !== 0){
                const oldX = x;
                x = cos * x - sin * y;
                y = sin * oldX + cos * y;
            }

            worldVertices[i] = positionX + x + originX;
            worldVertices[i + 1] = positionY + y + originY;
        }
        return worldVertices;
    }

    /** Sets the origin point to which all of the polygon's local vertices are relative to. */
    setOrigin(originX: number, originY: number): void{
        this.originX = originX;
        this.originY = originY;
        this.dirtyFlag = true;
    }

    /** Sets the polygon's position within the world. */
    setPosition(x: number, y: number): void{
        this.x = x;
        this.y = y;
        this.dirtyFlag = true;
    }

    /** Translates the polygon's position by the specified horizontal and vertical amounts. */
    translate(x: number, y: number): void{
        this.x += x;
        this.y += y;
        this.dirtyFlag = true;
    }

    /** Applies additional rotation to the polygon by the supplied degrees. */
    rotate(degrees: number): void{
        this.rotation += degrees;
        this.dirtyFlag = true;
    }

    /** Sets the amount of scaling to be applied to the polygon. */
    setScale(scaleX: number, scaleY: number): void{
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.dirtyFlag = true;
    }

    /** Applies additional scaling to the polygon by the supplied amount. */
    scale(amount: number): void{
        this.scaleX += amount;
        this.scaleY += amount;
        this.dirtyFlag = true;
    }

    /** Sets the polygon's world vertices to be recalculated when calling {@link getTransformedVertices()}. */
    dirty(): void{
        this.dirtyFlag = true;
    }

    /** Returns the area contained within the polygon. */
    area(): number{
        const vertices = this.getTransformedVertices();
        return polygonArea(vertices, 0, vertices.length);
    }

    /**
     * Returns an axis-aligned bounding box of this polygon.
     */
    getBoundingRectangle(): Rect{
        const vertices = this.getTransformedVertices();

        let minX = vertices[0];
        let minY = vertices[1];
        let maxX = vertices[0];
        let maxY = vertices[1];

        const numFloats = vertices.length;
        for(let i = 2; i < numFloats; i += 2){
            minX = minX > vertices[i] ? vertices[i] : minX;
            minY = minY > vertices[i + 1] ? vertices[i + 1] : minY;
            maxX = maxX < vertices[i] ? vertices[i] : maxX;
            maxY = maxY < vertices[i + 1] ? vertices[i + 1] : maxY;
        }

        if(this.bounds === null) this.bounds = new Rect();
        this.bounds.x = minX;
        this.bounds.y = minY;
        this.bounds.width = maxX - minX;
        this.bounds.height = maxY - minY;

        return this.bounds;
    }

    /** Returns whether an x, y pair is contained within the polygon. */
    contains(x: number, y: number): boolean;
    contains(point: Vec2): boolean;
    contains(a: number | Vec2, b?: number): boolean{
        if(typeof a === 'number'){
            const x = a;
            const y = b!;
            const vertices = this.getTransformedVertices();
            const numFloats = vertices.length;
            let intersects = 0;

            for(let i = 0; i < numFloats; i += 2){
                const x1 = vertices[i];
                const y1 = vertices[i + 1];
                const x2 = vertices[(i + 2) % numFloats];
                const y2 = vertices[(i + 3) % numFloats];
                if(((y1 <= y && y < y2) || (y2 <= y && y < y1)) && x < ((x2 - x1) / (y2 - y1) * (y - y1) + x1)){
                    intersects++;
                }
            }
            return (intersects & 1) === 1;
        }
        return this.contains(a.x, a.y);
    }

    /** Returns the x-coordinate of the polygon's position within the world. */
    getX(): number{
        return this.x;
    }

    /** Returns the y-coordinate of the polygon's position within the world. */
    getY(): number{
        return this.y;
    }

    /** Returns the x-coordinate of the polygon's origin point. */
    getOriginX(): number{
        return this.originX;
    }

    /** Returns the y-coordinate of the polygon's origin point. */
    getOriginY(): number{
        return this.originY;
    }

    /** Returns the total rotation applied to the polygon. */
    getRotation(): number{
        return this.rotation;
    }

    /** Sets the polygon to be rotated by the supplied degrees. */
    setRotation(degrees: number): void{
        this.rotation = degrees;
        this.dirtyFlag = true;
    }

    /** Returns the total horizontal scaling applied to the polygon. */
    getScaleX(): number{
        return this.scaleX;
    }

    /** Returns the total vertical scaling applied to the polygon. */
    getScaleY(): number{
        return this.scaleY;
    }
}
