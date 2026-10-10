import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { followerDistributions } from '@queues/follower-distributions/queues'
import { sendPostToFollowers } from '@services/follower-distributions'
import {
  createTestPost,
  createTestUser,
  followUser,
  getManualSendNotificationRowsForTest,
} from '@voucha/test-helpers'
import { getFollowerDistributionCursorForTest } from '@voucha/test-helpers/sql-follower-distribution'
import { followerDistributionsWorker } from './workers.mts'

const JOB_OPTIONS = { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 }

describe('followerDistributionsWorker', () => {
  beforeEach(async () => {
    await followerDistributions.obliterate({ force: true })
  })

  afterAll(async () => {
    await followerDistributionsWorker.close()
  })

  it('rejects unknown jobs', async () => {
    await expect(followerDistributions.add('missingJob', {}, JOB_OPTIONS)).rejects.toThrow(
      'Follower distribution job missingJob not found',
    )
  })

  it('hands a processFollowerDistribution job to the processor as the live job', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const follower = await createTestUser()
    await followUser(follower, sender)
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sendPostToFollowers(sender, post.id, { audience: 'all_followers' })

    await followerDistributions.add(
      'processFollowerDistribution',
      { distributionId: distribution.distribution_id },
      JOB_OPTIONS,
    )

    const sent = await getManualSendNotificationRowsForTest({
      sentByUserId: sender.id,
      postId: post.id,
    })
    expect(sent.map(row => row.user_id)).toEqual([follower.id])
    await expect(getFollowerDistributionCursorForTest(distribution.distribution_id)).resolves.toBe(
      follower.id,
    )
  })
})
