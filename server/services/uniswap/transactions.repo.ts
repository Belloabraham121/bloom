import { desc, eq } from "drizzle-orm"
import { db } from "@/server/services/db/client"
import { transactions } from "@/server/services/db/schema"

export type NewTransaction = {
  userId: string
  walletId?: string | null
  conversationId?: string | null
  messageId?: string | null
  tradeIntentId?: string | null
  executionPlanId?: string | null
  lpActionId?: string | null
  category: string
  provider?: string
  status?: string
  chainId?: number | null
  txHash?: string | null
  toAddress?: string | null
  fromAddress?: string | null
  value?: string | null
  calldata?: string | null
  uniswapRequestId?: string | null
  uniswapOrderId?: string | null
  uniswapPlanId?: string | null
  uniswapSwapId?: string | null
  stepIndex?: number | null
  requestPayload?: unknown
  responsePayload?: unknown
  error?: string | null
}

export async function insertTransaction(row: NewTransaction) {
  const [created] = await db
    .insert(transactions)
    .values({
      userId: row.userId,
      walletId: row.walletId ?? null,
      conversationId: row.conversationId ?? null,
      messageId: row.messageId ?? null,
      tradeIntentId: row.tradeIntentId ?? null,
      executionPlanId: row.executionPlanId ?? null,
      lpActionId: row.lpActionId ?? null,
      category: row.category,
      provider: row.provider ?? "uniswap_trade",
      status: row.status ?? "pending",
      chainId: row.chainId ?? null,
      txHash: row.txHash ?? null,
      toAddress: row.toAddress ?? null,
      fromAddress: row.fromAddress ?? null,
      value: row.value ?? null,
      calldata: row.calldata ?? null,
      uniswapRequestId: row.uniswapRequestId ?? null,
      uniswapOrderId: row.uniswapOrderId ?? null,
      uniswapPlanId: row.uniswapPlanId ?? null,
      uniswapSwapId: row.uniswapSwapId ?? null,
      stepIndex: row.stepIndex ?? null,
      requestPayload: row.requestPayload ?? null,
      responsePayload: row.responsePayload ?? null,
      error: row.error ?? null,
    })
    .returning()
  return created
}

export async function updateTransaction(
  id: string,
  patch: Partial<{
    status: string
    txHash: string | null
    responsePayload: unknown
    error: string | null
    submittedAt: Date | null
    confirmedAt: Date | null
    uniswapOrderId: string | null
    uniswapPlanId: string | null
    uniswapSwapId: string | null
  }>
) {
  const [updated] = await db
    .update(transactions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(transactions.id, id))
    .returning()
  return updated
}

export async function listTransactionsForUser(
  userId: string,
  opts?: { limit?: number; cursor?: string }
) {
  const limit = Math.min(opts?.limit ?? 30, 100)
  return db.query.transactions.findMany({
    where: eq(transactions.userId, userId),
    orderBy: [desc(transactions.createdAt)],
    limit,
  })
}

export async function getTransaction(id: string, userId: string) {
  const row = await db.query.transactions.findFirst({
    where: eq(transactions.id, id),
  })
  if (!row || row.userId !== userId) return null
  return row
}
