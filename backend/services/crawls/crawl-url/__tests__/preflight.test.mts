import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  insertTestUrlDirect,
  updateUrlHostnameBlocked,
  updateUrlHostnameCrawlable,
} from '@voucha/test-helpers'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { getLatestHtmlSnapshotCrawl } from '../../get.mts'
import { loadCrawlPreflight } from '../preflight.mts'

describe('crawl preflight database failure', () => {
  it('rethrows a database failure instead of treating the URL as blocked', async () => {
    const url = await insertTestUrlDirect(
      null,
      `https://preflight-${randomUUID()}.example.com/article`,
    )
    if (!url) throw new Error('Expected the owned public URL fixture')
    const options = { ignoreRobotsTxt: true }

    const { result, error } = await withPostgresPoolQueryFailureForTest('/* getUrlById */', () =>
      loadCrawlPreflight(url.id, 0, new Set(), options).catch((err: unknown) => err),
    )

    expect(result).toBe(error)
    expect(await getLatestHtmlSnapshotCrawl(url.id, { readOnly: false })).toBeNull()
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
