import assert from 'node:assert/strict'
import type { Job } from 'glide-mq'
import { background } from '@queues/background/queues'
import { RSS_FEEDS_ORDERING } from '@queues/rss-feeds/config'
import {
  RSS_FEEDS_DISPATCH_JOB,
  RSS_FEEDS_FETCH_JOB,
} from '@queues/background/enqueues/rss-feeds-jobs'
import {
  deleteRssFeedsByIds,
  insertTestRssFeedDirect,
  setRssFeedOwningTopicVoteScore,
  updateRssFeedTiming,
} from '../../test-helpers/entities/rss-feeds.mts'
import { getRssFeedCrawlTiers } from '../../test-helpers/data-stores/psql/rss-feed-crawl-tiers.mts'
import { refreshMaterializedView } from '@data-stores/psql/migrate'
import { overrideDynamicConfigFieldsForTest } from '../../test-helpers/dynamic-config.mts'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { rssFeedCrawlConfig } from '@services/rss-feeds/crawl-config'
import { uuidBefore } from '../../test-helpers/uuid-before.mts'
import { rssFeedsHandlers } from '@workers/rss-feeds/workers'

export async function checkRssWorkerContracts(): Promise<void> {
  const older = await insertTestRssFeedDirect({})
  const newer = await insertTestRssFeedDirect({})
  const fillers = await Promise.all(Array.from({ length: 3 }, () => insertTestRssFeedDirect({})))
  const ownedFeedIds = [older.id, newer.id, ...fillers.map(feed => feed.id)]
  assert.ok(older.id.localeCompare(newer.id) < 0, 'fixture UUID ordering')
  const restorePage = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
    rss_page_size: 1,
    background_max_depth: 1_000_000,
  })
  const restoreBudget = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
    capacity_budget: 1,
  })
  const dispatcher = rssFeedsHandlers.find(
    candidate => candidate.job.name === RSS_FEEDS_DISPATCH_JOB.name,
  )
  assert.ok(dispatcher, 'RSS dispatcher handler must be registered')
  let job: Awaited<ReturnType<typeof background.add>> | undefined
  let failed = false
  let failure: unknown
  try {
    // ast-grep-ignore: no-three-sequential-awaits -- write the score before refreshing the MV and reading its tier
    await setRssFeedOwningTopicVoteScore(newer.id, 1_000_000_000, 0)
    await refreshMaterializedView('mv_rss_feed_crawl_tiers')
    const [olderTier] = await getRssFeedCrawlTiers([older.id])
    const [newerTier] = await getRssFeedCrawlTiers([newer.id])
    assert.equal(olderTier, 5)
    assert.ok(newerTier !== undefined && newerTier < 5)
    await updateRssFeedTiming(older.id, new Date(Date.now() - 10 * 60_000))
    job = await background.add(
      RSS_FEEDS_DISPATCH_JOB.name,
      { cursor: { lane: newerTier, afterId: uuidBefore(older.id) } },
      { ...RSS_FEEDS_DISPATCH_JOB.options, ordering: RSS_FEEDS_ORDERING.dispatcher },
    )
    assert.ok(job, 'RSS dispatcher job admission')
    await dispatcher.handle(job as Job<never>)
    const [due, backfill] = await Promise.all([
      background.searchJobs({
        name: RSS_FEEDS_FETCH_JOB.name,
        data: { rssFeedId: newer.id },
      }),
      background.searchJobs({
        name: RSS_FEEDS_FETCH_JOB.name,
        data: { rssFeedId: older.id },
      }),
    ])
    assert.equal(due.length, 1, 'the newer due feed must consume the single run slot')
    assert.equal(backfill.length, 0, 'the older backfill feed must wait')
  } catch (err) {
    failed = true
    failure = err
  }

  try {
    restorePage()
    restoreBudget()
    await job?.remove()
    for (const feedId of ownedFeedIds) {
      const rows = await background.searchJobs({
        name: RSS_FEEDS_FETCH_JOB.name,
        data: { rssFeedId: feedId },
      })
      await Promise.all(rows.map(row => row.remove()))
    }
    await deleteRssFeedsByIds(ownedFeedIds)
    await refreshMaterializedView('mv_rss_feed_crawl_tiers')
  } catch (err) {
    if (failed)
      throw new AggregateError([failure, err], 'RSS worker contract cleanup failed', {
        cause: err,
      })
    throw err
  }
  if (failed) throw failure
}
