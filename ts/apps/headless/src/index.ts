// S0 自检：证明三段链路已通 —— ① pnpm workspace 软链、② tsx 直跑 TS 源码、③ 跨包 import。
// 这里刻意用「固定种子的 Rand + 只读静态字段 Time.delta」，输出完全确定，
// 因此验收可以做精确字符串比对，而不只是 /arc-ok/ 正则。
import {Rand, Time} from "@mindustry-ts/arc";

const seed = 1;
const first = new Rand(seed).nextLong();

console.log(`arc-ok delta=${Time.delta} rand(${seed})=${first}`);
