/**
 * Server-safe library spec for OpenUI Gateway prompting.
 * Must stay in sync with bloom-library.tsx (same components, root, groups, schemas).
 */
import {
  createLibrary,
  defineComponent,
  type ComponentGroup,
  type PromptOptions,
} from "@openuidev/lang-core"
import {
  openuiComponentGroups,
  openuiLibrary,
  openuiPromptOptions,
} from "@openuidev/react-ui/genui-lib"
import { z } from "zod/v4"

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
  description: "One token row: symbol, name, optional contract address.",
  props: z.object({
    symbol: z.string(),
    name: z.string(),
    address: z.string().optional(),
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
  Root,
]

const tradingComponentGroup: ComponentGroup = {
  name: "Trading",
  components: TRADING_COMPONENTS.map((c) => c.name),
  notes: [
    "- Use Trading components for Uniswap quotes, approvals, confirms, LP, and pool TVL.",
    "- Token discovery → TokenList + TokenRow. Chains → ChainList + ChainRow.",
    "- After get_pool_telemetry / get_top_pools → PoolTelemetry (and/or Table / BarChart for comparisons).",
    "- Prefer Button with Action([@ToAssistant(\"...\")]) for confirm / follow-up clicks.",
  ],
}

export const bloomPromptOptions: PromptOptions = {
  examples: [
    ...(openuiPromptOptions.examples ?? []),
    `Example — Uniswap quote + confirm:

root = Stack([caption, quote, cost, confirm])
caption = TextContent("Quote ready", "large-heavy")
quote = QuoteSummary("USDC", "WETH", "100", "0.04", "CLASSIC", "1.20", "Ethereum")
cost = CostBreakdown("1.20")
confirm = ConfirmTx("Confirm swap", "Swap 100 USDC for ~0.04 WETH on Ethereum", null, true)`,
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
    ...(openuiPromptOptions.additionalRules ?? []),
    "Every program must start with root = Stack([...]). Do not use Root(...).",
    "For Uniswap trading flows prefer Trading components (QuoteSummary, ConfirmTx, TokenList, PoolTelemetry, etc.).",
    "For comparisons and analytics use Table, BarChart, LineChart, PieChart, etc.",
    "Buttons: use Button / Buttons with Action([@ToAssistant(\"message\")]) or @OpenUrl(\"https://...\").",
    "Never invent token addresses or chain IDs — call tools first.",
  ],
}

const bloomLibraryServer = createLibrary({
  id: "bloom-trading@3",
  root: "Stack",
  componentGroups: [...openuiComponentGroups, tradingComponentGroup],
  components: [
    ...Object.values(openuiLibrary.components),
    ...TRADING_COMPONENTS,
  ],
})

export const bloomLibrarySpec = bloomLibraryServer.toSpec()
