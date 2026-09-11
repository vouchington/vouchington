import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { enqueueCrawlBrowser } from './enqueues.mts'
import { crawlBrowserQueue } from './queues.mts'

// Real integration test: enqueue against the in-memory glide-mq test queue and assert the
// emitted job's data and deduplication options, instead of mocking the enqueue factory.
describe('enqueueCrawlBrowser', () => {
  it('enqueues a crawl_browser job with priority and debounce dedup options', async () => {
    const linkId = `link-${randomUUID()}`
    const urlId = `url-${randomUUID()}`

    await enqueueCrawlBrowser({ linkId, urlId, crawlerId: 'c' })

    const waiting = await crawlBrowserQueue.getJobs('waiting')
    const job = waiting.find(j => (j.data as { linkId?: string }).linkId === linkId)
    expect(job).toBeDefined()
    expect(job!.data).toEqual({ linkId, urlId, crawlerId: 'c' })
    expect(job!.opts).toMatchObject({
      priority: 10,
      deduplication: { id: `crawl_browser__${linkId}__${urlId}`, mode: 'debounce' },
    })
  })

  it('encodes linkId and urlId in the deduplication id', async () => {
    const linkId = `link-${randomUUID()}`
    const urlId = `url-${randomUUID()}`

    await enqueueCrawlBrowser({ linkId, urlId, crawlerId: 'c' })

    const waiting = await crawlBrowserQueue.getJobs('waiting')
    const job = waiting.find(j => (j.data as { linkId?: string }).linkId === linkId)
    expect((job!.opts as { deduplication: { id: string } }).deduplication.id).toBe(
      `crawl_browser__${linkId}__${urlId}`,
    )
  })
})
