import assert from 'node:assert/strict'
import type { Job } from 'glide-mq'
import { background } from '@queues/background/queues'
import {
  RSS_FEEDS_DISPATCH_JOB,
  RSS_FEEDS_FETCH_JOB,
  type RssFeedsDispatchData,
} from '@queues/background/enqueues/rss-feeds-jobs'
import { RSS_FEEDS_ORDERING } from '@queues/rss-feeds/config'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { rssFeedCrawlConfig } from '@services/rss-feeds/crawl-config'
import {
  insertTestRssFeedDirect,
  deleteRssFeedsByIds,
} from '@voucha/test-helpers/entities/rss-feeds'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { rssFeedsHandlers } from '@workers/rss-feeds/workers'
import { updateRssFeedTiming } from '@voucha/test-helpers/entities/rss-feeds-state'
import { captureRssJobs } from '@voucha/test-helpers/rss-dispatch-jobs'

/** A succession of empty raw pages must retain the feed budget and reach a later due feed. */
export async function checkRssWorkerSparseLane(): Promise<void> {
  const ownedFeedIds: string[] = []
  const jobs: Array<Awaited<ReturnType<typeof background.getJob>>> = []
  let restorePage: () => void = () => {}
  let restoreBudget: () => void = () => {}
  try {
    const feeds = await Promise.all(Array.from({ length: 3 }, () => insertTestRssFeedDirect({})))
    ownedFeedIds.push(...feeds.map(feed => feed.id))
    const ids = ownedFeedIds.toSorted()
    const asOf = new Date()
    await Promise.all([
      updateRssFeedTiming(ids[0]!, asOf),
      updateRssFeedTiming(ids[1]!, asOf),
      updateRssFeedTiming(ids[2]!, new Date(asOf.getTime() - 25 * 60 * 60_000)),
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
    assert.ok(dispatcher)
    const first = await background.add(
      RSS_FEEDS_DISPATCH_JOB.name,
      {
        cursor: {
          lane: 5,
          afterId: uuidBefore(ids[0]!),
          throughId: ids[2],
        },
        asOf: asOf.toISOString(),
        remainingBudget: 1,
      },
      { ...RSS_FEEDS_DISPATCH_JOB.options, ordering: RSS_FEEDS_ORDERING.dispatcher },
    )
    assert.ok(first)
    jobs.push(first)
    let current = first
    for (let page = 0; page < 3; page++) {
      const pageJob: Job<never> = current as Job<never>
      const isEmptyPage = page < 2
      const expectedAfterId = ids[page]
      const admission: Awaited<ReturnType<typeof captureRssJobs>> = await captureRssJobs(
        () => dispatcher.handle(pageJob),
        1,
        row =>
          isEmptyPage
            ? row.name === RSS_FEEDS_DISPATCH_JOB.name &&
              (row.data as RssFeedsDispatchData).asOf === asOf.toISOString() &&
              (row.data as RssFeedsDispatchData).cursor?.afterId === expectedAfterId
            : row.name === RSS_FEEDS_FETCH_JOB.name &&
              ids.includes((row.data as { rssFeedId: string }).rssFeedId),
        row => jobs.push(row),
      )
      const next: NonNullable<Awaited<ReturnType<typeof background.getJob>>> | undefined =
        admission.jobs[0]
      assert.ok(next)
      if (isEmptyPage) {
        assert.equal(
          (admission.result as { count: number }).count,
          0,
          'fresh raw page must admit no feed',
        )
        assert.equal(next.name, RSS_FEEDS_DISPATCH_JOB.name)
        assert.equal((next.data as RssFeedsDispatchData).remainingBudget, 1)
        assert.equal((next.data as RssFeedsDispatchData).cursor?.lane, 5)
        current = next
      } else {
        assert.equal((admission.result as { count: number }).count, 1)
        assert.equal(next.name, RSS_FEEDS_FETCH_JOB.name)
        assert.equal((next.data as { rssFeedId: string }).rssFeedId, ids[2])
      }
    }
    const emptyTail = await background.add(
      RSS_FEEDS_DISPATCH_JOB.name,
      {
        cursor: { lane: 5, afterId: ids[2]!, throughId: ids[2] },
        asOf: asOf.toISOString(),
        remainingBudget: 1,
      },
      { ...RSS_FEEDS_DISPATCH_JOB.options, ordering: RSS_FEEDS_ORDERING.dispatcher },
    )
    assert.ok(emptyTail)
    jobs.push(emptyTail)
    const tail = await captureRssJobs(
      () => dispatcher.handle(emptyTail as Job<never>),
      1,
      row =>
        row.name === RSS_FEEDS_DISPATCH_JOB.name &&
        (row.data as RssFeedsDispatchData).asOf === asOf.toISOString() &&
        (row.data as RssFeedsDispatchData).cursor?.lane === 6,
      row => jobs.push(row),
    )
    assert.equal((tail.result as { count: number }).count, 0)
    const laneSix = tail.jobs[0]
    assert.ok(laneSix, 'exhausted lane must continue to backfill with capacity retained')
    assert.equal(laneSix.name, RSS_FEEDS_DISPATCH_JOB.name)
    assert.equal((laneSix.data as RssFeedsDispatchData).cursor?.lane, 6)
    assert.equal((laneSix.data as RssFeedsDispatchData).remainingBudget, 1)
  } finally {
    restorePage()
    restoreBudget()
    await Promise.all(
      jobs.filter((job): job is NonNullable<typeof job> => job !== null).map(job => job.remove()),
    )
    await deleteRssFeedsByIds(ownedFeedIds)
  }
}
