import { expect, it, describe } from 'vitest'
import {
  countBlacklistEntriesBySource,
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  getTestHostnameRow,
  insertTestDomainBlacklist,
  listBlacklistDomainsBySource,
} from '@voucha/test-helpers'
import { upsertUrlHostnames } from '../urls-hostnames/upsert.mts'
import { resolveEmailDomainHostnameId } from '../email-address-validator/email-domain-context.mts'
import { getCrawlHostnameCandidates } from '../crawls/hostname-dispatch-candidates.mts'
import { getUrlHostnameById } from '../urls-hostnames/get.mts'
import { caches } from '@services/entity-cache/caches'
import { getUrlHostnameByAnyCached } from '../entity-fetch/get.mts'
import { setTestHostnameCrawlSweep } from '@voucha/test-helpers/entities/hostname-crawl-sweeps'

import { syncDomainsWithDatabase } from './sync-db.mts'

describe('sync-db', () => {
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
      new Response(`# comment\nNew-A-${suffix}.com\nnew-a-${suffix}.com\nnew-b-${suffix}.com\n`),
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
        range: 0,
      },
      10,
    )
    expect(candidates.some(row => row.id === hostnameId)).toBe(false)
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
