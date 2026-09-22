// 源: arc-core/src/arc/math/Mat.java
// 迁移说明: 3x3 列主序矩阵, 逐字移植。set(Affine2) 使用文件内最小本地 Affine2 (TODO: 迁移到完整 Affine2)。
import {Mathf} from './Mathf';
import {Vec2} from './geom/Vec2';
import {Vec3} from './geom/Vec3';
import {ArcRuntimeException} from './ArcRuntimeException';

/**
 * 对应 arc.math.Affine2 的最小本地实现 (仅 Mat.set(Affine2) 所需字段)。
 * TODO: 迁移到 arc.math.Affine2 完整实现
 */
export class Affine2{
    m00 = 1; m01 = 0; m02 = 0;
    m10 = 0; m11 = 1; m12 = 0;
}

/**
 * A 3x3 column major matrix; useful for 2D transforms.
 */
export class Mat{
    static readonly M00 = 0;
    static readonly M01 = 3;
    static readonly M02 = 6;
    static readonly M10 = 1;
    static readonly M11 = 4;
    static readonly M12 = 7;
    static readonly M20 = 2;
    static readonly M21 = 5;
    static readonly M22 = 8;
    val: number[] = new Array<number>(9);
    private tmp: number[] = new Array<number>(9);

    constructor();
    constructor(matrix: Mat);
    /** @param values The float array to copy. Remember that this matrix is in column major order. */
    constructor(values: number[]);
    constructor(a?: Mat | number[]){
        if(a instanceof Mat){
            this.set(a);
        }else if(Array.isArray(a)){
            this.set(a);
        }else{
            this.idt();
        }
    }

    /**
     * Multiplies matrix a with matrix b in the following manner:
     * <pre>mul(A, B) => A := AB</pre>
     */
    private static mul(mata: number[], matb: number[]): void{
        const v00 = mata[Mat.M00] * matb[Mat.M00] + mata[Mat.M01] * matb[Mat.M10] + mata[Mat.M02] * matb[Mat.M20];
        const v01 = mata[Mat.M00] * matb[Mat.M01] + mata[Mat.M01] * matb[Mat.M11] + mata[Mat.M02] * matb[Mat.M21];
        const v02 = mata[Mat.M00] * matb[Mat.M02] + mata[Mat.M01] * matb[Mat.M12] + mata[Mat.M02] * matb[Mat.M22];

        const v10 = mata[Mat.M10] * matb[Mat.M00] + mata[Mat.M11] * matb[Mat.M10] + mata[Mat.M12] * matb[Mat.M20];
        const v11 = mata[Mat.M10] * matb[Mat.M01] + mata[Mat.M11] * matb[Mat.M11] + mata[Mat.M12] * matb[Mat.M21];
        const v12 = mata[Mat.M10] * matb[Mat.M02] + mata[Mat.M11] * matb[Mat.M12] + mata[Mat.M12] * matb[Mat.M22];

        const v20 = mata[Mat.M20] * matb[Mat.M00] + mata[Mat.M21] * matb[Mat.M10] + mata[Mat.M22] * matb[Mat.M20];
        const v21 = mata[Mat.M20] * matb[Mat.M01] + mata[Mat.M21] * matb[Mat.M11] + mata[Mat.M22] * matb[Mat.M21];
        const v22 = mata[Mat.M20] * matb[Mat.M02] + mata[Mat.M21] * matb[Mat.M12] + mata[Mat.M22] * matb[Mat.M22];

        mata[Mat.M00] = v00;
        mata[Mat.M10] = v10;
        mata[Mat.M20] = v20;
        mata[Mat.M01] = v01;
        mata[Mat.M11] = v11;
        mata[Mat.M21] = v21;
        mata[Mat.M02] = v02;
        mata[Mat.M12] = v12;
        mata[Mat.M22] = v22;
    }

    /** Sets this matrix to an orthographic projection. */
    setOrtho(x: number, y: number, width: number, height: number): Mat{
        const right = x + width, top = y + height;

        const x_orth = 2 / (right - x);
        const y_orth = 2 / (top - y);

        const tx = -(right + x) / (right - x);
        const ty = -(top + y) / (top - y);

        this.val[Mat.M00] = x_orth;
        this.val[Mat.M11] = y_orth;

        this.val[Mat.M02] = tx;
        this.val[Mat.M12] = ty;
        this.val[Mat.M22] = 1;

        return this;
    }

