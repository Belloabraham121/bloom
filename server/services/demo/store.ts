import {
  createDemoSession,
  getDemoFeed,
  makeDemoTick,
  publicDemoSession,
  quoteDemoSwap,
  createDemoTransaction,
  createDemoLiquidityTransaction,
  settleDemoTransaction,
  settleDemoLiquidityTransaction,
  resetDemoSessionState,
  paperSlippageBps,
  parseTokenUnits,
  formatTokenUnits,
  tokenDecimals,
  type DemoFeedConfig,
  type DemoSession,
  type DemoSide,
  type DemoTick,
  type DemoTransaction,
  type PublicDemoSession,
} from "./simulation";
import {
  ensureRedisConnected,
  getRedis,
  isRedisCircuitOpen,
  redisEnabled,
} from "@/server/services/redis/client";

export type DemoEvent =
  | { type: "demo_snapshot"; session: PublicDemoSession; at: string }
  | { type: "demo_tick"; tick: DemoTick; at: string }
  | { type: "demo_feed"; feedId: string; paused: boolean; lastError?: string | null; at: string }
  | { type: "demo_balances"; sessionId: string; at: string; session: PublicDemoSession }
  | { type: "demo_transaction"; transaction: DemoTransaction; at: string }
  | { type: "demo_reset"; session: PublicDemoSession; at: string };

type DemoListener = (event: DemoEvent) => void;

const sessions = new Map<string, DemoSession>();
const activeByOwner = new Map<string, string>();
const listeners = new Map<string, Set<DemoListener>>();
const feedTimers = new Map<string, ReturnType<typeof setInterval>>();
const lifecycleTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

function ownerKey(userId: string, conversationId: string | null): string {
  return `${userId}:${conversationId || "global"}`;
}

function sessionKey(sessionId: string): string {
  return `bloom:demo:${sessionId}`;
}

function activeKey(userId: string, conversationId: string | null): string {
  return `bloom:demo:active:${ownerKey(userId, conversationId)}`;
}

function rememberActive(session: DemoSession): void {
  activeByOwner.set(ownerKey(session.userId, session.conversationId), session.id);
}

async function persistSession(session: DemoSession): Promise<void> {
  sessions.set(session.id, session);
  rememberActive(session);
  const { writeCacheFile, cacheFileName } = await import("@/server/services/persist/file-cache");
  writeCacheFile(cacheFileName("demo-session", session.id), JSON.stringify(session));
  writeCacheFile(
    cacheFileName("demo-active", session.userId, session.conversationId || "global"),
    session.id
  );
  if (!redisEnabled() || isRedisCircuitOpen()) return;
  try {
    const redis = getRedis();
    await ensureRedisConnected(redis);
    await redis.set(sessionKey(session.id), JSON.stringify(session), "EX", 60 * 60 * 24 * 7);
    await redis.set(activeKey(session.userId, session.conversationId), session.id, "EX", 60 * 60 * 24 * 7);
  } catch {
    /* demo sessions remain available in memory */
  }
}

