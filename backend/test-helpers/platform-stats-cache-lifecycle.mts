import { valkeyEvents } from 'valkyries'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '../config/index.mts'
import { stableSerialize } from '../services/entity-cache/search-cache.mts'

/** Observe this project's real cache commands, including a deliberately late conditional write. */
export function observePlatformStatsCache(holdWrite = false) {
  const cache = new ValkeyCache<Record<string, never>>({
    prefix: 'platform_stats_anon',
    ttlSeconds: HTTP_CACHE_SHORT_MAX_AGE_SECONDS,
    keySerializer: stableSerialize,
  })
  const key = cache.getKey({})
  const original = cacheValkeyClient.invokeScript
  const pending: Promise<PromiseSettledResult<unknown>>[] = []
  const entered = Promise.withResolvers<void>()
  void entered.promise.catch(() => undefined)
  const released = Promise.withResolvers<void>()
  let held = false
  let markerKey: string | undefined
  let skipped = 0
  const observe = (task: Promise<unknown>) => {
    pending.push(
      task.then(
        value => ({ status: 'fulfilled' as const, value }),
        err => ({ status: 'rejected' as const, reason: err }),
      ),
    )
    return task
  }
  const onSkipped = (event: { cacheName: string; keys: string[] }) => {
    if (event.cacheName === 'platform_stats_anon' && event.keys.includes(stableSerialize({})))
      skipped++
  }
  valkeyEvents.on('cache:set-skipped', onSkipped)
  const wrapped: typeof original = function (this: typeof cacheValkeyClient, ...args) {
    const options = args[1]
    if (!options?.keys?.includes(key)) return original.apply(this, args)
    if (options.keys?.length === 2 && options.args?.length === 2)
      markerKey = String(options.keys[1])
    // One-entry conditional setters have key+marker and count+TTL+serialized value.
    if (holdWrite && !held && options.keys.length === 2 && options.args?.length === 3) {
      held = true
      entered.resolve()
      return observe(released.promise.then(() => original.apply(this, args))) as ReturnType<
        typeof original
      >
    }
    return observe(original.apply(this, args)) as ReturnType<typeof original>
  }
  cacheValkeyClient.invokeScript = wrapped
  return {
    entered: entered.promise,
    observations: () => ({ held, skipped }),
    release() {
      released.resolve()
      entered.reject(new Error('Stats cache closed before a held write was observed'))
    },
    async fence() {
      await cache.delete({})
    },
    async drain() {
      // Stats' six numeric fields take the small-JSON path: native write admission precedes
      // completion of the actual handler. This does not cover arbitrary compressed cache values.
      const outcomes = await Promise.all(pending)
      const failures = outcomes.filter(outcome => outcome.status === 'rejected')
      if (failures.length)
        throw new AggregateError(
          failures.map(outcome => outcome.reason),
          'Stats cache commands failed',
        )
    },
    async clear() {
      await cache.delete({})
      if (!markerKey) throw new Error('Stats marker key was not observed')
      await cacheValkeyClient.unlink([key, markerKey])
      const remaining = await cacheValkeyClient.mget([key, markerKey])
      if (remaining.some(value => value !== null))
        throw new Error('Stats cache or marker remained after drain')
    },
    async assertMarkerRemoved() {
      if (!markerKey || (await cacheValkeyClient.get(markerKey)) !== null)
        throw new Error('Stats invalidation marker remained after drain')
    },
    restore() {
      valkeyEvents.off('cache:set-skipped', onSkipped)
      if (cacheValkeyClient.invokeScript !== wrapped)
        throw new Error('Stats cache observer was replaced')
      cacheValkeyClient.invokeScript = original
    },
  }
}
