// 源: arc-core/src/arc/math/Angles.java
// 迁移说明: 静态方法逐字移植。mouseAngle 依赖 arc.Core (camera/input), 此处用最小本地桩, 迁移后接入。
// Floatc2 为 arc.func.Floatc2 的最小本地等价。
import {Mathf} from './Mathf';
import {Rand} from './Rand';
import {Vec2} from './geom/Vec2';

/** 对应 arc.func.Floatc2 (本地最小实现). */
export interface Floatc2{
    get(x: number, y: number): void;
}

/** 对应 arc.math.Angles.ParticleConsumer. */
export interface ParticleConsumer{
    accept(x: number, y: number, fin: number, fout: number): void;
}

// TODO: 迁移到 arc.Core 统一实现
const Core = {
    camera: {
        project(x: number, y: number): Vec2{
            return new Vec2(x, y);
        }
    },
    input: {
        mouseX(): number{ return 0; },
        mouseY(): number{ return 0; }
    }
};

const rand = new Rand();
const rv = new Vec2();

function isFloatc2(v: unknown): v is Floatc2{
    return typeof v === 'object' && v !== null && typeof (v as Floatc2).get === 'function';
}

function isParticleConsumer(v: unknown): v is ParticleConsumer{
    return typeof v === 'object' && v !== null && typeof (v as ParticleConsumer).accept === 'function';
}

export class Angles{
    static forwardDistance(angle1: number, angle2: number): number{
        return Math.abs(angle1 - angle2);
    }

    static backwardDistance(angle1: number, angle2: number): number{
        return 360 - Math.abs(angle1 - angle2);
    }

    static within(a: number, b: number, margin: number): boolean{
        return Angles.angleDist(a, b) <= margin;
    }

    static angleDist(a: number, b: number): number{
        a = Mathf.mod(a, 360);
        b = Mathf.mod(b, 360);
        return Math.min((a - b) < 0 ? a - b + 360 : a - b, (b - a) < 0 ? b - a + 360 : b - a);
    }

    static near(a: number, b: number, range: number): boolean{
        return Angles.angleDist(a, b) < range;
    }

    static clampRange(angle: number, dest: number, range: number): number{
        const dst = Angles.angleDist(angle, dest);
        return dst <= range ? angle : Angles.moveToward(angle, dest, dst - range);
    }

    static moveToward(angle: number, to: number, speed: number): number{
        if(Math.abs(Angles.angleDist(angle, to)) < speed) return to;
        angle = Mathf.mod(angle, 360);
        to = Mathf.mod(to, 360);

        if(angle > to === Angles.backwardDistance(angle, to) > Angles.forwardDistance(angle, to)){
            angle -= speed;
        }else{
            angle += speed;
        }

        return angle;
    }

    static angle(x: number, y: number): number;
    static angle(x: number, y: number, x2: number, y2: number): number;
    static angle(x: number, y: number, x2?: number, y2?: number): number{
        if(x2 === undefined || y2 === undefined){
            return Angles.angle(0, 0, x, y);
        }
        let ang = Mathf.atan2(x2 - x, y2 - y) * Mathf.radDeg;
        if(ang < 0) ang += 360;
        return ang;
    }

    static angleRad(x: number, y: number, x2: number, y2: number): number{
        return Mathf.atan2(x2 - x, y2 - y);
    }

    static trnsx(angle: number, len: number): number;
    static trnsx(angle: number, x: number, y: number): number;
    static trnsx(angle: number, a: number, b?: number): number{
        if(b === undefined) return a * Mathf.cosDeg(angle);
        return rv.set(a, b).rotate(angle).x;
    }

    static trnsy(angle: number, len: number): number;
    static trnsy(angle: number, x: number, y: number): number;
    static trnsy(angle: number, a: number, b?: number): number{
        if(b === undefined) return a * Mathf.sinDeg(angle);
        return rv.set(a, b).rotate(angle).y;
    }

    // TODO: 依赖 arc.Core (camera/input), 迁移后接入统一实现
    static mouseAngle(cx: number, cy: number): number{
        const avector = Core.camera.project(cx, cy);
        return Angles.angle(avector.x, avector.y, Core.input.mouseX(), Core.input.mouseY());
    }

