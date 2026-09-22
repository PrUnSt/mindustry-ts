import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: ".vitest-cache",
  test: {
    server: {
      deps: {
        optimizer: {
          web: { enabled: false }
        }
      }
    }
  }
});