import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { background } from '@queues/background/queues'
import {
  RSS_FEEDS_DISPATCH_JOB,
  RSS_FEEDS_FETCH_JOB,
} from '@queues/background/enqueues/rss-feeds-jobs'
import { insertTestRssFeedDirect } from '@voucha/test-helpers/entities/rss-feeds'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { rssFeedCrawlConfig } from '@services/rss-feeds/crawl-config'
import { RSS_FEEDS_ORDERING } from '@queues/rss-feeds/config'
import { rssFeedsHandlers } from './workers.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())

describe('RSS paged dispatcher through the background handler', () => {
  it('preserves the run budget and dispatcher ordering across pages', async () => {
    const feeds = await Promise.all([
      insertTestRssFeedDirect({}),
      insertTestRssFeedDirect({}),
      insertTestRssFeedDirect({}),
    ])
    const feedIds = feeds.map(feed => feed.id).toSorted()
    const restore = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
      rss_page_size: 1,
      background_max_depth: 1_000_000,
    })
    const restoreBudget = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
      capacity_budget: 2,
    })
    const dispatcher = rssFeedsHandlers.find(
      candidate => candidate.job.name === RSS_FEEDS_DISPATCH_JOB.name,
    )
    if (!dispatcher) throw new Error('RSS dispatcher handler is not registered')

    const firstJob = await background.add(RSS_FEEDS_DISPATCH_JOB.name, {
      afterId: uuidBefore(feedIds[0]!),
    })
    if (!firstJob) throw new Error('Expected RSS dispatcher job admission')
    let continuation: Awaited<ReturnType<typeof background.getJob>> | undefined
    try {
      await dispatcher.handle(firstJob as Job<never>)
      const firstPageRows = await background.searchJobs({
        name: RSS_FEEDS_FETCH_JOB.name,
        data: { rssFeedId: feedIds[0] },
      })
      expect(firstPageRows).toHaveLength(1)

      const continuations = await background.searchJobs({
        name: RSS_FEEDS_DISPATCH_JOB.name,
        data: { afterId: feedIds[0] },
      })
      expect(continuations).toHaveLength(1)
      continuation = await background.getJob(continuations[0]!.id)
      if (!continuation) throw new Error('Expected persisted RSS continuation')
      expect(continuation.data).toMatchObject({ afterId: feedIds[0], remainingBudget: 1 })
      expect(continuation.opts.ordering).toEqual(RSS_FEEDS_ORDERING.dispatcher)

      await dispatcher.handle(continuation as Job<never>)
      const secondPageRows = await background.searchJobs({
        name: RSS_FEEDS_FETCH_JOB.name,
        data: { rssFeedId: feedIds[1] },
      })
      expect(secondPageRows).toHaveLength(1)
      const thirdPageRows = await background.searchJobs({
        name: RSS_FEEDS_FETCH_JOB.name,
        data: { rssFeedId: feedIds[2] },
      })
      expect(thirdPageRows).toHaveLength(0)
      const furtherContinuations = await background.searchJobs({
        name: RSS_FEEDS_DISPATCH_JOB.name,
        data: { afterId: feedIds[1] },
      })
      expect(furtherContinuations).toHaveLength(0)
    } finally {
      restore()
      restoreBudget()
      await Promise.all([firstJob.remove(), continuation?.remove()])
      for (const feedId of feedIds) {
        const rows = await background.searchJobs({
          name: RSS_FEEDS_FETCH_JOB.name,
          data: { rssFeedId: feedId },
        })
        await Promise.all(rows.map(row => row.remove()))
      }
    }
  })
})
