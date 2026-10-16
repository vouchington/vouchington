import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import { FOLLOWER_DISTRIBUTIONS_BACKFILL_JOB } from '@queues/background/enqueues/follower-distributions-jobs'
import { followerDistributionsHandlers } from './workers.mts'

describe('follower distribution background handlers', () => {
  it('backfills the page after the cursor carried by the job', async () => {
    const handler = followerDistributionsHandlers.find(
      candidate => candidate.job.name === FOLLOWER_DISTRIBUTIONS_BACKFILL_JOB.name,
    )!
    const job = { data: { afterId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' } } as unknown as Job

    await expect(handler.handle(job)).resolves.toEqual({ enqueued: 0, hasMore: false })
  })
})
