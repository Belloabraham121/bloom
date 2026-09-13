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
    preparedJson: z.string().optional(),
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

const CanvasSlot = defineComponent({
  name: "CanvasSlot",
  description:
    "Named OpenUI region. Place once in CanvasWorld with x,y; update via patch_canvas. Use add_dashboard only when the user asks for another dashboard.",
  props: z.object({
    slotId: z.string(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  component: noop,
})

const LiveMarketSwitcher = defineComponent({
  name: "LiveMarketSwitcher",
  description:
    "Buttons to switch the live watched pair (USDC/ETH, USDC/WBTC, …). Place in live Stack after start_market_watch.",
  props: z.object({
    title: z.string().optional(),
  }),
  component: noop,
})

const LiveMarketChart = defineComponent({
  name: "LiveMarketChart",
  description:
    "Live price sparkline chart. Emit after start_market_watch with LiveMarketTick.",
  props: z.object({
    title: z.string().optional(),
  }),
  component: noop,
})

const CanvasFrame = defineComponent({
  name: "CanvasFrame",
  description:
    "Wrap OpenUI children at x,y (px) on the infinite canvas. Prefer CanvasSlot with coordinates for editable regions.",
  props: z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    children: z.array(z.any()),
  }),
  component: noop,
})

const CanvasWorld = defineComponent({
  name: "CanvasWorld",
  description:
    "Positioned plane for absolute CanvasSlot children. Use as world inside root Stack for multi-dashboard layouts.",
  props: z.object({
    children: z.array(z.any()),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
  component: noop,
})

const BalanceBoard = defineComponent({
  name: "BalanceBoard",
  description:
    "Multi-chain wallet balances. Pass rowsJson from get_wallet_balances tool (JSON array of {chainId,chainName,native,usdc,error?}).",
  props: z.object({
    title: z.string().optional(),
    rowsJson: z.string(),
  }),
  component: noop,
})

const ConfirmSend = defineComponent({
  name: "ConfirmSend",
  description:
    "Confirm a prepared transfer. Include preparedJson from prepare_transfer.",
  props: z.object({
    to: z.string(),
    amount: z.string(),
    chainId: z.number(),
    token: z.string().optional(),
    preparedJson: z.string().optional(),
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
  ConfirmSend,
  BalanceBoard,
  CostBreakdown,
  TxStatusCard,
  GaslessOrderCard,
  ChainedPlanCard,
  LpPositionCard,
  PoolTelemetry,
  LiveActivity,
  LiveMarketSwitcher,
  LiveTradeTape,
  LiveMarketTick,
  LiveMarketChart,
  InflightTrade,
  CanvasSlot,
  CanvasFrame,
  CanvasWorld,
  Root,
]

const tradingComponentGroup: ComponentGroup = {
  name: "Trading",
  components: TRADING_COMPONENTS.map((c) => c.name),
  notes: [
    "- First paint: Stack([CanvasWorld([CanvasSlot(id,x,y)...])]).",
    "- Updates: patch_canvas on widgetId; add_dashboard only when user asks for another panel.",
    "- Never rebuild root Stack after first paint.",
    "- Token discovery → TokenList + TokenRow. Chains → ChainList + ChainRow.",
    "- Prefer Button with Action([@ToAssistant(\"...\")]) for confirm / follow-up clicks.",
  ],
}

const basePromptOptions = (openuiBase.promptOptions ?? {}) as PromptOptions

export const bloomPromptOptions: PromptOptions = {
  examples: [
    ...(basePromptOptions.examples ?? []),
    `Example — quote after shell exists (REQUIRED pattern):

Call get_quote with body={{tokenIn:"USDC", tokenOut:"WETH", amount:"100", tokenInChainId:1, tokenOutChainId:1}}
That tool paints CanvasSlot("quote") with QuoteSummary + ConfirmTx.
Reply with short plain text only — never emit root = Stack for quotes.`,
    `Example — first paint spatial shell:

root = Stack([world])
world = CanvasWorld([title, live_slot, quote_slot])
title = TextContent("Trading desk", "large-heavy")
live_slot = CanvasSlot("live", 40, 80)
quote_slot = CanvasSlot("quote", 520, 80)

Then ONLY patch_canvas / get_quote / start_market_watch / add_dashboard.`,
    `Example — another scene/dashboard:

patch_canvas op=add_dashboard widgetId=analytics data={{openui:"Stack([title, tbl])\\ntitle = TextContent(\\"Pools\\", \\"large-heavy\\")\\n..."}}`,
    `Example — live market:

Call start_market_watch symbol0=USDC symbol1=ETH (seeds live slot). Do not rebuild shell.`,
  ],
  additionalRules: [
    ...(basePromptOptions.additionalRules ?? []),
    "First paint only: root = Stack([CanvasWorld([...])]). After that NEVER emit root = Stack — use tools that patch the canvas.",
    "Quotes: call get_quote — it updates the quote panel automatically.",
    "New scenes: patch_canvas op=add_dashboard. Edits: patch_canvas op=replace widgetId=...",
    "Live: start_market_watch then leave Live* in the live slot (auto-seeded).",
    "For Uniswap trading flows prefer Trading components inside slot patches (QuoteSummary, ConfirmTx, TokenList, PoolTelemetry).",
    "When a tool returns logoUrl, pass it as TokenRow's fourth argument so the icon renders.",
    "Buttons: use Button / Buttons with Action([@ToAssistant(\"message\")]) or @OpenUrl(\"https://...\").",
    "Never invent token addresses, chain IDs, or logo URLs — call tools first.",
  ],
}

const tradingLibrary = createLibrary({
  id: "bloom-trading-only@4",
  root: "MessageText",
  components: TRADING_COMPONENTS,
})
const tradingSpec = tradingLibrary.toSpec()

const baseSchema = openuiBase.schema as {
  $defs?: Record<string, unknown>
  [key: string]: unknown
}
const tradingSchema = tradingLibrary.toJSONSchema() as {
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
