import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    /**
     * One test file at a time.
     *
     * Gate G6 asserts a warm solve completes in under 5 ms, which is a wall-clock
     * measurement and therefore only meaningful when the machine is not busy
     * doing something else. Running the behavioural authoring suite in parallel
     * with it starved that measurement and made the gate fail perhaps two runs in
     * three, which is worse than useless: a gate nobody trusts is a gate nobody
     * reads. Serialising costs about twenty seconds and buys a suite whose red
     * means red.
     */
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