    /**
     * Sets this matrix to the identity matrix
     * @return This matrix for the purpose of chaining operations.
     */
    idt(): Mat{
        const val = this.val;
        val[Mat.M00] = 1;
        val[Mat.M10] = 0;
        val[Mat.M20] = 0;
        val[Mat.M01] = 0;
        val[Mat.M11] = 1;
        val[Mat.M21] = 0;
        val[Mat.M02] = 0;
        val[Mat.M12] = 0;
        val[Mat.M22] = 1;
        return this;
    }

    /**
     * Postmultiplies this matrix with the provided matrix and stores the result in this matrix.
     * @return This matrix for the purpose of chaining operations together.
     */
    mul(m: Mat): Mat{
        const val = this.val;

        const v00 = val[Mat.M00] * m.val[Mat.M00] + val[Mat.M01] * m.val[Mat.M10] + val[Mat.M02] * m.val[Mat.M20];
        const v01 = val[Mat.M00] * m.val[Mat.M01] + val[Mat.M01] * m.val[Mat.M11] + val[Mat.M02] * m.val[Mat.M21];
        const v02 = val[Mat.M00] * m.val[Mat.M02] + val[Mat.M01] * m.val[Mat.M12] + val[Mat.M02] * m.val[Mat.M22];

        const v10 = val[Mat.M10] * m.val[Mat.M00] + val[Mat.M11] * m.val[Mat.M10] + val[Mat.M12] * m.val[Mat.M20];
        const v11 = val[Mat.M10] * m.val[Mat.M01] + val[Mat.M11] * m.val[Mat.M11] + val[Mat.M12] * m.val[Mat.M21];
        const v12 = val[Mat.M10] * m.val[Mat.M02] + val[Mat.M11] * m.val[Mat.M12] + val[Mat.M12] * m.val[Mat.M22];

        const v20 = val[Mat.M20] * m.val[Mat.M00] + val[Mat.M21] * m.val[Mat.M10] + val[Mat.M22] * m.val[Mat.M20];
        const v21 = val[Mat.M20] * m.val[Mat.M01] + val[Mat.M21] * m.val[Mat.M11] + val[Mat.M22] * m.val[Mat.M21];
        const v22 = val[Mat.M20] * m.val[Mat.M02] + val[Mat.M21] * m.val[Mat.M12] + val[Mat.M22] * m.val[Mat.M22];

        val[Mat.M00] = v00;
        val[Mat.M10] = v10;
        val[Mat.M20] = v20;
        val[Mat.M01] = v01;
        val[Mat.M11] = v11;
        val[Mat.M21] = v21;
        val[Mat.M02] = v02;
        val[Mat.M12] = v12;
        val[Mat.M22] = v22;

        return this;
    }

    /**
     * Premultiplies this matrix with the provided matrix and stores the result in this matrix.
     * @return This matrix for the purpose of chaining operations.
     */
    mulLeft(m: Mat): Mat{
        const val = this.val;

        const v00 = m.val[Mat.M00] * val[Mat.M00] + m.val[Mat.M01] * val[Mat.M10] + m.val[Mat.M02] * val[Mat.M20];
        const v01 = m.val[Mat.M00] * val[Mat.M01] + m.val[Mat.M01] * val[Mat.M11] + m.val[Mat.M02] * val[Mat.M21];
        const v02 = m.val[Mat.M00] * val[Mat.M02] + m.val[Mat.M01] * val[Mat.M12] + m.val[Mat.M02] * val[Mat.M22];

        const v10 = m.val[Mat.M10] * val[Mat.M00] + m.val[Mat.M11] * val[Mat.M10] + m.val[Mat.M12] * val[Mat.M20];
        const v11 = m.val[Mat.M10] * val[Mat.M01] + m.val[Mat.M11] * val[Mat.M11] + m.val[Mat.M12] * val[Mat.M21];
        const v12 = m.val[Mat.M10] * val[Mat.M02] + m.val[Mat.M11] * val[Mat.M12] + m.val[Mat.M12] * val[Mat.M22];

        const v20 = m.val[Mat.M20] * val[Mat.M00] + m.val[Mat.M21] * val[Mat.M10] + m.val[Mat.M22] * val[Mat.M20];
        const v21 = m.val[Mat.M20] * val[Mat.M01] + m.val[Mat.M21] * val[Mat.M11] + m.val[Mat.M22] * val[Mat.M21];
        const v22 = m.val[Mat.M20] * val[Mat.M02] + m.val[Mat.M21] * val[Mat.M12] + m.val[Mat.M22] * val[Mat.M22];

        val[Mat.M00] = v00;
        val[Mat.M10] = v10;
        val[Mat.M20] = v20;
        val[Mat.M01] = v01;
        val[Mat.M11] = v11;
        val[Mat.M21] = v21;
        val[Mat.M02] = v02;
        val[Mat.M12] = v12;
        val[Mat.M22] = v22;

        return this;
    }

