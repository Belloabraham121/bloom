/**
 * Start/stop market ingest only when a live session is requested.
 */

import {
  startMarketPoller,
  type StreamHandle,
} from "@/server/services/substreams/poller"
import { ensureMissionRunner } from "@/server/services/missions/runner"

let handle: StreamHandle | null = null
let activeKey = ""

export function ensureLiveIngest(opts?: {
  chainId?: number
  intervalMs?: number
  symbol0?: string
  symbol1?: string
  userId?: string | null
}) {
  const nextChain = opts?.chainId ?? 1
  const symbol0 = opts?.symbol0 || "USDC"
  const symbol1 = opts?.symbol1 || "ETH"
  const userId = opts?.userId ?? null
  const key = `${nextChain}:${symbol0}:${symbol1}:${userId || ""}`

  if (handle && activeKey === key) {
    void ensureMissionRunner()
    return
  }
  handle?.stop()
  activeKey = key
  handle = startMarketPoller({
    chainId: nextChain,
    intervalMs: opts?.intervalMs ?? 8_000,
    symbol0,
    symbol1,
    userId,
  })
  void ensureMissionRunner()
}

export function stopLiveIngest() {
  handle?.stop()
  handle = null
  activeKey = ""
}
