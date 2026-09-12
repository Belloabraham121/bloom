/**
 * Server-safe library spec for OpenUI Gateway prompting.
 * Uses a serialized OpenUI base spec (no React) + Bloom trading components.
 * Keep trading schemas in sync with bloom-library.tsx.
 */
import {
  createLibrary,
  defineComponent,
  type ComponentGroup,
  type LibrarySpec,
  type PromptOptions,
} from "@openuidev/lang-core"
import { z } from "zod/v4"
import openuiBase from "./openui-base-spec.json"

const noop = () => null

const MessageText = defineComponent({
  name: "MessageText",
  description:
    "Short trading caption only (greetings or one-line intro). Prefer TextContent for general copy. Max two sentences.",
  props: z.object({
    text: z.string(),
  }),
  component: noop,
})

const TokenRow = defineComponent({
  name: "TokenRow",
  description:
    "One token row: symbol, name, optional contract address and logoUrl (Uniswap or CoinGecko).",
  props: z.object({
    symbol: z.string(),
    name: z.string(),
    address: z.string().optional(),
    logoUrl: z.string().optional(),
  }),
  component: noop,
})

const TokenList = defineComponent({
  name: "TokenList",
  description:
    "Visual list of tokens (bridgable, searchable, or swappable). Prefer over markdown bullets for token discovery.",
  props: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    children: z.array(TokenRow.ref),
  }),
  component: noop,
})

const ChainRow = defineComponent({
  name: "ChainRow",
  description: "One supported chain row.",
  props: z.object({
    name: z.string(),
    chainId: z.string(),
  }),
  component: noop,
})

const ChainList = defineComponent({
  name: "ChainList",
  description: "Visual list of supported chains.",
  props: z.object({
    title: z.string(),
    children: z.array(ChainRow.ref),
  }),
  component: noop,
})

const QuoteSummary = defineComponent({
  name: "QuoteSummary",
  description: "Show a Uniswap quote: tokens, amounts, routing, and gas.",
  props: z.object({
    tokenIn: z.string(),
    tokenOut: z.string(),
    amountIn: z.string(),
    amountOut: z.string(),
    routing: z.string(),
    gasFeeUsd: z.string().optional(),
    chainLabel: z.string().optional(),
  }),
  component: noop,
})

const ApprovalCard = defineComponent({
  name: "ApprovalCard",
  description: "Show token approval requirements before a swap or LP action.",
  props: z.object({
    token: z.string(),
    spender: z.string(),
    amount: z.string().optional(),
    status: z.string().optional(),
  }),
  component: noop,
})

const ConfirmTx = defineComponent({
  name: "ConfirmTx",
  description:
    "Ask the user to confirm broadcasting a prepared transaction or order.",
  props: z.object({
    title: z.string(),
    summary: z.string(),
    txTo: z.string().optional(),
    requiresConfirm: z.boolean().optional(),
  }),
  component: noop,
})

const CostBreakdown = defineComponent({
  name: "CostBreakdown",
  description: "Show network gas cost for a trade (no platform fee).",
  props: z.object({
    networkFeeUsd: z.string(),
    note: z.string().optional(),
  }),
  component: noop,
})

const TxStatusCard = defineComponent({
  name: "TxStatusCard",
  description: "Show status of a swap, order, plan step, or LP transaction.",
  props: z.object({
    category: z.string(),
    status: z.string(),
    txHash: z.string().optional(),
    detail: z.string().optional(),
  }),
  component: noop,
})

const GaslessOrderCard = defineComponent({
  name: "GaslessOrderCard",
  description: "Summarize a UniswapX gasless order.",
  props: z.object({
    orderId: z.string().optional(),
    status: z.string(),
    tokenIn: z.string(),
    tokenOut: z.string(),
    amountIn: z.string(),
    amountOut: z.string().optional(),
  }),
  component: noop,
})

const ChainedPlanCard = defineComponent({
  name: "ChainedPlanCard",
  description: "Show a chained cross-chain execution plan overview.",
  props: z.object({
    planId: z.string(),
    status: z.string(),
    stepsSummary: z.string(),
  }),
  component: noop,
})

const LpPositionCard = defineComponent({
  name: "LpPositionCard",
  description: "Summarize an LP create/increase/decrease/claim action.",
  props: z.object({
    action: z.string(),
    pool: z.string(),
    detail: z.string().optional(),
  }),
  component: noop,
})

const PoolTelemetry = defineComponent({
  name: "PoolTelemetry",
  description:
    "Show pool TVL and volume from The Graph (include version + chain when known).",
  props: z.object({
    pair: z.string(),
    tvlUsd: z.string(),
    volumeUsd: z.string().optional(),
    feeTier: z.string().optional(),
    version: z.string().optional(),
    chain: z.string().optional(),
  }),
  component: noop,
})

/** Legacy root — prefer Stack for new replies. */
const Root = defineComponent({
  name: "Root",
  description:
    "Legacy top-level container. Prefer Stack([...]) for new responses.",
  props: z.object({
    children: z.array(z.any()),
  }),
  component: noop,
})

const LiveActivity = defineComponent({
  name: "LiveActivity",
  description:
    "Real-time agent activity panel. ONLY after start_market_watch / start_mission when user asked for live data. Place in Stack — not fixed chrome.",
  props: z.object({
    title: z.string().optional(),
  }),
  component: noop,
})

