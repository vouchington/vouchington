import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestUrl, insertTestUrlHostname } from '@voucha/test-helpers'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { createCrawl } from '../create.mts'
import { updateCrawl } from '../update.mts'
import {
  readTestCrawlRefreshState,
  setTestCrawlRefreshState,
} from '@voucha/test-helpers/entities/crawl-refresh-state'
import { createCrawler } from '@services/crawlers'
import { searchCrawlerRefreshUrlCandidatesByHostnameId } from '@services/crawlers/refresh'

async function createFixture() {
  const hostname = `refresh-recency-${randomUUID()}.example.com`
  const hostnameId = await insertTestUrlHostname({ hostname })
  await updateUrlHostname(hostnameId, { is_crawlable: true })
  const user = await createTestUser()
  const crawler = await createCrawler(user, { hostname_id: hostnameId, crawler_type: 'fetch' })
  const urlIds: string[] = []
  for (let index = 0; index < 4; index += 1) {
    urlIds.push(await insertTestUrl({ hostnameId, url: `https://${hostname}/${index}` }))
  }
  return { hostnameId, crawlerId: crawler.id, urlIds }
}

describe('crawler refresh recency', () => {
  it('selects never-successful URLs first, then oldest successes, with stable ID ties', async () => {
    const { hostnameId, urlIds } = await createFixture()
    const [newer, older, neverA, neverB] = urlIds
    await setTestCrawlRefreshState(newer!, {
      last_crawl_attempt_at: null,
      last_successful_crawl_at: new Date('2026-01-02T00:00:00Z'),
    })
    await setTestCrawlRefreshState(older!, {
      last_crawl_attempt_at: null,
      last_successful_crawl_at: new Date('2026-01-01T00:00:00Z'),
    })
    const expected = [...[neverA!, neverB!].toSorted(), older!, newer!]
    const selected = await searchCrawlerRefreshUrlCandidatesByHostnameId(hostnameId, 4)
    expect(selected.map(row => row.id)).toEqual(expected)
    const excluded = await searchCrawlerRefreshUrlCandidatesByHostnameId(hostnameId, 2, {}, [
      expected[0]!,
    ])
    expect(excluded.map(row => row.id)).toEqual(expected.slice(1, 3))
    await setTestCrawlRefreshState(newer!, {
      last_crawl_attempt_at: null,
      last_successful_crawl_at: new Date('2026-01-01T00:00:00Z'),
    })
    const tied = await searchCrawlerRefreshUrlCandidatesByHostnameId(hostnameId, 4)
    expect(tied.map(row => row.id)).toEqual([
      ...expected.slice(0, 2),
      ...[older!, newer!].toSorted(),
    ])
  })

  it('immediately excludes failed and incomplete attempts, then admits due failed URLs', async () => {
    const { hostnameId, crawlerId, urlIds } = await createFixture()
    const [failedId, incompleteId, untouchedA, untouchedB] = urlIds
    const failed = await createCrawl(failedId!, crawlerId)
    await updateCrawl(failed.id, failedId!, {
      completed_at: new Date(),
      response_status_code: 503,
      network_error: 'timeout',
    })
    await createCrawl(incompleteId!, crawlerId)
    const selected = await searchCrawlerRefreshUrlCandidatesByHostnameId(hostnameId, 4)
    expect(selected.map(row => row.id)).toEqual([untouchedA!, untouchedB!].toSorted())
    const state = await readTestCrawlRefreshState(failedId!)
    expect(state.last_successful_crawl_at).toBeNull()
    await setTestCrawlRefreshState(failedId!, {
      ...state,
      last_crawl_attempt_at: new Date(Date.now() - 8 * 86_400_000),
    })
    const due = await searchCrawlerRefreshUrlCandidatesByHostnameId(hostnameId, 4)
    expect(due.map(row => row.id)).toEqual([failedId!, untouchedA!, untouchedB!].toSorted())
  })
  it('cools down a recent success before restoring its success-recency order', async () => {
    const { hostnameId, crawlerId, urlIds } = await createFixture()
    const [successfulId, ...untouched] = urlIds
    const crawl = await createCrawl(successfulId!, crawlerId)
    await updateCrawl(crawl.id, successfulId!, {
      completed_at: new Date(),
      response_status_code: 200,
    })
    const recent = await searchCrawlerRefreshUrlCandidatesByHostnameId(hostnameId, 4)
    expect(recent.map(row => row.id)).toEqual([...untouched].toSorted())
    const state = await readTestCrawlRefreshState(successfulId!)
    await setTestCrawlRefreshState(successfulId!, {
      ...state,
      last_crawl_attempt_at: new Date(Date.now() - 8 * 86_400_000),
    })
    const due = await searchCrawlerRefreshUrlCandidatesByHostnameId(hostnameId, 4)
    expect(due.map(row => row.id)).toEqual([...untouched.toSorted(), successfulId!])
  })
})
