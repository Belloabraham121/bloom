import type { User } from "@privy-io/react-auth"

export type PrivyEvmWallet = {
  privyWalletId: string
  address: string
}

function isPrivyEmbeddedWallet(account: { walletClientType?: string }): boolean {
  return (
    account.walletClientType === "privy" || account.walletClientType === "privy-v2"
  )
}

/** Find the user's Privy embedded EVM wallet. */
export function findPrivyEvmWallet(user: User | null): PrivyEvmWallet | null {
  if (!user) return null

  for (const account of user.linkedAccounts) {
    if (account.type !== "wallet") continue
    if (account.chainType !== "ethereum") continue
    if (!isPrivyEmbeddedWallet(account)) continue
    if (!account.id) continue

    return {
      privyWalletId: account.id,
      address: account.address,
    }
  }

  return null
}

export function shortenAddress(address: string, chars = 4): string {
  if (address.length < chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}