    /**
     * Sets this matrix to a rotation matrix that will rotate any vector in counter-clockwise direction around the z-axis.
     */
    setToRotation(degrees: number): Mat;
    setToRotation(axis: Vec3, degrees: number): Mat;
    setToRotation(axis: Vec3, cos: number, sin: number): Mat;
    setToRotation(a: number | Vec3, b?: number, c?: number): Mat{
        if(typeof a === 'number'){
            return this.setToRotationRad(Mathf.degreesToRadians * a);
        }
        if(c === undefined){
            return this.setToRotation(a, Mathf.cosDeg(b!), Mathf.sinDeg(b!));
        }
        const val = this.val;
        const oc = 1.0 - b;
        val[Mat.M00] = oc * a.x * a.x + b;
        val[Mat.M10] = oc * a.x * a.y - a.z * c;
        val[Mat.M20] = oc * a.z * a.x + a.y * c;
        val[Mat.M01] = oc * a.x * a.y + a.z * c;
        val[Mat.M11] = oc * a.y * a.y + b;
        val[Mat.M21] = oc * a.y * a.z - a.x * c;
        val[Mat.M02] = oc * a.z * a.x - a.y * c;
        val[Mat.M12] = oc * a.y * a.z + a.x * c;
        val[Mat.M22] = oc * a.z * a.z + b;
        return this;
    }

    /**
     * Sets this matrix to a rotation matrix that will rotate any vector in counter-clockwise direction around the z-axis.
     */
    setToRotationRad(radians: number): Mat{
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const val = this.val;

        val[Mat.M00] = cos;
        val[Mat.M10] = sin;
        val[Mat.M20] = 0;

        val[Mat.M01] = -sin;
        val[Mat.M11] = cos;
        val[Mat.M21] = 0;

        val[Mat.M02] = 0;
        val[Mat.M12] = 0;
        val[Mat.M22] = 1;

        return this;
    }

    /**
     * Sets this matrix to a translation matrix.
     */
    setToTranslation(x: number, y: number): Mat;
    setToTranslation(translation: Vec2): Mat;
    setToTranslation(x: number | Vec2, y?: number): Mat{
        const val = this.val;
        const tx = typeof x === 'number' ? x : x.x;
        const ty = typeof x === 'number' ? y! : x.y;

        val[Mat.M00] = 1;
        val[Mat.M10] = 0;
        val[Mat.M20] = 0;

        val[Mat.M01] = 0;
        val[Mat.M11] = 1;
        val[Mat.M21] = 0;

        val[Mat.M02] = tx;
        val[Mat.M12] = ty;
        val[Mat.M22] = 1;

        return this;
    }

    /**
     * Sets this matrix to a scaling matrix.
     */
    setToScaling(scaleX: number, scaleY: number): Mat;
    setToScaling(scale: Vec2): Mat;
    setToScaling(scaleX: number | Vec2, scaleY?: number): Mat{
        const val = this.val;
        const sx = typeof scaleX === 'number' ? scaleX : scaleX.x;
        const sy = typeof scaleX === 'number' ? scaleY! : scaleX.y;
        val[Mat.M00] = sx;
        val[Mat.M10] = 0;
        val[Mat.M20] = 0;
        val[Mat.M01] = 0;
        val[Mat.M11] = sy;
        val[Mat.M21] = 0;
        val[Mat.M02] = 0;
        val[Mat.M12] = 0;
        val[Mat.M22] = 1;
        return this;
    }

    toString(): string{
        const val = this.val;
        return '[' + val[Mat.M00] + '|' + val[Mat.M01] + '|' + val[Mat.M02] + ']\n'
        + '[' + val[Mat.M10] + '|' + val[Mat.M11] + '|' + val[Mat.M12] + ']\n'
        + '[' + val[Mat.M20] + '|' + val[Mat.M21] + '|' + val[Mat.M22] + ']';
    }

