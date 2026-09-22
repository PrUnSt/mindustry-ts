// 源: arc-core/src/arc/math/Mathf.java, arc-core/src/arc/math/Rand.java (结构库所需的最小等价实现)
// 迁移说明: 仅移植了 arc.struct 使用的 Mathf/Rand 方法 (random/clamp/nextPowerOfTwo 与 Rand.random/nextInt)。
// 数值均为 float64 (number), 随机数基于 Math.random。

/** 随机数生成器 (arc.math.Rand 的最小等价). */
export class Rand{
    /** @return 一个在 [min, max] 区间内 (含端点) 的随机整数. */
    random(min: number, max: number): number{
        if(min > max){
            const t = min; min = max; max = t;
        }
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /** @return 一个在 [0, n) 区间内的随机整数. */
    nextInt(n: number): number{
        return Math.floor(Math.random() * n);
    }
}

/** Mathf 的最小等价: 仅含结构库需要的方法. */
export const Mathf = {
    /** 全局随机数生成器. */
    rand: new Rand(),

    /** @return 一个在 [0, range] 区间内 (含端点) 的随机整数, 或 [min, max] 区间内 (含端点) 的随机整数. */
    random(rangeOrMin: number, max?: number): number{
        if(max === undefined) return Math.floor(Math.random() * (rangeOrMin + 1));
        return Mathf.rand.random(rangeOrMin, max);
    },

    /** @return value 限制在 [min, max] 区间内. */
    clamp(value: number, min: number, max: number): number{
        return value < min ? min : (value > max ? max : value);
    },

    /** @return 大于等于 value 的下一个 2 的幂. */
    nextPowerOfTwo(value: number): number{
        return 1 << (32 - Math.clz32(value - 1));
    },
};
