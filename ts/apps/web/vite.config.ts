import { defineConfig } from "vite";

// workspace 包的 package.json 以 TS 源码（src/index.ts）作为 main。
// Vite 的依赖预打包（esbuild）会把它们当作第三方 npm 包处理并失败，
// 因此必须排除，让它们走源码解析路径（配合 node_modules 里的 workspace 软链）。
export default defineConfig({
  optimizeDeps: {
    exclude: ["@mindustry-ts/arc", "@mindustry-ts/game"]
  }
});
