import { NextResponse } from "next/server"
import { requirePrivyUser } from "@/server/lib/auth"
import {
  getTransaction,
  listTransactionsForUser,
} from "@/server/services/uniswap/transactions.repo"

export async function GET(request: Request) {
  try {
    const user = await requirePrivyUser(request)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (id) {
      const row = await getTransaction(id, user.id)
      if (!row) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
      }
      return NextResponse.json(row)
    }
    const limit = Number(searchParams.get("limit") || 30)
    const rows = await listTransactionsForUser(user.id, { limit })
    return NextResponse.json({ transactions: rows })
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: number }).status)
        : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
}
