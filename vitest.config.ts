import { defineConfig } from "vitest/config";
import path from "node:path";

const integration = process.env.BRAIN_GYM_INTEGRATION === "1";
if (integration) {
  // Never fall back to .env: on the deployment host it points at real user data.
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/^postgres(ql)?:$/.test(new URL(url).protocol) ||
      !new URL(url).pathname.endsWith("_test")) {
    throw new Error("Integration tests require TEST_DATABASE_URL naming a disposable database ending in _test");
  }
  process.env.DATABASE_URL = url;
}

export default defineConfig({
  test: {
    environment: "node",
    // Queue capacity and lease tests intentionally share a disposable database.
    fileParallelism: !integration,
    setupFiles: ["./tests/setup.ts"],
    include: integration
      ? ["tests/integration/**/*.test.ts"]
      : ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "tests/evals/**/*.test.ts"],
    testTimeout: 30_000
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") }
  }
});
