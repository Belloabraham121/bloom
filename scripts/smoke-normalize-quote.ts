import { normalizeQuoteBody } from "../server/services/uniswap/normalize-quote"

async function main() {
  const { body, warnings } = await normalizeQuoteBody(
    {
      tokenIn: "USDC",
      tokenOut: "ETH",
      amount: "100",
      tokenInChainId: 1,
      tokenOutChainId: 1,
    },
    { decisionOrigin: "human_mediated", swapper: null }
  )
  if (body.tokenIn !== "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48") {
    throw new Error("bad tokenIn " + body.tokenIn)
  }
  if (body.amount !== "100000000") {
    throw new Error("bad amount " + body.amount)
  }
  console.log("normalize-quote smoke ok", { warnings, amount: body.amount })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
