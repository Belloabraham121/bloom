import type { AgentMode } from "@/lib/types";

const TRADE_API_BASE = "https://trade-api.gateway.uniswap.org/v1";

/** Stay under Uniswap default ~6 RPS per API key. */
const MAX_RPS = 5;
const MIN_INTERVAL_MS = Math.ceil(1000 / MAX_RPS);

type GateState = {
  chain: Promise<void>;
  nextAvailableAt: number;
};

const globalGate = globalThis as unknown as { __uniswapGate?: GateState };

function getGate(): GateState {
  if (!globalGate.__uniswapGate) {
    globalGate.__uniswapGate = {
      chain: Promise.resolve(),
      nextAvailableAt: 0,
    };
  }
  return globalGate.__uniswapGate;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireSlot() {
  const gate = getGate();
  let release!: () => void;
  const prev = gate.chain;
  gate.chain = new Promise<void>((r) => {
    release = r;
  });
  await prev;
  try {
    const now = Date.now();
    const wait = Math.max(0, gate.nextAvailableAt - now);
    if (wait > 0) await sleep(wait);
    gate.nextAvailableAt = Date.now() + MIN_INTERVAL_MS;
  } finally {
    release();
  }
}

export function buildAgentInfoHeader(decisionOrigin: AgentMode): string {
  return JSON.stringify({
    integration_name: "swap-integration",
    decision_origin: decisionOrigin,
    version: "1.5.0",
  });
}

export class UniswapApiError extends Error {
  status: number;
  body: unknown;
  requestId?: string;

  constructor(status: number, body: unknown, message?: string) {
    super(message || `Uniswap API error ${status}`);
    this.name = "UniswapApiError";
    this.status = status;
    this.body = body;
    if (body && typeof body === "object" && "requestId" in body) {
      this.requestId = String((body as { requestId?: string }).requestId ?? "");
    }
  }
}

export type UniswapRequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  decisionOrigin?: AgentMode;
  maxRetries?: number;
};

export async function uniswapFetch<T = unknown>(
  options: UniswapRequestOptions,
): Promise<T> {
  const apiKey = process.env.UNISWAP_API_KEY;
  if (!apiKey) {
    throw new Error("UNISWAP_API_KEY is not configured");
  }

  const decisionOrigin = options.decisionOrigin ?? "human_mediated";
  const maxRetries = options.maxRetries ?? 4;

  let url = `${TRADE_API_BASE}${options.path}`;
  if (options.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(options.query)) {
      if (v === undefined) continue;
      params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await acquireSlot();

    const res = await fetch(url, {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-universal-router-version": "2.0",
        "x-agent-info": buildAgentInfoHeader(decisionOrigin),
      },
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }

    if (res.status === 429) {
      const backoff = Math.min(8000, 400 * 2 ** attempt) + Math.random() * 200;
      lastError = new UniswapApiError(
        429,
        parsed,
        "Uniswap rate limit exceeded",
      );
      await sleep(backoff);
      continue;
    }

    if (res.status === 503 || res.status === 504) {
      const backoff = Math.min(5000, 300 * 2 ** attempt) + Math.random() * 150;
      lastError = new UniswapApiError(res.status, parsed);
      await sleep(backoff);
      continue;
    }

    if (!res.ok) {
      throw new UniswapApiError(
        res.status,
        parsed,
        typeof parsed === "object" &&
          parsed &&
          "detail" in parsed &&
          typeof (parsed as { detail: unknown }).detail === "string"
          ? (parsed as { detail: string }).detail
          : undefined,
      );
    }

    return parsed as T;
  }

  throw lastError instanceof Error
    ? lastError
    : new UniswapApiError(429, null, "Uniswap rate limit exceeded");
}
