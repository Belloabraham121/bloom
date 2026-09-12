/**
 * AgentQA smoke — no live Privy required.
 * Usage: npx tsx scripts/agentqa-smoke.ts
 *
 * Exit 0 = PASS. Live Privy paths remain deferred:manual in QA_CHECKLIST.
 */

import { evaluateAllowlistsForTest } from "../server/services/missions/guardrails"
import { prepareTransfer } from "../server/services/wallet/transfer"
import {
  normalizeOpenUIContent,
  looksLikeOpenUI,
  parseLiveMarketControl,
} from "../lib/openui/detect"

let failed = 0

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.info(`PASS  ${name}`)
  } else {
    failed += 1
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

function main() {
  // Guardrails
  const g = evaluateAllowlistsForTest(
    {
      allowlistChainIds: [1, 8453],
      allowlistTokens: ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"],
      maxNotionalUsd: 100,
    },
    {
      chainId: 1,
      tokenIn: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      tokenOut: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      amountIn: "50",
      maxFromParams: 100,
    }
  )
  assert("allowlist accepts eth + USDC in", g.chain === null)
  assert("allowlist rejects WETH out", g.token !== null)
  assert("notional 50 under 100", g.notional === null)

  const g2 = evaluateAllowlistsForTest(
    { maxNotionalUsd: 10 },
    { amountIn: "25", maxFromParams: 10 }
  )
  assert("notional blocks over cap", g2.notional !== null)

  // Transfer prepare
  const native = prepareTransfer({
    chainId: 1,
    to: "0x0000000000000000000000000000000000000001",
    amount: "0.01",
    token: "native",
  })
  assert("native transfer data is 0x", native.data === "0x")
  assert("native transfer has value", native.value.startsWith("0x"))

  const usdc = prepareTransfer({
    chainId: 1,
    to: "0x0000000000000000000000000000000000000001",
    amount: "1.5",
    token: "usdc",
  })
  assert("usdc transfer encodes calldata", usdc.data.startsWith("0x") && usdc.data.length > 10)

  // OpenUI normalize / live controls
  const framed =
    "]]" +
    ">openui:content?thesys=true\nroot = Stack([a])\na = TextContent(\"hi\")\n]]" +
    ">openui:end"
  const norm = normalizeOpenUIContent(framed)
  assert("normalize strips thesys framing", norm.includes("root = Stack"))
  assert("looksLikeOpenUI", looksLikeOpenUI(norm))
  assert(
    "parseLiveMarketControl pause",
    parseLiveMarketControl("Pause live market watch") === "pause"
  )

  // Strategy module loads
  void import("../server/services/missions/strategies").then(() => {
    assert("strategies module loads", true)
    finish()
  }).catch((e) => {
    assert("strategies module loads", false, String(e))
    finish()
  })
}

function finish() {
  console.info(failed === 0 ? "\nAgentQA smoke: PASS" : `\nAgentQA smoke: FAIL (${failed})`)
  process.exit(failed === 0 ? 0 : 1)
}

main()
