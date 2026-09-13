"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";

export type DemoSnapshotFeed = {
  feedId: string;
  chainId: number;
  symbol0: string;
  symbol1: string;
  tickMs: number;
  price: number;
  priceDisplay: string;
  paused: boolean;
  source: string | null;
  lastError: string | null;
  history: Array<{ price: number; at: string }>;
  updatedAt: string;
};

export type DemoSnapshotTransaction = {
  id: string;
  feedId: string;
  chainId: number;
  pair: string;
  side: "buy" | "sell";
  amountIn: string;
  amountOut: string;
  status: string;
  txHash: string;
  explorerUrl: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
};

export type DemoSnapshotPosition = {
  id: string;
  feedId: string;
  chainId: number;
  pair: string;
  assetSymbol: string;
  usdcRaw: string;
  assetRaw: string;
  createdAt: string;
};

export type DemoSnapshot = {
  id: string;
  conversationId: string | null;
  feedOrder: string[];
  feeds: Record<string, DemoSnapshotFeed>;
  balances: {
    formatted: Array<{ symbol: string; display: string; raw: string; decimals: number }>;
    updatedAt: string;
  };
  transactions: DemoSnapshotTransaction[];
  positions: DemoSnapshotPosition[];
  revision: number;
  updatedAt: string;
};

type DemoFeedContextValue = {
  session: DemoSnapshot | null;
  conversationId: string | null;
  loading: boolean;
  error: string | null;
  startDemo: () => Promise<DemoSnapshot | null>;
  pauseFeed: (feedId: string) => Promise<void>;
  resumeFeed: (feedId: string) => Promise<void>;
  quoteDemo: (feedId: string, side: "buy" | "sell", amount: string) => Promise<unknown>;
  swapDemo: (feedId: string, side: "buy" | "sell", amount: string) => Promise<unknown>;
  liquidityDemo: (input: {
    feedId: string;
    action: "add" | "remove";
    usdcAmount?: string;
    assetAmount?: string;
    positionId?: string;
  }) => Promise<unknown>;
  addDemoPanel: (input: {
    sessionId?: string;
    kind: "graph" | "swap" | "liquidity" | "balances" | "tape";
    feedId?: string;
    side?: "buy" | "sell";
    amount?: string;
    usdcAmount?: string;
  }) => Promise<unknown>;
  resetDemo: () => Promise<void>;
  refreshDemo: () => Promise<void>;
  arrangePanels: () => Promise<unknown>;
};

const DemoFeedContext = createContext<DemoFeedContextValue>({
  session: null,
  conversationId: null,
  loading: false,
  error: null,
  startDemo: async () => null,
  pauseFeed: async () => {},
  resumeFeed: async () => {},
  quoteDemo: async () => null,
  swapDemo: async () => null,
  liquidityDemo: async () => null,
  addDemoPanel: async () => null,
  resetDemo: async () => {},
  refreshDemo: async () => {},
  arrangePanels: async () => null,
});

export function useDemoFeed(): DemoFeedContextValue {
  return useContext(DemoFeedContext);
}

function lastTickKey(feedId: string): string {
  return `bloom-demo-last-tick:${feedId}`;
}

