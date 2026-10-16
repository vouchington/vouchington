import {
  QUEUE_DOMAIN_CONTROLS_CHANGED_KEY,
  queueDomainControlsPubSub,
} from '@data-stores/valkey-pubsub'
import { getPauseCacheMs } from '@queues/background/config'
import { getQueueDomainControl } from './read.mts'

type CachedPause = { paused: boolean; expiresAt: number }

const cache = new Map<string, CachedPause>()
const inFlight = new Map<string, Promise<boolean>>()
// A change published while a read is in flight must win over that read's older answer.
const generations = new Map<string, number>()

/**
 * Whether a domain is paused, from this process's short-lived cache. The TTL is the
 * `pause_cache_ms` DynamicConfig field; a published change clears the entry sooner.
 */
export function isQueueDomainPaused(domain: string): Promise<boolean> {
  const cached = cache.get(domain)
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.paused)
  const pending = inFlight.get(domain)
  if (pending) return pending
  const read = readAndCache(domain).finally(() => inFlight.delete(domain))
  inFlight.set(domain, read)
  return read
}

async function readAndCache(domain: string): Promise<boolean> {
  const generation = generations.get(domain) ?? 0
  const { paused } = await getQueueDomainControl(domain)
  if ((generations.get(domain) ?? 0) === generation) {
    cache.set(domain, { paused, expiresAt: Date.now() + getPauseCacheMs() })
  }
  return paused
}

/** Drops a domain's cached state so the next job re-reads it. */
export function invalidateQueueDomainPause(domain: string): void {
  generations.set(domain, (generations.get(domain) ?? 0) + 1)
  cache.delete(domain)
}

/**
 * Subscribes this process to pause changes published by the API. Close it with the worker.
 * `onInvalidated` observes each cleared entry, for callers that must wait on a change.
 */
export async function watchQueueDomainControls(
  onInvalidated?: (domain: string) => void,
): Promise<{ close(): Promise<void> }> {
  const subscription = await queueDomainControlsPubSub.subscribe(QUEUE_DOMAIN_CONTROLS_CHANGED_KEY)
  subscription.setHandler(change => {
    invalidateQueueDomainPause(change.domain)
    onInvalidated?.(change.domain)
  })
  return { close: async () => subscription.close() }
}
