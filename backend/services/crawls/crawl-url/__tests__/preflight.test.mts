import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  insertTestUrlDirect,
  updateUrlHostnameBlocked,
  updateUrlHostnameCrawlable,
} from '@voucha/test-helpers'
import {
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  insertTestDomainBlacklist,
} from '@voucha/test-helpers/entities/domain-blacklists'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { addDomainsToBloomFilter } from '../../../urls-domains-blacklist/bloom-filter.mts'
import { getLatestHtmlSnapshotCrawl } from '../../get.mts'
import { loadCrawlPreflight } from '../preflight.mts'

describe('crawl preflight blacklist database failure', () => {
  it('rethrows a database failure instead of treating the URL as blocked', async () => {
    const suffix = randomUUID()
    const domain = `preflight-${suffix}.example.com`
    const sourceName = `preflight-${suffix.replace(/[0-9a-f]/g, c =>
      String.fromCharCode(97 + Number.parseInt(c, 16)),
    )}`
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: sourceName,
      url: `https://${domain}/blacklist.txt`,
    })
    try {
      await insertTestDomainBlacklist(domain, sourceName)
      await addDomainsToBloomFilter([domain])
      const url = await insertTestUrlDirect(null, `https://${domain}/article`)
      if (!url) throw new Error('Expected the owned public URL fixture')
      const options = { ignoreRobotsTxt: true }

      const { result, error } = await withPostgresPoolQueryFailureForTest(
        '/* getBlocklistedDomainKeys */',
        () => loadCrawlPreflight(url.id, 0, new Set(), options).catch((err: unknown) => err),
      )

      expect(result).toBe(error)
      expect(await getLatestHtmlSnapshotCrawl(url.id, { readOnly: false })).toBeNull()
      await expect(loadCrawlPreflight(url.id, 0, new Set(), options)).resolves.toBeNull()
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })
})

describe('crawl preflight hostname flags', () => {
  it.each(['uncrawlable', 'blocked'] as const)(
    'rejects a %s hostname before crawl creation',
    async flag => {
      const url = await insertTestUrlDirect(
        null,
        `https://preflight-${randomUUID()}.example.com/article`,
      )
      if (!url) throw new Error('Expected owned URL')
      if (flag === 'blocked') await updateUrlHostnameBlocked(url.hostname.id, true)
      else await updateUrlHostnameCrawlable(url.hostname.id, false)
      await expect(
        loadCrawlPreflight(url.id, 0, new Set(), { ignoreRobotsTxt: true }),
      ).resolves.toBeNull()
      expect(await getLatestHtmlSnapshotCrawl(url.id, { readOnly: false })).toBeNull()
    },
  )
})