export function readDemoLastTick(feedId: string): { price: number; priceDisplay: string; at: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(lastTickKey(feedId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { price?: number; priceDisplay?: string; at?: string };
    if (typeof parsed.price !== "number" || !(parsed.price > 0)) return null;
    return {
      price: parsed.price,
      priceDisplay: parsed.priceDisplay || String(parsed.price),
      at: parsed.at || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function writeDemoLastTick(feedId: string, tick: { price: number; priceDisplay?: string; at: string }): void {
  try {
    localStorage.setItem(
      lastTickKey(feedId),
      JSON.stringify({ price: tick.price, priceDisplay: tick.priceDisplay, at: tick.at })
    );
  } catch {
    /* quota / private mode */
  }
}

function sessionQuery(conversationId: string | null, sessionId?: string): string {
  const params = new URLSearchParams();
  if (sessionId) params.set("sessionId", sessionId);
  if (conversationId) params.set("conversationId", conversationId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function DemoFeedProvider({
  conversationId,
  getAccessToken,
  refreshKey,
  children,
}: {
  conversationId: string | null;
  getAccessToken: () => Promise<string | null>;
  refreshKey?: number | string;
  children: ReactNode;
}) {
  const [session, setSession] = useState<DemoSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sessionRef = useRef<DemoSnapshot | null>(null);
  const getAccessTokenRef = useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const authedFetch = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getAccessTokenRef.current();
    if (!token) throw new Error("Not authenticated");
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
    return data as Record<string, unknown>;
  }, []);

  const refreshDemo = useCallback(async () => {
    if (!conversationId) return;
    const isInitialLoad = !sessionRef.current;
    if (isInitialLoad) setLoading(true);
    setError(null);
    try {
      const data = await authedFetch(`/api/demo/session${sessionQuery(conversationId)}`);
      setSession((data.session as DemoSnapshot | null) || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Desk unavailable");
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  }, [authedFetch, conversationId]);

  useEffect(() => {
    void refreshDemo();
  }, [refreshDemo, refreshKey]);

  useEffect(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    if (!session?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getAccessTokenRef.current();
        if (!token || cancelled) return;
        const ticketRes = await fetch("/api/auth/sse-ticket", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!ticketRes.ok || cancelled) return;
        const ticketData = (await ticketRes.json()) as { ticket?: string };
        if (!ticketData.ticket || cancelled) return;
        const source = new EventSource(
          `/api/demo/stream?sessionId=${encodeURIComponent(session.id)}&ticket=${encodeURIComponent(ticketData.ticket)}`
        );
        eventSourceRef.current = source;
        source.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as {
              type: string;
              session?: DemoSnapshot;
              tick?: { feedId: string; price: number; priceDisplay?: string; at: string };
              transaction?: DemoSnapshotTransaction;
              feedId?: string;
              paused?: boolean;
              lastError?: string | null;
            };
            if (message.type === "demo_snapshot" || message.type === "demo_reset") {
              if (message.session) setSession(message.session);
              return;
            }
            if (message.type === "demo_balances" && message.session) {
              setSession(message.session);
              return;
            }
            if (message.type === "demo_tick" && message.tick) {
              const tick = message.tick;
              writeDemoLastTick(tick.feedId, tick);
              setSession((prev) => {
                if (!prev || !prev.feeds[tick.feedId]) return prev;
                const feed = prev.feeds[tick.feedId]!;
                return {
                  ...prev,
                  feeds: {
                    ...prev.feeds,
                    [tick.feedId]: {
                      ...feed,
                      price: tick.price,
                      priceDisplay: tick.priceDisplay || feed.priceDisplay,
                      lastError: null,
                      history: [...feed.history, { price: tick.price, at: tick.at }].slice(-90),
                      updatedAt: tick.at,
                    },
                  },
                };
              });
              return;
            }
            if (message.type === "demo_transaction" && message.transaction) {
              const row = message.transaction;
              setSession((prev) => {
                if (!prev) return prev;
                const next = [row, ...prev.transactions.filter((item) => item.id !== row.id)].slice(0, 50);
                return { ...prev, transactions: next, updatedAt: row.updatedAt };
              });
              return;
            }
            if (message.type === "demo_feed" && message.feedId) {
              const feedId = message.feedId;
              setSession((prev) => {
                if (!prev || !prev.feeds[feedId]) return prev;
                return {
                  ...prev,
                  feeds: {
                    ...prev.feeds,
                    [feedId]: {
                      ...prev.feeds[feedId]!,
                      paused: Boolean(message.paused),
                      lastError: message.lastError ?? null,
                    },
                  },
                };
              });
            }
          } catch {
            /* ignore malformed demo events */
          }
        };
      } catch {
        /* demo stream is optional */
      }
    })();
    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [session?.id]);

  const startDemo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authedFetch("/api/demo/session", {
        method: "POST",
        body: JSON.stringify({ conversationId }),
      });
      const next = data.session as DemoSnapshot;
      setSession(next);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start desk");
      throw e;
    } finally {
      setLoading(false);
    }
  }, [authedFetch, conversationId]);

  const updateFeed = useCallback(
    async (feedId: string, body: Record<string, unknown>) => {
      const data = await authedFetch("/api/demo/feed", {
        method: "POST",
        body: JSON.stringify({
          sessionId: session?.id,
          conversationId,
          feedId,
          ...body,
        }),
      });
      setSession(data.session as DemoSnapshot);
    },
    [authedFetch, conversationId, session?.id]
  );

  const pauseFeed = useCallback((feedId: string) => updateFeed(feedId, { action: "pause" }), [updateFeed]);
  const resumeFeed = useCallback((feedId: string) => updateFeed(feedId, { action: "resume" }), [updateFeed]);

  const quoteDemo = useCallback(
    async (feedId: string, side: "buy" | "sell", amount: string) => {
      const data = await authedFetch("/api/demo/quote", {
        method: "POST",
        body: JSON.stringify({ sessionId: session?.id, conversationId, feedId, side, amount }),
      });
      return data.quote;
    },
    [authedFetch, conversationId, session?.id]
  );

  const swapDemo = useCallback(
    async (feedId: string, side: "buy" | "sell", amount: string) => {
      const data = await authedFetch("/api/demo/swap", {
        method: "POST",
        body: JSON.stringify({ sessionId: session?.id, conversationId, feedId, side, amount }),
      });
      await refreshDemo();
      return data.transaction;
    },
    [authedFetch, conversationId, refreshDemo, session?.id]
  );

  const liquidityDemo = useCallback(
    async (input: {
      feedId: string;
      action: "add" | "remove";
      usdcAmount?: string;
      assetAmount?: string;
      positionId?: string;
    }) => {
      const data = await authedFetch("/api/demo/liquidity", {
        method: "POST",
        body: JSON.stringify({ sessionId: session?.id, conversationId, ...input }),
      });
      await refreshDemo();
      return data.transaction;
    },
    [authedFetch, conversationId, refreshDemo, session?.id]
  );

  const addDemoPanel = useCallback(
    async (input: {
      sessionId?: string;
      kind: "graph" | "swap" | "liquidity" | "balances" | "tape";
      feedId?: string;
      side?: "buy" | "sell";
      amount?: string;
      usdcAmount?: string;
    }) => {
      const data = await authedFetch("/api/demo/panels", {
        method: "POST",
        body: JSON.stringify({ sessionId: input.sessionId ?? session?.id, conversationId, ...input }),
      });
      await refreshDemo();
      return data.panel;
    },
    [authedFetch, conversationId, refreshDemo, session?.id]
  );

  const resetDemo = useCallback(async () => {
    await authedFetch("/api/demo/balances", {
      method: "POST",
      body: JSON.stringify({ sessionId: session?.id, conversationId }),
    });
    await refreshDemo();
  }, [authedFetch, conversationId, refreshDemo, session?.id]);

  const arrangePanels = useCallback(async () => {
    const data = await authedFetch("/api/demo/panels/arrange", {
      method: "POST",
      body: JSON.stringify({ conversationId }),
    });
    await refreshDemo();
    return data;
  }, [authedFetch, conversationId, refreshDemo]);

  const value = useMemo(
    () => ({
      session,
      conversationId,
      loading,
      error,
      startDemo,
      pauseFeed,
      resumeFeed,
      quoteDemo,
      swapDemo,
      liquidityDemo,
      addDemoPanel,
      resetDemo,
      refreshDemo,
      arrangePanels,
    }),
    [session, conversationId, loading, error, startDemo, pauseFeed, resumeFeed, quoteDemo, swapDemo, liquidityDemo, addDemoPanel, resetDemo, refreshDemo, arrangePanels]
  );

  return <DemoFeedContext.Provider value={value}>{children}</DemoFeedContext.Provider>;
}

