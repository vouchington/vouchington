import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { FOLLOWER_DISTRIBUTIONS_PROCESS_JOB } from '@queues/background/enqueues/follower-distributions-jobs'
import { sendPostToFollowers } from '@services/follower-distributions'
import { followerDistributionsWorkConfig } from '@services/follower-distributions/work-limits'
import { processFollowerDistribution } from '@workers/follower-distributions/processors'
import {
  createTestPost,
  createTestUser,
  followUser,
  getManualSendNotificationRowsForTest,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { getFollowerDistributionCursorForTest } from '@voucha/test-helpers/sql-follower-distribution'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('follower distribution chunks through the background queue with real GlideMQ', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  it('runs every chunk of a distribution inside one job', async () => {
    const { sender, post, distributionId, recipientIds } = await createDistribution(2)
    const restoreChunkSize = overrideDynamicConfigFieldsForTest(followerDistributionsWorkConfig, {
      recipient_chunk_size: 1,
    })
    try {
      const { runJobIds, job, state } = await runDistribution(distributionId)

      // One recipient per chunk: two recipient chunks, then the empty chunk that completes it.
      expect(state).toBe('completed')
      expect(runJobIds).toEqual([job.id, job.id, job.id])
      // moveToDelayed continues the job without spending one of its retry attempts.
      expect((await harness!.queue.getJob(job.id))?.attemptsMade).toBe(0)
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
    const { distributionId } = await createDistribution(1)

    const { runJobIds, job, state } = await runDistribution(distributionId)

    expect(state).toBe('completed')
    expect(runJobIds).toEqual([job.id])
  })

  async function runDistribution(distributionId: string) {
    const runJobIds: string[] = []
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: {
        [FOLLOWER_DISTRIBUTIONS_PROCESS_JOB.name]: (job: Job) => {
          runJobIds.push(job.id)
          return processFollowerDistribution(job as Job<{ distributionId: string }>)
        },
      },
    })
    const job = await harness.add(FOLLOWER_DISTRIBUTIONS_PROCESS_JOB, { distributionId })
    return { runJobIds, job, state: await harness.settled(job) }
  }
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
