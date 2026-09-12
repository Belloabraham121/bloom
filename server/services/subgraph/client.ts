/**
 * On-demand Uniswap V2 / V3 / V4 subgraph queries via The Graph.
 * No indexing into Bloom Postgres — agents call this live with THE_GRAPH_API_KEY.
 */

import {
  getChainName,
  listSubgraphMarkets,
  resolveSubgraphId,
  type UniswapVersion,
} from "./registry"

const GRAPH_GATEWAY = "https://gateway.thegraph.com/api"

export { listSubgraphMarkets, resolveSubgraphId, type UniswapVersion }

function requireApiKey() {
  const apiKey = process.env.THE_GRAPH_API_KEY
  if (!apiKey) {
    throw new Error("THE_GRAPH_API_KEY is not configured")
  }
  return apiKey
}

export async function queryUniswapSubgraph(params: {
  version: UniswapVersion
  chainId: number
  query: string
  variables?: Record<string, unknown>
}) {
  const apiKey = requireApiKey()
  const subgraphId = resolveSubgraphId(params.version, params.chainId)

  if (!subgraphId) {
    const available = listSubgraphMarkets()
      .map((m) => `${m.version}/${m.chainName}(${m.chainId})`)
      .join(", ")
    throw new Error(
      `No Uniswap ${params.version} subgraph for chain ${params.chainId} (${getChainName(params.chainId)}). ` +
        `Available: ${available}. Override with UNISWAP_SUBGRAPH_${params.version.toUpperCase()}_${params.chainId}.`
    )
  }

  const url = `${GRAPH_GATEWAY}/${apiKey}/subgraphs/id/${subgraphId}`

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query: params.query,
      variables: params.variables ?? {},
    }),
  })

  const json = (await res.json()) as {
    data?: unknown
    errors?: Array<{ message: string }>
  }

  if (!res.ok || json.errors?.length) {
    throw new Error(
      json.errors?.map((e) => e.message).join("; ") ||
        `Subgraph query failed (${res.status}) for ${params.version} chain ${params.chainId}`
    )
  }

  return {
    version: params.version,
    chainId: params.chainId,
    chainName: getChainName(params.chainId),
    subgraphId,
    data: json.data,
  }
}

/** Top pools / pairs by liquidity for a version+chain. */
export async function getTopPools(params: {
  version?: UniswapVersion
  chainId?: number
  first?: number
}) {
  const version = params.version ?? "v3"
  const chainId = params.chainId ?? 1
  const first = Math.min(params.first ?? 10, 25)

  if (version === "v2") {
    const result = await queryUniswapSubgraph({
      version,
      chainId,
      query: `
        query TopPairs($first: Int!) {
          pairs(first: $first, orderBy: reserveUSD, orderDirection: desc) {
            id
            reserveUSD
            volumeUSD
            token0 { id symbol name decimals }
            token1 { id symbol name decimals }
          }
        }
      `,
      variables: { first },
    })
    const pairs = ((result.data as { pairs?: PoolRow[] }).pairs || []).map(
      (p) => normalizePoolRow(p, "v2")
    )
    return { ...result, pools: pairs, data: { pairs, pools: pairs } }
  }

  // V3 + V4 share a pools entity with TVL in the public Uniswap deployments
  const result = await queryUniswapSubgraph({
    version,
    chainId,
    query: `
      query TopPools($first: Int!) {
        pools(first: $first, orderBy: totalValueLockedUSD, orderDirection: desc) {
          id
          feeTier
          totalValueLockedUSD
          volumeUSD
          token0Price
          token1Price
          token0 { id symbol name decimals }
          token1 { id symbol name decimals }
        }
      }
    `,
    variables: { first },
  })
  const pools = ((result.data as { pools?: PoolRow[] }).pools || []).map(
    (p) => normalizePoolRow(p, version)
  )
  return { ...result, pools, data: { pools } }
}

type TokenRef = { id: string; symbol: string; name: string; decimals: string }
type PoolRow = {
  id: string
  feeTier?: string
  totalValueLockedUSD?: string
  reserveUSD?: string
  volumeUSD?: string
  token0Price?: string
  token1Price?: string
  token0?: TokenRef
  token1?: TokenRef
}

function normalizePoolRow(row: PoolRow, version: UniswapVersion) {
  return {
    id: row.id,
    version,
    feeTier: row.feeTier ?? null,
    tvlUsd: row.totalValueLockedUSD ?? row.reserveUSD ?? null,
    volumeUsd: row.volumeUSD ?? null,
    token0Price: row.token0Price ?? null,
    token1Price: row.token1Price ?? null,
    token0: row.token0 ?? null,
    token1: row.token1 ?? null,
    pairLabel:
      row.token0?.symbol && row.token1?.symbol
        ? `${row.token0.symbol}/${row.token1.symbol}`
        : row.id,
  }
}