    /** @return The determinant of this matrix */
    det(): number{
        const val = this.val;
        return val[Mat.M00] * val[Mat.M11] * val[Mat.M22] + val[Mat.M01] * val[Mat.M12] * val[Mat.M20] + val[Mat.M02] * val[Mat.M10] * val[Mat.M21] - val[Mat.M00]
        * val[Mat.M12] * val[Mat.M21] - val[Mat.M01] * val[Mat.M10] * val[Mat.M22] - val[Mat.M02] * val[Mat.M11] * val[Mat.M20];
    }

    /**
     * Inverts this matrix given that the determinant is != 0.
     * @throws ArcRuntimeException if the matrix is singular (not invertible)
     */
    inv(): Mat{
        const det = this.det();
        if(det === 0) throw new ArcRuntimeException('Can\'t invert a singular matrix');

        const inv_det = 1.0 / det;
        const tmp = this.tmp, val = this.val;

        tmp[Mat.M00] = val[Mat.M11] * val[Mat.M22] - val[Mat.M21] * val[Mat.M12];
        tmp[Mat.M10] = val[Mat.M20] * val[Mat.M12] - val[Mat.M10] * val[Mat.M22];
        tmp[Mat.M20] = val[Mat.M10] * val[Mat.M21] - val[Mat.M20] * val[Mat.M11];
        tmp[Mat.M01] = val[Mat.M21] * val[Mat.M02] - val[Mat.M01] * val[Mat.M22];
        tmp[Mat.M11] = val[Mat.M00] * val[Mat.M22] - val[Mat.M20] * val[Mat.M02];
        tmp[Mat.M21] = val[Mat.M20] * val[Mat.M01] - val[Mat.M00] * val[Mat.M21];
        tmp[Mat.M02] = val[Mat.M01] * val[Mat.M12] - val[Mat.M11] * val[Mat.M02];
        tmp[Mat.M12] = val[Mat.M10] * val[Mat.M02] - val[Mat.M00] * val[Mat.M12];
        tmp[Mat.M22] = val[Mat.M00] * val[Mat.M11] - val[Mat.M10] * val[Mat.M01];

        val[Mat.M00] = inv_det * tmp[Mat.M00];
        val[Mat.M10] = inv_det * tmp[Mat.M10];
        val[Mat.M20] = inv_det * tmp[Mat.M20];
        val[Mat.M01] = inv_det * tmp[Mat.M01];
        val[Mat.M11] = inv_det * tmp[Mat.M11];
        val[Mat.M21] = inv_det * tmp[Mat.M21];
        val[Mat.M02] = inv_det * tmp[Mat.M02];
        val[Mat.M12] = inv_det * tmp[Mat.M12];
        val[Mat.M22] = inv_det * tmp[Mat.M22];

        return this;
    }

    /**
     * Copies the values from the provided matrix to this matrix.
     */
    set(mat: Mat): Mat;
    /**
     * Copies the values from the provided affine matrix to this matrix. The last row is set to (0, 0, 1).
     */
    set(affine: Affine2): Mat;
    /**
     * Sets the matrix to the given matrix as a float array. The float array must have at least 9 elements.
     */
    set(values: number[]): Mat;
    set(a: Mat | Affine2 | number[]): Mat{
        if(Array.isArray(a)){
            for(let i = 0; i < 9; i++){
                this.val[i] = a[i];
            }
        }else if(a instanceof Mat){
            for(let i = 0; i < this.val.length; i++){
                this.val[i] = a.val[i];
            }
        }else{
            const val = this.val;
            val[Mat.M00] = a.m00;
            val[Mat.M10] = a.m10;
            val[Mat.M20] = 0;
            val[Mat.M01] = a.m01;
            val[Mat.M11] = a.m11;
            val[Mat.M21] = 0;
            val[Mat.M02] = a.m02;
            val[Mat.M12] = a.m12;
            val[Mat.M22] = 1;
        }
        return this;
    }

    /**
     * Adds a translational component to the matrix in the 3rd column. The other columns are untouched.
     */
    trn(vector: Vec2): Mat;
    trn(x: number, y: number): Mat;
    trn(vector: Vec3): Mat;
    trn(a: Vec2 | Vec3 | number, b?: number): Mat{
        if(typeof a === 'number'){
            this.val[Mat.M02] += a;
            this.val[Mat.M12] += b!;
        }else{
            this.val[Mat.M02] += a.x;
            this.val[Mat.M12] += a.y;
        }
        return this;
    }

