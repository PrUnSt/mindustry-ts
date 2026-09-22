// 源: java.util.Random（Noise.init 所需的最小确定性 LCG；BigInt 保持 48 位种子与 Java 完全一致）

/**
 * Minimal deterministic re-implementation of java.util.Random for a fixed seed.
 * All method names and bit behavior match the JDK; used by {@link Noise} so that a
 * given seed reproduces the exact same permutation tables as the Java original.
 */
export class JRandom{
  private seed: bigint;

  constructor(seed: number){
    this.seed = (BigInt(seed) ^ 0x5deece66dn) & 0xffffffffffffn;
  }

  /** Java Random.next(bits): returns the top `bits` bits of the new 48-bit state. */
  private next(bits: number): number{
    this.seed = (this.seed * 0x5deece66dn + 0xbn) & 0xffffffffffffn;
    return Number(this.seed >> BigInt(48 - bits));
  }

  /** Java Random.nextDouble(): (next(26) << 27 + next(27)) / 2^53. */
  nextDouble(): number{
    return (this.next(26) * 134217728 + this.next(27)) / 9007199254740992;
  }

  /** Java Random.nextInt(): the low 32 bits of the state (as an unsigned value). */
  nextInt(): number{
    return this.next(32);
  }

  /** Java Random.nextLong() (approximate for values >= 2^53; low bits are exact). */
  nextLong(): number{
    return this.next(32) * 4294967296 + this.next(32);
  }
}