    static circleVectors(points: number, length: number, pos: Floatc2): void;
    static circleVectors(points: number, length: number, offset: number, pos: Floatc2): void;
    static circleVectors(points: number, length: number, offsetOrPos: number | Floatc2, pos?: Floatc2): void{
        let offset = 0;
        if(typeof offsetOrPos === 'number'){
            offset = offsetOrPos;
        }else{
            pos = offsetOrPos;
        }
        for(let i = 0; i < points; i++){
            const f = i * 360 / points + offset;
            pos!.get(Angles.trnsx(f, length), Angles.trnsy(f, length));
        }
    }

    static randVectors(seed: number, amount: number, length: number, cons: Floatc2): void{
        rand.setSeed(seed);
        for(let i = 0; i < amount; i++){
            rv.trns(rand.random(360), length);
            cons.get(rv.x, rv.y);
        }
    }

    static randLenVectors(seed: number, amount: number, length: number, cons: Floatc2): void;
    static randLenVectors(seed: number, amount: number, minLength: number, length: number, cons: Floatc2): void;
    static randLenVectors(seed: number, amount: number, length: number, angle: number, range: number, cons: Floatc2): void;
    static randLenVectors(seed: number, amount: number, length: number, angle: number, range: number, spread: number, cons: Floatc2): void;
    static randLenVectors(seed: number, fin: number, amount: number, length: number, cons: ParticleConsumer): void;
    static randLenVectors(seed: number, fin: number, amount: number, length: number, angle: number, range: number, cons: ParticleConsumer): void;
    static randLenVectors(seed: number, a: number, b: number, c: number | Floatc2 | ParticleConsumer, d?: number | Floatc2 | ParticleConsumer, e?: number | Floatc2 | ParticleConsumer, f?: number | Floatc2 | ParticleConsumer, g?: Floatc2 | ParticleConsumer): void{
        rand.setSeed(seed);

        if(typeof c === 'number'){
            if(typeof d === 'number'){
                if(typeof e === 'number'){
                    // (seed, amount, length, angle, range, spread, Floatc2) 或 (seed, fin, amount, length, angle, range, ParticleConsumer)
                    if(isFloatc2(f)){
                        const amount = a, length = b, angle = c, range = d, spread = e, cons = f;
                        for(let i = 0; i < amount; i++){
                            rv.trns(angle + rand.range(range), rand.random(length));
                            cons.get(rv.x + rand.range(spread), rv.y + rand.range(spread));
                        }
                    }else{
                        const fin = a, amount = b, length = c, angle = d, range = e, cons = f as ParticleConsumer;
                        for(let i = 0; i < amount; i++){
                            rv.trns(angle + rand.range(range), rand.random(length * fin));
                            cons.accept(rv.x, rv.y, fin * (rand.nextFloat()), 0);
                        }
                    }
                }else{
                    // (seed, amount, length, angle, range, Floatc2)
                    const amount = a, length = b, angle = c, range = d, cons = e as Floatc2;
                    for(let i = 0; i < amount; i++){
                        rv.trns(angle + rand.range(range), rand.random(length));
                        cons.get(rv.x, rv.y);
                    }
                }
            }else{
                // (seed, amount, minLength, length, Floatc2) 或 (seed, fin, amount, length, ParticleConsumer)
                if(isFloatc2(d)){
                    const amount = a, minLength = b, length = c, cons = d;
                    for(let i = 0; i < amount; i++){
                        rv.trns(rand.random(360), minLength + rand.random(length));
                        cons.get(rv.x, rv.y);
                    }
                }else{
                    const fin = a, amount = b, length = c, cons = d as ParticleConsumer;
                    for(let i = 0; i < amount; i++){
                        const l = rand.nextFloat();
                        rv.trns(rand.random(360), length * l * fin);
                        cons.accept(rv.x, rv.y, fin * l, (1 - fin) * l);
                    }
                }
            }
        }else{
            // (seed, amount, length, Floatc2)
            const amount = a, length = b, cons = c as Floatc2;
            for(let i = 0; i < amount; i++){
                rv.trns(rand.random(360), length);
                cons.get(rv.x, rv.y);
            }
        }
    }
}
