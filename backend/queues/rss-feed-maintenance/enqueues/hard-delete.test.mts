import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readEnqueuedJob } from '@voucha/test-helpers'
import { PRIORITY_HARD_DELETE, PRIORITY_RECOVERY } from '../config.mts'
import { rssFeedMaintenance } from '../queues.mts'
import {
  enqueueHardDeleteRssFeedFinalizers,
  enqueueHardDeleteRssFeedChildPages,
  enqueueHardDeleteRssFeedSourcePages,
  enqueueRecoverRssFeedHardDeletes,
} from './hard-delete.mts'

describe('RSS feed hard-delete admissions', () => {
  it('places bounded delete pages behind ordinary maintenance on one feed lane', async () => {
    const rssFeedId = randomUUID()
    const jobs = [
      await readEnqueuedJob(
        rssFeedMaintenance,
        (await enqueueHardDeleteRssFeedSourcePages([{ rssFeedId, pageCursor: randomUUID() }]))[0],
      ),
      await readEnqueuedJob(
        rssFeedMaintenance,
        (
          await enqueueHardDeleteRssFeedChildPages([
            { rssFeedId, phase: 'feed_categories', pageCursor: randomUUID() },
          ])
        )[0],
      ),
      await readEnqueuedJob(
        rssFeedMaintenance,
        (await enqueueHardDeleteRssFeedFinalizers([{ rssFeedId, pageCursor: rssFeedId }]))[0],
      ),
    ]
    try {
      for (const job of jobs) {
        expect(job.opts).toMatchObject({
          priority: PRIORITY_HARD_DELETE,
          ordering: { key: `hard-delete-rss-feed:${rssFeedId}`, concurrency: 1 },
          removeOnComplete: true,
          removeOnFail: true,
        })
      }
    } finally {
      for (const job of jobs) await job.remove()
    }
  })

  it('keeps recovery in its separate lower-priority lane', async () => {
    const job = await readEnqueuedJob(rssFeedMaintenance, await enqueueRecoverRssFeedHardDeletes())
    try {
      expect(job.opts).toMatchObject({
        priority: PRIORITY_RECOVERY,
        ordering: { key: 'hard-delete-rss-feed-recovery', concurrency: 1 },
      })
    } finally {
      await job.remove()
    }
  })
})
