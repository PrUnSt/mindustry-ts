// S0 自检（与 apps/headless 同一行），证明浏览器侧也能解析 workspace 的 TS 源码包。
import {Rand, Time} from "@mindustry-ts/arc";

const seed = 1;
const line = `arc-ok delta=${Time.delta} rand(${seed})=${new Rand(seed).nextLong()}`;

const app = document.getElementById("app");
if(app !== null) app.textContent = line;

console.log(line);
