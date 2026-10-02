import { getQueueBacklogDepth } from './get-queue-stats.mts'

const cache = new Map<string, { fetchedAt: number; promise: Promise<number> }>()

export function getQueueBacklogDepthCached(name: string, ttlMs: number): Promise<number> {
  const entry = cache.get(name)
  const now = Date.now()
  if (entry && now - entry.fetchedAt < ttlMs) {
    return entry.promise
  }
  const promise: Promise<number> = getQueueBacklogDepth(name).catch(err => {
    if (cache.get(name)?.promise === promise) {
      cache.delete(name)
    }
    throw err as Error
  })
  cache.set(name, { fetchedAt: now, promise })
  return promise
}

export function clearQueueStatsCacheForTesting(): void {
  cache.clear()
}
