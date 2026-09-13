# Uniswap Stack — Developer Feedback

## Project: Bloom

## 1. What we built

Bloom is an AI-powered trading terminal where users talk to an autonomous agent that executes Uniswap trades, monitors live markets, and manages liquidity positions across V2, V3, and V4 on eight chains.

## 2. How we used the Uniswap Stack

**Uniswap Trade API** (`trade-api.gateway.uniswap.org/v1`):
- `/quote` — price quotes before any execution
- `/swap` — direct single-token swaps on V2 and V3
- `/swap_5792` and `/swap_7702` — v4 hook-based executions for advanced routing
- `/order` — limit and batch orders
- `/plan` — multi-step chained trades (DCA, arb ladders)
- `/lp/*` — liquidity provision: create, increase, decrease, claim fees, pool info
- `/check_approval`, `/permissions`, `/wallet/encode_7702` — pre-execution checks

**Uniswap Subgraphs** (The Graph):
- V2, V3, V4 subgraphs across Ethereum, Base, Arbitrum, Optimism, Polygon, BSC, Avalanche, Unichain
- Live queries for top pools by TVL, pair telemetry (volume, prices), token listings
- No data indexed into Bloom's own database — all market reads come from subgraphs directly

## 3. What worked well

- **Progressive execution model**: The separation of `/quote` → `/swap` vs `/order` vs `/plan` lets an agent choose the right complexity level for each task. A simple swap is one call; a multi-hop DCA is a `/plan` with steps.
- **v4 hook support**: The `swap_5792` and `swap_7702` endpoints give access to v4 hook-based execution, which is forward-looking and differentiating.
- **Subgraph version/chain matrix**: The Uniswap subgraph registry across three versions and eight chains provides comprehensive coverage. Our registry approach (env-overridable subgraph IDs) is clean and deployable across environments.
- **LP API**: The `/lp/*` endpoints are well-designed — check approval, create, increase, decrease, and claim fees cover the full liquidity lifecycle.
- **Subgraph composition**: We composed multiple subgraphs (V2, V3, V4) in a single agent decision loop, using the registry to route queries to the right subgraph ID per version+chain. One query pattern spanning many protocols.

## 4. Challenges and suggestions

- **Quote caching**: Repeated identical quotes hit the gateway independently. A short-lived in-memory or Redis cache keyed on pool+amount+side would reduce latency and gateway costs under heavy agent use.
- **Subgraph query costs**: Live subgraph queries on every agent decision loop can accumulate costs. A lightweight caching layer (even 30-second TTLs) on `getTopPools` and `getPoolTelemetry` would help.
- **Subgraph gaps on newer chains**: Some chain subgraph deployments are community-hosted rather than official. A verification or health-check endpoint for community subgraphs would improve reliability.
- **Rate limit transparency**: The Trade API rate limits are not well-documented. Better headers or documentation on throttling would help agents back off gracefully.

## 5. Innovation highlights

- **Agent-driven composition**: The AI agent uses subgraph queries to research markets, then the Trade API to execute — composing read (subgraph) and write (Trade API) in a single reasoning loop.
- **Plan-based batched execution**: Using `/plan` for multi-step strategies (DCA, arbitrage) is a powerful pattern that treats the Trade API as an orchestration layer, not just a swap endpoint.
- **Cross-version routing**: The agent decides between V2, V3, V4 execution paths based on the quote, automatically routing to the optimal endpoint.
