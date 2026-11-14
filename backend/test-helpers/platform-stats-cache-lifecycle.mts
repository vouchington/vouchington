import { ValkeyCache } from '@data-stores/valkey/cache'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { SEARCH_CACHE_TTL_SECONDS } from '../services/entity-cache/search-cache-ttl.mts'
import { getAnonymousCacheGeneration } from '../services/entity-cache/anonymous-cache-generation.mts'
import { serializeSearchCacheKey } from '../services/entity-cache/search-cache.mts'

/** Own conditional cache commands for the isolated Stats Valkey instance. */
export async function observePlatformStatsCache() {
  const input = { generation: await getAnonymousCacheGeneration(), options: {} }
  const cache = new ValkeyCache<typeof input>({
    prefix: 'platform_stats_anon',
    ttlSeconds: SEARCH_CACHE_TTL_SECONDS,
    keySerializer: serializeSearchCacheKey,
  })
  const key = cache.getKey(input)
  const original = cacheValkeyClient.invokeScript
  const pending: Promise<PromiseSettledResult<unknown>>[] = []
  let markerKey: string | undefined
  const wrapped: typeof original = function (this: typeof cacheValkeyClient, ...args) {
    if (args[1]?.keys?.includes(key) && args[1].keys.length === 2 && args[1].args?.length === 2)
      markerKey = String(args[1].keys[1])
    const task = original.apply(this, args)
    if (args[1]?.keys?.includes(key)) {
      pending.push(
        task
          .then(value => ({ status: 'fulfilled' as const, value }))
          .catch((err: unknown) => ({ status: 'rejected' as const, reason: err })),
      )
    }
    return task
  }
  cacheValkeyClient.invokeScript = wrapped
  return {
    cacheKey: serializeSearchCacheKey(input),
    async clear() {
      await cache.delete(input)
      if (!markerKey) throw new Error('Stats cache invalidation marker was not observed')
      await cacheValkeyClient.unlink([key, markerKey])
    },
    async drain() {
      // The bounded six-number result admits its write before the SDK handler settles.
      const failures = (await Promise.all(pending)).filter(outcome => outcome.status === 'rejected')
      if (failures.length)
        throw new AggregateError(
          failures.map(outcome => outcome.reason),
          'Stats cache commands failed',
        )
    },
    restore() {
      if (cacheValkeyClient.invokeScript !== wrapped)
        throw new Error('Stats cache observer was replaced')
      cacheValkeyClient.invokeScript = original
    },
  }
}
