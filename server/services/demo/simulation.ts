import { randomBytes, randomUUID } from "node:crypto";

export type DemoFeedConfig = {
  feedId?: string;
  chainId?: number;
  symbol0?: string;
  symbol1?: string;
  tickMs?: number;
};

export type DemoTick = {
  feedId: string;
  chainId: number;
  symbol0: string;
  symbol1: string;
  price: number;
  priceDisplay: string;
  spreadBps: number;
  volume: number;
  changePct: number;
  at: string;
  source: string;
  simulated: true;
};

export type DemoTokenBalance = {
  raw: string;
  decimals: number;
};

export type DemoBalances = {
  tokens: Record<string, DemoTokenBalance>;
  updatedAt: string;
};

export type DemoSide = "buy" | "sell";

export type DemoTxSide = DemoSide | "lp-add" | "lp-remove";

export type DemoLiquidityMove = {
  assetSymbol: string;
  assetDecimals: number;
  usdcInRaw: string;
  assetInRaw: string;
  positionId?: string;
};

export type DemoPosition = {
  id: string;
  feedId: string;
  chainId: number;
  pair: string;
  assetSymbol: string;
  usdcRaw: string;
  assetRaw: string;
  createdAt: string;
};

export type DemoQuote = {
  quoteId: string;
  feedId: string;
  chainId: number;
  symbol0: string;
  symbol1: string;
  side: DemoSide;
  amountIn: string;
  amountInRaw: string;
  amountOut: string;
  amountOutRaw: string;
  price: number;
  feeBps: number;
  slippageBps: number;
  expiresAt: string;
  source?: "uniswap" | "spot";
  simulated: true;
};

export type DemoTxStatus =
  | "sim_quoting"
  | "sim_signing"
  | "sim_submitted"
  | "sim_confirming"
  | "simulated-confirmed"
  | "sim_failed";

export type DemoTransaction = {
  id: string;
  feedId: string;
  chainId: number;
  pair: string;
  side: DemoTxSide;
  amountIn: string;
  amountOut: string;
  status: DemoTxStatus;
  txHash: string;
  explorerUrl: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
  liquidity?: DemoLiquidityMove;
  simulated: true;
};

export type DemoFeedState = {
  feedId: string;
  chainId: number;
  symbol0: string;
  symbol1: string;
  tickMs: number;
  price: number;
  history: DemoTick[];
  paused: boolean;
  source: string | null;
  lastError: string | null;
  updatedAt: string;
};

export type DemoSession = {
  id: string;
  userId: string;
  conversationId: string | null;
  feeds: Record<string, DemoFeedState>;
  feedOrder: string[];
  balances: DemoBalances;
  transactions: DemoTransaction[];
  positions: DemoPosition[];
  autoTrade: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

const SUPPORTED_CHAIN_IDS = new Set([1, 10, 137, 8453, 42161]);
const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  USDT: 6,
  DAI: 18,
  ETH: 18,
  WETH: 18,
  WBTC: 8,
};

const DEFAULT_FEEDS: Required<
  Pick<DemoFeedConfig, "chainId" | "symbol0" | "symbol1" | "tickMs">
>[] = [
  { chainId: 1, symbol0: "USDC", symbol1: "ETH", tickMs: 2500 },
  { chainId: 1, symbol0: "USDC", symbol1: "WBTC", tickMs: 3000 },
  { chainId: 1, symbol0: "USDC", symbol1: "DAI", tickMs: 3500 },
];

const PRICE_SCALE = BigInt("1000000000000");
const MAX_HISTORY = 120;
const MAX_TRANSACTIONS = 50;

function powerOfTen(exponent: number): bigint {
  let result = BigInt(1);
  for (let i = 0; i < exponent; i += 1) {
    result *= BigInt(10);
  }
  return result;
}

function sanitizeSymbol(value: string | undefined, fallback: string): string {
  const symbol = (value || fallback).trim().toUpperCase();
  if (!symbol || symbol.length < 2 || symbol.length > 10) return fallback;
  if (/^\d+$/.test(symbol)) return fallback;
  return symbol;
}

