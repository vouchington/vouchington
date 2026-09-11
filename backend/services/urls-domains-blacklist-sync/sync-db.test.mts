import { expect, it, describe } from 'vitest'
import {
  countBlacklistEntriesBySource,
  createTestBlacklistSource,
  insertTestDomainBlacklist,
  listBlacklistDomainsBySource,
} from '@voucha/test-helpers'

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
  })

  it('syncDomainsWithDatabase stages email domains in SQL and applies database changes', async () => {
    const suffix = randomSourceSuffix()
    const sourceId = await createTestBlacklistSource({
      type: 'email',
      name: `sync-db-email-${suffix}`,
      url: 'https://example.com/email-blacklist.txt',
    })

    const result = await syncDomainsWithDatabase(
      sourceId,
      new Response(`email-blocked-${suffix}.com\n`),
      'email',
    )

    expect(result).toEqual({ skipped: false, domainsAdded: 1, domainsRemoved: 0 })
    await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual([
      `email-blocked-${suffix}.com`,
    ])
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
