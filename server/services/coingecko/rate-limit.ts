/**
 * Sliding-window rate limiter for CoinGecko (Demo ≈ 100 rpm; leave headroom).
 * Serializes acquires so concurrent callers cannot burst past the budget.
 */

export class SlidingWindowRateLimiter {
  private timestamps: number[] = []
  private chain: Promise<void> = Promise.resolve()

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number = 60_000
  ) {}

  /** Wait until a request slot is available, then consume it. */
  async acquire(): Promise<void> {
    const run = async () => {
      for (;;) {
        const now = Date.now()
        this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs)
        if (this.timestamps.length < this.maxPerWindow) {
          this.timestamps.push(now)
          return
        }
        const oldest = this.timestamps[0]!
        const waitMs = this.windowMs - (now - oldest) + 25
        await sleep(Math.max(waitMs, 50))
      }
    }

    const next = this.chain.then(run, run)
    this.chain = next.catch(() => {})
    await next
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
