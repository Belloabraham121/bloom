import { buildQuoteSlotOpenui } from "../server/services/canvas/quote-openui"

const s = buildQuoteSlotOpenui({
  symbolIn: "USDC",
  symbolOut: "WETH",
  amountInHuman: "100",
  amountOutDisplay: "0.04",
  routing: "CLASSIC",
  preparedJson: JSON.stringify({
    chainId: 1,
    to: "0xabc",
    data: "0xdead",
    value: "0x0",
    category: "swap",
  }),
  summary: "Swap 100",
})

if (!s.includes(", null, \"")) {
  throw new Error("expected ConfirmTx(..., null, preparedJson, true)\n" + s)
}
if (!s.includes("0xdead")) {
  throw new Error("preparedJson missing from OpenUI\n" + s)
}
console.log("quote-openui smoke ok")
