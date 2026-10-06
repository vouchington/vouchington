import { vi } from 'vitest'

type UserMetricsFill = {
  setBySerializedKeyIfNotInvalidated(
    serializedKey: string,
    value: unknown,
    ttl?: number,
  ): Promise<void>
}

/** The read-through fill discards `setBySerializedKeyIfNotInvalidated`. Capture that promise. */
export function trackUserMetricsFills(cache: object, pending: Promise<unknown>[]): () => void {
  const target = cache as unknown as UserMetricsFill
  const fill = target.setBySerializedKeyIfNotInvalidated
  const spy = vi
    .spyOn(target, 'setBySerializedKeyIfNotInvalidated')
    .mockImplementation((serializedKey, value, ttl) => {
      const result = fill.call(target, serializedKey, value, ttl)
      pending.push(result)
      return result
    })
  return () => spy.mockRestore()
}
