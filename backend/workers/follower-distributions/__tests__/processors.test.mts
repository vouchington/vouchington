import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import type {
  advanceFollowerDistributionChunkCursor,
  processFollowerDistributionChunk,
  streamIncompleteFollowerDistributionIdBatches,
} from '@services/follower-distributions'
import type { enqueueBulkProcessFollowerDistributions } from '@queues/follower-distributions/enqueues'
import type { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'

import { backfillFollowerDistributions, processFollowerDistribution } from '../processors.mts'

const mockAdvanceFollowerDistributionChunkCursor =
  vi.fn<typeof advanceFollowerDistributionChunkCursor>()
const mockEnqueueBulkDeliverNotificationPushIntents =
  vi.fn<typeof enqueueBulkDeliverNotificationPushIntents>()
const mockEnqueueBulkProcessFollowerDistributions =
  vi.fn<typeof enqueueBulkProcessFollowerDistributions>()
const mockProcessFollowerDistributionChunk = vi.fn<typeof processFollowerDistributionChunk>()
const mockStreamIncompleteFollowerDistributionIdBatches =
  vi.fn<typeof streamIncompleteFollowerDistributionIdBatches>()

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

  it('backfills each incomplete distribution id batch', async () => {
    mockStreamIncompleteFollowerDistributionIdBatches.mockImplementation(async function* () {
      yield ['distribution-1', 'distribution-2']
      yield ['distribution-3']
    })

    const result = await runBackfillFollowerDistributions()

    expect(result).toEqual({ enqueued: 3 })
    expect(mockEnqueueBulkProcessFollowerDistributions).toHaveBeenNthCalledWith(1, [
      'distribution-1',
      'distribution-2',
    ])
    expect(mockEnqueueBulkProcessFollowerDistributions).toHaveBeenNthCalledWith(2, [
      'distribution-3',
    ])
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

function runBackfillFollowerDistributions() {
  return backfillFollowerDistributions({
    enqueueBulkProcessFollowerDistributions: mockEnqueueBulkProcessFollowerDistributions,
    streamIncompleteFollowerDistributionIdBatches:
      mockStreamIncompleteFollowerDistributionIdBatches,
  })
}
