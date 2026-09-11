import { NextResponse } from "next/server"
import { requirePrivyUser } from "@/server/lib/auth"
import {
  getPoolTelemetry,
  getTokensInPools,
  getTopPools,
  listSubgraphMarkets,
  queryUniswapSubgraph,
  type UniswapVersion,
} from "@/server/services/subgraph/client"

function parseVersion(v: unknown): UniswapVersion | undefined {
  if (v === "v2" || v === "v3" || v === "v4") return v
  return undefined
}

export async function GET(request: Request) {
  try {
    await requirePrivyUser(request)
    return NextResponse.json({ markets: listSubgraphMarkets() })
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: number }).status)
        : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    await requirePrivyUser(request)
    const body = await request.json()
    const version = parseVersion(body.version)
    const chainId =
      typeof body.chainId === "number" ? body.chainId : undefined

    if (body.action === "markets") {
      return NextResponse.json({ markets: listSubgraphMarkets() })
    }

    if (body.action === "top_pools") {
      const data = await getTopPools({
        version,
        chainId,
        first: typeof body.first === "number" ? body.first : undefined,
      })
      return NextResponse.json({ data })
    }

    if (body.action === "tokens_in_pools") {
      const data = await getTokensInPools({
        version,
        chainId,
        first: typeof body.first === "number" ? body.first : undefined,
        search: typeof body.search === "string" ? body.search : undefined,
      })
      return NextResponse.json({ data })
    }

    if (body.token0 && body.token1) {
      const data = await getPoolTelemetry({
        version,
        chainId,
        token0: String(body.token0),
        token1: String(body.token1),
      })
      return NextResponse.json({ data })
    }

    if (body.query) {
      if (!version || typeof chainId !== "number") {
        return NextResponse.json(
          { error: "Raw query requires version (v2|v3|v4) and chainId" },
          { status: 400 }
        )
      }
      const data = await queryUniswapSubgraph({
        version,
        chainId,
        query: String(body.query),
        variables: body.variables,
      })
      return NextResponse.json({ data })
    }

    return NextResponse.json(
      {
        error:
          "Provide action=markets|top_pools|tokens_in_pools, token0+token1, or a GraphQL query with version+chainId",
      },
      { status: 400 }
    )
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: number }).status)
        : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Subgraph query failed" },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
}