async function readPersistedSession(sessionId: string): Promise<DemoSession | null> {
  if (redisEnabled() && !isRedisCircuitOpen()) {
    try {
      const redis = getRedis();
      await ensureRedisConnected(redis);
      const raw = await redis.get(sessionKey(sessionId));
      if (raw) {
        const parsed = JSON.parse(raw) as DemoSession;
        sessions.set(parsed.id, parsed);
        rememberActive(parsed);
        return parsed;
      }
    } catch {
      /* fall through to the file cache */
    }
  }
  try {
    const { readCacheFile, cacheFileName } = await import("@/server/services/persist/file-cache");
    const raw = readCacheFile(cacheFileName("demo-session", sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoSession;
    sessions.set(parsed.id, parsed);
    rememberActive(parsed);
    return parsed;
  } catch {
    return null;
  }
}

function publish(sessionId: string, event: DemoEvent): void {
  listeners.get(sessionId)?.forEach((listener) => {
    try {
      listener(event);
    } catch {
      /* one slow listener must not break the demo stream */
    }
  });
}

function publishSnapshot(session: DemoSession): void {
  publish(session.id, {
    type: "demo_snapshot",
    session: publicDemoSession(session),
    at: new Date().toISOString(),
  });
}

function feedTimerKey(sessionId: string, feedId: string): string {
  return `${sessionId}:${feedId}`;
}

function ensureFeedLoop(session: DemoSession, feedId: string): void {
  const feed = getDemoFeed(session, feedId);
  const key = feedTimerKey(session.id, feed.feedId);
  const existing = feedTimers.get(key);
  if (existing) clearInterval(existing);
  if (feed.paused) {
    feedTimers.delete(key);
    return;
  }
  const poll = async () => {
    const current = sessions.get(session.id);
    if (!current) {
      const timer = feedTimers.get(key);
      if (timer) clearInterval(timer);
      feedTimers.delete(key);
      return;
    }
    try {
      const liveFeed = getDemoFeed(current, feed.feedId);
      if (liveFeed.paused) {
        const timer = feedTimers.get(key);
        if (timer) clearInterval(timer);
        feedTimers.delete(key);
        return;
      }
      const { fetchSpotPrices } = await import("@/server/services/market/price-fallback");
      const spot = await fetchSpotPrices(liveFeed.symbol0, liveFeed.symbol1);
      if (!spot) {
        liveFeed.lastError = "Price source unreachable — retrying";
        liveFeed.updatedAt = new Date().toISOString();
        void persistSession(current);
        publish(current.id, {
          type: "demo_feed",
          feedId: liveFeed.feedId,
          paused: liveFeed.paused,
          lastError: liveFeed.lastError,
          at: liveFeed.updatedAt,
        });
        return;
      }
      const tick = makeDemoTick(liveFeed, { price: spot.pairPrice, source: spot.source });
      current.updatedAt = tick.at;
      void persistSession(current);
      publish(current.id, { type: "demo_tick", tick, at: tick.at });
    } catch {
      /* keep the loop alive; the UI retains the last price */
    }
  };
  // Fetch immediately so charts paint on connect instead of after one interval.
  void poll();
  const timer = setInterval(() => {
    void poll();
  }, feed.tickMs);
  feedTimers.set(key, timer);
}

function ensureSessionLoops(session: DemoSession): void {
  for (const feedId of session.feedOrder) {
    ensureFeedLoop(session, feedId);
  }
}

function stopSessionLoops(sessionId: string): void {
  for (const [key, timer] of feedTimers) {
    if (key.startsWith(`${sessionId}:`)) {
      clearInterval(timer);
      feedTimers.delete(key);
    }
  }
  const pending = lifecycleTimers.get(sessionId) || [];
  pending.forEach((timer) => clearTimeout(timer));
  lifecycleTimers.delete(sessionId);
}

function trackLifecycleTimer(sessionId: string, timer: ReturnType<typeof setTimeout>): void {
  const pending = lifecycleTimers.get(sessionId) || [];
  pending.push(timer);
  lifecycleTimers.set(sessionId, pending);
}

async function requireOwnedSession(sessionId: string, userId: string): Promise<DemoSession> {
  const cached = sessions.get(sessionId);
  if (cached && cached.userId === userId) return cached;
  const persisted = await readPersistedSession(sessionId);
  if (persisted && persisted.userId === userId) return persisted;
  throw Object.assign(new Error("Paper session not found"), { status: 404 });
}

export async function createDemoSessionService(params: {
  userId: string;
  conversationId?: string | null;
  feeds?: DemoFeedConfig[];
  reset?: boolean;
}): Promise<PublicDemoSession> {
  const conversationId = params.conversationId ?? null;
  if (params.reset) {
    const active = await getActiveDemoSession(params.userId, conversationId);
    if (active) {
      stopSessionLoops(active.id);
      const reset = resetDemoSessionState(sessions.get(active.id) || activeToSession(active));
      await persistSession(reset);
      ensureSessionLoops(reset);
      publish(reset.id, { type: "demo_reset", session: publicDemoSession(reset), at: new Date().toISOString() });
      return publicDemoSession(reset);
    }
  }
  const session = createDemoSession({
    userId: params.userId,
    conversationId,
    feeds: params.feeds,
  });
  await persistSession(session);
  ensureSessionLoops(session);
  publishSnapshot(session);
  return publicDemoSession(session);
}

function activeToSession(snapshot: PublicDemoSession): DemoSession {
  const cached = sessions.get(snapshot.id);
  if (!cached) throw new Error("Session expired in memory");
  return cached;
}

export async function getActiveDemoSession(
  userId: string,
  conversationId?: string | null
): Promise<PublicDemoSession | null> {
  const key = ownerKey(userId, conversationId ?? null);
  const cachedId = activeByOwner.get(key);
  if (cachedId) {
    const cached = sessions.get(cachedId);
    if (cached && cached.userId === userId) return publicDemoSession(cached);
  }
  if (redisEnabled() && !isRedisCircuitOpen()) {
    try {
      const redis = getRedis();
      await ensureRedisConnected(redis);
      const sessionId = await redis.get(activeKey(userId, conversationId ?? null));
      if (sessionId) {
        const session = await requireOwnedSession(sessionId, userId);
        return publicDemoSession(session);
      }
    } catch {
      /* fall through to the file cache */
    }
  }
  try {
    const { readCacheFile, cacheFileName } = await import("@/server/services/persist/file-cache");
    const sessionId = readCacheFile(
      cacheFileName("demo-active", userId, conversationId || "global")
    )?.trim();
    if (!sessionId) return null;
    const session = await requireOwnedSession(sessionId, userId);
    return publicDemoSession(session);
  } catch {
    return null;
  }
}

export async function getDemoSessionService(
  sessionId: string,
  userId: string
): Promise<PublicDemoSession> {
  const session = await requireOwnedSession(sessionId, userId);
  return publicDemoSession(session);
}

export async function updateDemoFeedService(params: {
  userId: string;
  sessionId?: string;
  conversationId?: string | null;
  feedId: string;
  action: "pause" | "resume";
  tickMs?: number;
}): Promise<PublicDemoSession> {
  const session = params.sessionId
    ? await requireOwnedSession(params.sessionId, params.userId)
    : await requireActiveSession(params.userId, params.conversationId ?? null);
  const feed = getDemoFeed(session, params.feedId);
  if (params.action === "pause") feed.paused = true;
  if (params.action === "resume") feed.paused = false;
  if (Number.isFinite(params.tickMs)) {
    feed.tickMs = Math.min(10_000, Math.max(1_000, Math.round(params.tickMs as number)));
  }
  feed.updatedAt = new Date().toISOString();
  session.updatedAt = feed.updatedAt;
  await persistSession(session);
  ensureFeedLoop(session, feed.feedId);
  publish(session.id, {
    type: "demo_feed",
    feedId: feed.feedId,
    paused: feed.paused,
    at: feed.updatedAt,
  });
  return publicDemoSession(session);
}

async function requireActiveSession(userId: string, conversationId: string | null): Promise<DemoSession> {
  const snapshot = await getActiveDemoSession(userId, conversationId);
  if (!snapshot) throw Object.assign(new Error("No active session"), { status: 404 });
  return activeToSession(snapshot);
}

export async function resetDemoBalancesService(params: {
  userId: string;
  sessionId?: string;
  conversationId?: string | null;
}): Promise<PublicDemoSession> {
  const session = params.sessionId
    ? await requireOwnedSession(params.sessionId, params.userId)
    : await requireActiveSession(params.userId, params.conversationId ?? null);
  stopSessionLoops(session.id);
  const reset = resetDemoSessionState(session);
  await persistSession(reset);
  ensureSessionLoops(reset);
  publish(reset.id, { type: "demo_reset", session: publicDemoSession(reset), at: new Date().toISOString() });
  return publicDemoSession(reset);
}

async function resolveDemoQuote(
  userId: string,
  session: DemoSession,
  feedId: string,
  side: DemoSide,
  amount: string
) {
  const feed = getDemoFeed(session, feedId);
  const resolvedSide: DemoSide = side === "sell" ? "sell" : "buy";
  const amountInSymbol = resolvedSide === "buy" ? feed.symbol0 : feed.symbol1;
  const amountOutSymbol = resolvedSide === "buy" ? feed.symbol1 : feed.symbol0;
  const amountInDecimals = tokenDecimals(amountInSymbol);
  const amountOutDecimals = tokenDecimals(amountOutSymbol);

  // Prefer a real Uniswap quote; fall back to the last real spot price.
  try {
    const { db } = await import("@/server/services/db/client");
    const { wallets } = await import("@/server/services/db/schema");
    const { eq } = await import("drizzle-orm");
    const { normalizeQuoteBody } = await import("@/server/services/uniswap/normalize-quote");
    const { tradeClient } = await import("@/server/services/uniswap/trade.client");
    const { pickOutputAmountRaw } = await import("@/server/services/canvas/quote-openui");

    let swapper: string | null = null;
    try {
      const rows = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
      const addr = rows[0]?.address;
      if (typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr)) swapper = addr;
    } catch {
      /* quote-only path works without a wallet */
    }

    const amountInRaw = parseTokenUnits(amount, amountInDecimals);
    const normalized = await normalizeQuoteBody(
      {
        tokenIn: amountInSymbol,
        tokenOut: amountOutSymbol,
        amount,
        tokenInChainId: feed.chainId,
        tokenOutChainId: feed.chainId,
      },
      { decisionOrigin: "human_mediated", swapper }
    );
    const raw = (await tradeClient.quote(normalized.body, "human_mediated")) as Record<string, unknown>;
    const outRaw = pickOutputAmountRaw(raw);
    if (outRaw == null) throw new Error("Uniswap quote had no output amount");
    const { feeBps, slippageBps } = paperSlippageBps(amountInRaw, amountInDecimals);
    const netOut = (BigInt(outRaw) * BigInt(10_000 - feeBps - slippageBps)) / BigInt(10_000);
    if (netOut <= BigInt(0)) throw new Error("Uniswap quote is below the minimum output");
    const now = new Date();
    const inHuman = Number(amountInRaw) / 10 ** amountInDecimals;
    const outHuman = Number(netOut) / 10 ** amountOutDecimals;
    return {
      quoteId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      feedId: feed.feedId,
      chainId: feed.chainId,
      symbol0: feed.symbol0,
      symbol1: feed.symbol1,
      side: resolvedSide,
      amountIn: formatTokenUnits(amountInRaw.toString(), amountInDecimals),
      amountInRaw: amountInRaw.toString(),
      amountOut: formatTokenUnits(netOut.toString(), amountOutDecimals),
      amountOutRaw: netOut.toString(),
      price: inHuman > 0 ? outHuman / inHuman : feed.price,
      feeBps,
      slippageBps,
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      simulated: true as const,
      source: "uniswap" as const,
    };
  } catch (error) {
    // Uniswap unreachable — price from the last real spot tick instead.
    if (feed.price > 0) {
      const fallback = quoteDemoSwap({ session, feedId, side: resolvedSide, amount });
      return { ...fallback, source: "spot" as const };
    }
    throw error instanceof Error ? error : new Error("Quote unavailable");
  }
}

export async function quoteDemoService(params: {
  userId: string;
  sessionId?: string;
  conversationId?: string | null;
  feedId: string;
  side: DemoSide;
  amount: string;
}) {
  const session = params.sessionId
    ? await requireOwnedSession(params.sessionId, params.userId)
    : await requireActiveSession(params.userId, params.conversationId ?? null);
  return resolveDemoQuote(params.userId, session, params.feedId, params.side, params.amount);
}

export async function swapDemoService(params: {
  userId: string;
  sessionId?: string;
  conversationId?: string | null;
  feedId: string;
  side: DemoSide;
  amount: string;
}) {
  const session = params.sessionId
    ? await requireOwnedSession(params.sessionId, params.userId)
    : await requireActiveSession(params.userId, params.conversationId ?? null);
  const quote = await resolveDemoQuote(params.userId, session, params.feedId, params.side, params.amount);
  const transaction = createDemoTransaction({ session, quote });
  await persistSession(session);
  publish(session.id, { type: "demo_transaction", transaction, at: transaction.updatedAt });

  const revision = session.revision;
  const advance = (status: DemoTransaction["status"], delayMs: number, settle = false) => {
    const timer = setTimeout(() => {
      const current = sessions.get(session.id);
      if (!current || current.revision !== revision) return;
      const row = current.transactions.find((item) => item.id === transaction.id);
      if (!row) return;
      if (settle) {
        settleDemoTransaction(current, row.id, quote);
      } else {
        row.status = status;
        row.updatedAt = new Date().toISOString();
        current.updatedAt = row.updatedAt;
      }
      void persistSession(current);
      publish(current.id, { type: "demo_transaction", transaction: row, at: row.updatedAt });
      if (settle) {
        publish(current.id, {
          type: "demo_balances",
          sessionId: current.id,
          at: row.updatedAt,
          session: publicDemoSession(current),
        });
      }
    }, delayMs);
    trackLifecycleTimer(session.id, timer);
  };

  advance("sim_signing", 650);
  advance("sim_submitted", 1300);
  advance("sim_confirming", 2100);
  advance("simulated-confirmed", 3000, true);

  return { quote, transaction: { ...transaction } };
}

export async function liquidityDemoService(params: {
  userId: string;
  sessionId?: string;
  conversationId?: string | null;
  feedId: string;
  action: "add" | "remove";
  usdcAmount?: string;
  assetAmount?: string;
  positionId?: string;
}) {
  const session = params.sessionId
    ? await requireOwnedSession(params.sessionId, params.userId)
    : await requireActiveSession(params.userId, params.conversationId ?? null);
  const { transaction } = createDemoLiquidityTransaction({
    session,
    feedId: params.feedId,
    action: params.action,
    usdcAmount: params.usdcAmount,
    assetAmount: params.assetAmount,
    positionId: params.positionId,
  });
  await persistSession(session);
  publish(session.id, { type: "demo_transaction", transaction, at: transaction.updatedAt });

  const revision = session.revision;
  const advance = (status: DemoTransaction["status"], delayMs: number, settle = false) => {
    const timer = setTimeout(() => {
      const current = sessions.get(session.id);
      if (!current || current.revision !== revision) return;
      const row = current.transactions.find((item) => item.id === transaction.id);
      if (!row) return;
      if (settle) {
        settleDemoLiquidityTransaction(current, row.id);
      } else {
        row.status = status;
        row.updatedAt = new Date().toISOString();
        current.updatedAt = row.updatedAt;
      }
      void persistSession(current);
      publish(current.id, { type: "demo_transaction", transaction: row, at: row.updatedAt });
      if (settle) {
        publish(current.id, {
          type: "demo_balances",
          sessionId: current.id,
          at: row.updatedAt,
          session: publicDemoSession(current),
        });
      }
    }, delayMs);
    trackLifecycleTimer(session.id, timer);
  };

  advance("sim_signing", 650);
  advance("sim_submitted", 1300);
  advance("sim_confirming", 2100);
  advance("simulated-confirmed", 3000, true);

  return { transaction: { ...transaction } };
}

export function subscribeDemoSession(sessionId: string, listener: DemoListener): () => void {
  const set = listeners.get(sessionId) || new Set<DemoListener>();
  set.add(listener);
  listeners.set(sessionId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(sessionId);
  };
}

export async function ensureDemoSessionStreaming(sessionId: string, userId: string): Promise<DemoSession> {
  const session = await requireOwnedSession(sessionId, userId);
  ensureSessionLoops(session);
  return session;
}
