// 源: arc-core/src/arc/func/ConsT.java

/** A consumer that may throw. E is retained for signature parity; TS has no checked exceptions. */
export type ConsT<T, E extends Error = Error> = (t: T) => void;
