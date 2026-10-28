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

/** A succession of empty raw pages must retain the feed budget and reach backfill lanes. */
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
      updateRssFeedTiming(ids[2]!, new Date(asOf.getTime() - 60 * 60_000)),
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
        cursor: { lane: 5, afterId: uuidBefore(ids[0]!), throughId: ids[2] },
        asOf: asOf.toISOString(),
        remainingBudget: 1,
      },
      { ...RSS_FEEDS_DISPATCH_JOB.options, ordering: RSS_FEEDS_ORDERING.dispatcher },
    )
    assert.ok(first)
    jobs.push(first)
    const seen = new Set<string>()
    let reachedBackfill = false
    for (let page = 0; page < 20; page++) {
      const current = jobs.at(-1)!
      assert.ok(current)
      seen.add(current.id)
      await dispatcher.handle(current as Job<never>)
      const fetches = await background.searchJobs({
        name: RSS_FEEDS_FETCH_JOB.name,
        data: { rssFeedId: ids[2] },
      })
      if (fetches.length > 0) {
        reachedBackfill = true
        break
      }
      const candidates = await background.searchJobs({ name: RSS_FEEDS_DISPATCH_JOB.name })
      const next = candidates.find(
        row => (row.data as RssFeedsDispatchData).asOf === asOf.toISOString() && !seen.has(row.id),
      )
      assert.ok(next, 'empty eligible page must admit a cursor continuation')
      assert.equal((next.data as RssFeedsDispatchData).remainingBudget, 1)
      jobs.push(await background.getJob(next.id))
    }
    assert.ok(reachedBackfill, 'sparse due lane must reach a backfill feed beyond the raw page cap')
    for (const id of ids.slice(0, 2)) {
      const fetches = await background.searchJobs({
        name: RSS_FEEDS_FETCH_JOB.name,
        data: { rssFeedId: id },
      })
      assert.equal(fetches.length, 0)
    }
  } finally {
    restorePage()
    restoreBudget()
    await Promise.all(
      jobs.filter((job): job is NonNullable<typeof job> => job !== null).map(job => job.remove()),
    )
    for (const feedId of ownedFeedIds) {
      const fetches = await background.searchJobs({
        name: RSS_FEEDS_FETCH_JOB.name,
        data: { rssFeedId: feedId },
      })
      await Promise.all(fetches.map(job => job.remove()))
    }
    await deleteRssFeedsByIds(ownedFeedIds)
  }
}