function sanitizeFeedId(symbol0: string, symbol1: string): string {
  return `${symbol0}_${symbol1}`.replace(/[^A-Z0-9_]/g, "").slice(0, 32) || "USDC_ETH";
}

function clampTickMs(tickMs: number | undefined, fallback: number): number {
  if (!Number.isFinite(tickMs || NaN)) return fallback;
  return Math.min(10_000, Math.max(1_000, Math.round(tickMs as number)));
}

export function formatDemoPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "—";
  if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (price >= 1) return price.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return price.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function parseTokenUnits(amount: string, decimals: number): bigint {
  const text = amount.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error("Amount must be a positive decimal number");
  const whole = match[1]!.replace(/^0+(?=\d)/, "") || "0";
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) {
    throw new Error(`Amount has too many decimals for a ${decimals}-decimal token`);
  }
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  const raw = BigInt(whole) * powerOfTen(decimals) + (padded ? BigInt(padded) : BigInt(0));
  if (raw <= BigInt(0)) throw new Error("Amount must be greater than zero");
  return raw;
}

export function formatTokenUnits(raw: string, decimals: number): string {
  const value = BigInt(raw);
  const base = powerOfTen(decimals);
  const whole = (value / base).toString();
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function tokenDecimals(symbol: string): number {
  return TOKEN_DECIMALS[symbol] ?? 18;
}

function defaultBalances(): DemoBalances {
  return {
    tokens: {
      USDC: { raw: "200000000", decimals: 6 },
      ETH: { raw: "100000000000000000", decimals: 18 },
      WBTC: { raw: "1000000", decimals: 8 },
      DAI: { raw: "200000000000000000000", decimals: 18 },
      USDT: { raw: "200000000", decimals: 6 },
    },
    updatedAt: new Date().toISOString(),
  };
}

export function explorerUrl(chainId: number, txHash: string): string {
  if (chainId === 1) return `https://etherscan.io/tx/${txHash}`;
  if (chainId === 8453) return `https://basescan.org/tx/${txHash}`;
  if (chainId === 42161) return `https://arbiscan.io/tx/${txHash}`;
  if (chainId === 10) return `https://optimistic.etherscan.io/tx/${txHash}`;
  if (chainId === 137) return `https://polygonscan.com/tx/${txHash}`;
  return `https://blockscan.com/tx/${txHash}`;
}

export function randomDemoTxHash(): string {
  return `0x${randomBytes(32).toString("hex")}`;
}

export function createDemoFeedState(
  config: DemoFeedConfig,
  index: number
): DemoFeedState {
  const chainId = SUPPORTED_CHAIN_IDS.has(config.chainId ?? 1) ? (config.chainId ?? 1) : 1;
  const symbol0 = sanitizeSymbol(config.symbol0, "USDC");
  const symbol1 = sanitizeSymbol(config.symbol1, "ETH");
  const feedId = (config.feedId || sanitizeFeedId(symbol0, symbol1)).toUpperCase();
  const now = new Date().toISOString();
  return {
    feedId,
    chainId,
    symbol0,
    symbol1,
    tickMs: clampTickMs(config.tickMs, DEFAULT_FEEDS[index % DEFAULT_FEEDS.length]?.tickMs || 2500),
    price: 0,
    history: [],
    paused: false,
    source: null,
    lastError: null,
    updatedAt: now,
  };
}

export function createDemoSession(params: {
  id?: string;
  userId: string;
  conversationId?: string | null;
  feeds?: DemoFeedConfig[];
}): DemoSession {
  const id = params.id || randomUUID();
  const requested = params.feeds && params.feeds.length ? params.feeds : DEFAULT_FEEDS;
  const feeds: Record<string, DemoFeedState> = {};
  const feedOrder: string[] = [];
  requested.slice(0, 6).forEach((config, index) => {
    const feed = createDemoFeedState(config, index);
    feeds[feed.feedId] = feed;
    feedOrder.push(feed.feedId);
  });
  const now = new Date().toISOString();
  return {
    id,
    userId: params.userId,
    conversationId: params.conversationId ?? null,
    feeds,
    feedOrder,
    balances: defaultBalances(),
    transactions: [],
    positions: [],
    autoTrade: false,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function resetDemoSessionState(session: DemoSession): DemoSession {
  const next = createDemoSession({
    id: session.id,
    userId: session.userId,
    conversationId: session.conversationId,
    feeds: session.feedOrder.map((feedId) => {
      const feed = session.feeds[feedId];
      if (!feed) return {};
      return {
        feedId: feed.feedId,
        chainId: feed.chainId,
        symbol0: feed.symbol0,
        symbol1: feed.symbol1,
        tickMs: feed.tickMs,
      };
    }),
  });
  return {
    ...next,
    autoTrade: session.autoTrade,
    createdAt: session.createdAt,
    revision: session.revision + 1,
  };
}

export function getDemoFeed(session: DemoSession, feedId: string): DemoFeedState {
  const feed = session.feeds[feedId.toUpperCase()];
  if (!feed) throw new Error(`Unknown demo feed "${feedId}"`);
  return feed;
}

/**
 * Record one real spot price on a feed. Prices come from live market sources
 * (CoinGecko → DefiLlama → Binance); nothing here is simulated.
 */
export function makeDemoTick(
  feed: DemoFeedState,
  spot: { price: number; source: string },
  at = new Date()
): DemoTick {
  const price = spot.price;
  feed.price = price;
  feed.source = spot.source;
  feed.lastError = null;
  feed.updatedAt = at.toISOString();
  const reference = feed.history[0]?.price ?? price;
  const tick: DemoTick = {
    feedId: feed.feedId,
    chainId: feed.chainId,
    symbol0: feed.symbol0,
    symbol1: feed.symbol1,
    price,
    priceDisplay: formatDemoPrice(price),
    spreadBps: 0,
    volume: 0,
    changePct: reference > 0 ? ((price - reference) / reference) * 100 : 0,
    at: at.toISOString(),
    source: spot.source,
    simulated: true,
  };
  feed.history = [...feed.history, tick].slice(-MAX_HISTORY);
  return tick;
}

/** Paper fee + size-based slippage applied on top of real Uniswap quotes. */
export function paperSlippageBps(amountInRaw: bigint, amountInDecimals: number): {
  feeBps: number;
  slippageBps: number;
} {
  const sizeRatio = Number(amountInRaw) / 10 ** amountInDecimals;
  return {
    feeBps: 10,
    slippageBps: Math.min(150, 5 + Math.round(Math.min(sizeRatio, 5000) / 25)),
  };
}

function quoteAmounts(
  side: DemoSide,
  amountInRaw: bigint,
  amountInDecimals: number,
  amountOutDecimals: number,
  price: number
): { amountOutRaw: bigint; feeBps: number; slippageBps: number } {
  const priceE12 = BigInt(Math.max(1, Math.round(price * 1_000_000_000_000)));
  const { feeBps, slippageBps } = paperSlippageBps(amountInRaw, amountInDecimals);
  const retainedBps = BigInt(10_000 - feeBps - slippageBps);
  const basisPoints = BigInt(10_000);
  if (side === "buy") {
    const gross = (amountInRaw * PRICE_SCALE * powerOfTen(amountOutDecimals)) / (priceE12 * powerOfTen(amountInDecimals));
    return { amountOutRaw: (gross * retainedBps) / basisPoints, feeBps, slippageBps };
  }
  const gross = (amountInRaw * priceE12 * powerOfTen(amountOutDecimals)) / (PRICE_SCALE * powerOfTen(amountInDecimals));
  return { amountOutRaw: (gross * retainedBps) / basisPoints, feeBps, slippageBps };
}

export function quoteDemoSwap(params: {
  session: DemoSession;
  feedId: string;
  side: DemoSide;
  amount: string;
}): DemoQuote {
  const feed = getDemoFeed(params.session, params.feedId);
  const side: DemoSide = params.side === "sell" ? "sell" : "buy";
  const amountInSymbol = side === "buy" ? feed.symbol0 : feed.symbol1;
  const amountOutSymbol = side === "buy" ? feed.symbol1 : feed.symbol0;
  const amountInDecimals = tokenDecimals(amountInSymbol);
  const amountOutDecimals = tokenDecimals(amountOutSymbol);
  const amountInRaw = parseTokenUnits(params.amount, amountInDecimals);
  // Quotes never require a balance — affordability is enforced at execution.
  const amounts = quoteAmounts(side, amountInRaw, amountInDecimals, amountOutDecimals, feed.price);
  if (amounts.amountOutRaw <= BigInt(0)) throw new Error("Quote is below the minimum output");
  const now = new Date();
  return {
    quoteId: randomUUID(),
    feedId: feed.feedId,
    chainId: feed.chainId,
    symbol0: feed.symbol0,
    symbol1: feed.symbol1,
    side,
    amountIn: formatTokenUnits(amountInRaw.toString(), amountInDecimals),
    amountInRaw: amountInRaw.toString(),
    amountOut: formatTokenUnits(amounts.amountOutRaw.toString(), amountOutDecimals),
    amountOutRaw: amounts.amountOutRaw.toString(),
    price: feed.price,
    feeBps: amounts.feeBps,
    slippageBps: amounts.slippageBps,
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    simulated: true,
  };
}

export function createDemoTransaction(params: {
  session: DemoSession;
  quote: DemoQuote;
}): DemoTransaction {
  const now = new Date().toISOString();
  const txHash = randomDemoTxHash();
  const pair = `${params.quote.symbol1}/${params.quote.symbol0}`;
  const transaction: DemoTransaction = {
    id: randomUUID(),
    feedId: params.quote.feedId,
    chainId: params.quote.chainId,
    pair,
    side: params.quote.side,
    amountIn: `${params.quote.amountIn} ${params.quote.side === "buy" ? params.quote.symbol0 : params.quote.symbol1}`,
    amountOut: `${params.quote.amountOut} ${params.quote.side === "buy" ? params.quote.symbol1 : params.quote.symbol0}`,
    status: "sim_quoting",
    txHash,
    explorerUrl: explorerUrl(params.quote.chainId, txHash),
    createdAt: now,
    updatedAt: now,
    simulated: true,
  };
  params.session.transactions = [transaction, ...params.session.transactions].slice(0, MAX_TRANSACTIONS);
  params.session.updatedAt = now;
  return transaction;
}

export function settleDemoTransaction(
  session: DemoSession,
  transactionId: string,
  quote: DemoQuote
): DemoTransaction {
  const transaction = session.transactions.find((row) => row.id === transactionId);
  if (!transaction) throw new Error("Transaction not found");
  const amountInSymbol = quote.side === "buy" ? quote.symbol0 : quote.symbol1;
  const amountOutSymbol = quote.side === "buy" ? quote.symbol1 : quote.symbol0;
  const amountInBalance = session.balances.tokens[amountInSymbol];
  const amountOutBalance = session.balances.tokens[amountOutSymbol] || {
    raw: "0",
    decimals: tokenDecimals(amountOutSymbol),
  };
  if (!amountInBalance || BigInt(amountInBalance.raw) < BigInt(quote.amountInRaw)) {
    transaction.status = "sim_failed";
    transaction.error = `Insufficient ${amountInSymbol} balance`;
    transaction.updatedAt = new Date().toISOString();
    return transaction;
  }
  amountInBalance.raw = (BigInt(amountInBalance.raw) - BigInt(quote.amountInRaw)).toString();
  amountOutBalance.raw = (BigInt(amountOutBalance.raw) + BigInt(quote.amountOutRaw)).toString();
  session.balances.tokens[amountInSymbol] = amountInBalance;
  session.balances.tokens[amountOutSymbol] = amountOutBalance;
  session.balances.updatedAt = new Date().toISOString();
  transaction.status = "simulated-confirmed";
  transaction.updatedAt = new Date().toISOString();
  session.updatedAt = transaction.updatedAt;
  return transaction;
}

export function createDemoLiquidityTransaction(params: {
  session: DemoSession;
  feedId: string;
  action: "add" | "remove";
  usdcAmount?: string;
  assetAmount?: string;
  positionId?: string;
}): { transaction: DemoTransaction; move: DemoLiquidityMove } {
  const feed = getDemoFeed(params.session, params.feedId);
  const assetSymbol = feed.symbol1;
  const assetDecimals = tokenDecimals(assetSymbol);
  const now = new Date().toISOString();
  const txHash = randomDemoTxHash();
  const pair = `${feed.symbol1}/${feed.symbol0}`;

  if (params.action === "add") {
    if (!params.usdcAmount || !params.assetAmount) {
      throw new Error("usdcAmount and assetAmount are required to add liquidity");
    }
    // Balance is enforced at settlement so the lifecycle always starts visibly.
    const usdcInRaw = parseTokenUnits(params.usdcAmount, 6);
    const assetInRaw = parseTokenUnits(params.assetAmount, assetDecimals);
    const move: DemoLiquidityMove = {
      assetSymbol,
      assetDecimals,
      usdcInRaw: usdcInRaw.toString(),
      assetInRaw: assetInRaw.toString(),
    };
    const transaction: DemoTransaction = {
      id: randomUUID(),
      feedId: feed.feedId,
      chainId: feed.chainId,
      pair,
      side: "lp-add",
      amountIn: `${formatTokenUnits(usdcInRaw.toString(), 6)} USDC + ${formatTokenUnits(assetInRaw.toString(), assetDecimals)} ${assetSymbol}`,
      amountOut: `LP ${pair}`,
      status: "sim_quoting",
      txHash,
      explorerUrl: explorerUrl(feed.chainId, txHash),
      createdAt: now,
      updatedAt: now,
      liquidity: move,
      simulated: true,
    };
    params.session.transactions = [transaction, ...params.session.transactions].slice(0, MAX_TRANSACTIONS);
    params.session.updatedAt = now;
    return { transaction, move };
  }

  if (!params.positionId) throw new Error("positionId is required to remove liquidity");
  const position = params.session.positions.find((row) => row.id === params.positionId);
  if (!position || position.feedId !== feed.feedId) throw new Error("Liquidity position not found");
  const move: DemoLiquidityMove = {
    assetSymbol: position.assetSymbol,
    assetDecimals: tokenDecimals(position.assetSymbol),
    usdcInRaw: position.usdcRaw,
    assetInRaw: position.assetRaw,
    positionId: position.id,
  };
  const transaction: DemoTransaction = {
    id: randomUUID(),
    feedId: feed.feedId,
    chainId: feed.chainId,
    pair,
    side: "lp-remove",
    amountIn: `LP ${pair}`,
    amountOut: `${formatTokenUnits(position.usdcRaw, 6)} USDC + ${formatTokenUnits(position.assetRaw, move.assetDecimals)} ${position.assetSymbol}`,
    status: "sim_quoting",
    txHash,
    explorerUrl: explorerUrl(feed.chainId, txHash),
    createdAt: now,
    updatedAt: now,
    liquidity: move,
    simulated: true,
  };
  params.session.transactions = [transaction, ...params.session.transactions].slice(0, MAX_TRANSACTIONS);
  params.session.updatedAt = now;
  return { transaction, move };
}

export function settleDemoLiquidityTransaction(
  session: DemoSession,
  transactionId: string
): DemoTransaction {
  const transaction = session.transactions.find((row) => row.id === transactionId);
  if (!transaction || !transaction.liquidity) throw new Error("Transaction not found");
  const move = transaction.liquidity;
  const usdcBalance = session.balances.tokens.USDC;
  const assetBalance = session.balances.tokens[move.assetSymbol] || {
    raw: "0",
    decimals: move.assetDecimals,
  };
  if (transaction.side === "lp-add") {
    if (!usdcBalance || BigInt(usdcBalance.raw) < BigInt(move.usdcInRaw)) {
      transaction.status = "sim_failed";
      transaction.error = "Insufficient USDC balance";
      transaction.updatedAt = new Date().toISOString();
      return transaction;
    }
    if (BigInt(assetBalance.raw) < BigInt(move.assetInRaw)) {
      transaction.status = "sim_failed";
      transaction.error = `Insufficient ${move.assetSymbol} balance`;
      transaction.updatedAt = new Date().toISOString();
      return transaction;
    }
    usdcBalance.raw = (BigInt(usdcBalance.raw) - BigInt(move.usdcInRaw)).toString();
    assetBalance.raw = (BigInt(assetBalance.raw) - BigInt(move.assetInRaw)).toString();
    session.balances.tokens.USDC = usdcBalance;
    session.balances.tokens[move.assetSymbol] = assetBalance;
    session.positions = [
      {
        id: move.positionId || randomUUID(),
        feedId: transaction.feedId,
        chainId: transaction.chainId,
        pair: transaction.pair,
        assetSymbol: move.assetSymbol,
        usdcRaw: move.usdcInRaw,
        assetRaw: move.assetInRaw,
        createdAt: transaction.createdAt,
      },
      ...session.positions,
    ].slice(0, 25);
  } else {
    const positionIndex = session.positions.findIndex((row) => row.id === move.positionId);
    if (positionIndex < 0) {
      transaction.status = "sim_failed";
      transaction.error = "Liquidity position not found";
      transaction.updatedAt = new Date().toISOString();
      return transaction;
    }
    const [position] = session.positions.splice(positionIndex, 1);
    if (!position) throw new Error("Liquidity position not found");
    usdcBalance.raw = (BigInt(usdcBalance.raw) + BigInt(position.usdcRaw)).toString();
    assetBalance.raw = (BigInt(assetBalance.raw) + BigInt(position.assetRaw)).toString();
    session.balances.tokens.USDC = usdcBalance;
    session.balances.tokens[move.assetSymbol] = assetBalance;
  }
  session.balances.updatedAt = new Date().toISOString();
  transaction.status = "simulated-confirmed";
  transaction.updatedAt = new Date().toISOString();
  session.updatedAt = transaction.updatedAt;
  return transaction;
}

export function formatDemoBalances(balances: DemoBalances): Array<{
  symbol: string;
  display: string;
  raw: string;
  decimals: number;
}> {
  return Object.entries(balances.tokens).map(([symbol, balance]) => ({
    symbol,
    display: `${formatTokenUnits(balance.raw, balance.decimals)} ${symbol}`,
    raw: balance.raw,
    decimals: balance.decimals,
  }));
}

export function publicDemoSession(session: DemoSession) {
  return {
    id: session.id,
    conversationId: session.conversationId,
    feedOrder: session.feedOrder,
    feeds: Object.fromEntries(
      Object.entries(session.feeds).map(([feedId, feed]) => [
        feedId,
        {
          feedId: feed.feedId,
          chainId: feed.chainId,
          symbol0: feed.symbol0,
          symbol1: feed.symbol1,
          tickMs: feed.tickMs,
          price: feed.price,
          priceDisplay: formatDemoPrice(feed.price),
          paused: feed.paused,
          source: feed.source,
          lastError: feed.lastError,
          history: feed.history.slice(-60),
          updatedAt: feed.updatedAt,
        },
      ])
    ),
    balances: {
      tokens: session.balances.tokens,
      formatted: formatDemoBalances(session.balances),
      updatedAt: session.balances.updatedAt,
    },
    transactions: session.transactions,
    positions: session.positions,
    autoTrade: session.autoTrade,
    revision: session.revision,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    simulated: true as const,
  };
}

export type PublicDemoSession = ReturnType<typeof publicDemoSession>;
