import { createHash } from 'node:crypto'
import { ValkeyCache } from '@data-stores/valkey/cache'
import type { ValkeyCacheOptions } from '@data-stores/valkey/types'
import { SEARCH_CACHE_TTL_SECONDS } from './search-cache-ttl.mts'
import { getAnonymousCacheGeneration } from './anonymous-cache-generation.mts'

/**
 * Creates a Valkey-cached wrapper for a search/list function used by logged-out users.
 * Keys are SHA-256 hashes of stable-serialized options, avoiding collisions from
 * ValkeyCache's toLowerCase() normalization on case-sensitive values like base64 cursors.
 */
export function createSearchCache<O extends object, R>(
  prefix: string,
  fn: (options: O) => Promise<R>,
): (options: O) => Promise<R> {
  const cache = new ValkeyCache<{ generation: string; options: O }>({
    prefix,
    ttlSeconds: SEARCH_CACHE_TTL_SECONDS,
    keySerializer: serializeSearchCacheKey,
  } as unknown as ValkeyCacheOptions<{ generation: string; options: O }>)

  const cached = cache.cacheGetByAny(({ options }: { generation: string; options: O }) =>
    fn(options),
  )

  // Search functions never return null, so cached never returns null in practice.
  // Cast away the null from cacheGetByAny's return type.
  return async (options: O): Promise<R> =>
    (await cached({ generation: await getAnonymousCacheGeneration(), options })) as R
}

export function serializeSearchCacheKey({
  generation,
  options,
}: {
  generation: string
  options: object
}): string {
  return stableSerialize({ generation, optionsKey: stableSerialize(options) })
}

export function stableSerialize(options: object): string {
  const entries = Object.entries(options as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .toSorted(([a], [b]) => a.localeCompare(b))
  return createHash('sha256')
    .update(JSON.stringify(Object.fromEntries(entries)))
    .digest('hex')
}
