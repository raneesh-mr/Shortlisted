import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
// E2E_TARGET=workers runs against the Cloudflare Workers runtime (workerd) via
// `opennextjs-cloudflare preview`; run `npx opennextjs-cloudflare build` first.
// Default runs against `next start`; run `npm run build` first.
const workers = process.env.E2E_TARGET === "workers";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Pixel 7"],
    // Simulate a visitor from the UAE (Cloudflare and Vercel country headers).
    extraHTTPHeaders: { "cf-ipcountry": "AE", "x-vercel-ip-country": "AE" },
  },
  webServer: {
    command: workers ? `npx opennextjs-cloudflare preview --port ${PORT}` : `npm run start -- -p ${PORT}`,
    port: PORT,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    // Guest-only smoke test: no Supabase or AI keys needed.
    env: { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", ANTHROPIC_API_KEY: "" },
  },
});
