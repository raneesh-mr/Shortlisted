import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Every page is a prerendered static shell (data lives in the browser or Supabase)
// and nothing uses ISR or revalidation, so the read-only static-assets cache is enough.
// Switch to the R2 incremental cache if a route ever needs revalidation.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
