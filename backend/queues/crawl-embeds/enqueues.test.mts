import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CRAWL_EMBEDS_DEFAULTS,
  OEMBED_HOST_RATE_LIMIT_MS,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
} from './config.mts'
import {
  enqueueBackfillCrawlEmbeds,
  enqueueBulkCrawlEmbeds,
  enqueueCrawlEmbed,
} from './enqueues.mts'
import { crawlEmbedsQueue } from './queues.mts'

describe('crawl-embeds enqueues', () => {
  beforeEach(async () => {
    await crawlEmbedsQueue.obliterate({ force: true })
  })

  it('enqueues only a crawl ID with destination-host ordering', async () => {
    const crawlId = randomUUID()
    const job = await enqueueCrawlEmbed(crawlId, { endpointHostname: 'api.example.com' })
    assert(job)
    expect(job).toMatchObject({
      data: { crawl_id: crawlId },
      opts: {
        attempts: CRAWL_EMBEDS_DEFAULTS.attempts,
        backoff: CRAWL_EMBEDS_DEFAULTS.backoff,
        priority: PRIORITY_DEFAULT,
        removeOnComplete: 100,
        removeOnFail: 100,
        deduplication: { id: `resolve_crawl_oembed__${crawlId}`, mode: 'simple' },
        ordering: {
          key: 'oembed:api.example.com',
          rateLimit: { max: 1, duration: OEMBED_HOST_RATE_LIMIT_MS },
        },
      },
    })
  })

  it('bulk-enqueues independently ordered crawl IDs', async () => {
    const entries = [
      { crawlId: randomUUID(), endpointHostname: 'one.example.com' },
      { crawlId: randomUUID(), endpointHostname: 'two.example.com' },
    ]
    const jobs = await enqueueBulkCrawlEmbeds(entries, 7)
    expect(jobs.map(job => job.data)).toEqual(entries.map(entry => ({ crawl_id: entry.crawlId })))
    expect(jobs.map(job => job.opts.priority)).toEqual([7, 7])
    expect(jobs.map(job => job.opts.ordering?.key)).toEqual([
      'oembed:one.example.com',
      'oembed:two.example.com',
    ])
  })

  it('enqueues one throttled serialized backfill dispatcher', async () => {
    const job = await enqueueBackfillCrawlEmbeds()
    assert(job)
    expect(job).toMatchObject({
      data: {},
      opts: {
        priority: PRIORITY_DISPATCHER,
        deduplication: { id: 'backfill_crawl_embeds', mode: 'throttle' },
        ordering: { key: 'backfill', concurrency: 1 },
      },
    })
  })
})
