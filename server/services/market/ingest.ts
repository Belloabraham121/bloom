/**
 * Start/stop market ingest only when a live session is requested.
 */

import { startMarketPoller, type StreamHandle } from "@/server/services/substreams/poller"
import { ensureMissionRunner } from "@/server/services/missions/runner"

let handle: StreamHandle | null = null
let chainId = 1

export function ensureLiveIngest(opts?: { chainId?: number; intervalMs?: number }) {
  const nextChain = opts?.chainId ?? 1
  if (handle && chainId === nextChain) {
    void ensureMissionRunner()
    return
  }
  handle?.stop()
  chainId = nextChain
  handle = startMarketPoller({
    chainId: nextChain,
    intervalMs: opts?.intervalMs ?? 10_000,
  })
  void ensureMissionRunner()
}

export function stopLiveIngest() {
  handle?.stop()
  handle = null
}
