import { defineConfig } from "drizzle-kit"
import { config } from "dotenv"

config({ path: ".env.local" })

export default defineConfig({
  schema: "./server/services/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://bloom:bloom@localhost:5433/bloom",
  },
})