function demoBalanceDisplay(session: DemoSnapshot | null, symbol: string): string {
  const row = session?.balances.formatted.find((item) => item.symbol === symbol);
  return row?.display || (symbol === "USDC" ? "200 USDC" : symbol === "ETH" ? "0.1 ETH" : `0 ${symbol}`);
}

export function DemoControl() {
  const { session, loading, startDemo, resetDemo } = useDemoFeed();
  const [open, setOpen] = useState(false);
  if (!session) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 rounded-full text-xs"
        disabled={loading}
        onClick={() => void startDemo().catch(() => {})}
      >
        {loading ? "Starting…" : "Start"}
      </Button>
    );
  }
  return (
    <div className="relative">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 rounded-full text-xs"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Portfolio balances"
      >
        Portfolio · {demoBalanceDisplay(session, "USDC")} · {demoBalanceDisplay(session, "ETH")}
      </Button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close portfolio controls"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg">
            <p className="text-xs font-medium">Portfolio</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Balances in this desk are virtual and never touch your wallet.
            </p>
            <div className="mt-2 space-y-1 text-xs">
              {session.balances.formatted.map((row) => (
                <p key={row.symbol} className="flex justify-between gap-2">
                  <span className="font-medium">{row.symbol}</span>
                  <span className="font-mono text-muted-foreground">{row.display}</span>
                </p>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3 h-8 w-full text-xs"
              disabled={loading}
              onClick={() => void resetDemo().catch(() => {}).finally(() => setOpen(false))}
            >
              Reset to 200 USDC · 0.1 ETH
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
