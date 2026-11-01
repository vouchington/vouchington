import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { getBackgroundOrderingConcurrency } from '@queues/background/config'
import {
  RSS_FEEDS_DISPATCH_JOB,
  RSS_FEEDS_FETCH_JOB,
} from '@queues/background/enqueues/rss-feeds-jobs'
import { background } from '@queues/background/queues'
import { RSS_FEEDS_ORDERING } from '@queues/rss-feeds/config'
import { rssFeedCrawlConfig } from '@services/rss-feeds/crawl-config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  deleteRssFeedsByIds,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers/entities/rss-feeds'
import { captureRssJobs } from '@voucha/test-helpers/rss-dispatch-jobs'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { createTestUuidWindow } from '@voucha/test-helpers/uuid-window'
import { rssFeedsHandlers } from './workers.mts'

type RssFeedsDispatchData = NonNullable<typeof RSS_FEEDS_DISPATCH_JOB.data>

describe('rss feed paged dispatch', () => {
  // no-mistakes-timeout-reason: two real queue admissions each wait on the glide event deadline, after three owned feeds are inserted
  it('pages owned feeds until the crawl budget is exhausted', { timeout: 15_000 }, async () => {
    const { firstId, secondId, thirdId } = createTestUuidWindow()
    const feeds = await Promise.all(
      [firstId, secondId, thirdId].map(id => insertTestRssFeedDirect({ id })),
    )
    const feedIds = feeds.map(feed => feed.id).toSorted()
    const restorePage = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
      rss_page_size: 1,
      background_max_depth: 1_000_000,
    })
    const restoreBudget = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
      capacity_budget: 2,
    })
    const admitted: NonNullable<Awaited<ReturnType<typeof background.getJob>>>[] = []
    let firstJob: Awaited<ReturnType<typeof background.add>> | undefined
    try {
      const dispatcher = rssFeedsHandlers.find(
        candidate => candidate.job.name === RSS_FEEDS_DISPATCH_JOB.name,
      )
      if (!dispatcher) throw new Error('RSS dispatcher handler must be registered')

      firstJob = await background.add(
        RSS_FEEDS_DISPATCH_JOB.name,
        { cursor: { lane: 5, afterId: uuidBefore(feedIds[0]!), throughId: feedIds[2] } },
        { ...RSS_FEEDS_DISPATCH_JOB.options, ordering: RSS_FEEDS_ORDERING.dispatcher },
      )
      if (!firstJob) throw new Error('RSS dispatcher job admission')
      const firstAdmission = await captureRssJobs(
        () => dispatcher.handle(firstJob as Job<never>),
        2,
        row =>
          (row.name === RSS_FEEDS_FETCH_JOB.name &&
            feedIds.includes((row.data as { rssFeedId: string }).rssFeedId)) ||
          (row.name === RSS_FEEDS_DISPATCH_JOB.name &&
            (row.data as RssFeedsDispatchData).cursor?.afterId === feedIds[0]),
        row => admitted.push(row),
      )
      const firstPage = firstAdmission.result as { count: number }
      expect(firstPage.count).toBe(1)
      expect(
        firstAdmission.jobs.filter(
          row =>
            row.name === RSS_FEEDS_FETCH_JOB.name &&
            (row.data as { rssFeedId: string }).rssFeedId === feedIds[0],
        ),
      ).toHaveLength(1)

      const continuations = firstAdmission.jobs.filter(
        row =>
          row.name === RSS_FEEDS_DISPATCH_JOB.name &&
          (row.data as RssFeedsDispatchData).cursor?.afterId === feedIds[0],
      )
      expect(continuations).toHaveLength(1)
      const continuation = await background.getJob(continuations[0]!.id)
      if (!continuation) throw new Error('Expected persisted RSS continuation')
      const data = continuation.data as RssFeedsDispatchData
      expect(data.cursor?.lane).toBe(5)
      expect(data.cursor?.afterId).toBe(feedIds[0])
      expect(typeof data.asOf).toBe('string')
      expect(data.remainingBudget).toBe(1)
      expect(continuation.opts.ordering).toEqual({
        ...RSS_FEEDS_ORDERING.dispatcher,
        concurrency: getBackgroundOrderingConcurrency(RSS_FEEDS_ORDERING.dispatcher.key),
      })

      const secondAdmission = await captureRssJobs(
        () => dispatcher.handle(continuation as Job<never>),
        1,
        row =>
          row.name === RSS_FEEDS_FETCH_JOB.name &&
          feedIds.includes((row.data as { rssFeedId: string }).rssFeedId),
        row => admitted.push(row),
      )
      expect((secondAdmission.result as { count: number }).count).toBe(1)
      expect(
        secondAdmission.jobs.filter(
          row =>
            row.name === RSS_FEEDS_FETCH_JOB.name &&
            (row.data as { rssFeedId: string }).rssFeedId === feedIds[1],
        ),
      ).toHaveLength(1)
      const exhaustedJob = await background.getJob(continuation.id)
      if (!exhaustedJob) throw new Error('Expected exhausted RSS continuation')
      const receipt = (
        exhaustedJob.data as RssFeedsDispatchData & { dispatchReceipt?: { next?: unknown } }
      ).dispatchReceipt
      expect(receipt?.next).toBeUndefined()
    } finally {
      restorePage()
      restoreBudget()
      await firstJob?.remove()
      await Promise.all(admitted.map(row => row.remove()))
      await deleteRssFeedsByIds(feedIds)
    }
  })
})
