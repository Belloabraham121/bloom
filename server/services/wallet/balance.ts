import {
  createPublicClient,
  erc20Abi,
  formatEther,
  formatUnits,
  http,
  type Address,
  type Chain,
} from "viem"
import {
  arbitrum,
  base,
  mainnet,
  optimism,
  polygon,
} from "viem/chains"

const NATIVE_SYMBOL: Record<number, string> = {
  1: "ETH",
  10: "ETH",
  137: "POL",
  8453: "ETH",
  42161: "ETH",
}

const USDC: Partial<Record<number, Address>> = {
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  137: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
}

const CHAINS: Record<number, Chain> = {
  1: mainnet,
  10: optimism,
  137: polygon,
  8453: base,
  42161: arbitrum,
}

function rpcUrl(chainId: number): string {
  const fromEnv =
    process.env[`RPC_URL_${chainId}`] ||
    (chainId === 1 ? process.env.RPC_URL : undefined)
  if (fromEnv?.trim()) return fromEnv.trim()

  switch (chainId) {
    case 1:
      return "https://ethereum.publicnode.com"
    case 10:
      return "https://optimism.publicnode.com"
    case 137:
      return "https://polygon-bor.publicnode.com"
    case 8453:
      return "https://base.publicnode.com"
    case 42161:
      return "https://arbitrum-one.publicnode.com"
    default:
      throw new Error(`No RPC configured for chain ${chainId}`)
  }
}

function clientFor(chainId: number) {
  const chain = CHAINS[chainId]
  if (!chain) throw new Error(`Unsupported chain ${chainId}`)
  return createPublicClient({
    chain,
    transport: http(rpcUrl(chainId), { timeout: 20_000 }),
  })
}

export type WalletBalance = {
  chainId: number
  chainName: string
  address: string
  native: {
    symbol: string
    raw: string
    formatted: string
  }
  usdc: {
    symbol: "USDC"
    raw: string
    formatted: string
    address: string
  } | null
}

export async function getWalletBalance(params: {
  address: string
  chainId?: number
}): Promise<WalletBalance> {
  const chainId = params.chainId ?? 1
  const chain = CHAINS[chainId]
  if (!chain) throw new Error(`Unsupported chain ${chainId}`)

  const address = params.address as Address
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Invalid wallet address")
  }

  const client = clientFor(chainId)
  const nativeRaw = await client.getBalance({ address })
  const nativeSymbol = NATIVE_SYMBOL[chainId] || "ETH"

  let usdc: WalletBalance["usdc"] = null
  const usdcAddress = USDC[chainId]
  if (usdcAddress) {
    try {
      const raw = await client.readContract({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      })
      usdc = {
        symbol: "USDC",
        raw: raw.toString(),
        formatted: formatUnits(raw, 6),
        address: usdcAddress,
      }
    } catch {
      usdc = null
    }
  }

  return {
    chainId,
    chainName: chain.name,
    address,
    native: {
      symbol: nativeSymbol,
      raw: nativeRaw.toString(),
      formatted: formatEther(nativeRaw),
    },
    usdc,
  }
}

export function formatBalanceDisplay(value: string, digits = 6): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  if (n === 0) return "0"
  if (n < 0.000001) return "<0.000001"
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
  })
}
