// 源: arc-core/src/arc/math/Rand.java
// 迁移说明: xorshift128+ 伪随机数生成器, 与 Java 逐字等价。Java long 在 TS 中用 number (float64) 表示,
// 内部状态与全部 64 位运算用 BigInt 精确模拟, 保证同种子序列可复现 (确定性)。
// 注意: 公开字段 seed0/seed1 为有符号 long 的 number 视图; 超出 2^53 精度时 number 会舍入,
// 但内部 BigInt 状态不受影响 (经访问器读写)。
const MASK64 = (1n << 64n) - 1n;
const LONG_MIN = 1n << 63n;
const NORM_DOUBLE = 1.0 / (1 << 53);
const NORM_FLOAT = 1.0 / (1 << 24);

/** 将 JS number 转为有符号 64 位 BigInt 的无符号表示. */
function toUint64(v: number): bigint{
    return BigInt.asUintN(64, BigInt(Math.trunc(v)));
}

export class Rand{
    /** The first half of the internal state of this pseudo-random number generator. */
    get seed0(): number{ return Number(BigInt.asIntN(64, this.s0)); }
    set seed0(v: number){ this.s0 = toUint64(v); }

    /** The second half of the internal state of this pseudo-random number generator. */
    get seed1(): number{ return Number(BigInt.asIntN(64, this.s1)); }
    set seed1(v: number){ this.s1 = toUint64(v); }

    private s0: bigint = 0n;
    private s1: bigint = 0n;

    /** Creates a new random number generator with a seed very likely to be distinct from any other invocation. */
    constructor();
    /** Creates a new random number generator using a single {@code long} seed. */
    constructor(seed: number);
    /** Creates a new random number generator using two {@code long} seeds. */
    constructor(seed0: number, seed1: number);
    constructor(seed0?: number, seed1?: number){
        if(seed0 === undefined){
            // Java 用 new Random().nextLong() 产生 64 位种子; TS 用 53 位随机数 (float64 可精确表示)。
            this.setSeed(Math.floor(Math.random() * 0x1FFFFFFFFFFFFF));
        }else if(seed1 === undefined){
            this.setSeed(seed0);
        }else{
            this.setState(seed0, seed1);
        }
    }

    private static murmurHash3(x: bigint): bigint{
        x ^= x >> 33n;
        x = (x * 0xff51afd7ed558ccdn) & MASK64;
        x ^= x >> 33n;
        x = (x * 0xc4ceb9fe1a85ec53n) & MASK64;
        x ^= x >> 33n;
        return x;
    }

    /** Returns the next pseudo-random, uniformly distributed {@code long} value from this random number generator's sequence. */
    nextLong(): number;
    /**
     * Returns a pseudo-random, uniformly distributed {@code long} value between 0 (inclusive) and the specified value (exclusive).
     */
    nextLong(n: number): number;
    nextLong(n?: number): number{
        if(n === undefined){
            return Number(BigInt.asIntN(64, this.nextLongUnsigned()));
        }
        return Number(BigInt.asIntN(64, this.nextLongLong(BigInt(Math.trunc(n)))));
    }

    /** @return the next 64-bit state value as an unsigned BigInt (内部使用). */
    private nextLongUnsigned(): bigint{
        let s1 = this.s0;
        const s0 = this.s1;
        this.s0 = s0;
        s1 ^= (s1 << 23n) & MASK64;
        this.s1 = (s1 ^ s0 ^ (s1 >> 17n) ^ (s0 >> 26n)) & MASK64;
        return this.s1;
    }

    /** Returns the next pseudo-random, uniformly distributed {@code int} value. */
    nextInt(): number;
    /**
     * Returns a pseudo-random, uniformly distributed {@code int} value between 0 (inclusive) and the specified value (exclusive).
     */
    nextInt(n: number): number;
    nextInt(n?: number): number{
        if(n === undefined){
            return Number(BigInt.asIntN(32, this.nextLongUnsigned()));
        }
        return Number(BigInt.asIntN(32, this.nextLongLong(BigInt(Math.trunc(n)))));
    }

    /** 内部实现: 0 (含) 到 n (不含) 的均匀 long, 拒绝采样, 与 Java 逐字对应. */
    private nextLongLong(n: bigint): bigint{
        if(n <= 0n) throw new Error('n must be positive');
        for(;;){
            const bits = this.nextLongUnsigned() >> 1n;
            const value = bits % n;
            const check = BigInt.asUintN(64, bits - value + (n - 1n));
            if(check < LONG_MIN) return value;
        }
    }

    /** Returns a pseudo-random, uniformly distributed {@code double} value between 0.0 and 1.0. */
    nextDouble(): number{
        return Number(this.nextLongUnsigned() >> 11n) * NORM_DOUBLE;
    }

    /** Returns a pseudo-random, uniformly distributed {@code float} value between 0.0 and 1.0. */
    nextFloat(): number{
        return Number(this.nextLongUnsigned() >> 40n) * NORM_FLOAT;
    }

    /** Returns a pseudo-random, uniformly distributed {@code boolean} value. */
    nextBoolean(): boolean{
        return (this.nextLongUnsigned() & 1n) !== 0n;
    }

    /** Generates random bytes and places them into a user-supplied byte array. */
    nextBytes(bytes: number[]): void{
        let n: number;
        let i = bytes.length;
        while(i !== 0){
            n = i < 8 ? i : 8; // min(i, 8)
            let bits = this.nextLongUnsigned();
            while(n-- !== 0){
                bytes[--i] = Number(BigInt.asIntN(8, bits));
                bits >>= 8n;
            }
        }
    }

    /** Sets the internal seed of this generator based on the given {@code long} value. */
    setSeed(seed: number): void{
        const s = seed === 0 ? LONG_MIN : toUint64(seed);
        const seed0 = Rand.murmurHash3(s);
        this.setState(Number(BigInt.asIntN(64, seed0)), Number(BigInt.asIntN(64, Rand.murmurHash3(seed0))));
    }

    chance(chance: number): boolean{
        return this.nextDouble() < chance;
    }

    range(amount: number): number{
        return Number.isInteger(amount) ? this.nextInt(amount * 2 + 1) - amount : this.nextFloat() * amount * 2 - amount;
    }

    random(max: number): number;
    random(min: number, max: number): number;
    random(min: number, max?: number): number{
        if(max === undefined){
            return Number.isInteger(min) ? this.nextInt(min + 1) : this.nextFloat() * min;
        }
        return Number.isInteger(min) && Number.isInteger(max)
            ? (min >= max ? min : min + this.nextInt(max - min + 1))
            : min + (max - min) * this.nextFloat();
    }

    /**
     * Sets the internal state of this generator.
     * @param seed0 the first part of the internal state
     * @param seed1 the second part of the internal state
     */
    setState(seed0: number, seed1: number): void{
        this.s0 = toUint64(seed0);
        this.s1 = toUint64(seed1);
    }

    /**
     * Returns the internal seeds to allow state saving.
     * @param seed must be 0 or 1, designating which of the 2 long seeds to return
     */
    getState(seed: number): number{
        return seed === 0 ? Number(BigInt.asIntN(64, this.s0)) : Number(BigInt.asIntN(64, this.s1));
    }
}
