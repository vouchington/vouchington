import { Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { QUEUE_NAME } from '@queues/follower-distributions/config'
import { enqueueProcessFollowerDistribution } from '@queues/follower-distributions/enqueues'
import { followerDistributions } from '@queues/follower-distributions/queues'
import { notifications } from '@queues/notifications/queues'
import { sendPostToFollowers } from '@services/follower-distributions'
import { followerDistributionsWorkConfig } from '@services/follower-distributions/work-limits'
import {
  createTestPost,
  createTestUser,
  followUser,
  getManualSendNotificationRowsForTest,
} from '@voucha/test-helpers'
import { getFollowerDistributionCursorForTest } from '@voucha/test-helpers/sql-follower-distribution'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { processFollowerDistribution } from '../processors.mts'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

// Priority jobs wait for a promotion tick; the default tick is 5 s per chunk.
const PROMOTION_INTERVAL_MS = 100

describe('follower distribution continuation with real GlideMQ', () => {
  it('runs every chunk of a distribution even though each chunk job is still active', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const followers = [await createTestUser(), await createTestUser()]
    for (const follower of followers) await followUser(follower, sender)
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const distribution = await sendPostToFollowers(sender, post.id, { audience: 'all_followers' })
    const restoreChunkSize = overrideDynamicConfigFieldsForTest(followerDistributionsWorkConfig, {
      recipient_chunk_size: 1,
    })
    const chunks: boolean[] = []
    const done = Promise.withResolvers<void>()
    const worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => processFollowerDistribution(job.data as { distributionId: string }),
      {
        connection: workerQueueConnection,
        prefix: workerQueuePrefix,
        concurrency: 1,
        blockTimeout: 1000,
        promotionInterval: PROMOTION_INTERVAL_MS,
      },
    )
    worker.on('completed', (_job, result) => {
      chunks.push((result as { completed: boolean }).completed)
      if ((result as { completed: boolean }).completed) done.resolve()
    })
    worker.on('failed', (_job, error) => done.reject(error))
    try {
      await worker.waitUntilReady()
      await enqueueProcessFollowerDistribution(distribution.distribution_id)
      await done.promise

      // One recipient per chunk: two recipient chunks, then the empty chunk that completes it.
      expect(chunks).toEqual([false, false, true])
      const recipientIds = followers.map(follower => follower.id).toSorted()
      const sent = await getManualSendNotificationRowsForTest({
        sentByUserId: sender.id,
        postId: post.id,
      })
      expect(sent.map(row => row.user_id)).toEqual(recipientIds)
      await expect(
        getFollowerDistributionCursorForTest(distribution.distribution_id),
      ).resolves.toBe(recipientIds.at(-1))
    } finally {
      restoreChunkSize()
      await worker.close(true)
      await Promise.all([
        followerDistributions.obliterate({ force: true }),
        notifications.obliterate({ force: true }),
      ])
      await Promise.all([followerDistributions.close(), notifications.close()])
    }
  })
})
