import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  disconnectAcceptedBlueskyAccountAndCleanupFollows,
  reconcileBlueskyFollow,
  streamBlueskyFollowPropagationCandidateBatches,
  streamPendingBlueskyDisconnectBatches,
} from '@services/bluesky-follows'
import type {
  enqueueBulkDisconnectRequested,
  enqueueBulkReconcileBlueskyFollow,
} from '@queues/bluesky-follow-propagation/enqueues'

import {
  backfillBlueskyDisconnectRequests,
  backfillBlueskyFollowPropagation,
  disconnectRequested,
  reconcileFollow,
} from '../processors.mts'

const mockReconcileBlueskyFollow = vi.fn<typeof reconcileBlueskyFollow>()
const mockEnqueueBulkReconcileBlueskyFollow = vi.fn<typeof enqueueBulkReconcileBlueskyFollow>()
const mockStreamBlueskyFollowPropagationCandidateBatches =
  vi.fn<typeof streamBlueskyFollowPropagationCandidateBatches>()
const mockDisconnect = vi.fn<typeof disconnectAcceptedBlueskyAccountAndCleanupFollows>()
const mockEnqueueBulkDisconnect = vi.fn<typeof enqueueBulkDisconnectRequested>()
const mockStreamDisconnects = vi.fn<typeof streamPendingBlueskyDisconnectBatches>()

describe('bluesky follow propagation worker processors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reconciles a single follower/followee pair', async () => {
    await reconcileFollow(
      { followerUserId: 'follower-1', followeeUserId: 'followee-1' },
      { reconcileBlueskyFollow: mockReconcileBlueskyFollow },
    )

    expect(mockReconcileBlueskyFollow).toHaveBeenCalledWith('follower-1', 'followee-1')
  })

  it('bulk-enqueues each streamed backfill batch', async () => {
    mockStreamBlueskyFollowPropagationCandidateBatches.mockImplementation(async function* () {
      yield [
        { followerUserId: 'follower-1', followeeUserId: 'followee-1' },
        { followerUserId: 'follower-2', followeeUserId: 'followee-2' },
      ]
      yield [{ followerUserId: 'follower-3', followeeUserId: 'followee-3' }]
    })

    const result = await backfillBlueskyFollowPropagation({
      enqueueBulkReconcileBlueskyFollow: mockEnqueueBulkReconcileBlueskyFollow,
      streamBlueskyFollowPropagationCandidateBatches:
        mockStreamBlueskyFollowPropagationCandidateBatches,
    })

    expect(result).toEqual({ enqueued: 3 })
    expect(mockEnqueueBulkReconcileBlueskyFollow).toHaveBeenNthCalledWith(1, [
      { followerUserId: 'follower-1', followeeUserId: 'followee-1' },
      { followerUserId: 'follower-2', followeeUserId: 'followee-2' },
    ])
    expect(mockEnqueueBulkReconcileBlueskyFollow).toHaveBeenNthCalledWith(2, [
      { followerUserId: 'follower-3', followeeUserId: 'followee-3' },
    ])
  })

  it('returns zero enqueued when there are no candidate batches', async () => {
    mockStreamBlueskyFollowPropagationCandidateBatches.mockImplementation(async function* () {})

    const result = await backfillBlueskyFollowPropagation({
      enqueueBulkReconcileBlueskyFollow: mockEnqueueBulkReconcileBlueskyFollow,
      streamBlueskyFollowPropagationCandidateBatches:
        mockStreamBlueskyFollowPropagationCandidateBatches,
    })

    expect(result).toEqual({ enqueued: 0 })
    expect(mockEnqueueBulkReconcileBlueskyFollow).not.toHaveBeenCalled()
  })

  it('disconnects only the exact generation carried by the durable job', async () => {
    const data = {
      userId: 'user-1',
      blueskyDid: 'did:plc:old',
      linkAuthorizationId: 'authorization-old',
    }

    await disconnectRequested(data, {
      disconnectAcceptedBlueskyAccountAndCleanupFollows: mockDisconnect,
    })

    expect(mockDisconnect).toHaveBeenCalledWith('user-1', data)
  })

  it('exhaustively bulk-enqueues every streamed disconnect backfill batch', async () => {
    mockStreamDisconnects.mockImplementation(async function* () {
      yield [{ userId: 'user-1', blueskyDid: 'did:plc:one', linkAuthorizationId: 'auth-1' }]
      yield [
        { userId: 'user-2', blueskyDid: 'did:plc:two', linkAuthorizationId: 'auth-2' },
        { userId: 'user-3', blueskyDid: 'did:plc:three', linkAuthorizationId: 'auth-3' },
      ]
    })

    await expect(
      backfillBlueskyDisconnectRequests({
        enqueueBulkDisconnectRequested: mockEnqueueBulkDisconnect,
        streamPendingBlueskyDisconnectBatches: mockStreamDisconnects,
      }),
    ).resolves.toEqual({ enqueued: 3 })
    expect(mockEnqueueBulkDisconnect).toHaveBeenCalledTimes(2)
  })
})
