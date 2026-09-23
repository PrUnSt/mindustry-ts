// 源: arc-core/src/arc/mock/* (@see §11 mock/降级层设计)
// headless 的降级层统一出口。这些对象的共同要求是「带身份的真实对象, 永不 null/undefined」。
export { MockGraphics } from "./MockGraphics";
export { MockApplication } from "./MockApplication";
export { MockSettings } from "./MockSettings";
export { MockBundle } from "./MockBundle";
export { MockNet } from "./MockNet";
