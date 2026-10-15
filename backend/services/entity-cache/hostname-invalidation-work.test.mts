import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import {
  ageHostnameCacheInvalidationWorkForTest,
  expireHostnameCacheInvalidationLeaseForTest,
  getHostnameCacheInvalidationWorkForTest,
  makeHostnameCacheInvalidationAvailableForTest,
} from '@voucha/test-helpers/hostname-cache-invalidation'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { upsertUrlHostnames } from '../urls-hostnames/upsert.mts'
import { caches } from './caches.mts'
import { CACHE_TTLS_SECONDS } from './config.mts'
import { drainHostnameCacheInvalidationWork } from './hostname-invalidation-drain.mts'
import { enqueueHostnameCacheInvalidation } from './hostname-invalidation-work.mts'
import { entityCacheWorkConfig } from './work-limits.mts'

async function ownHostname(): Promise<{ id: string; hostname: string }> {
  const hostname = `cache-work-${crypto.randomUUID()}.example.com`
  const id = (await upsertUrlHostnames(null, [hostname])).get(hostname)
  if (!id) throw new Error('Expected own hostname')
  return { id, hostname }
}

async function enqueue(id: string): Promise<void> {
  await using transaction = await beginTransaction()
  await enqueueHostnameCacheInvalidation(transaction, [id])
  await transaction.commit()
}

