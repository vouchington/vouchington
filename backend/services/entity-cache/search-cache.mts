import { createHash } from 'node:crypto'
import { ValkeyCache } from '@data-stores/valkey/cache'
import type { ValkeyCacheOptions } from '@data-stores/valkey/types'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

/**
 * Creates a Valkey-cached wrapper for a search/list function used by logged-out users.
 * Keys are SHA-256 hashes of stable-serialized options, avoiding collisions from
 * ValkeyCache's toLowerCase() normalization on case-sensitive values like base64 cursors.
 */
export function createSearchCache<O extends object, R>(
  prefix: string,
  fn: (options: O) => Promise<R>,
): (options: O) => Promise<R> {
  const cache = new ValkeyCache<O>({
    prefix,
    ttlSeconds: HTTP_CACHE_SHORT_MAX_AGE_SECONDS,
    keySerializer: stableSerialize,
  } as unknown as ValkeyCacheOptions<O>)

  const cached = cache.cacheGetByAny(fn)

  // Search functions never return null, so cached never returns null in practice.
  // Cast away the null from cacheGetByAny's return type.
  return async (options: O): Promise<R> => (await cached(options)) as R
}

export async function invalidateSearchCache(prefix: string): Promise<void> {
  await ValkeyCache.invalidate(prefix)
}

export function stableSerialize(options: object): string {
  const entries = Object.entries(options as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return createHash('sha256')
    .update(JSON.stringify(Object.fromEntries(entries)))
    .digest('hex')
}
