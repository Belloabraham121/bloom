/**
 * Always-on mission + market worker.
 * Usage: npm run worker:missions
 *
 * Keeps market poller + mission runner alive outside serverless request lifetime.
 */

import { config as loadEnv } from "dotenv"
import { resolve } from "path"

loadEnv({ path: resolve(process.cwd(), ".env.local") })
loadEnv({ path: resolve(process.cwd(), ".env") })

import { startMarketPoller } from "../server/services/substreams/poller"
import {
  ensureMissionRunner,
  getMissionRunnerStatus,
  stopMissionRunner,
} from "../server/services/missions/runner"
import { listRunningMissions } from "../server/services/missions/repo"

async function main() {
  console.info("[mission-worker] starting")
  if (!process.env.THE_GRAPH_API_KEY?.trim()) {
    console.info(
      "[mission-worker] THE_GRAPH_API_KEY unset — using spot prices only (CoinGecko/DefiLlama/Binance)"
    )
  }

  const pollers = [
    startMarketPoller({ chainId: 1, intervalMs: 8_000, symbol0: "USDC", symbol1: "ETH" }),
    startMarketPoller({
      chainId: 8453,
      intervalMs: 12_000,
      symbol0: "USDC",
      symbol1: "ETH",
    }),
  ]

  await ensureMissionRunner()
  console.info("[mission-worker] runner", getMissionRunnerStatus())

  const statusTimer = setInterval(() => {
    void listRunningMissions()
      .then((rows) => {
        console.info(
          `[mission-worker] heartbeat runningMissions=${rows.length}`,
          getMissionRunnerStatus()
        )
      })
      .catch((e) => console.warn("[mission-worker] status", e))
  }, 60_000)
  statusTimer.unref?.()

  const shutdown = async () => {
    console.info("[mission-worker] shutting down")
    clearInterval(statusTimer)
    for (const p of pollers) p.stop()
    await stopMissionRunner()
    process.exit(0)
  }
  process.on("SIGINT", () => void shutdown())
  process.on("SIGTERM", () => void shutdown())

  console.info("[mission-worker] running — Ctrl+C to stop")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