describe('durable hostname cache invalidation', () => {
  it('is invisible before commit and strictly evicts both caches after commit', async () => {
    const { id, hostname } = await ownHostname()
    await caches.url_hostnames.set(id, { id, hostname })
    await caches.url_hostnames.set(hostname, { id, hostname })
    await caches.email_domain_validation.set(hostname, { success: true })
    await using transaction = await beginTransaction()
    await enqueueHostnameCacheInvalidation(transaction, [id])
    expect(await getHostnameCacheInvalidationWorkForTest(id)).toBeNull()
    expect(await drainHostnameCacheInvalidationWork({ hostnameIds: [id] })).toBe(0)
    await transaction.commit()

    expect(await drainHostnameCacheInvalidationWork({ hostnameIds: [id] })).toBe(1)
    expect(await getHostnameCacheInvalidationWorkForTest(id)).toBeNull()
    expect(await caches.url_hostnames.get(id)).toBeNull()
    expect(await caches.url_hostnames.get(hostname)).toBeNull()
    expect(await caches.email_domain_validation.get(hostname)).toBeNull()
  })

  it('retains failed work with a fenced lease and drains it after backoff', async () => {
    const { id } = await ownHostname()
    await enqueue(id)
    await expect(
      drainHostnameCacheInvalidationWork({
        hostnameIds: [id],
        evict: async () => {
          throw new Error('owned cache failure')
        },
      }),
    ).rejects.toThrow('owned cache failure')
    const failed = await getHostnameCacheInvalidationWorkForTest(id)
    expect(failed).toMatchObject({ generation: '1', lease_token: null, attempt_count: 1 })
    await makeHostnameCacheInvalidationAvailableForTest(id)
    expect(await drainHostnameCacheInvalidationWork({ hostnameIds: [id] })).toBe(1)
    expect(await getHostnameCacheInvalidationWorkForTest(id)).toBeNull()
  })

  it('does not let an old lease acknowledge a newer generation', async () => {
    const { id } = await ownHostname()
    await enqueue(id)
    const claimed = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const first = drainHostnameCacheInvalidationWork({
      hostnameIds: [id],
      evict: async () => {
        claimed.resolve()
        await release.promise
      },
    })
    await claimed.promise
    const oldLease = await getHostnameCacheInvalidationWorkForTest(id)
    expect(oldLease?.lease_token).not.toBeNull()
    await enqueue(id)
    release.resolve()
    await first
    expect(await getHostnameCacheInvalidationWorkForTest(id)).toMatchObject({
      generation: '2',
      lease_token: null,
      attempt_count: 0,
    })
    expect(await drainHostnameCacheInvalidationWork({ hostnameIds: [id] })).toBe(1)
  })

  it('does not let an old failure postpone a newly enqueued generation', async () => {
    const { id } = await ownHostname()
    await enqueue(id)
    const claimed = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const first = drainHostnameCacheInvalidationWork({
      hostnameIds: [id],
      evict: async () => {
        claimed.resolve()
        await release.promise
        throw new Error('old eviction failed')
      },
    })
    const outcome = first.then(
      () => ({ ok: true as const, error: null }),
      (err: unknown) => ({ ok: false as const, error: err }),
    )
    await claimed.promise
    await enqueue(id)
    const fresh = await getHostnameCacheInvalidationWorkForTest(id)
    release.resolve()
    expect(await outcome).toMatchObject({ ok: false, error: { message: 'old eviction failed' } })
    expect(await getHostnameCacheInvalidationWorkForTest(id)).toEqual(fresh)
    expect(fresh).toMatchObject({ generation: '2', attempt_count: 0, lease_token: null })
    expect(await drainHostnameCacheInvalidationWork({ hostnameIds: [id] })).toBe(1)
  })

  it('reclaims an expired lease without letting its former owner delete the row', async () => {
    const { id } = await ownHostname()
    await enqueue(id)
    const claimed = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const first = drainHostnameCacheInvalidationWork({
      hostnameIds: [id],
      evict: async () => {
        claimed.resolve()
        await release.promise
      },
    })
    await claimed.promise
    await expireHostnameCacheInvalidationLeaseForTest(id)
    const reclaimed = Promise.withResolvers<void>()
    const releaseReclaimed = Promise.withResolvers<void>()
    const second = drainHostnameCacheInvalidationWork({
      hostnameIds: [id],
      evict: async () => {
        reclaimed.resolve()
        await releaseReclaimed.promise
      },
    })
    await reclaimed.promise
    const secondLease = (await getHostnameCacheInvalidationWorkForTest(id))?.lease_token
    expect(secondLease).not.toBeNull()
    release.resolve()
    await first
    expect((await getHostnameCacheInvalidationWorkForTest(id))?.lease_token).toBe(secondLease)
    releaseReclaimed.resolve()
    expect(await second).toBe(1)
    expect(await getHostnameCacheInvalidationWorkForTest(id)).toBeNull()
  })

  it('admits an expired lease before ready work within a lowered page limit', async () => {
    const expired = await ownHostname()
    const ready = await Promise.all([ownHostname(), ownHostname()])
    await enqueue(expired.id)
    const claimed = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const first = drainHostnameCacheInvalidationWork({
      hostnameIds: [expired.id],
      evict: async () => {
        claimed.resolve()
        await release.promise
      },
    })
    await claimed.promise
    await expireHostnameCacheInvalidationLeaseForTest(expired.id)
    for (const row of ready) await enqueue(row.id)
    const restore = overrideDynamicConfigFieldsForTest(entityCacheWorkConfig, {
      delete_keys_per_batch: 1,
    })
    try {
      expect(
        await drainHostnameCacheInvalidationWork({
          hostnameIds: [expired.id, ...ready.map(row => row.id)],
        }),
      ).toBe(1)
      expect(await getHostnameCacheInvalidationWorkForTest(expired.id)).toBeNull()
      for (const row of ready) {
        expect(await getHostnameCacheInvalidationWorkForTest(row.id)).not.toBeNull()
      }
    } finally {
      release.resolve()
      await first
      restore()
    }
  })

  it('honors a lowered page limit and prunes work after the actual hostname-cache TTL', async () => {
    const rows = await Promise.all([ownHostname(), ownHostname(), ownHostname()])
    const ids = rows.map(row => row.id)
    for (const id of ids) await enqueue(id)
    const restore = overrideDynamicConfigFieldsForTest(entityCacheWorkConfig, {
      delete_keys_per_batch: 2,
    })
    try {
      expect(await drainHostnameCacheInvalidationWork({ hostnameIds: ids })).toBe(2)
      expect(
        (await Promise.all(ids.map(getHostnameCacheInvalidationWorkForTest))).filter(Boolean),
      ).toHaveLength(1)
      const remaining = (await Promise.all(ids.map(getHostnameCacheInvalidationWorkForTest))).find(
        row => row !== null,
      )
      if (!remaining) throw new Error('Expected one remaining work row')
      await ageHostnameCacheInvalidationWorkForTest(
        remaining.url_hostname_id,
        CACHE_TTLS_SECONDS.url_hostnames + 1,
      )
      expect(await drainHostnameCacheInvalidationWork({ hostnameIds: ids })).toBe(0)
      expect(await getHostnameCacheInvalidationWorkForTest(remaining.url_hostname_id)).toBeNull()
    } finally {
      restore()
    }
  })
})
