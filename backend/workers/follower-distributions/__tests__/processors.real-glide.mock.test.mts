import { Worker, type Job } from 'glide-mq'
import { afterAll, describe, expect, it, vi } from 'vitest'
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

// A job that moves itself to delayed waits for a promotion tick; the default tick is 5 s per chunk.
const PROMOTION_INTERVAL_MS = 100

describe('follower distribution chunks with real GlideMQ', () => {
  afterAll(async () => {
    await Promise.all([
      followerDistributions.obliterate({ force: true }),
      notifications.obliterate({ force: true }),
    ])
    await Promise.all([followerDistributions.close(), notifications.close()])
  })

  it('runs every chunk of a distribution inside one job', async () => {
    const { sender, post, distributionId, recipientIds } = await createDistribution(2)
    const restoreChunkSize = overrideDynamicConfigFieldsForTest(followerDistributionsWorkConfig, {
      recipient_chunk_size: 1,
    })
    try {
      const { runJobIds, completedJobId, result } = await runDistribution(distributionId)

      // One recipient per chunk: two recipient chunks, then the empty chunk that completes it.
      expect(runJobIds).toHaveLength(3)
      expect(new Set(runJobIds)).toEqual(new Set([completedJobId]))
      expect(result).toMatchObject({ completed: true })
      const jobs = await followerDistributions.searchJobs({
        name: 'processFollowerDistribution',
        data: { distributionId },
      })
      expect(jobs.map(job => job.id)).toEqual([completedJobId])
      // moveToDelayed continues the job without spending one of its retry attempts.
      expect(jobs[0]!.attemptsMade).toBe(0)
      const sent = await getManualSendNotificationRowsForTest({
        sentByUserId: sender.id,
        postId: post.id,
      })
      expect(sent.map(row => row.user_id)).toEqual(recipientIds)
      await expect(getFollowerDistributionCursorForTest(distributionId)).resolves.toBe(
        recipientIds.at(-1),
      )
    } finally {
      restoreChunkSize()
    }
  })

  it('completes a distribution that fits in one chunk without moving the job', async () => {
    const { post, sender, distributionId, recipientIds } = await createDistribution(1)

    const { runJobIds, completedJobId, result } = await runDistribution(distributionId)

    expect(runJobIds).toEqual([completedJobId])
    expect(result).toMatchObject({ completed: true, processed: 1 })
    const sent = await getManualSendNotificationRowsForTest({
      sentByUserId: sender.id,
      postId: post.id,
    })
    expect(sent.map(row => row.user_id)).toEqual(recipientIds)
    await expect(getFollowerDistributionCursorForTest(distributionId)).resolves.toBe(
      recipientIds[0],
    )
  })
})

async function createDistribution(followerCount: number) {
  const sender = await createTestUser()
  const creator = await createTestUser()
  const followers = await Promise.all(Array.from({ length: followerCount }, () => createTestUser()))
  for (const follower of followers) await followUser(follower, sender)
  const post = await createTestPost({ user: creator, privacy: 'public' })
  const distribution = await sendPostToFollowers(sender, post.id, { audience: 'all_followers' })
  return {
    sender,
    post,
    distributionId: distribution.distribution_id,
    recipientIds: followers.map(follower => follower.id).toSorted(),
  }
}

async function runDistribution(distributionId: string) {
  const runJobIds: string[] = []
  const done = Promise.withResolvers<{ completedJobId: string; result: unknown }>()
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      runJobIds.push(job.id)
      return processFollowerDistribution(job)
    },
    {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
      concurrency: 1,
      blockTimeout: 1000,
      promotionInterval: PROMOTION_INTERVAL_MS,
    },
  )
  worker.on('completed', (job, result) => done.resolve({ completedJobId: job.id, result }))
  worker.on('failed', (_job, error) => done.reject(error))
  try {
    await worker.waitUntilReady()
    await enqueueProcessFollowerDistribution(distributionId)
    return { runJobIds, ...(await done.promise) }
  } finally {
    await worker.close(true)
  }
}