    /**
     * Postmultiplies this matrix by a translation matrix.
     */
    translate(x: number, y: number): Mat;
    translate(translation: Vec2): Mat;
    translate(x: number | Vec2, y?: number): Mat{
        const val = this.val;
        const tmp = this.tmp;
        tmp[Mat.M00] = 1;
        tmp[Mat.M10] = 0;
        tmp[Mat.M20] = 0;

        tmp[Mat.M01] = 0;
        tmp[Mat.M11] = 1;
        tmp[Mat.M21] = 0;

        tmp[Mat.M02] = typeof x === 'number' ? x : x.x;
        tmp[Mat.M12] = typeof x === 'number' ? y! : x.y;
        tmp[Mat.M22] = 1;
        Mat.mul(val, tmp);
        return this;
    }

    /**
     * Postmultiplies this matrix with a (counter-clockwise) rotation matrix.
     */
    rotate(degrees: number): Mat{
        return this.rotateRad(Mathf.degreesToRadians * degrees);
    }

    /**
     * Postmultiplies this matrix with a (counter-clockwise) rotation matrix.
     */
    rotateRad(radians: number): Mat{
        if(radians === 0) return this;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const tmp = this.tmp;

        tmp[Mat.M00] = cos;
        tmp[Mat.M10] = sin;
        tmp[Mat.M20] = 0;

        tmp[Mat.M01] = -sin;
        tmp[Mat.M11] = cos;
        tmp[Mat.M21] = 0;

        tmp[Mat.M02] = 0;
        tmp[Mat.M12] = 0;
        tmp[Mat.M22] = 1;
        Mat.mul(this.val, tmp);
        return this;
    }

    /**
     * Postmultiplies this matrix with a scale matrix.
     */
    scale(scaleX: number, scaleY: number): Mat;
    scale(scale: Vec2): Mat;
    scale(scaleX: number | Vec2, scaleY?: number): Mat{
        const tmp = this.tmp;
        const sx = typeof scaleX === 'number' ? scaleX : scaleX.x;
        const sy = typeof scaleX === 'number' ? scaleY! : scaleX.y;
        tmp[Mat.M00] = sx;
        tmp[Mat.M10] = 0;
        tmp[Mat.M20] = 0;
        tmp[Mat.M01] = 0;
        tmp[Mat.M11] = sy;
        tmp[Mat.M21] = 0;
        tmp[Mat.M02] = 0;
        tmp[Mat.M12] = 0;
        tmp[Mat.M22] = 1;
        Mat.mul(this.val, tmp);
        return this;
    }

    /**
     * Get the values in this matrix.
     * @return The float values that make up this matrix in column-major order.
     */
    getValues(): number[]{
        return this.val;
    }

    getTranslation(position: Vec2): Vec2{
        position.x = this.val[Mat.M02];
        position.y = this.val[Mat.M12];
        return position;
    }

    getScale(scale: Vec2): Vec2{
        const val = this.val;
        scale.x = Math.sqrt(val[Mat.M00] * val[Mat.M00] + val[Mat.M01] * val[Mat.M01]);
        scale.y = Math.sqrt(val[Mat.M10] * val[Mat.M10] + val[Mat.M11] * val[Mat.M11]);
        return scale;
    }

    getRotation(): number{
        return Mathf.radiansToDegrees * Math.atan2(this.val[Mat.M10], this.val[Mat.M00]);
    }

    getRotationRad(): number{
        return Math.atan2(this.val[Mat.M10], this.val[Mat.M00]);
    }

    /**
     * Scale the matrix in the both the x and y components by the scalar value.
     */
    scl(scale: number): Mat;
    scl(scale: Vec2): Mat;
    scl(scale: Vec3): Mat;
    scl(scale: number | Vec2 | Vec3): Mat{
        if(typeof scale === 'number'){
            this.val[Mat.M00] *= scale;
            this.val[Mat.M11] *= scale;
        }else{
            this.val[Mat.M00] *= scale.x;
            this.val[Mat.M11] *= scale.y;
        }
        return this;
    }

    /**
     * Transposes the current matrix.
     */
    transpose(): Mat{
        // Where MXY you do not have to change MXX
        const val = this.val;
        const v01 = val[Mat.M10];
        const v02 = val[Mat.M20];
        const v10 = val[Mat.M01];
        const v12 = val[Mat.M21];
        const v20 = val[Mat.M02];
        const v21 = val[Mat.M12];
        val[Mat.M01] = v01;
        val[Mat.M02] = v02;
        val[Mat.M10] = v10;
        val[Mat.M12] = v12;
        val[Mat.M20] = v20;
        val[Mat.M21] = v21;
        return this;
    }
}
