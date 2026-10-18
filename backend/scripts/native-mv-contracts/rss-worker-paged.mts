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

/** The lane-5 cursor and run budget are global, so this real-queue case has one native owner. */
export async function checkRssWorkerPagedContracts(): Promise<void> {
  const ownedFeedIds: string[] = []
  let firstJob: Awaited<ReturnType<typeof background.add>> | undefined
  let continuation: Awaited<ReturnType<typeof background.getJob>> | undefined
  let restorePage: () => void = () => {}
  let restoreBudget: () => void = () => {}
  let failure: unknown
  let failed = false

  try {
    for (let index = 0; index < 3; index++) {
      const feed = await insertTestRssFeedDirect({})
      ownedFeedIds.push(feed.id)
    }
    const feedIds = ownedFeedIds.toSorted()
    restorePage = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
      rss_page_size: 1,
      background_max_depth: 1_000_000,
    })
    restoreBudget = overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
      capacity_budget: 2,
    })
    const dispatcher = rssFeedsHandlers.find(
      candidate => candidate.job.name === RSS_FEEDS_DISPATCH_JOB.name,
    )
    assert.ok(dispatcher, 'RSS dispatcher handler must be registered')

    firstJob = await background.add(RSS_FEEDS_DISPATCH_JOB.name, {
      cursor: { lane: 5, afterId: uuidBefore(feedIds[0]!) },
    })
    assert.ok(firstJob, 'RSS dispatcher job admission')
    await dispatcher.handle(firstJob as Job<never>)
    const firstPageRows = await background.searchJobs({
      name: RSS_FEEDS_FETCH_JOB.name,
      data: { rssFeedId: feedIds[0] },
    })
    assert.equal(firstPageRows.length, 1, 'the first feed must receive a real fetch job')

    const continuations = (
      await background.searchJobs({ name: RSS_FEEDS_DISPATCH_JOB.name })
    ).filter(row => (row.data as RssFeedsDispatchData).cursor?.afterId === feedIds[0])
    assert.equal(continuations.length, 1, 'the first page must persist one continuation')
    continuation = await background.getJob(continuations[0]!.id)
    assert.ok(continuation, 'Expected persisted RSS continuation')
    const data = continuation.data as RssFeedsDispatchData
    assert.equal(data.cursor?.lane, 5)
    assert.equal(data.cursor?.afterId, feedIds[0])
    assert.equal(typeof data.asOf, 'string')
    assert.equal(data.remainingBudget, 1)
    assert.deepEqual(continuation.opts.ordering, RSS_FEEDS_ORDERING.dispatcher)

    await dispatcher.handle(continuation as Job<never>)
    const secondPageRows = await background.searchJobs({
      name: RSS_FEEDS_FETCH_JOB.name,
      data: { rssFeedId: feedIds[1] },
    })
    assert.equal(secondPageRows.length, 1, 'the second feed must receive a real fetch job')
    const thirdPageRows = await background.searchJobs({
      name: RSS_FEEDS_FETCH_JOB.name,
      data: { rssFeedId: feedIds[2] },
    })
    assert.equal(thirdPageRows.length, 0, 'the third feed must remain outside the run budget')
    const furtherContinuations = (
      await background.searchJobs({ name: RSS_FEEDS_DISPATCH_JOB.name })
    ).filter(row => (row.data as RssFeedsDispatchData).cursor?.afterId === feedIds[1])
    assert.equal(furtherContinuations.length, 0, 'the exhausted budget must not continue')
  } catch (err) {
    failed = true
    failure = err
  }

  const cleanupErrors: unknown[] = []
  for (const cleanup of [
    async () => restorePage(),
    async () => restoreBudget(),
    async () => firstJob?.remove(),
    async () => continuation?.remove(),
    async () => {
      for (const feedId of ownedFeedIds) {
        const rows = await background.searchJobs({
          name: RSS_FEEDS_FETCH_JOB.name,
          data: { rssFeedId: feedId },
        })
        await Promise.all(rows.map(row => row.remove()))
      }
    },
    async () => deleteRssFeedsByIds(ownedFeedIds),
  ]) {
    try {
      await cleanup()
    } catch (err) {
      cleanupErrors.push(err)
    }
  }
  if (cleanupErrors.length > 0 && failed) {
    throw new AggregateError([failure, ...cleanupErrors], 'RSS paged contract and cleanup failed')
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'RSS paged contract cleanup failed')
  }
  if (failed) throw failure
}