const LiveTradeTape = defineComponent({
  name: "LiveTradeTape",
  description:
    "Live trade tape of agent swaps. Emit only after start_market_watch / start_mission.",
  props: z.object({
    title: z.string().optional(),
  }),
  component: noop,
})

const LiveMarketTick = defineComponent({
  name: "LiveMarketTick",
  description:
    "Latest live pool/price tick. Use after start_market_watch for real-time prices.",
  props: z.object({
    title: z.string().optional(),
  }),
  component: noop,
})

const InflightTrade = defineComponent({
  name: "InflightTrade",
  description:
    "In-flight trade card (quoting → signing → submitted). Include in live Stack.",
  props: z.object({
    title: z.string().optional(),
  }),
  component: noop,
})

const TRADING_COMPONENTS = [
  MessageText,
  TokenRow,
  TokenList,
  ChainRow,
  ChainList,
  QuoteSummary,
  ApprovalCard,
  ConfirmTx,
  CostBreakdown,
  TxStatusCard,
  GaslessOrderCard,
  ChainedPlanCard,
  LpPositionCard,
  PoolTelemetry,
  LiveActivity,
  LiveTradeTape,
  LiveMarketTick,
  InflightTrade,
  Root,
]

const tradingComponentGroup: ComponentGroup = {
  name: "Trading",
  components: TRADING_COMPONENTS.map((c) => c.name),
  notes: [
    "- Use Trading components for Uniswap quotes, approvals, confirms, LP, and pool TVL.",
    "- Real-time: start_market_watch then LiveActivity / LiveTradeTape / LiveMarketTick / InflightTrade in Stack.",
    "- Never assume fixed chat chrome for live UI.",
    "- Token discovery → TokenList + TokenRow. Chains → ChainList + ChainRow.",
    "- Prefer Button with Action([@ToAssistant(\"...\")]) for confirm / follow-up clicks.",
  ],
}

const basePromptOptions = (openuiBase.promptOptions ?? {}) as PromptOptions

export const bloomPromptOptions: PromptOptions = {
  examples: [
    ...(basePromptOptions.examples ?? []),
    `Example — Uniswap quote + confirm:

root = Stack([caption, quote, cost, confirm])
caption = TextContent("Quote ready", "large-heavy")
quote = QuoteSummary("USDC", "WETH", "100", "0.04", "CLASSIC", "1.20", "Ethereum")
cost = CostBreakdown("1.20")
confirm = ConfirmTx("Confirm swap", "Swap 100 USDC for ~0.04 WETH on Ethereum", null, true)`,
    `Example — live real-time (after start_market_watch):

root = Stack([title, activity, tick, tape])
title = TextContent("Live USDC/ETH", "large-heavy")
activity = LiveActivity("Agent activity")
tick = LiveMarketTick("Last tick")
tape = LiveTradeTape("Trades")`,
    `Example — tokens with logos:

root = Stack([title, list])
title = TextContent("Tokens", "large-heavy")
list = TokenList("Ethereum", "Chain ID 1", [t1])
t1 = TokenRow("USDC", "USD Coin", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "https://coin-images.coingecko.com/coins/images/6319/large/usdc.png")`,
    `Example — Pool TVL table + chart:

root = Stack([title, tbl, chart])
title = TextContent("Top Base V3 pools", "large-heavy")
tbl = Table([Col("Pair", pairs), Col("TVL (USD)", tvls)])
pairs = ["WETH/USDC", "WETH/USDbC"]
tvls = [12000000, 4500000]
chart = BarChart(pairs, [s1], "grouped")
s1 = Series("TVL", tvls)`,
  ],
  additionalRules: [
    ...(basePromptOptions.additionalRules ?? []),
    "Every program must start with root = Stack([...]). Do not use Root(...).",
    "Live UI must be OpenUI LiveActivity / LiveTradeTape / LiveMarketTick / InflightTrade after start_market_watch — never fixed chrome.",
    "For Uniswap trading flows prefer Trading components (QuoteSummary, ConfirmTx, TokenList, PoolTelemetry, etc.).",
    "When a tool returns logoUrl, pass it as TokenRow's fourth argument so the icon renders.",
    "For comparisons and analytics use Table, BarChart, LineChart, PieChart, etc.",
    "Buttons: use Button / Buttons with Action([@ToAssistant(\"message\")]) or @OpenUrl(\"https://...\").",
    "Never invent token addresses, chain IDs, or logo URLs — call tools first.",
  ],
}

const tradingSpec = createLibrary({
  id: "bloom-trading-only@3",
  root: "MessageText",
  components: TRADING_COMPONENTS,
}).toSpec()

const baseSchema = openuiBase.schema as {
  $defs?: Record<string, unknown>
  [key: string]: unknown
}
const tradingSchema = tradingSpec.schema as {
  $defs?: Record<string, unknown>
  [key: string]: unknown
}

export const bloomLibrarySpec = {
  root: "Stack",
  components: {
    ...(openuiBase.components as LibrarySpec["components"]),
    ...tradingSpec.components,
  },
  componentGroups: [
    ...((openuiBase.componentGroups as ComponentGroup[]) ?? []),
    tradingComponentGroup,
  ],
  schema: {
    ...baseSchema,
    $defs: {
      ...(baseSchema.$defs ?? {}),
      ...(tradingSchema.$defs ?? {}),
    },
  },
} as LibrarySpec
