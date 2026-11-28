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

function getDispatcherHandler() {
  const dispatcher = rssFeedsHandlers.find(c => c.job.name === RSS_FEEDS_DISPATCH_JOB.name)
  if (!dispatcher) throw new Error('RSS dispatcher handler must be registered')
  return dispatcher
}

async function addDispatchJob(data: RssFeedsDispatchData) {
  const job = await background.add(RSS_FEEDS_DISPATCH_JOB.name, data, {
    ...RSS_FEEDS_DISPATCH_JOB.options,
    ordering: RSS_FEEDS_ORDERING.dispatcher,
  })
  if (!job) throw new Error('RSS dispatcher job admission')
  return job
}

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
        const dispatcher = getDispatcherHandler()

        const first = await addDispatchJob({
          cursor: {
            lane: 5,
            afterLastSucceededAt: null,
            afterId: uuidBefore(ids[0]!),
            throughId: ids[2],
          },
          asOf: asOfIso,
          remainingBudget: 1,
        })
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

        const emptyTail = await addDispatchJob({
          cursor: {
            lane: 5,
            afterLastSucceededAt: dueAt.toISOString(),
            afterId: ids[2]!,
            throughId: ids[2],
          },
          asOf: asOfIso,
          remainingBudget: 1,
        })
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
        const dispatcher = getDispatcherHandler()

        job = await addDispatchJob({
          cursor: {
            lane: 5,
            afterLastSucceededAt: null,
            afterId: uuidBefore(ids[0]!),
            throughId: ids[2],
          },
          asOf: new Date('2012-05-01T00:00:00.000Z').toISOString(),
          remainingBudget: 5,
          remainingRawBudget: 2,
        })

        const result = (await dispatcher.handle(job as Job<never>)) as {
          count: number
          rawRowsRead: number
          nextCursor?: { lane: number; afterId: string }
        }
        expect(result).toMatchObject({
          count: 0,
          rawRowsRead: 2,
          nextCursor: { lane: 5, afterId: ids[1] },
        })
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

  // no-mistakes-timeout-reason: runs two real glide dispatch continuations past a blocked prefix longer than one page rawBudget
  it(
    'advances a continuation past a blocked prefix longer than page rawBudget and dispatches a healthy feed behind it',
    { timeout: 25_000 },
    async () => {
      const ownedFeedIds: string[] = []
      const jobs: NonNullable<Awaited<ReturnType<typeof background.getJob>>>[] = []
      let restorePage = (): void => {}
      let restoreBudget = (): void => {}
      try {
        const feeds = await Promise.all(
          Array.from({ length: 6 }, () => insertTestRssFeedDirect({})),
        )
        ownedFeedIds.push(...feeds.map(feed => feed.id))
        const ids = ownedFeedIds.toSorted()
        const asOf = new Date('2012-06-15T00:00:00.000Z')
        const asOfIso = asOf.toISOString()
        const baseMs = asOf.getTime() - 48 * 60 * 60_000
        await Promise.all(ids.map((id, i) => updateRssFeedTiming(id, new Date(baseMs + i * 1000))))
        const blockedIds = ids.slice(0, 5)
        const healthyId = ids[5]!
        const blockedRows = await Promise.all(
          blockedIds.map(id => getRssFeedByIdToFetch(id, { ttl: 0 })),
        )
        await Promise.all(
          blockedRows.map(row =>
            setTestHostnameRateLimitedUntil(row!.url_hostname_id, new Date(Date.now() + 60_000)),
          ),
        )
        restorePage = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
          rss_page_size: 1,
          background_max_depth: 1_000_000,
        })
        restoreBudget = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
          capacity_budget: 2,
          tier5_sla_ms: 24 * 60 * 60_000,
        })
        const dispatcher = getDispatcherHandler()
        const first = await addDispatchJob({
          cursor: {
            lane: 5,
            afterLastSucceededAt: new Date(baseMs - 1000).toISOString(),
            afterId: uuidBefore(ids[0]!),
            throughId: healthyId,
          },
          asOf: asOfIso,
          remainingBudget: 2,
          remainingRawBudget: 10,
        })
        jobs.push(first)

        // Page 1 scans 4 blocked rows (pageRawBudget = 4) and enqueues a continuation past blockedIds[3].
        const page1 = await captureRssJobs(
          () => dispatcher.handle(first as Job<never>),
          1,
          row =>
            row.name === RSS_FEEDS_DISPATCH_JOB.name &&
            (row.data as RssFeedsDispatchData).asOf === asOfIso &&
            (row.data as RssFeedsDispatchData).cursor?.afterId === blockedIds[3],
          row => jobs.push(row),
        )
        expect(page1.result).toMatchObject({
          count: 0,
          rawRowsRead: 4,
          nextCursor: { lane: 5, afterId: blockedIds[3] },
        })
        const continuation = page1.jobs[0]!
        expect((continuation.data as RssFeedsDispatchData).remainingRawBudget).toBe(6)

        // Page 2 skips blockedIds[4] and dispatches healthyId.
        const page2 = await captureRssJobs(
          () => dispatcher.handle(continuation as Job<never>),
          1,
          row =>
            row.name === RSS_FEEDS_FETCH_JOB.name &&
            (row.data as { rssFeedId: string }).rssFeedId === healthyId,
          row => jobs.push(row),
        )
        expect(page2.result).toMatchObject({ count: 1, rawRowsRead: 2 })
        expect((page2.jobs[0]!.data as { rssFeedId: string }).rssFeedId).toBe(healthyId)
      } finally {
        restorePage()
        restoreBudget()
        await Promise.all(jobs.map(job => job.remove()))
        await deleteRssFeedsByIds(ownedFeedIds)
      }
    },
  )
})
