import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createCrawler } from '@services/crawlers'
import { addUrl } from '@services/urls'
import { createTestUser, beginTransaction } from '@voucha/test-helpers'
import {
  readTestCrawlRefreshState,
  readTestUrlReconciliationRevision,
  setTestCrawlRefreshState,
} from '@voucha/test-helpers/entities/crawl-refresh-state'
import { createCrawl } from './create.mts'
import { getCrawlById } from './get.mts'
import { updateCrawl } from './update.mts'

async function createFixture() {
  const user = await createTestUser()
  const url = await addUrl(user.id, `https://example.com/crawl-refresh-${randomUUID()}`)
  if (!url) throw new Error('Expected public fixture URL')
  const crawler = await createCrawler(user, {
    hostname_id: url.hostname.id,
    crawler_type: 'fetch',
  })
  return { urlId: url.id, crawlerId: crawler.id }
}

describe('crawl refresh state', () => {
  it('keeps URL reconciliation revisions unchanged when crawl markers advance', async () => {
    const { urlId, crawlerId } = await createFixture()
    const originalRevision = await readTestUrlReconciliationRevision(urlId)
    const crawl = await createCrawl(urlId, crawlerId)
    expect(await readTestUrlReconciliationRevision(urlId)).toBe(originalRevision)
    await updateCrawl(crawl.id, urlId, { completed_at: new Date() })
    expect((await readTestCrawlRefreshState(urlId)).last_successful_crawl_at).toBeInstanceOf(Date)
    expect(await readTestUrlReconciliationRevision(urlId)).toBe(originalRevision)
  })

  it('records a pending attempt without recording success', async () => {
    const { urlId, crawlerId } = await createFixture()
    const crawl = await createCrawl(urlId, crawlerId)
    expect(crawl.completed_at).toBeNull()
    expect(await readTestCrawlRefreshState(urlId)).toEqual({
      last_crawl_attempt_at: crawl.created_at,
      last_successful_crawl_at: null,
    })
  })

  it.each([200, 204, 299, 304])('records completed HTTP %i as success', async status => {
    const { urlId, crawlerId } = await createFixture()
    const crawl = await createCrawl(urlId, crawlerId)
    const completedAt = new Date('2026-01-20T12:00:00Z')
    await updateCrawl(crawl.id, urlId, {
      completed_at: completedAt,
      response_status_code: status,
    })
    expect(await readTestCrawlRefreshState(urlId)).toEqual({
      last_crawl_attempt_at: crawl.created_at,
      last_successful_crawl_at: completedAt,
    })
  })

  it.each([
    { status: 200, completed: false, networkError: null },
    { status: 301, completed: true, networkError: null },
    { status: 302, completed: true, networkError: null },
    { status: 307, completed: true, networkError: null },
    { status: 308, completed: true, networkError: null },
    { status: 404, completed: true, networkError: null },
    { status: 500, completed: true, networkError: null },
    { status: 200, completed: true, networkError: 'timeout' as const },
    { status: 304, completed: true, networkError: 'dns' as const },
  ])(
    'does not record success for $status, completed=$completed, error=$networkError',
    async ({ status, completed, networkError }) => {
      const { urlId, crawlerId } = await createFixture()
      const crawl = await createCrawl(urlId, crawlerId)
      await updateCrawl(crawl.id, urlId, {
        response_status_code: status,
        completed_at: completed ? new Date('2026-01-20T12:00:00Z') : null,
        network_error: networkError,
      })
      expect(await readTestCrawlRefreshState(urlId)).toEqual({
        last_crawl_attempt_at: crawl.created_at,
        last_successful_crawl_at: null,
      })
    },
  )

  it('uses persisted status and error across sparse completion updates', async () => {
    const { urlId, crawlerId } = await createFixture()
    const crawl = await createCrawl(urlId, crawlerId)
    const completedAt = new Date('2026-01-20T12:00:00Z')
    await updateCrawl(crawl.id, urlId, { response_status_code: 304, network_error: 'timeout' })
    await updateCrawl(crawl.id, urlId, { completed_at: completedAt })
    expect((await readTestCrawlRefreshState(urlId)).last_successful_crawl_at).toBeNull()
    await updateCrawl(crawl.id, urlId, { network_error: null })
    expect((await readTestCrawlRefreshState(urlId)).last_successful_crawl_at).toEqual(completedAt)
  })

  it('preserves newer completion timestamps when an older success finishes last', async () => {
    const { urlId, crawlerId } = await createFixture()
    const older = await createCrawl(urlId, crawlerId)
    const newer = await createCrawl(urlId, crawlerId)
    const newerCompletion = new Date('2026-01-20T12:00:00Z')
    await updateCrawl(newer.id, urlId, { completed_at: newerCompletion })
    await updateCrawl(older.id, urlId, { completed_at: new Date('2026-01-19T12:00:00Z') })
    expect(await readTestCrawlRefreshState(urlId)).toEqual({
      last_crawl_attempt_at: newer.created_at,
      last_successful_crawl_at: newerCompletion,
    })
    const failed = await createCrawl(urlId, crawlerId)
    await updateCrawl(failed.id, urlId, { completed_at: new Date(), response_status_code: 500 })
    expect((await readTestCrawlRefreshState(urlId)).last_successful_crawl_at).toEqual(
      newerCompletion,
    )
  })

  it('does not regress an attempt marker when an older reservation arrives later', async () => {
    const { urlId, crawlerId } = await createFixture()
    const laterAttempt = new Date('2099-01-01T00:00:00Z')
    await setTestCrawlRefreshState(urlId, {
      last_crawl_attempt_at: laterAttempt,
      last_successful_crawl_at: null,
    })
    await createCrawl(urlId, crawlerId)
    expect((await readTestCrawlRefreshState(urlId)).last_crawl_attempt_at).toEqual(laterAttempt)
  })

  it('rolls back crawl creation and URL markers together', async () => {
    const { urlId, crawlerId } = await createFixture()
    let crawlId: string
    {
      await using transaction = await beginTransaction()
      const options = { query: transaction }
      const crawl = await createCrawl(urlId, crawlerId, {}, options)
      crawlId = crawl.id
      const completedAt = new Date('2026-01-20T12:00:00Z')
      await updateCrawl(crawl.id, urlId, { completed_at: completedAt }, options)
      expect(await readTestCrawlRefreshState(urlId, options)).toEqual({
        last_crawl_attempt_at: crawl.created_at,
        last_successful_crawl_at: completedAt,
      })
    }
    expect(await getCrawlById(crawlId, urlId, { readOnly: false })).toBeNull()
    expect(await readTestCrawlRefreshState(urlId)).toEqual({
      last_crawl_attempt_at: null,
      last_successful_crawl_at: null,
    })
  })
})
