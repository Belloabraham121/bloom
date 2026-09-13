/**
 * Start/stop market ingest only when a live session is requested.
 */

import {
  startMarketPoller,
  type StreamHandle,
} from "@/server/services/substreams/poller"
import { ensureMissionRunner } from "@/server/services/missions/runner"

const activeIngest = new Map<string, { handle: StreamHandle; refCount: number }>()

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
  const key = `${nextChain}:${symbol0}:${symbol1}`

  const existing = activeIngest.get(key)
  if (existing) {
    existing.refCount++
    void ensureMissionRunner()
    return
  }

  const handle = startMarketPoller({
    chainId: nextChain,
    intervalMs: opts?.intervalMs ?? 8_000,
    symbol0,
    symbol1,
    userId,
  })
  activeIngest.set(key, { handle, refCount: 1 })
  void ensureMissionRunner()
}

export function releaseLiveIngest(opts: {
  chainId: number
  symbol0: string
  symbol1: string
}) {
  const key = `${opts.chainId}:${opts.symbol0}:${opts.symbol1}`
  const entry = activeIngest.get(key)
  if (!entry) return
  entry.refCount--
  if (entry.refCount <= 0) {
    entry.handle.stop()
    activeIngest.delete(key)
  }
}

export function stopLiveIngest() {
  for (const [key, entry] of activeIngest) {
    entry.handle.stop()
    activeIngest.delete(key)
  }
}
