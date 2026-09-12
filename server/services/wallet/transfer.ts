/**
 * Native / USDC transfer preparation for Privy broadcast.
 */

import {
  encodeFunctionData,
  erc20Abi,
  isAddress,
  parseEther,
  parseUnits,
  type Address,
  type Hex,
} from "viem"

const USDC: Partial<Record<number, Address>> = {
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  137: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
}

export type PreparedTransfer = {
  chainId: number
  to: string
  data: string
  value: string
  category: "transfer"
  token: "native" | "usdc"
  amount: string
  requestPayload: Record<string, unknown>
}

export function prepareTransfer(params: {
  chainId: number
  to: string
  amount: string
  token?: "native" | "usdc"
}): PreparedTransfer {
  const token = params.token ?? "native"
  const to = params.to.trim()
  if (!isAddress(to)) {
    throw new Error("Invalid recipient address")
  }
  const amount = params.amount.trim()
  if (!amount || Number(amount) <= 0) {
    throw new Error("Invalid amount")
  }

  if (token === "native") {
    const value = parseEther(amount)
    return {
      chainId: params.chainId,
      to,
      data: "0x",
      value: `0x${value.toString(16)}` as Hex,
      category: "transfer",
      token,
      amount,
      requestPayload: { chainId: params.chainId, to, amount, token },
    }
  }

  const usdc = USDC[params.chainId]
  if (!usdc) {
    throw new Error(`USDC not configured for chain ${params.chainId}`)
  }
  const raw = parseUnits(amount, 6)
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [to as Address, raw],
  })
  return {
    chainId: params.chainId,
    to: usdc,
    data,
    value: "0x0",
    category: "transfer",
    token,
    amount,
    requestPayload: {
      chainId: params.chainId,
      to,
      amount,
      token,
      tokenContract: usdc,
    },
  }
}
