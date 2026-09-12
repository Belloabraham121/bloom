import { eq } from "drizzle-orm"
import { db } from "@/server/services/db/client"
import { tradeIntents } from "@/server/services/db/schema"

export type NewTradeIntent = {
  userId: string
  conversationId?: string | null
  messageId?: string | null
  status?: string
  kind: string
  chainIdIn?: number | null
  chainIdOut?: number | null
  tokenIn?: string | null
  tokenOut?: string | null
  amountIn?: string | null
  amountOutExpected?: string | null
  routing?: string | null
  uniswapRequestId?: string | null
  quotePayload?: unknown
  calldataPayload?: unknown
  networkFeeUsd?: string | null
  error?: string | null
  expiresAt?: Date | null
}

export async function insertTradeIntent(row: NewTradeIntent) {
  const [created] = await db
    .insert(tradeIntents)
    .values({
      userId: row.userId,
      conversationId: row.conversationId ?? null,
      messageId: row.messageId ?? null,
      status: row.status ?? "proposed",
      kind: row.kind,
      chainIdIn: row.chainIdIn ?? null,
      chainIdOut: row.chainIdOut ?? null,
      tokenIn: row.tokenIn ?? null,
      tokenOut: row.tokenOut ?? null,
      amountIn: row.amountIn ?? null,
      amountOutExpected: row.amountOutExpected ?? null,
      routing: row.routing ?? null,
      uniswapRequestId: row.uniswapRequestId ?? null,
      quotePayload: row.quotePayload ?? null,
      calldataPayload: row.calldataPayload ?? null,
      networkFeeUsd: row.networkFeeUsd ?? null,
      error: row.error ?? null,
      expiresAt: row.expiresAt ?? null,
    })
    .returning()
  return created
}

export async function updateTradeIntent(
  id: string,
  patch: Partial<{
    status: string
    quotePayload: unknown
    calldataPayload: unknown
    routing: string | null
    amountOutExpected: string | null
    error: string | null
    uniswapOrderId: string | null
  }>
) {
  const [updated] = await db
    .update(tradeIntents)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(tradeIntents.id, id))
    .returning()
  return updated
}

export async function getTradeIntent(id: string, userId: string) {
  const row = await db.query.tradeIntents.findFirst({
    where: eq(tradeIntents.id, id),
  })
  if (!row || row.userId !== userId) return null
  return row
}
