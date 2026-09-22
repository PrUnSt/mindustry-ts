// 源: arc-core/src/arc/util/Scaling.java
// 迁移说明: Java enum 在 TS 中实现为带静态实例的类; 数值 float64。
import {Vec2} from './geom/Vec2';

/**
 * Various scaling types for fitting one rectangle into another.
 */
export class Scaling{
    /** Scales the source to fit the target while keeping the same aspect ratio. */
    static readonly fit = new Scaling(0);
    /** Scales the source to fit the target if it is larger, otherwise does not scale. */
    static readonly bounded = new Scaling(1);
    /** Scales the source to fill the target while keeping the same aspect ratio. */
    static readonly fill = new Scaling(2);
    /** Scales the source to fill the target in the x direction while keeping the same aspect ratio. */
    static readonly fillX = new Scaling(3);
    /** Scales the source to fill the target in the y direction while keeping the same aspect ratio. */
    static readonly fillY = new Scaling(4);
    /** Scales the source to fill the target. */
    static readonly stretch = new Scaling(5);
    /** Scales the source to fill the target in the x direction, without changing the y direction. */
    static readonly stretchX = new Scaling(6);
    /** Scales the source to fill the target in the y direction, without changing the x direction. */
    static readonly stretchY = new Scaling(7);
    /** The source is not scaled. */
    static readonly none = new Scaling(8);

    private static readonly temp = new Vec2();
    private readonly id: number;

    private constructor(id: number){
        this.id = id;
    }

    /**
     * Returns the size of the source scaled to the target. Note the same Vec2 instance is always returned and should never be
     * cached.
     */
    apply(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): Vec2{
        const temp = Scaling.temp;
        switch(this.id){
            case 0:{ // fit
                const targetRatio = targetHeight / targetWidth;
                const sourceRatio = sourceHeight / sourceWidth;
                const scale = targetRatio > sourceRatio ? targetWidth / sourceWidth : targetHeight / sourceHeight;
                temp.x = sourceWidth * scale;
                temp.y = sourceHeight * scale;
                break;
            }
            case 2:{ // fill
                const targetRatio = targetHeight / targetWidth;
                const sourceRatio = sourceHeight / sourceWidth;
                const scale = targetRatio < sourceRatio ? targetWidth / sourceWidth : targetHeight / sourceHeight;
                temp.x = sourceWidth * scale;
                temp.y = sourceHeight * scale;
                break;
            }
            case 3:{ // fillX
                const scale = targetWidth / sourceWidth;
                temp.x = sourceWidth * scale;
                temp.y = sourceHeight * scale;
                break;
            }
            case 4:{ // fillY
                const scale = targetHeight / sourceHeight;
                temp.x = sourceWidth * scale;
                temp.y = sourceHeight * scale;
                break;
            }
            case 5: // stretch
                temp.x = targetWidth;
                temp.y = targetHeight;
                break;
            case 6: // stretchX
                temp.x = targetWidth;
                temp.y = sourceHeight;
                break;
            case 7: // stretchY
                temp.x = sourceWidth;
                temp.y = targetHeight;
                break;
            case 1: // bounded
                if(sourceHeight > targetHeight || sourceWidth > targetWidth){
                    return Scaling.fit.apply(sourceWidth, sourceHeight, targetWidth, targetHeight);
                }else{
                    return Scaling.none.apply(sourceWidth, sourceHeight, targetWidth, targetHeight);
                }
            case 8: // none
            default:
                temp.x = sourceWidth;
                temp.y = sourceHeight;
                break;
        }
        return temp;
    }
}
