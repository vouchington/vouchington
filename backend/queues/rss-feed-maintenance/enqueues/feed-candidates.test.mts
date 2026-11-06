import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readEnqueuedJob } from '@voucha/test-helpers'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
import { PRIORITY_DEFAULT, PRIORITY_RECOVERY } from '../config.mts'
import { rssFeedMaintenance } from '../queues.mts'
import {
  enqueueBulkReconcileFeedCandidates,
  enqueueDispatchFeedCandidates,
} from './feed-candidates.mts'

describe('RSS feed candidate admissions', () => {
  it('persists separate bounded page and dispatcher lanes with replay-safe identities', async () => {
    const itemId = randomUUID()
    const sweepId = randomUUID()
    const continuationKey = `2_topics_${randomUUID()}`
    const [pageAdmission] = await enqueueBulkReconcileFeedCandidates([{ itemId, continuationKey }])
    const dispatchAdmission = await enqueueDispatchFeedCandidates({ sweepId, afterId: itemId })
    const page = await readEnqueuedJob(rssFeedMaintenance, pageAdmission)
    const dispatch = await readEnqueuedJob(rssFeedMaintenance, dispatchAdmission)
    try {
      expect(page.id).toContain(`rss-feed-candidate__${itemId}__${continuationKey}`)
      expect(page.data).toEqual({ itemId, continuationKey })
      expect(page.opts).toMatchObject({
        priority: PRIORITY_DEFAULT,
        ordering: {
          key: 'rss-feed-candidates:pages',
          concurrency: getPostPublicationWorkLimit('rss_feed_candidate_concurrency'),
        },
        removeOnComplete: true,
        removeOnFail: true,
      })
      expect(dispatch.id).toContain(`rss-feed-candidates-dispatch__${sweepId}__${itemId}`)
      expect(dispatch.data).toEqual({ sweepId, afterId: itemId })
      expect(dispatch.opts).toMatchObject({
        priority: PRIORITY_RECOVERY,
        ordering: {
          key: 'rss-feed-candidates:dispatch',
          concurrency: getPostPublicationWorkLimit('rss_feed_candidate_concurrency'),
        },
      })
    } finally {
      await page.remove()
      await dispatch.remove()
    }
  })
})
