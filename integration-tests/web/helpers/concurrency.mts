import { ASSET_CONCURRENCY_PATH } from './concurrency-broker.mts'

export function createCrossProcessConcurrencyLimiter(origin: string) {
  const slotUrl = new URL(ASSET_CONCURRENCY_PATH, origin)

  return async function runWithConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
    const lease = await fetch(slotUrl, { signal: AbortSignal.timeout(60_000) })
    if (!lease.ok) {
      await lease.body?.cancel()
      throw new Error(`asset concurrency broker returned ${lease.status}`)
    }
    try {
      return await fn()
    } finally {
      await lease.body?.cancel()
    }
  }
}
