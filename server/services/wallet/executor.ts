/**
 * Privy server wallet executor — sign + broadcast Uniswap calldata.
 */

import { PrivyClient } from "@privy-io/server-auth"
import { and, eq } from "drizzle-orm"
import { db } from "@/server/services/db/client"
import { tradeIntents, wallets } from "@/server/services/db/schema"
import {
  insertTransaction,
  updateTransaction,
} from "@/server/services/uniswap/transactions.repo"
import { publishAgentEvent } from "@/server/services/market/bus"
import { patchCanvasForUser } from "@/server/services/canvas/store"
import type { AgentMode } from "@/lib/types"

function getPrivy(): PrivyClient {
  const appId = process.env.PRIVY_APP_ID || process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const appSecret = process.env.PRIVY_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error("Privy server credentials are not configured")
  }
  const authKey = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY
  return new PrivyClient(appId, appSecret, {
    walletApi: authKey ? { authorizationPrivateKey: authKey } : undefined,
  })
}

function caip2(chainId: number) {
  return `eip155:${chainId}` as `eip155:${number}`
}

export type PreparedTx = {
  chainId: number
  to: string
  data: string
  value?: string
  from?: string
  category?: string
  requestPayload?: unknown
  responsePayload?: unknown
  uniswapRequestId?: string | null
  missionId?: string
  conversationId?: string | null
  tradeIntentId?: string | null
}

export function extractTxFields(payload: unknown): {
  to?: string
  data?: string
  value?: string
  chainId?: number
} {
  if (!payload || typeof payload !== "object") return {}
  const p = payload as Record<string, unknown>
  const swap = (p.swap || p.transaction || p) as Record<string, unknown>
  const to =
    (typeof swap.to === "string" && swap.to) ||
    (typeof p.to === "string" && p.to) ||
    undefined
  const data =
    (typeof swap.data === "string" && swap.data) ||
    (typeof p.data === "string" && p.data) ||
    undefined
  const value =
    (typeof swap.value === "string" && swap.value) ||
    (typeof p.value === "string" && p.value) ||
    "0x0"
  const chainId =
    typeof swap.chainId === "number"
      ? swap.chainId
      : typeof p.chainId === "number"
        ? p.chainId
        : undefined
  return { to, data, value, chainId }
}

export async function executePreparedTx(params: {
  userId: string
  agentMode: AgentMode
  prepared: PreparedTx
  requireAutonomous?: boolean
}): Promise<{
  ok: boolean
  txId?: string
  txHash?: string
  error?: string
}> {
  // Kill switch — block all transactions when active
  try {
    const { isKillSwitchOn } = await import("@/server/services/missions/repo")
    if (await isKillSwitchOn(params.userId)) {
      return { ok: false, error: "Kill switch is active — all transactions blocked." }
    }
  } catch { /* kill switch table may not exist yet */ }

  // Verify trade intent if provided (soft gate — null from autonomous mode passes through)
  const tradeIntentId = params.prepared.tradeIntentId
  if (tradeIntentId) {
    const intent = await db.query.tradeIntents.findFirst({
      where: and(
        eq(tradeIntents.id, tradeIntentId),
        eq(tradeIntents.userId, params.userId)
      ),
    })
    if (!intent) {
      return { ok: false, error: "No matching trade intent found" }
    }
    if (intent.status !== "proposed" && intent.status !== "quoted") {
      return { ok: false, error: "Trade intent already executed or expired" }
    }
  }

  if (params.requireAutonomous && params.agentMode !== "autonomous") {
    return {
      ok: false,
      error: "Autonomous mode required. Enable in Settings or confirm manually.",
    }
  }

  const wallet = await db.query.wallets.findFirst({
    where: eq(wallets.userId, params.userId),
  })
  if (!wallet?.privyWalletId) {
    return { ok: false, error: "No Privy embedded wallet linked for this user" }
  }

  const { to, data, value, chainId } = {
    ...extractTxFields(params.prepared.responsePayload),
    to: params.prepared.to,
    data: params.prepared.data,
    value: params.prepared.value,
    chainId: params.prepared.chainId,
  }

  if (!to || chainId == null) {
    return { ok: false, error: "Prepared transaction missing to/chainId" }
  }
  const txData = data && data !== "" ? data : "0x"

  const row = await insertTransaction({
    userId: params.userId,
    walletId: wallet.id,
    conversationId: params.prepared.conversationId ?? null,
    tradeIntentId: params.prepared.tradeIntentId ?? null,
    category: params.prepared.category || "swap",
    status: "signing",
    chainId,
    toAddress: to,
    fromAddress: wallet.address,
    value: value || "0x0",
    calldata: txData,
    uniswapRequestId: params.prepared.uniswapRequestId ?? null,
    requestPayload: params.prepared.requestPayload,
    responsePayload: params.prepared.responsePayload,
  })

  await publishAgentEvent({
    userId: params.userId,
    missionId: params.prepared.missionId,
    step: "signing",
    message: "Signing via Privy…",
    payload: { txId: row.id, chainId, to },
  })

  await patchCanvasForUser({
    userId: params.userId,
    conversationId: params.prepared.conversationId,
    patch: {
      op: "replace",
      widgetId: "inflight_trade",
      kind: "inflight_trade",
      data: {
        status: "signing",
        chainId,
        to,
        category: params.prepared.category || "swap",
      },
    },
  })

  try {
    const privy = getPrivy()
    const result = await privy.walletApi.ethereum.sendTransaction({
      walletId: wallet.privyWalletId,
      caip2: caip2(chainId),
      transaction: {
        to: to as `0x${string}`,
        data: txData as `0x${string}`,
        value: (value || "0x0") as `0x${string}`,
        chainId,
      },
    })

    const txHash = result.hash
    await updateTransaction(row.id, {
      status: "submitted",
      txHash,
      submittedAt: new Date(),
      responsePayload: { ...((params.prepared.responsePayload as object) || {}), broadcast: result },
    })

    await publishAgentEvent({
      userId: params.userId,
      missionId: params.prepared.missionId,
      step: "submitted",
      message: `Submitted ${txHash.slice(0, 10)}…`,
      payload: { txId: row.id, txHash, chainId },
    })

    await patchCanvasForUser({
      userId: params.userId,
      conversationId: params.prepared.conversationId,
      patch: {
        op: "set",
        widgetId: "inflight_trade",
        data: { status: "submitted", txHash },
      },
    })

    await patchCanvasForUser({
      userId: params.userId,
      conversationId: params.prepared.conversationId,
      patch: {
        op: "set",
        widgetId: "trade_tape",
        path: `rows.${row.id}`,
        data: {
          id: row.id,
          side: "swap",
          status: "submitted",
          txHash,
          chainId,
          at: new Date().toISOString(),
        },
      },
    })

    return { ok: true, txId: row.id, txHash }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await updateTransaction(row.id, {
      status: "failed",
      error: message,
    })
    await publishAgentEvent({
      userId: params.userId,
      missionId: params.prepared.missionId,
      step: "failed",
      message,
      payload: { txId: row.id },
    })
    await patchCanvasForUser({
      userId: params.userId,
      conversationId: params.prepared.conversationId,
      patch: {
        op: "set",
        widgetId: "inflight_trade",
        data: { status: "failed", error: message },
      },
    })
    return { ok: false, txId: row.id, error: message }
  }
}
