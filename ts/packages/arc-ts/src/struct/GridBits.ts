// 源: arc-core/src/arc/struct/GridBits.java
// 迁移说明: 用 Bits 实现的二维布尔网格 (宽/高/取值/设置). Java 中 width/height 为私有 final 字段,
// TS 中为避免与 width()/height() 方法同名, 字段命名为 _width/_height.
import {Bits} from './Bits';

export class GridBits{
    private readonly _width: number;
    private readonly _height: number;
    private readonly bits: Bits;

    constructor(width: number, height: number){
        this._width = width;
        this._height = height;
        this.bits = new Bits(width * height);
    }

    set(other: GridBits): void;
    set(x: number, y: number): void;
    set(x: number, y: number, b: boolean): void;
    set(a: any, b?: any, c?: any): void{
        if(a instanceof GridBits){
            this.bits.set(a.bits);
            return;
        }
        const x = a;
        const y = b;
        if(c === undefined){
            this.bits.set(x + y * this._width);
        }else if(c){
            this.bits.set(x + y * this._width);
        }else{
            this.bits.clear(x + y * this._width);
        }
    }

    get(x: number, y: number): boolean{
        if(x >= this._width || y >= this._height || x < 0 || y < 0) return false;
        return this.bits.get(x + y * this._width);
    }

    clear(): void{
        this.bits.clear();
    }

    width(): number{
        return this._width;
    }

    height(): number{
        return this._height;
    }
}
