/**
 * In-memory + Redis-backed canvas store per user/conversation.
 */

import {
  applyCanvasPatch,
  emptyCanvas,
  type CanvasModel,
  type CanvasPatchOp,
} from "./model"
import { ensureRedisConnected, getRedis } from "@/server/services/redis/client"
import { publishCanvasPatch } from "@/server/services/market/bus"

function storeKey(userId: string, conversationId: string | null) {
  return `bloom:canvas:${userId}:${conversationId || "default"}`
}

const memory = new Map<string, CanvasModel>()

export async function getCanvasModel(
  userId: string,
  conversationId: string | null
): Promise<CanvasModel> {
  const key = storeKey(userId, conversationId)
  const cached = memory.get(key)
  if (cached) return cached

  try {
    const redis = getRedis()
    await ensureRedisConnected(redis)
    const raw = await redis.get(key)
    if (raw) {
      const parsed = JSON.parse(raw) as CanvasModel
      memory.set(key, parsed)
      return parsed
    }
  } catch {
    /* redis optional */
  }

  const blank = emptyCanvas(conversationId)
  memory.set(key, blank)
  return blank
}

export async function saveCanvasModel(
  userId: string,
  conversationId: string | null,
  model: CanvasModel
) {
  const key = storeKey(userId, conversationId)
  memory.set(key, model)
  try {
    const redis = getRedis()
    await ensureRedisConnected(redis)
    await redis.set(key, JSON.stringify(model), "EX", 60 * 60 * 24 * 7)
  } catch {
    /* ignore */
  }
}

export async function patchCanvasForUser(params: {
  userId: string
  conversationId?: string | null
  patch: CanvasPatchOp
}): Promise<CanvasModel> {
  const conversationId = params.conversationId ?? null
  const current = await getCanvasModel(params.userId, conversationId)
  const next = applyCanvasPatch(current, params.patch)
  await saveCanvasModel(params.userId, conversationId, next)

  const widgetId = params.patch.widgetId
  const widget = widgetId ? next.widgets[widgetId] : undefined
  await publishCanvasPatch({
    userId: params.userId,
    conversationId,
    op: params.patch.op,
    widgetId,
    path: params.patch.path,
    kind: params.patch.kind || widget?.kind,
    openuiDocument:
      params.patch.openuiDocument !== undefined
        ? params.patch.openuiDocument
        : undefined,
    revision: next.revision,
    data:
      params.patch.data ??
      (widget
        ? { openui: widget.props.openui, ...widget.props }
        : undefined),
  })
  return next
}
