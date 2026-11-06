import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
} from '@voucha/test-helpers'
import {
  addCandidateSource,
  setCandidatePublication,
} from '@voucha/test-helpers/rss-feed-candidates'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { runRealRssMaintenanceJob } from '@voucha/test-helpers/real-rss-maintenance-job'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { postPublicationWorkConfig } from '@services/post-publication/work-limits'
import { getCandidateReconciliation } from '@services/rss-feed-items/candidate-reconciliation-state'
import { QUEUE_NAME } from '@queues/rss-feed-maintenance/config'
import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import { processRssFeedMaintenanceJob } from '../processors.mts'

describe('RSS feed candidate worker', () => {
  it('dispatches one bounded work page and enqueues a distinct continuation after processing', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
        rss_feed_candidate_dispatch_size: 1,
        rss_feed_candidate_page_size: 1,
      }),
    )
    const feed = await createTestRssFeedWithTiming((await createTestTopic()).id)
    const otherFeed = await createTestRssFeedWithTiming((await createTestTopic()).id)
    const item = await createTestRssFeedItemWithUrl(feed)
    await addCandidateSource(item.id, otherFeed)
    await setCandidatePublication(item.id, new Date(Date.now() - 60_000))
    expect(await getCandidateReconciliation(item.id)).toBeDefined()
    const sweepId = randomUUID()
    const ownedJobs: { remove: () => Promise<unknown> }[] = []
    onTestFinished(async () => {
      await Promise.all(ownedJobs.map(job => job.remove()))
    })
    const runJob = (name: string, data: Record<string, unknown>) =>
      runRealRssMaintenanceJob(QUEUE_NAME, name, data, processRssFeedMaintenanceJob)

    expect(
      await runJob('dispatchRssFeedItemCandidates', {
        afterId: uuidBefore(item.id),
        sweepId,
      }),
    ).toEqual({ enqueued: 1 })
    const firstPage = await rssFeedMaintenance.searchJobs({
      name: 'processReconcileRssFeedItemCandidates',
      data: { itemId: item.id },
    })
    const nextDispatch = await rssFeedMaintenance.searchJobs({
      name: 'dispatchRssFeedItemCandidates',
      data: { sweepId },
    })
    ownedJobs.push(...firstPage, ...nextDispatch)
    expect(firstPage).toHaveLength(1)
    expect(nextDispatch).toHaveLength(1)
    expect(nextDispatch[0]!.data).toMatchObject({
      afterId: item.id,
      throughId: expect.any(String),
    })

    expect(await runJob('processReconcileRssFeedItemCandidates', { itemId: item.id })).toEqual({
      hasMore: true,
    })
    const continued = await rssFeedMaintenance.searchJobs({
      name: 'processReconcileRssFeedItemCandidates',
      data: { itemId: item.id },
    })
    ownedJobs.push(...continued.filter(job => !firstPage.some(firstJob => firstJob.id === job.id)))
    expect(continued).toHaveLength(2)
    expect(continued.map(job => job.id)).toEqual(
      expect.arrayContaining([firstPage[0]!.id, expect.stringContaining(`${item.id}__1_sources_`)]),
    )
    expect(await runJob('processReconcileRssFeedItemCandidates', { itemId: randomUUID() })).toEqual(
      { hasMore: false },
    )
  })
})
