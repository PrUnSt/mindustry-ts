// 源: arc-core/src/arc/struct/Bits.java
// 迁移说明: 无大小限制的位集. Java 用 long[] (每字 64 位), TS 用 bigint[] 精确模拟 64 位字;
// 公开 API 的索引/返回值均为 number. 位运算与 Java 逐字对应 (1L << (index & 0x3F) 等).

/** 无大小限制的位集, 支持与其他位字段按位比较. */
export class Bits{
    private bits: bigint[] = [0n];

    constructor();
    /** 创建足以表示 [0, nbits) 位索引的位集. */
    constructor(nbits: number);
    constructor(nbits?: number){
        if(nbits !== undefined){
            this.checkCapacity(nbits >>> 6);
        }
    }

    /** 将本位集设为另一个位集相同的位. 两个位集应有相同长度. */
    set(other: Bits): void;
    /** @param index 要设置的位索引. */
    set(index: number): void;
    /** 设置或清除给定索引处的位. */
    set(index: number, value: boolean): void;
    /** @param from 起始索引, 含. @param to 结束索引, 不含. */
    set(from: number, to: number): void;
    set(a: any, b?: any): void{
        if(typeof a === 'number'){
            if(typeof b === 'boolean'){
                // set(index, value)
                if(b){
                    this.setBit(a);
                }else{
                    this.clear(a);
                }
                return;
            }
            if(b === undefined){
                // set(index)
                this.setBit(a);
                return;
            }
            // set(from, to)
            const from = a;
            const to = b;
            if(from === to) return;

            const startWordIndex = from >>> 6;
            const endWordIndex = (to - 1) >>> 6;
            this.checkCapacity(endWordIndex);

            const mask = 0xffffffffffffffffn;
            const firstWordMask = mask << BigInt(from & 63);
            const lastWordMask = BigInt.asUintN(64, mask) >> BigInt((-to) & 63);

            if(startWordIndex === endWordIndex){
                // Case 1: 单字
                this.bits[startWordIndex] |= (firstWordMask & lastWordMask);
            }else{
                // Case 2: 多字
                // 处理首字
                this.bits[startWordIndex] |= firstWordMask;

                // 处理中间字
                for(let i = startWordIndex + 1; i < endWordIndex; i++)
                    this.bits[i] = mask;

                // 处理末字 (恢复不变量)
                this.bits[endWordIndex] |= lastWordMask;
            }
            return;
        }
        // set(other: Bits)
        const length = Math.min(this.bits.length, a.bits.length);
        for(let i = 0; i < length; i++){
            this.bits[i] = a.bits[i];
        }
    }

    private setBit(index: number): void{
        const word = index >>> 6;
        this.checkCapacity(word);
        this.bits[word] |= 1n << BigInt(index & 0x3f);
    }

    /** @param index 要翻转的位索引 */
    flip(index: number): void{
        const word = index >>> 6;
        this.checkCapacity(word);
        this.bits[word] ^= 1n << BigInt(index & 0x3f);
    }

    private checkCapacity(len: number): void{
        if(len >= this.bits.length){
            const newBits = new Array<bigint>(len + 1).fill(0n);
            for(let i = 0; i < this.bits.length; i++) newBits[i] = this.bits[i];
            this.bits = newBits;
        }
    }

    /**
     * @param index 要清除的位索引
     */
    clear(index: number): void;
    /** 清除整个位集 */
    clear(): void;
    clear(index?: number): void{
        if(index === undefined){
            const bits = this.bits;
            const length = bits.length;
            for(let i = 0; i < length; i++){
                bits[i] = 0n;
            }
            return;
        }
        const word = index >>> 6;
        if(word >= this.bits.length) return;
        this.bits[word] &= ~(1n << BigInt(index & 0x3f));
    }

    /** @return 当前存储的位数, <b>不是</b> 最高设置位! */
    numBits(): number{
        return this.bits.length << 6;
    }

    /**
     * @return 本位集的 "逻辑大小": 最高设置位的索引加一. 无设置位时返回 0.
     */
    length(): number{
        const bits = this.bits;
        for(let word = bits.length - 1; word >= 0; --word){
            const bitsAtWord = bits[word];
            if(bitsAtWord !== 0n){
                for(let bit = 63; bit >= 0; --bit){
                    if((bitsAtWord & (1n << BigInt(bit & 0x3f))) !== 0n){
                        return (word << 6) + bit + 1;
                    }
                }
            }
        }
        return 0;
    }

    /** @return 本位集是否不包含任何设置为 true 的位 */
    isEmpty(): boolean{
        const bits = this.bits;
        const length = bits.length;
        for(let i = 0; i < length; i++){
            if(bits[i] !== 0n){
                return false;
            }
        }
        return true;
    }

    /** @return 给定索引处的位是否为 true (已设置). word 越界时返回 false (与 Java 一致). */
    get(index: number): boolean{
        const word = index >>> 6;
        if(word >= this.bits.length) return false;
        return (this.bits[word] & (1n << BigInt(index & 0x3f))) !== 0n;
    }

