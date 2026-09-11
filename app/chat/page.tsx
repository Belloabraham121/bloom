"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { usePrivy } from "@privy-io/react-auth"
import { ChatShell } from "@/components/chat/chat-shell"
import { AnimatedOrb } from "@/components/chat/animated-orb"
import { findPrivyEvmWallet, shortenAddress } from "@/lib/privy-wallet"

export default function ChatPage() {
  const router = useRouter()
  const { ready, authenticated, user, getAccessToken } = usePrivy()

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace("/auth")
    }
  }, [ready, authenticated, router])

  useEffect(() => {
    if (!ready || !authenticated || !user) return
    const wallet = findPrivyEvmWallet(user)
    void (async () => {
      try {
        const token = await getAccessToken()
        if (!token) return
        await fetch("/api/users/me", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            walletAddress: wallet?.address,
            privyWalletId: wallet?.privyWalletId,
            email:
              user.email?.address || user.google?.email || null,
          }),
        })
      } catch {
        // non-blocking upsert
      }
    })()
  }, [ready, authenticated, user, getAccessToken])

  if (!ready || !authenticated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <AnimatedOrb size={64} />
      </main>
    )
  }

  const email =
    user.email?.address ||
    user.google?.email ||
    user.wallet?.address ||
    "signed-in"
  const wallet = findPrivyEvmWallet(user)
  const displayName =
    user.google?.name ||
    (wallet ? shortenAddress(wallet.address) : email.split("@")[0])

  return (
    <ChatShell
      userEmail={email}
      userName={displayName}
      walletAddress={wallet?.address}
    />
  )
}
