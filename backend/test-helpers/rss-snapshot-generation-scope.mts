import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { GlideClient } from '@valkey/valkey-glide'
import { vi } from 'vitest'
import { primaryCacheValkeyClient } from '@data-stores/valkey/clients'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

const GENERATION_KEY = 'rss_public_post_snapshots:legal_generation'
const scopes = new AsyncLocalStorage<GenerationScope>()

type GenerationScope = {
  key: string
  missingReads: number
  barrierReaders: number
  barrier: ReturnType<typeof Promise.withResolvers<void>>
  initializations: Array<{ generation: string; installed: boolean }>
}

/** SDK call-through only: application clients stay real; unrelated async work keeps its keys. */
export async function withIsolatedRssSnapshotGeneration<T>(
  run: (scope: {
    evict: () => Promise<void>
    readSnapshot: (serializedKey: string) => Promise<unknown>
    initializations: GenerationScope['initializations']
  }) => Promise<T>,
  barrierReaders = 0,
): Promise<T> {
  const scope: GenerationScope = {
    key: `test:rss-generation:${randomUUID()}`,
    missingReads: 0,
    barrierReaders,
    barrier: Promise.withResolvers<void>(),
    initializations: [],
  }
  const get = GlideClient.prototype.get
  const set = GlideClient.prototype.set
  const snapshotCache = new ValkeyCache({
    prefix: 'rss_public_post_snapshots_anon',
    ttlSeconds: HTTP_CACHE_SHORT_MAX_AGE_SECONDS,
    client: primaryCacheValkeyClient,
  })
  const snapshots = new Set<string>()
  const getSpy = vi.spyOn(GlideClient.prototype, 'get').mockImplementation(async function (
    this: GlideClient,
    key,
    options,
  ) {
    const active = scopes.getStore()
    if (!active || String(key) !== GENERATION_KEY) return get.call(this, key, options)
    const result = await get.call(this, active.key, options)
    if (result === null && active.barrierReaders > 0) {
      active.missingReads++
      if (active.missingReads === active.barrierReaders) active.barrier.resolve()
      await active.barrier.promise
    }
    return result
  })
  const setSpy = vi.spyOn(GlideClient.prototype, 'set').mockImplementation(async function (
    this: GlideClient,
    key,
    value,
    options,
  ) {
    const active = scopes.getStore()
    if (!active || String(key) !== GENERATION_KEY) return set.call(this, key, value, options)
    const result = await set.call(this, active.key, value, options)
    if (options?.conditionalSet === 'onlyIfDoesNotExist') {
      active.initializations.push({ generation: String(value), installed: result !== null })
    }
    return result
  })
  try {
    return await scopes.run(scope, () =>
      run({
        initializations: scope.initializations,
        evict: async () => {
          if (scope.initializations.length === 0) throw new Error('RSS generation was not scoped')
          await primaryCacheValkeyClient.unlink([scope.key])
        },
        readSnapshot: serializedKey => {
          snapshots.add(serializedKey)
          return snapshotCache.get(serializedKey)
        },
      }),
    )
  } finally {
    scope.barrier.resolve()
    getSpy.mockRestore()
    setSpy.mockRestore()
    await Promise.all([
      primaryCacheValkeyClient.unlink([scope.key]),
      snapshots.size > 0 ? snapshotCache.delete(...snapshots) : Promise.resolve(),
    ])
  }
}
