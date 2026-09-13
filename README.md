# Bloom — The Bloomberg terminal of trading, run autonomously with agents

Bloom is the Bloomberg terminal of trading, powered by autonomous AI agents. Users talk to an agent in plain words, and it researches markets, executes trades, and manages positions across Uniswap V2, V3, and V4 — all displayed on live, interactive dashboards.

## What it does

- **Natural language trading** — Tell the agent what you want: swap tokens, build a DCA schedule, provide liquidity, or find arbitrage opportunities. The agent handles the research, quotes, and execution.
- **Live market intelligence** — Real-time pool data, price feeds, and portfolio tracking streamed from Uniswap subgraphs and Substreams across 8 chains.
- **Infinite canvas** — An OpenUI-powered workspace where trading widgets (price charts, pool tables, wallet balances, execution panels) live and update in real time.
- **Autonomous missions** — Set your agent to work in the background: periodic DCA, arbitrage scanning, or LP strategies with configurable risk guardrails.
- **Transaction Hub** — A floating panel showing all executed trades with status, route, and timing.
- **Content workflow** — Generate X/Twitter threads, LinkedIn posts, email newsletters, and SEO content from market data and trading activity.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS, React 19, Recharts, OpenUI |
| AI Agent | `ai` SDK, OpenAI, tool-calling with Zod validation |
| Auth & Wallet | Privy (embedded EVM wallets, Google/email sign-in) |
| Trading | Uniswap Trade API (`/quote`, `/swap`, `/order`, `/plan`, `/lp/*`), Uniswap V2/V3/V4 subgraphs via The Graph |
| Real-time Data | Substreams, The Graph, CoinGecko |
| Backend | PostgreSQL (Drizzle ORM), Redis (caching/streaming) |
| Infrastructure | Docker Compose |

## Getting started

### Prerequisites

- Node.js 20+
- Docker + Docker Compose

### Setup

```bash
# Clone and install
pnpm install

# Copy environment
cp .env.example .env.local

# Start infrastructure
docker compose up -d

# Run database migrations
pnpm db:generate && pnpm db:migrate

# Start dev server
pnpm dev
```

### Required environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET` | Privy authentication |
| `DATABASE_URL` | PostgreSQL connection |
| `REDIS_URL` | Redis for caching and event streaming |
| `UNISWAP_API_KEY` | Uniswap Trade API |
| `THE_GRAPH_API_KEY` | The Graph (subgraph queries) |
| `COINGECKO_API_KEY` | CoinGecko (token logos, prices) |
| `THESYS_API_KEY` | OpenUI Gateway |
| `SUBSTREAMS_API_TOKEN` | Substreams (real-time event streaming) |

## Architecture

```
┌──────────────────────────────────────────────┐
│              Next.js App (Browser)            │
│  Chat Interface · Infinite Canvas · Tx Hub   │
└──────────────┬───────────────────────────────┘
               │
┌──────────────▼───────────────────────────────┐
│            API Routes (/api/*)                │
│  /chat · /uniswap/trade · /uniswap/lp ·      │
│  /market · /canvas · /subgraph/query ·       │
│  /wallet · /auth                             │
└──────────────┬───────────────────────────────┘
               │
┌──────────────▼───────────────────────────────┐
│          Server Services                     │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐│
│  │ AI Agent │ │ Uniswap  │ │  Subgraph    ││
│  │ (tools)  │ │ Trade API│ │  Client      ││
│  └──────────┘ └──────────┘ └──────────────┘│
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐│
│  │  Wallet  │ │ Missions │ │  Substreams  ││
│  │ Executor │ │ (DCA/    │ │  Poller      ││
│  │          │ │  Arb/LP) │ │              ││
│  └──────────┘ └──────────┘ └──────────────┘│
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐│
│  │PostgreSQL│ │  Redis   │ │  Content     ││
│  │ (Drizzle)│ │ (cache)  │ │  Workflow    ││
│  └──────────┘ └──────────┘ └──────────────┘│
└──────────────────────────────────────────────┘
```

## Project structure

```
app/                    Next.js App Router pages and API routes
  app/chat/             Main trading chat interface
  app/api/              API routes (trade, lp, market, canvas, auth, subgraph, wallet)
  app/layout.tsx        Root layout with metadata
components/             UI components (chat, canvas, transaction hub, widgets)
server/services/        Server-side business logic
  agent/                AI agent configuration, system prompts, tool definitions
  canvas/               Canvas rendering and widget layout engine
  coingecko/            Token logo and price data
  db/                   Database schema, repositories
  market/               Price feeds, market data aggregation
  missions/             Autonomous mission engine (DCA, arb, LP) with guardrails
  redis/                Redis caching and pub/sub
  subgraph/             Subgraph registry and live query client (V2/V3/V4)
  substreams/           Substreams streaming and poller
  uniswap/              Trade API client, quote normalization, transaction repo, routing
  wallet/               Wallet executor, signing, transaction lifecycle
hooks/                  React hooks (wallet, market, canvas)
lib/                    Shared utilities, OpenUI components, types
workflows/              Content generation pipelines (X, LinkedIn, email, SEO)
scripts/                Worker scripts and operational tooling
docs/                   Documentation
```

## Key features in detail

### Trading agent tools

The AI agent has access to tool calls backed by live data:

- `list_subgraph_markets` — Discover available Uniswap V2/V3/V4 markets by version and chain
- `get_top_pools` — Live pools ranked by TVL across any version/chain
- `get_tokens_in_pools` — Token listings with logos from Uniswap + CoinGecko
- `get_pool_telemetry` — TVL and volume for any token pair
- `run_subgraph_query` — Raw GraphQL for advanced queries
- `quote` / `swap` / `order` / `plan` — Full execution lifecycle via Trade API
- `liquidity` — LP position management (create, increase, decrease, claim fees)

### Autonomous missions

Background-running strategies with guardrails:

- **DCA** — Split large buys into timed smaller purchases
- **Arbitrage scanner** — Monitor price differences across pools and chains
- **LP strategies** — Automated liquidity provision with fee monitoring

Each mission has configurable limits, stop conditions, and a manual override switch.

### Content workflow

Trading activity generates content automatically:

- X/Twitter threads from trade history and market insights
- LinkedIn posts for professional audience
- Email digests for periodic summaries
- SEO-optimized articles from market analysis

## Contributing

See [docs/QA_CHECKLIST.md](docs/QA_CHECKLIST.md) for the agent QA checklist and quality criteria.

## Links

- [The Graph Standardized Subgraphs](https://thegraph.com/docs/en/subgraphs/existing-subgraphs/standard-subgraphs/)
- [Uniswap Developer Portal](https://developers.uniswap.org/)
- [Substreams Documentation](https://substreams.io/)
- [Privy Documentation](https://docs.privy.io/)
- [OpenUI](https://openui.dev/)
