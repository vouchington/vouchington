import { describe, expect, it } from 'vitest'
import { followerDistributions } from '@queues/follower-distributions/queues'
import { sharePostWithFollowers } from '@services/follower-distributions'
import {
  createTestPost,
  createTestUser,
  followUser,
  getPostShareRecipientIdsForTest,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { getFollowerDistributionCursorForTest } from '@voucha/test-helpers/sql-follower-distribution'
import { processFollowerDistribution } from '../processors.mts'

describe('processFollowerDistribution completion', () => {
  it('completes a distribution that fits in one chunk without enqueueing a continuation', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const follower = await createTestUser()
    await followUser(follower, sender)
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sharePostWithFollowers(sender, post.id)
    const distributionId = distribution.distribution_id

    await expect(processFollowerDistribution({ distributionId })).resolves.toMatchObject({
      completed: true,
      processed: 1,
    })

    await expect(
      getPostShareRecipientIdsForTest({ sharedByUserId: sender.id, postId: post.id }),
    ).resolves.toEqual([follower.id])
    await expect(getFollowerDistributionCursorForTest(distributionId)).resolves.toBe(follower.id)
    // A repeat finds the distribution already completed and does no work.
    await expect(processFollowerDistribution({ distributionId })).resolves.toMatchObject({
      completed: true,
      processed: 0,
    })
    const jobs = await readAllQueueJobs(followerDistributions)
    const continuations = jobs.filter(job =>
      (job.opts as { deduplication?: { id?: string } }).deduplication?.id?.startsWith(
        `process_follower_distribution__${distributionId}`,
      ),
    )
    expect(continuations).toEqual([])
  })
})
