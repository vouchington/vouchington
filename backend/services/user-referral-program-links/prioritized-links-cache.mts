import { ValkeyCache } from '@data-stores/valkey/cache'

export const PRIORITIZED_LINKS_CACHE_TTL_SECONDS = 5 * 60

/**
 * Per-program out-of-network referral links shown by `@services/prioritized-referral-links`.
 * Keyed by referral program topic id; it holds no viewer input, so every viewer shares one entry.
 * Link writes in this package clear it; membership, crawl and label changes wait out the TTL.
 * Stale refresh stays on (the default): in the last 10% of the TTL a read returns the cached list
 * and one background load per process replaces it, so steady traffic rarely sees an expiry. A
 * clear is a real miss: concurrent reads each load the list, and the cache does not coalesce them.
 */
export const prioritizedLinksCache = new ValkeyCache({
  prefix: 'prioritized_referral_links',
  ttlSeconds: PRIORITIZED_LINKS_CACHE_TTL_SECONDS,
  mode: 'json',
})

/** Clears the cached out-of-network links for every given program after links are added or removed. */
export async function clearPrioritizedLinksCache(referralProgramIds: string[]): Promise<void> {
  if (referralProgramIds.length === 0) return
  await prioritizedLinksCache.delete(...new Set(referralProgramIds))
}