/** Pool / pair telemetry for a token pair. */
export async function getPoolTelemetry(params: {
  version?: UniswapVersion
  chainId?: number
  token0: string
  token1: string
}) {
  const version = params.version ?? "v3"
  const chainId = params.chainId ?? 1
  const token0 = params.token0.toLowerCase()
  const token1 = params.token1.toLowerCase()

  if (version === "v2") {
    const [a, b] = await Promise.all([
      queryUniswapSubgraph({
        version,
        chainId,
        query: `
          query PairTelemetry($token0: String!, $token1: String!) {
            pairs(
              first: 5
              orderBy: reserveUSD
              orderDirection: desc
              where: { token0: $token0, token1: $token1 }
            ) {
              id
              reserveUSD
              volumeUSD
              token0 { id symbol name decimals }
              token1 { id symbol name decimals }
            }
          }
        `,
        variables: { token0, token1 },
      }),
      queryUniswapSubgraph({
        version,
        chainId,
        query: `
          query PairTelemetryRev($token0: String!, $token1: String!) {
            pairs(
              first: 5
              orderBy: reserveUSD
              orderDirection: desc
              where: { token0: $token1, token1: $token0 }
            ) {
              id
              reserveUSD
              volumeUSD
              token0 { id symbol name decimals }
              token1 { id symbol name decimals }
            }
          }
        `,
        variables: { token0, token1 },
      }),
    ])
    const pairs = [
      ...((a.data as { pairs?: unknown[] }).pairs || []),
      ...((b.data as { pairs?: unknown[] }).pairs || []),
    ]
    return { ...a, data: { pairs } }
  }

  const [forward, reverse] = await Promise.all([
    queryUniswapSubgraph({
      version,
      chainId,
      query: `
        query PoolTelemetry($token0: String!, $token1: String!) {
          pools(
            first: 5
            orderBy: totalValueLockedUSD
            orderDirection: desc
            where: { token0: $token0, token1: $token1 }
          ) {
            id
            feeTier
            totalValueLockedUSD
            volumeUSD
            token0 { id symbol name decimals }
            token1 { id symbol name decimals }
            poolDayData(first: 1, orderBy: date, orderDirection: desc) {
              volumeUSD
              tvlUSD
              high
              low
            }
          }
        }
      `,
      variables: { token0, token1 },
    }),
    queryUniswapSubgraph({
      version,
      chainId,
      query: `
        query PoolTelemetryRev($token0: String!, $token1: String!) {
          pools(
            first: 5
            orderBy: totalValueLockedUSD
            orderDirection: desc
            where: { token0: $token1, token1: $token0 }
          ) {
            id
            feeTier
            totalValueLockedUSD
            volumeUSD
            token0 { id symbol name decimals }
            token1 { id symbol name decimals }
            poolDayData(first: 1, orderBy: date, orderDirection: desc) {
              volumeUSD
              tvlUSD
              high
              low
            }
          }
        }
      `,
      variables: { token0, token1 },
    }),
  ])
  const pools = [
    ...((forward.data as { pools?: unknown[] }).pools || []),
    ...((reverse.data as { pools?: unknown[] }).pools || []),
  ]
  return { ...forward, data: { pools } }
}

/**
 * Tokens appearing in top pools on a chain/version (live from subgraph, not DB).
 */
export async function getTokensInPools(params: {
  version?: UniswapVersion
  chainId?: number
  first?: number
  search?: string
}) {
  const top = await getTopPools({
    version: params.version ?? "v3",
    chainId: params.chainId ?? 1,
    first: Math.min(params.first ?? 20, 40),
  })

  const data = top.data as {
    pools?: Array<{
      token0?: { id: string; symbol: string; name: string; decimals: string }
      token1?: { id: string; symbol: string; name: string; decimals: string }
    }>
    pairs?: Array<{
      token0?: { id: string; symbol: string; name: string; decimals: string }
      token1?: { id: string; symbol: string; name: string; decimals: string }
    }>
  }

  const rows = data.pools || data.pairs || []
  const byId = new Map<
    string,
    { id: string; symbol: string; name: string; decimals: string }
  >()

  for (const row of rows) {
    for (const t of [row.token0, row.token1]) {
      if (!t?.id) continue
      byId.set(t.id.toLowerCase(), t)
    }
  }

  let tokens = [...byId.values()]
  const q = params.search?.trim().toLowerCase()
  if (q) {
    tokens = tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
    )
  }

  return {
    version: top.version,
    chainId: top.chainId,
    chainName: top.chainName,
    subgraphId: top.subgraphId,
    tokens,
  }
}

/** Raw GraphQL passthrough for power users / agent flexibility. */
export async function runSubgraphQuery(params: {
  version: UniswapVersion
  chainId: number
  query: string
  variables?: Record<string, unknown>
}) {
  return queryUniswapSubgraph(params)
}
