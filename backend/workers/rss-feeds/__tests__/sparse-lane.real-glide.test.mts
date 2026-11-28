import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import {
  RSS_FEEDS_DISPATCH_JOB,
  RSS_FEEDS_FETCH_JOB,
} from '@queues/background/enqueues/rss-feeds-jobs'
import { background } from '@queues/background/queues'
import { RSS_FEEDS_ORDERING } from '@queues/rss-feeds/config'
import { getRssFeedByIdToFetch } from '@services/rss-feeds'
import { rssFeedCrawlConfig } from '@services/rss-feeds/crawl-config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  deleteRssFeedsByIds,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers/entities/rss-feeds'
import { updateRssFeedTiming } from '@voucha/test-helpers/entities/rss-feeds-state'
import { setTestHostnameRateLimitedUntil } from '@voucha/test-helpers/entities/url-hostname-network-backoff'
import { captureRssJobs } from '@voucha/test-helpers/rss-dispatch-jobs'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { createTestUuidWindow } from '@voucha/test-helpers/uuid-window'
import { rssFeedsHandlers } from '../workers.mts'

type RssFeedsDispatchData = NonNullable<typeof RSS_FEEDS_DISPATCH_JOB.data>

describe('rss feed sparse lane', () => {
  // no-mistakes-timeout-reason: two real queue admissions each wait on the glide event deadline, after three owned feeds and their timing rows are written
  it(
    'skips fresh tier-5 feeds directly and continues to backfill when exhausted',
    { timeout: 25_000 },
    async () => {
      const { firstId, secondId, thirdId } = createTestUuidWindow()
      const ownedFeedIds: string[] = []
      const jobs: NonNullable<Awaited<ReturnType<typeof background.getJob>>>[] = []
      let restorePage = (): void => {}
      let restoreBudget = (): void => {}
      try {
        const feeds = await Promise.all(
          [firstId, secondId, thirdId].map(id => insertTestRssFeedDirect({ id })),
        )
        ownedFeedIds.push(...feeds.map(feed => feed.id))
        const ids = ownedFeedIds.toSorted()
        const asOf = new Date('2012-05-01T00:00:00.000Z')
        const asOfIso = asOf.toISOString()
        const dueAt = new Date(asOf.getTime() - 25 * 60 * 60_000)
        await Promise.all([
          updateRssFeedTiming(ids[0]!, asOf),
          updateRssFeedTiming(ids[1]!, asOf),
          updateRssFeedTiming(ids[2]!, dueAt),
        ])
        restorePage = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
          rss_page_size: 1,
          background_max_depth: 1_000_000,
        })
        restoreBudget = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
          capacity_budget: 1,
          tier1_sla_ms: 5 * 60_000,
          tier5_sla_ms: 24 * 60 * 60_000,
        })
        const dispatcher = rssFeedsHandlers.find(
          candidate => candidate.job.name === RSS_FEEDS_DISPATCH_JOB.name,
        )
        if (!dispatcher) throw new Error('RSS dispatcher handler must be registered')

        const first = await background.add(
          RSS_FEEDS_DISPATCH_JOB.name,
          {
            cursor: {
              lane: 5,
              afterLastSucceededAt: null,
              afterId: uuidBefore(ids[0]!),
              throughId: ids[2],
            },
            asOf: asOfIso,
            remainingBudget: 1,
          },
          { ...RSS_FEEDS_DISPATCH_JOB.options, ordering: RSS_FEEDS_ORDERING.dispatcher },
        )
        if (!first) throw new Error('RSS dispatcher job admission')
        jobs.push(first)

        // Fresh feeds ids[0] and ids[1] are skipped by the index; page 1 dispatches ids[2] directly.
        const dueAdmission = await captureRssJobs(
          () => dispatcher.handle(first as Job<never>),
          1,
          row =>
            row.name === RSS_FEEDS_FETCH_JOB.name &&
            ids.includes((row.data as { rssFeedId: string }).rssFeedId),
          row => jobs.push(row),
        )
        const dueJob = dueAdmission.jobs[0]
        if (!dueJob) throw new Error('due feed admission')
        expect((dueAdmission.result as { count: number; rawRowsRead: number }).count).toBe(1)
        expect((dueAdmission.result as { count: number; rawRowsRead: number }).rawRowsRead).toBe(1)
        expect(dueJob.name).toBe(RSS_FEEDS_FETCH_JOB.name)
        expect((dueJob.data as { rssFeedId: string }).rssFeedId).toBe(ids[2])

        const emptyTail = await background.add(
          RSS_FEEDS_DISPATCH_JOB.name,
          {
            cursor: {
              lane: 5,
              afterLastSucceededAt: dueAt.toISOString(),
              afterId: ids[2]!,
              throughId: ids[2],
            },
            asOf: asOfIso,
            remainingBudget: 1,
          },
          { ...RSS_FEEDS_DISPATCH_JOB.options, ordering: RSS_FEEDS_ORDERING.dispatcher },
        )
        if (!emptyTail) throw new Error('RSS empty-tail dispatcher job admission')
        jobs.push(emptyTail)
        const tail = await captureRssJobs(
          () => dispatcher.handle(emptyTail as Job<never>),
          1,
          row =>
            row.name === RSS_FEEDS_DISPATCH_JOB.name &&
            (row.data as RssFeedsDispatchData).asOf === asOfIso &&
            (row.data as RssFeedsDispatchData).cursor?.lane === 6,
          row => jobs.push(row),
        )
        expect((tail.result as { count: number }).count).toBe(0)
        const laneSix = tail.jobs[0]
        if (!laneSix) {
          throw new Error('exhausted lane 5 must continue to failing lane 6 with capacity retained')
        }
        expect(laneSix.name).toBe(RSS_FEEDS_DISPATCH_JOB.name)
        expect((laneSix.data as RssFeedsDispatchData).cursor?.lane).toBe(6)
        expect((laneSix.data as RssFeedsDispatchData).remainingBudget).toBe(1)
      } finally {
        restorePage()
        restoreBudget()
        await Promise.all(jobs.map(job => job.remove()))
        await deleteRssFeedsByIds(ownedFeedIds)
      }
    },
  )

  // no-mistakes-timeout-reason: exercises a real glide dispatcher job with three rate-limited feeds exhausting remainingRawBudget
  it(
    'stops chaining continuations when remainingRawBudget is exhausted by skipped rows',
    { timeout: 15_000 },
    async () => {
      const { firstId, secondId, thirdId } = createTestUuidWindow()
      const ownedFeedIds: string[] = []
      let job: Awaited<ReturnType<typeof background.add>> | undefined
      let restorePage = (): void => {}
      let restoreBudget = (): void => {}
      try {
        const feeds = await Promise.all(
          [firstId, secondId, thirdId].map(id => insertTestRssFeedDirect({ id })),
        )
        ownedFeedIds.push(...feeds.map(feed => feed.id))
        const ids = ownedFeedIds.toSorted()
        const rows = await Promise.all(ids.map(id => getRssFeedByIdToFetch(id, { ttl: 0 })))
        await Promise.all(
          rows.map(row =>
            setTestHostnameRateLimitedUntil(row!.url_hostname_id, new Date(Date.now() + 60_000)),
          ),
        )
        restorePage = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
          rss_page_size: 2,
          background_max_depth: 1_000_000,
        })
        restoreBudget = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
          capacity_budget: 5,
        })
        const dispatcher = rssFeedsHandlers.find(
          candidate => candidate.job.name === RSS_FEEDS_DISPATCH_JOB.name,
        )
        if (!dispatcher) throw new Error('RSS dispatcher handler must be registered')

        job = await background.add(
          RSS_FEEDS_DISPATCH_JOB.name,
          {
            cursor: {
              lane: 5,
              afterLastSucceededAt: null,
              afterId: uuidBefore(ids[0]!),
              throughId: ids[2],
            },
            asOf: new Date('2012-05-01T00:00:00.000Z').toISOString(),
            remainingBudget: 5,
            remainingRawBudget: 2,
          },
          { ...RSS_FEEDS_DISPATCH_JOB.options, ordering: RSS_FEEDS_ORDERING.dispatcher },
        )
        if (!job) throw new Error('RSS dispatcher job admission')

        const result = (await dispatcher.handle(job as Job<never>)) as {
          count: number
          rawRowsRead: number
        }
        expect(result).toEqual({ count: 0, rawRowsRead: 2 })
        const finished = await background.getJob(job.id)
        const receipt = (
          finished?.data as RssFeedsDispatchData & { dispatchReceipt?: { next?: unknown } }
        )?.dispatchReceipt
        expect(receipt?.next).toBeUndefined()
      } finally {
        restorePage()
        restoreBudget()
        await job?.remove()
        await deleteRssFeedsByIds(ownedFeedIds)
      }
    },
  )
})
