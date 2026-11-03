import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { background } from '@queues/background/queues'
import { sendPostToFollowers, sharePostWithFollowers } from '@services/follower-distributions'
import { followerDistributionsWorkConfig } from '@services/follower-distributions/work-limits'
import { createTestPost, createTestUser, followUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { getFollowerDistributionCursorForTest } from '@voucha/test-helpers/sql-follower-distribution'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'

import { backfillFollowerDistributions, processFollowerDistribution } from '../processors.mts'

const lastPossibleId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

describe('follower distribution worker processors with queue side effects', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not advance the distribution cursor if push enqueueing fails', async () => {
    const distributionId = await createOwnDistribution(true)
    vi.spyOn(background, 'addBulk').mockRejectedValue(new Error('Valkey unavailable'))

    await expect(
      processFollowerDistribution({
        data: { distributionId },
        updateData: vi.fn<Job['updateData']>(),
        moveToDelayed: vi.fn<Job['moveToDelayed']>(),
      }),
    ).rejects.toThrow('Valkey unavailable')

    await expect(getFollowerDistributionCursorForTest(distributionId)).resolves.toBeNull()
  })

  it('backfills one page of incomplete distributions and continues from its last id', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(followerDistributionsWorkConfig, {
        backfill_batch_size: 1,
      }),
    )
    const distributionId = await createOwnDistribution()

    await expect(backfillFollowerDistributions(uuidBefore(distributionId))).resolves.toEqual({
      enqueued: 1,
      hasMore: true,
    })

    const jobs = await readAllQueueJobs(background)
    expect(
      jobs
        .filter(job => (job.data as { distributionId?: string }).distributionId === distributionId)
        .map(job => ({ name: job.name, data: job.data })),
    ).toEqual([
      { name: 'follower-distributions.processFollowerDistribution', data: { distributionId } },
    ])
    const continuation = await background.getJob(
      `backfill_follower_distributions__${distributionId}`,
    )
    expect(continuation?.name).toBe('follower-distributions.backfillFollowerDistributions')
    expect(continuation?.data).toEqual({ afterId: distributionId })
  })

  it('enqueues nothing past the last possible id', async () => {
    await expect(backfillFollowerDistributions(lastPossibleId)).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })

    await expect(
      background.getJob(`backfill_follower_distributions__${lastPossibleId}`),
    ).resolves.toBeFalsy()
  })
})

async function createOwnDistribution(notify = false): Promise<string> {
  const sender = await createTestUser()
  const creator = await createTestUser()
  const follower = await createTestUser()
  await followUser(follower, sender)
  const post = await createTestPost({ user: creator, privacy: 'public' })
  const distribution = notify
    ? await sendPostToFollowers(sender, post.id, { audience: 'all_followers' })
    : await sharePostWithFollowers(sender, post.id)
  return distribution.distribution_id
}
