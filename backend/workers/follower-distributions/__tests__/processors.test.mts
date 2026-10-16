import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import type {
  advanceFollowerDistributionChunkCursor,
  processFollowerDistributionChunk,
  listIncompleteFollowerDistributionIdPage,
} from '@services/follower-distributions'
import type {
  enqueueBackfillFollowerDistributionsContinuation,
  enqueueBulkProcessFollowerDistributions,
} from '@queues/follower-distributions/enqueues'
import type { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'

import { backfillFollowerDistributions, processFollowerDistribution } from '../processors.mts'

const mockAdvanceFollowerDistributionChunkCursor =
  vi.fn<typeof advanceFollowerDistributionChunkCursor>()
const mockEnqueueBulkDeliverNotificationPushIntents =
  vi.fn<typeof enqueueBulkDeliverNotificationPushIntents>()
const mockEnqueueBulkProcessFollowerDistributions =
  vi.fn<typeof enqueueBulkProcessFollowerDistributions>()
const mockProcessFollowerDistributionChunk = vi.fn<typeof processFollowerDistributionChunk>()
const mockEnqueueBackfillContinuation =
  vi.fn<typeof enqueueBackfillFollowerDistributionsContinuation>()
const mockListIncompleteFollowerDistributionIdPage =
  vi.fn<typeof listIncompleteFollowerDistributionIdPage>()

describe('follower distribution worker processors with queue side effects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not advance the distribution cursor if push enqueueing fails', async () => {
    mockProcessFollowerDistributionChunk.mockResolvedValue({
      completed: true,
      cursorRecipientId: 'recipient-1',
      distributionId: 'distribution-1',
      notificationsToDeliver: [{ notificationId: 'notification-1', userId: 'user-1' }],
      processed: 1,
    })
    mockEnqueueBulkDeliverNotificationPushIntents.mockRejectedValue(new Error('Valkey unavailable'))

    await expect(
      runProcessFollowerDistribution({ distributionId: 'distribution-1' }),
    ).rejects.toThrow('Valkey unavailable')

    expect(mockAdvanceFollowerDistributionChunkCursor).not.toHaveBeenCalled()
  })

  it('backfills one page of incomplete distributions and continues from its last id', async () => {
    mockListIncompleteFollowerDistributionIdPage.mockResolvedValue({
      ids: ['distribution-1', 'distribution-2'],
      hasMore: true,
    })

    const result = await runBackfillFollowerDistributions('distribution-0')

    expect(result).toEqual({ enqueued: 2, hasMore: true })
    expect(mockListIncompleteFollowerDistributionIdPage).toHaveBeenCalledWith('distribution-0')
    expect(mockEnqueueBulkProcessFollowerDistributions).toHaveBeenCalledWith([
      'distribution-1',
      'distribution-2',
    ])
    expect(mockEnqueueBackfillContinuation).toHaveBeenCalledWith('distribution-2')
  })

  it('stops after a short page without a continuation', async () => {
    mockListIncompleteFollowerDistributionIdPage.mockResolvedValue({
      ids: ['distribution-3'],
      hasMore: false,
    })

    await expect(runBackfillFollowerDistributions()).resolves.toEqual({
      enqueued: 1,
      hasMore: false,
    })
    expect(mockEnqueueBackfillContinuation).not.toHaveBeenCalled()
  })

  it('backfills through the real page reader past the last possible id', async () => {
    await expect(
      backfillFollowerDistributions('ffffffff-ffff-ffff-ffff-ffffffffffff'),
    ).resolves.toEqual({ enqueued: 0, hasMore: false })
  })

  it('enqueues nothing when no distribution is incomplete', async () => {
    mockListIncompleteFollowerDistributionIdPage.mockResolvedValue({ ids: [], hasMore: false })

    await runBackfillFollowerDistributions()

    expect(mockEnqueueBulkProcessFollowerDistributions).not.toHaveBeenCalled()
  })
})

function runProcessFollowerDistribution(data: { distributionId: string }) {
  const job = {
    data,
    updateData: vi.fn<Job['updateData']>(),
    moveToDelayed: vi.fn<Job['moveToDelayed']>(),
  }
  return processFollowerDistribution(job, {
    advanceFollowerDistributionChunkCursor: mockAdvanceFollowerDistributionChunkCursor,
    enqueueBulkDeliverNotificationPushIntents: mockEnqueueBulkDeliverNotificationPushIntents,
    processFollowerDistributionChunk: mockProcessFollowerDistributionChunk,
  })
}

function runBackfillFollowerDistributions(afterId?: string) {
  return backfillFollowerDistributions(afterId, {
    enqueueBackfillFollowerDistributionsContinuation: mockEnqueueBackfillContinuation,
    enqueueBulkProcessFollowerDistributions: mockEnqueueBulkProcessFollowerDistributions,
    listIncompleteFollowerDistributionIdPage: mockListIncompleteFollowerDistributionIdPage,
  })
}
