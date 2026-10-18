import { expect, it, describe } from 'vitest'
import {
  countBlacklistEntriesBySource,
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  getTestHostnameRow,
  insertTestDomainBlacklist,
  listBlacklistDomainsBySource,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'
import { upsertUrlHostnames } from '../urls-hostnames/upsert.mts'
import { resolveEmailDomainHostnameId } from '../email-address-validator/email-domain-context.mts'
import { getCrawlHostnameCandidates } from '../crawls/hostname-dispatch-candidates.mts'
import { getUrlHostnameById } from '../urls-hostnames/get.mts'
import { caches } from '@services/entity-cache/caches'
import { drainHostnameCacheInvalidationWork } from '@services/entity-cache/hostname-invalidation-drain'
import {
  makeHostnameCacheInvalidationAvailableForTest,
  getHostnameCacheInvalidationWorkForTest,
  failNextHostnameCacheDeleteForTest,
} from '@voucha/test-helpers/hostname-cache-invalidation'
import { getUrlHostnameByAnyCached } from '../entity-fetch/get.mts'
import { setTestHostnameCrawlSweep } from '@voucha/test-helpers/entities/hostname-crawl-sweeps'

import { syncDomainsWithDatabase } from './sync-db.mts'

describe('sync-db', () => {
  it('keeps both added and removed hostname invalidations durable when inline eviction fails', async () => {
    const suffix = crypto.randomUUID()
    const domain = `sync-failure-${suffix}.example.com`
    const hostnameId = (await upsertUrlHostnames(null, [domain])).get(domain)!
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `sync-failure-${randomSourceSuffix()}`,
      url: 'https://example.com/sync-failure.txt',
    })
    try {
      for (const feed of [`${domain}\n`, '']) {
        const restoreFailure = failNextHostnameCacheDeleteForTest(hostnameId)
        try {
          await syncDomainsWithDatabase(sourceId, new Response(feed))
        } finally {
          restoreFailure()
        }
        expect(await getHostnameCacheInvalidationWorkForTest(hostnameId)).toMatchObject({
          attempt_count: 1,
          lease_token: null,
        })
        await makeHostnameCacheInvalidationAvailableForTest(hostnameId)
        expect(await drainHostnameCacheInvalidationWork({ hostnameIds: [hostnameId] })).toBe(1)
      }
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })

  it('retains an inherited administrator block when a child first arrives from a URL feed', async () => {
    const suffix = crypto.randomUUID()
    const parent = `admin-parent-${suffix}.example.com`
    const child = `sub.${parent}`
    const parentId = (await upsertUrlHostnames(null, [parent])).get(parent)!
    await updateUrlHostnameBlocked(parentId, true)
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `sync-parent-${randomSourceSuffix()}`,
      url: 'https://example.com/parent-blacklist.txt',
    })

    await syncDomainsWithDatabase(sourceId, new Response(`${child}\n`), 'url')
    const hostname = await getUrlHostnameByAnyCached(child)
    expect(hostname?.is_blocked).toBe(true)
    if (!hostname) throw new Error('Expected feed-created child hostname')

    await syncDomainsWithDatabase(sourceId, new Response(''), 'url')
    expect((await getTestHostnameRow(hostname.id))?.is_blocked).toBe(true)
    expect((await getUrlHostnameByAnyCached(child))?.is_blocked).toBe(true)
  })

  it('syncDomainsWithDatabase stages URL domains in SQL, returns diff counts, and applies database changes', async () => {
    const suffix = randomSourceSuffix()
    const sourceName = `sync-db-url-${suffix}`
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: sourceName,
      url: 'https://example.com/url-blacklist.txt',
    })
    await insertTestDomainBlacklist(`removed-${suffix}.com`, sourceName)

    const result = await syncDomainsWithDatabase(
      sourceId,
      new Response(
        `# comment\n${Array.from({ length: 4 }, () => 'a'.repeat(63)).join('.')}.com\nNew-A-${suffix}.com\nnew-a-${suffix}.com\nnew-b-${suffix}.com\n`,
      ),
      'url',
    )

    expect(result).toEqual({ skipped: false, domainsAdded: 2, domainsRemoved: 1 })
    expect(await countBlacklistEntriesBySource(sourceId)).toBe(2)
    await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual([
      `new-a-${suffix}.com`,
      `new-b-${suffix}.com`,
    ])

    const domains = [`new-a-${suffix}.com`, `new-b-${suffix}.com`]
    const hostnameIds = await upsertUrlHostnames(null, domains)
    for (const domain of domains) {
      expect((await getTestHostnameRow(hostnameIds.get(domain)!))?.is_blocked).toBe(true)
    }

    await syncDomainsWithDatabase(sourceId, new Response(''), 'url')
    for (const domain of domains) {
      expect((await getTestHostnameRow(hostnameIds.get(domain)!))?.is_blocked).toBe(false)
    }
  })

  it('syncDomainsWithDatabase stages email domains in SQL and applies database changes', async () => {
    const suffix = randomSourceSuffix()
    const sourceId = await createTestBlacklistSource({
      type: 'email',
      name: `sync-db-email-${suffix}`,
      url: 'https://example.com/email-blacklist.txt',
    })
    const domain = `email-blocked-${suffix}.com`
    await caches.email_domain_validation.set(domain, { success: true })

    const result = await syncDomainsWithDatabase(sourceId, new Response(`${domain}\n`), 'email')

    expect(result).toEqual({ skipped: false, domainsAdded: 1, domainsRemoved: 0 })
    await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual([domain])
    await expect(caches.email_domain_validation.get(domain)).resolves.toBeNull()
    const hostnameId = await resolveEmailDomainHostnameId(`reader@${domain}`)
    if (!hostnameId) throw new Error('Expected email blocklist hostname')
    const bucketDays = 30000 + Math.floor(Math.random() * 1000)
    await setTestHostnameCrawlSweep(hostnameId, bucketDays, null)
    expect((await getUrlHostnameById(hostnameId))?.publicly_introduced_at).toBeNull()
    const candidates = await getCrawlHostnameCandidates(
      {
        sweepStartedAt: new Date(Date.now() + 86_400_000).toISOString(),
        rangeLimit: 10,
        afterBucketDays: 0,
        bucketDays,
      },
      10,
    )
    expect(candidates.find(row => row.id === hostnameId)?.has_url).toBe(false)
  })

  it('rejects a downloaded URL feed if its source becomes email-only before the diff', async () => {
    const suffix = randomSourceSuffix()
    const name = `sync-db-reclassified-${suffix}`
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name,
      url: 'https://example.com/reclassified-blacklist.txt',
    })
    const domain = `private-${suffix}.example.com`
    let releaseBody!: () => void
    const bodyReleased = new Promise<void>(resolve => {
      releaseBody = resolve
    })
    let bodyRequested!: () => void
    const requested = new Promise<void>(resolve => {
      bodyRequested = resolve
    })
    const body = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          bodyRequested()
          await bodyReleased
          controller.enqueue(new TextEncoder().encode(`${domain}\n`))
          controller.close()
        },
      },
      { highWaterMark: 0 },
    )

    const completion = syncDomainsWithDatabase(sourceId, new Response(body), 'url').then(
      () => ({ status: 'completed' as const }),
      err => ({ status: 'rejected' as const, error: err }),
    )
    await requested
    await createTestBlacklistSource({
      type: 'email',
      name,
      url: 'https://example.com/reclassified-blacklist.txt',
    })
    releaseBody()

    await expect(completion).resolves.toMatchObject({
      status: 'rejected',
      error: { message: 'Domain blacklist source type changed during sync' },
    })
    expect(await listBlacklistDomainsBySource(sourceId)).toEqual([])
  })

  it('evicts cached hostname policy after feed adds and removes a block', async () => {
    const suffix = crypto.randomUUID()
    const domain = `sync-cache-${suffix}.example.com`
    const hostnameId = (await upsertUrlHostnames(null, [domain])).get(domain)!
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `sync-cache-${randomSourceSuffix()}`,
      url: 'https://example.com/sync-cache.txt',
    })
    try {
      const unblocked = await getUrlHostnameByAnyCached(hostnameId)
      expect(unblocked?.is_blocked).toBe(false)
      await caches.url_hostnames.set(hostnameId, unblocked)
      await caches.url_hostnames.set(domain, unblocked)

      await syncDomainsWithDatabase(sourceId, new Response(`${domain}\n`))
      for (const key of [hostnameId, domain]) {
        expect((await getUrlHostnameByAnyCached(key))?.is_blocked).toBe(true)
      }

      const blocked = await getUrlHostnameByAnyCached(hostnameId)
      await caches.url_hostnames.set(hostnameId, blocked)
      await caches.url_hostnames.set(domain, blocked)
      await syncDomainsWithDatabase(sourceId, new Response(''))
      for (const key of [hostnameId, domain]) {
        expect((await getUrlHostnameByAnyCached(key))?.is_blocked).toBe(false)
      }
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })

  it.each(['url', 'email'] as const)(
    'invalidates the %s Bloom ready marker before enqueueing its rebuild',
    async sourceType => {
      const suffix = randomSourceSuffix()
      const calls: string[] = []
      const sourceId = await createTestBlacklistSource({
        type: sourceType,
        name: `sync-db-ready-${sourceType}-${suffix}`,
        url: `https://example.com/${sourceType}-ready-blacklist.txt`,
      })

      await syncDomainsWithDatabase(
        sourceId,
        new Response(`ready-invalidated-${suffix}.com\n`),
        sourceType,
        {
          invalidateEmailReadyMarker: async () => {
            calls.push('invalidate-email')
          },
          invalidateUrlReadyMarker: async () => {
            calls.push('invalidate-url')
          },
          enqueueEmailRebuild: async () => {
            calls.push('enqueue-email')
          },
          enqueueUrlRebuild: async () => {
            calls.push('enqueue-url')
          },
        },
      )

      expect(calls).toEqual([`invalidate-${sourceType}`, `enqueue-${sourceType}`])
    },
  )

  it('serializes concurrent syncs for the same source without merging stale diffs', async () => {
    const suffix = randomSourceSuffix()
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `sync-db-concurrent-${suffix}`,
      url: 'https://example.com/concurrent-blacklist.txt',
    })
    const firstDomain = `first-${suffix}.com`
    const secondDomain = `second-${suffix}.com`

    await Promise.all([
      syncDomainsWithDatabase(sourceId, new Response(`${firstDomain}\n`)),
      syncDomainsWithDatabase(sourceId, new Response(`${secondDomain}\n`)),
    ])

    const finalDomains = await listBlacklistDomainsBySource(sourceId)
    expect([[firstDomain], [secondDomain]]).toContainEqual(finalDomains)
  })

  function randomSourceSuffix(): string {
    const suffix = Math.random()
      .toString(36)
      .replaceAll(/[0-9.]/g, '')
      .slice(0, 10)
    return suffix || 'source'
  }
})
