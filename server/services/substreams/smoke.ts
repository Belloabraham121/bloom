/**
 * Substreams smoke helpers for the standalone worker only.
 * Do NOT import this from Next.js API routes (pulls @substreams/* peers).
 */

import {
  getSubstreamsEndpoint,
  getSubstreamsToken,
  isSubstreamsConfigured,
  SUBSTREAMS_DEFAULTS,
} from "./config"
import { publishMarketEvent } from "@/server/services/market/bus"

export async function runSubstreamsSmoke(opts?: {
  blocks?: number
  startBlock?: number
}): Promise<{ ok: boolean; events: number; error?: string }> {
  if (!isSubstreamsConfigured()) {
    return { ok: false, events: 0, error: "SUBSTREAMS_API_TOKEN not set" }
  }

  try {
    const token = getSubstreamsToken()!
    const endpoint = getSubstreamsEndpoint()
    // Intentionally no @substreams/* import here — install peers in the worker
    // environment when enabling full gRPC. Publish a bus heartbeat to verify wiring.
    void token
    void endpoint
    void opts

    await publishMarketEvent({
      chainId: SUBSTREAMS_DEFAULTS.chainId,
      pool: "substreams-smoke",
      price: "0",
      block: opts?.startBlock,
    })

    return {
      ok: true,
      events: 1,
      error:
        "Token configured. Market feed uses subgraph poller; enable gRPC stream in worker when peers are installed.",
    }
  } catch (error) {
    return {
      ok: false,
      events: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
