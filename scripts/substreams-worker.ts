/**
 * Substreams / market worker entry.
 * Usage: npx tsx scripts/substreams-worker.ts
 *
 * Requires REDIS_URL. SUBSTREAMS_API_TOKEN enables smoke check;
 * subgraph poller always publishes MarketEvents for the mission runner.
 */

import { config as loadEnv } from "dotenv"
import { resolve } from "path"

loadEnv({ path: resolve(process.cwd(), ".env.local") })
loadEnv({ path: resolve(process.cwd(), ".env") })

import { startMarketPoller } from "../server/services/substreams/poller"
import { runSubstreamsSmoke } from "../server/services/substreams/smoke"
import { ensureMissionRunner } from "../server/services/missions/runner"
import { isSubstreamsConfigured } from "../server/services/substreams/config"

async function main() {
  console.info("[worker] starting market poller + mission runner")
  if (isSubstreamsConfigured()) {
    const smoke = await runSubstreamsSmoke({ blocks: 1 })
    console.info("[worker] substreams smoke", smoke)
  } else {
    console.warn("[worker] SUBSTREAMS_API_TOKEN missing — using subgraph poller only")
  }

  const poller = startMarketPoller({ chainId: 1, intervalMs: 8_000 })
  await ensureMissionRunner()

  const shutdown = () => {
    console.info("[worker] shutting down")
    poller.stop()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  console.info("[worker] running")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
