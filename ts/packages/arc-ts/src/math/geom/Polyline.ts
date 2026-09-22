// 源: arc-core/src/arc/math/geom/Polyline.java
// 迁移说明: 逐字移植, 数值 float64。contains 始终返回 false (与 Java 一致)。
import {Mathf} from '../Mathf';
import {Vec2} from './Vec2';
import {Shape2D} from './Shape2D';

export class Polyline implements Shape2D{
    private localVertices: number[];
    private worldVertices: number[] | null = null;
    private x = 0;
    private y = 0;
    private originX = 0;
    private originY = 0;
    private rotation = 0;
    private scaleX = 1;
    private scaleY = 1;
    private length = 0;
    private scaledLength = 0;
    private calcScaledLength = true;
    private calcLength = true;
    private dirtyFlag = true;

    constructor();
    constructor(vertices: number[]);
    constructor(vertices?: number[]){
        if(vertices === undefined){
            this.localVertices = new Array<number>(0);
        }else{
            if(vertices.length < 4) throw new Error('polylines must contain at least 2 points.');
            this.localVertices = vertices;
        }
    }

    /** Returns vertices without scaling or rotation and without being offset by the polyline position. */
    getVertices(): number[]{
        return this.localVertices;
    }

    setVertices(vertices: number[]): void{
        if(vertices.length < 4) throw new Error('polylines must contain at least 2 points.');
        this.localVertices = vertices;
        this.dirtyFlag = true;
    }

    /** Returns vertices scaled, rotated, and offset by the polygon position. */
    getTransformedVertices(): number[]{
        if(!this.dirtyFlag) return this.worldVertices!;
        this.dirtyFlag = false;

        const localVertices = this.localVertices;
        if(this.worldVertices === null || this.worldVertices.length < localVertices.length){
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

    /** Returns the euclidean length of the polyline without scaling */
    getLength(): number{
        if(!this.calcLength) return this.length;
        this.calcLength = false;

        this.length = 0;
        for(let i = 0, n = this.localVertices.length - 2; i < n; i += 2){
            const x = this.localVertices[i + 2] - this.localVertices[i];
            const y = this.localVertices[i + 1] - this.localVertices[i + 3];
            this.length += Math.sqrt(x * x + y * y);
        }

        return this.length;
    }

    /** Returns the euclidean length of the polyline */
    getScaledLength(): number{
        if(!this.calcScaledLength) return this.scaledLength;
        this.calcScaledLength = false;

        this.scaledLength = 0;
        for(let i = 0, n = this.localVertices.length - 2; i < n; i += 2){
            const x = this.localVertices[i + 2] * this.scaleX - this.localVertices[i] * this.scaleX;
            const y = this.localVertices[i + 1] * this.scaleY - this.localVertices[i + 3] * this.scaleY;
            this.scaledLength += Math.sqrt(x * x + y * y);
        }

        return this.scaledLength;
    }

    getX(): number{
        return this.x;
    }

    getY(): number{
        return this.y;
    }

    getOriginX(): number{
        return this.originX;
    }

    getOriginY(): number{
        return this.originY;
    }

    getRotation(): number{
        return this.rotation;
    }

    setRotation(degrees: number): void{
        this.rotation = degrees;
        this.dirtyFlag = true;
    }

    getScaleX(): number{
        return this.scaleX;
    }

    getScaleY(): number{
        return this.scaleY;
    }

    setOrigin(originX: number, originY: number): void{
        this.originX = originX;
        this.originY = originY;
        this.dirtyFlag = true;
    }

    setPosition(x: number, y: number): void{
        this.x = x;
        this.y = y;
        this.dirtyFlag = true;
    }

    rotate(degrees: number): void{
        this.rotation += degrees;
        this.dirtyFlag = true;
    }

    setScale(scaleX: number, scaleY: number): void{
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.dirtyFlag = true;
        this.calcScaledLength = true;
    }

    scale(amount: number): void{
        this.scaleX += amount;
        this.scaleY += amount;
        this.dirtyFlag = true;
        this.calcScaledLength = true;
    }

    calculateLength(): void{
        this.calcLength = true;
    }

    calculateScaledLength(): void{
        this.calcScaledLength = true;
    }

    dirty(): void{
        this.dirtyFlag = true;
    }

    translate(x: number, y: number): void{
        this.x += x;
        this.y += y;
        this.dirtyFlag = true;
    }

    contains(point: Vec2): boolean;
    contains(x: number, y: number): boolean;
    contains(a: Vec2 | number, b?: number): boolean{
        return false;
    }
}