    /**
     * 返回在指定起始索引处或之后第一个设置为 true 的位的索引. 不存在返回 -1.
     */
    nextSetBit(fromIndex: number): number{
        const bits = this.bits;
        let word = fromIndex >>> 6;
        const bitsLength = bits.length;
        if(word >= bitsLength) return -1;
        let bitsAtWord = bits[word];
        if(bitsAtWord !== 0n){
            for(let i = fromIndex & 0x3f; i < 64; i++){
                if((bitsAtWord & (1n << BigInt(i & 0x3f))) !== 0n){
                    return (word << 6) + i;
                }
            }
        }
        for(word++; word < bitsLength; word++){
            if(word !== 0){
                bitsAtWord = bits[word];
                if(bitsAtWord !== 0n){
                    for(let i = 0; i < 64; i++){
                        if((bitsAtWord & (1n << BigInt(i & 0x3f))) !== 0n){
                            return (word << 6) + i;
                        }
                    }
                }
            }
        }
        return -1;
    }

    /** 返回在指定起始索引处或之后第一个设置为 false 的位的索引. */
    nextClearBit(fromIndex: number): number{
        const bits = this.bits;
        let word = fromIndex >>> 6;
        const bitsLength = bits.length;
        if(word >= bitsLength) return bits.length << 6;
        let bitsAtWord = bits[word];
        for(let i = fromIndex & 0x3f; i < 64; i++){
            if((bitsAtWord & (1n << BigInt(i & 0x3f))) === 0n){
                return (word << 6) + i;
            }
        }
        for(word++; word < bitsLength; word++){
            if(word === 0){
                return word << 6;
            }
            bitsAtWord = bits[word];
            for(let i = 0; i < 64; i++){
                if((bitsAtWord & (1n << BigInt(i & 0x3f))) === 0n){
                    return (word << 6) + i;
                }
            }
        }
        return bits.length << 6;
    }

    /**
     * 对本位集与参数位集做逻辑 <b>AND</b>. 本集被修改: 某位为 true 当且仅当原来为 true 且参数位集对应位也为 true.
     */
    and(other: Bits): void{
        const commonWords = Math.min(this.bits.length, other.bits.length);
        for(let i = 0; commonWords > i; i++){
            this.bits[i] &= other.bits[i];
        }

        if(this.bits.length > commonWords){
            for(let i = commonWords, s = this.bits.length; s > i; i++){
                this.bits[i] = 0n;
            }
        }
    }

    /**
     * 清除本集中与参数位集对应位被设置的所有位.
     */
    andNot(other: Bits): void{
        for(let i = 0, j = this.bits.length, k = other.bits.length; i < j && i < k; i++){
            this.bits[i] &= ~other.bits[i];
        }
    }

    /**
     * 对本位集与参数位集做逻辑 <b>OR</b>.
     */
    or(other: Bits): void{
        const commonWords = Math.min(this.bits.length, other.bits.length);
        for(let i = 0; commonWords > i; i++){
            this.bits[i] |= other.bits[i];
        }

        if(commonWords < other.bits.length){
            this.checkCapacity(other.bits.length);
            for(let i = commonWords, s = other.bits.length; s > i; i++){
                this.bits[i] = other.bits[i];
            }
        }
    }

    /**
     * 对本位集与参数位集做逻辑 <b>XOR</b>.
     */
    xor(other: Bits): void{
        const commonWords = Math.min(this.bits.length, other.bits.length);

        for(let i = 0; commonWords > i; i++){
            this.bits[i] ^= other.bits[i];
        }

        if(commonWords < other.bits.length){
            this.checkCapacity(other.bits.length);
            for(let i = commonWords, s = other.bits.length; s > i; i++){
                this.bits[i] = other.bits[i];
            }
        }
    }

    /**
     * @return 本位集是否与参数位集有同为 true 的位 (相交).
     */
    intersects(other: Bits): boolean{
        const bits = this.bits;
        const otherBits = other.bits;
        for(let i = Math.min(bits.length, otherBits.length) - 1; i >= 0; i--){
            if((bits[i] & otherBits[i]) !== 0n){
                return true;
            }
        }
        return false;
    }

    /**
     * @return 本位集是否为参数位集的超集, 即本集中包含参数位集所有为 true 的位.
     */
    containsAll(other: Bits): boolean{
        const bits = this.bits;
        const otherBits = other.bits;
        const otherBitsLength = otherBits.length;
        const bitsLength = bits.length;

        for(let i = bitsLength; i < otherBitsLength; i++){
            if(otherBits[i] !== 0n){
                return false;
            }
        }
        for(let i = Math.min(bitsLength, otherBitsLength) - 1; i >= 0; i--){
            if((bits[i] & otherBits[i]) !== otherBits[i]){
                return false;
            }
        }
        return true;
    }

    hashCode(): number{
        const word = this.length() >>> 6;
        let hash = 0;
        for(let i = 0; word >= i; i++){
            const bits = this.bits[i];
            const folded = BigInt.asUintN(64, bits) >> 32n;
            hash = (Math.imul(127, hash) + Number((bits ^ folded) & 0xffffffffn)) | 0;
        }
        return hash;
    }

    equals(obj: unknown): boolean{
        if(this === obj) return true;
        if(obj === null || obj === undefined) return false;
        if(!(obj instanceof Bits)) return false;

        const other = obj as Bits;
        const otherBits = other.bits;

        const commonWords = Math.min(this.bits.length, otherBits.length);
        for(let i = 0; commonWords > i; i++){
            if(this.bits[i] !== otherBits[i])
                return false;
        }

        if(this.bits.length === otherBits.length)
            return true;

        return this.length() === other.length();
    }
}
