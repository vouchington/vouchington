import { afterAll, describe, expect, it } from 'vitest'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { FOLLOWER_DISTRIBUTIONS_PROCESS_JOB } from '@queues/background/enqueues/follower-distributions-jobs'
import { background } from '@queues/background/queues'
import { sendPostToFollowers } from '@services/follower-distributions'
import {
  createTestPost,
  createTestUser,
  followUser,
  getManualSendNotificationRowsForTest,
} from '@voucha/test-helpers'
import { getFollowerDistributionCursorForTest } from '@voucha/test-helpers/sql-follower-distribution'
import { BACKGROUND_HANDLERS } from '../processors/handlers.mts'
import { createBackgroundWorker } from '../workers/create-worker.mts'

const worker = createBackgroundWorker({
  handlers: BACKGROUND_HANDLERS,
  domains: ['follower-distributions'],
})

describe('follower distribution background handlers', () => {
  afterAll(async () => {
    await closeAndUnregisterGlideMQInstance(worker)
  })

  it('hands a processFollowerDistribution job to the processor as the live job', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const follower = await createTestUser()
    await followUser(follower, sender)
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sendPostToFollowers(sender, post.id, { audience: 'all_followers' })

    await background.add(
      FOLLOWER_DISTRIBUTIONS_PROCESS_JOB.name,
      { distributionId: distribution.distribution_id },
      { attempts: 1, removeOnComplete: true, removeOnFail: true },
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
