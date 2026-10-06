import { caches } from '@services/entity-cache/caches'
import { vi } from 'vitest'

type UserMetricsFill = {
  setBySerializedKeyIfNotInvalidated(
    serializedKey: string,
    value: unknown,
    ttl?: number,
  ): Promise<void>
}

/** The read-through fill discards `setBySerializedKeyIfNotInvalidated`. Capture that promise. */
export function trackUserMetricsFills(pending: Promise<unknown>[]): () => void {
  const cache = caches.user_metrics as unknown as UserMetricsFill
  const fill = cache.setBySerializedKeyIfNotInvalidated
  const spy = vi
    .spyOn(cache, 'setBySerializedKeyIfNotInvalidated')
    .mockImplementation((serializedKey, value, ttl) => {
      const result = fill.call(cache, serializedKey, value, ttl)
      pending.push(result)
      return result
    })
  return () => spy.mockRestore()
}
