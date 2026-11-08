import { postPublicationWorkConfig } from '@services/post-publication/work-limits'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { background } from '@queues/background/queues'
import {
  PUBLISHER_TYPE_FEED_PUBLICATION_JOB,
  POST_PUBLICATION_EFFECTS_JOB,
} from '@queues/background/enqueues/post-publication-jobs'
import { enqueuePublisherTypeFeedPublication } from '@queues/post-publication/enqueues'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import {
  createTestTopic,
  createTestUser,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { insertTestRssFeedDirect } from '@voucha/test-helpers/entities/rss-feeds'
import {
  capturePublisherFeedPageJobs,
  readPublisherTypeFeedJob,
} from '@voucha/test-helpers/publisher-feed-publication-jobs'
import { getEnqueuedJobId } from '@voucha/test-helpers/queue-jobs'
import { processPublisherTypeFeedContinuation } from './publisher-type-feeds.mts'

describe('publisher feed capture through native queue receipts', () => {
  // no-mistakes-timeout-reason: owned feed fixtures and two native queue stream admission waits
  it(
    'continues on its dispatcher lane and replays a receipted page without re-admitting removed effects',
    { timeout: 15000 },
    async () => {
      const user = await createTestUser()
      const first = await createTestTopic({ user })
      const second = await createTestTopic({ user })
      await insertTestRssFeedDirect({ topicId: first.id })
      await insertTestRssFeedDirect({ topicId: second.id })
      const topicIds = [first.id, second.id].toSorted()
      const changeId = randomUUID()
      onTestFinished(
        overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
          rss_page_size: 1,
          background_max_depth: 1000000,
        }),
      )
      onTestFinished(
        overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, { capture_batch_size: 1 }),
      )
      const root = await readPublisherTypeFeedJob(
        getEnqueuedJobId(
          await enqueuePublisherTypeFeedPublication({ changeId, topicIds, afterTopicId: null }),
        ),
      )
      const ownedIds = new Set([root.id])
      onTestFinished(async () => {
        await Promise.all([...ownedIds].map(async id => (await background.getJob(id))?.remove()))
      })
      expect(
        await enqueuePublisherTypeFeedPublication({ changeId, topicIds, afterTopicId: null }),
      ).toBeNull()
      const separateEvent = await readPublisherTypeFeedJob(
        getEnqueuedJobId(
          await enqueuePublisherTypeFeedPublication({
            changeId: randomUUID(),
            topicIds,
            afterTopicId: null,
          }),
        ),
      )
      ownedIds.add(separateEvent.id)
      expect(separateEvent.id).not.toBe(root.id)
      const firstPage = await capturePublisherFeedPageJobs(changeId, 2, () =>
        processPublisherTypeFeedContinuation(root),
      )
      firstPage.jobs.forEach(job => ownedIds.add(job.id))
      expect(firstPage.result).toMatchObject({ rowsRead: 1, hasMore: true })
      const next = firstPage.jobs.find(
        job => job.name === PUBLISHER_TYPE_FEED_PUBLICATION_JOB.name,
      )!
      const effect = firstPage.jobs.find(job => job.name === POST_PUBLICATION_EFFECTS_JOB.name)!
      expect(next.opts.ordering).toMatchObject({
        key: 'post-publication:publisher-type-feeds',
        concurrency: 1,
      })
      expect(effect.opts.ordering).toMatchObject({ key: 'post-publication:effects' })
      expect(next.id).not.toBe(root.id)
      expect(next.data).toMatchObject({ changeId, topicIds, afterTopicId: topicIds[0] })
      await effect.remove()
      const receipted = await readPublisherTypeFeedJob(root.id)
      expect(receipted).not.toBeNull()
      await expect(processPublisherTypeFeedContinuation(receipted)).resolves.toEqual(
        firstPage.result,
      )
      expect(await background.getJob(effect.id)).toBeNull()
      const nextJob = await readPublisherTypeFeedJob(next.id)
      const secondPage = await capturePublisherFeedPageJobs(changeId, 1, () =>
        processPublisherTypeFeedContinuation(nextJob),
      )
      secondPage.jobs.forEach(job => ownedIds.add(job.id))
      expect(secondPage.result).toMatchObject({ rowsRead: 1, hasMore: false })
      expect(secondPage.jobs[0]!.name).toBe(POST_PUBLICATION_EFFECTS_JOB.name)
    },
  )
})
