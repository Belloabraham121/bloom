import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

const connectionString = process.env.DATABASE_URL
if (!connectionString && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL must be set in production")
}
const effectiveUrl = connectionString || "postgresql://bloom:bloom@localhost:5433/bloom"

const globalForDb = globalThis as unknown as {
  bloomSql?: ReturnType<typeof postgres>
}

function getSql() {
  if (!globalForDb.bloomSql) {
    globalForDb.bloomSql = postgres(effectiveUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 3,
    })
  }
  return globalForDb.bloomSql
}

export const db = drizzle(getSql(), { schema })
