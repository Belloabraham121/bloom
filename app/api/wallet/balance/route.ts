import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { requirePrivyUser } from "@/server/lib/auth"
import { db } from "@/server/services/db/client"
import { wallets } from "@/server/services/db/schema"
import {
  formatBalanceDisplay,
  getWalletBalance,
} from "@/server/services/wallet/balance"

export async function GET(request: Request) {
  try {
    const user = await requirePrivyUser(request)
    const { searchParams } = new URL(request.url)
    const chainIdParam = searchParams.get("chainId")
    const chainId = chainIdParam ? Number(chainIdParam) : 1
    if (!Number.isFinite(chainId)) {
      return NextResponse.json({ error: "Invalid chainId" }, { status: 400 })
    }

    const addressParam = searchParams.get("address")
    let address = addressParam?.trim() || null

    if (!address) {
      const wallet = await db.query.wallets.findFirst({
        where: eq(wallets.userId, user.id),
      })
      address = wallet?.address || null
    }

    if (!address) {
      return NextResponse.json(
        { error: "No wallet address found for this account" },
        { status: 404 }
      )
    }

    const balance = await getWalletBalance({ address, chainId })
    return NextResponse.json({
      ...balance,
      nativeDisplay: `${formatBalanceDisplay(balance.native.formatted)} ${balance.native.symbol}`,
      usdcDisplay: balance.usdc
        ? `${formatBalanceDisplay(balance.usdc.formatted, 2)} USDC`
        : null,
    })
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: number }).status)
        : 500
    console.error("[wallet/balance]", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load balance",
      },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
}
