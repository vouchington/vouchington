import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, onTestFinished } from 'vitest'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import {
  RSS_FEEDS_DISPATCH_JOB,
  RSS_FEEDS_FETCH_JOB,
  RSS_FEEDS_JOBS,
} from '@queues/background/enqueues/rss-feeds-jobs'
import type { BackgroundHandler } from '@queues/background/types'
import { enqueueBulkFetchRssFeeds } from '@queues/rss-feeds/enqueues'
import { backgroundQueue as rssFeedsQueue } from '@voucha/test-helpers/shared-background-queue'
import { rssFeedCrawlConfig } from '@services/rss-feeds/crawl-config'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { processRssFeedsDispatcher } from '../../rss-feeds/processors.mts'
import { BACKGROUND_HANDLERS } from '../processors/handlers.mts'
import { createBackgroundWorker } from '../workers/create-worker.mts'

const fetched: string[] = []

// No-op handlers, never the real rss-feeds handlers: the real fetch would call the network.
const worker = createBackgroundWorker({
  handlers: [
    ...BACKGROUND_HANDLERS.filter(handler => handler.job.domain !== 'rss-feeds'),
    ...RSS_FEEDS_JOBS.map((job): BackgroundHandler => ({
      job,
      handle: queued => {
        const rssFeedId = (queued.data as { rssFeedId?: string }).rssFeedId
        if (rssFeedId) fetched.push(rssFeedId)
      },
    })),
  ],
  domains: ['rss-feeds'],
})

describe('rss-feeds background domain', () => {
  afterAll(async () => {
    await closeAndUnregisterGlideMQInstance(worker)
  })

  it('serves a requested fetch through the shared worker and admits the feed again once it completes', async () => {
    const rssFeedId = randomUUID()

    await enqueueBulkFetchRssFeeds([rssFeedId], { ttl: 60_000 })
    await enqueueBulkFetchRssFeeds([rssFeedId], { ttl: 60_000 })

    const jobs = await rssFeedsQueue.searchJobs({
      name: RSS_FEEDS_FETCH_JOB.name,
      data: { rssFeedId },
    })
    expect(fetched.filter(id => id === rssFeedId)).toHaveLength(2)
    expect(new Set(jobs.map(job => job.id)).size).toBe(2)
    for (const job of jobs) expect(await job.getState()).toBe('completed')
  })

  it('runs the dispatcher as one page bounded by the crawl capacity budget', async () => {
    onTestFinished(overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { capacity_budget: 2 }))
    const feeds = await Promise.all([
      createTestRssFeed({}),
      createTestRssFeed({}),
      createTestRssFeed({}),
    ])
    feeds.sort((left, right) => left.id.localeCompare(right.id))

    const result = await processRssFeedsDispatcher(undefined, {
      cursor: { lane: 5, afterId: uuidBefore(feeds[0]!.id), throughId: feeds[2]!.id },
      asOf: new Date(),
      limit: 2,
      rawBudget: 2,
    })

    expect(result.count).toBe(2)
    expect(result.rawRowsRead).toBe(2)
    expect(result.nextCursor?.afterId).toBe(feeds[1]!.id)
    expect(RSS_FEEDS_DISPATCH_JOB.options.priority).toBe(100)
  })
})
