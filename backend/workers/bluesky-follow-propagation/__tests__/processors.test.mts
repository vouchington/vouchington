import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  disconnectAcceptedBlueskyAccountAndCleanupFollows,
  listBlueskyFollowPropagationCandidatePage,
  listPendingBlueskyDisconnectPage,
  reconcileBlueskyFollow,
} from '@services/bluesky-follows'
import type {
  enqueueBackfillBlueskyDisconnectRequestsContinuation,
  enqueueBackfillBlueskyFollowPropagationContinuation,
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
const mockFollowContinuation = vi.fn<typeof enqueueBackfillBlueskyFollowPropagationContinuation>()
const mockListCandidatePage = vi.fn<typeof listBlueskyFollowPropagationCandidatePage>()
const mockDisconnect = vi.fn<typeof disconnectAcceptedBlueskyAccountAndCleanupFollows>()
const mockEnqueueBulkDisconnect = vi.fn<typeof enqueueBulkDisconnectRequested>()
const mockDisconnectContinuation =
  vi.fn<typeof enqueueBackfillBlueskyDisconnectRequestsContinuation>()
const mockListDisconnectPage = vi.fn<typeof listPendingBlueskyDisconnectPage>()

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

  it('enqueues a full candidate page and continues from its last pair', async () => {
    const candidates = [
      { followerUserId: 'follower-1', followeeUserId: 'followee-1' },
      { followerUserId: 'follower-2', followeeUserId: 'followee-2' },
    ]
    mockListCandidatePage.mockResolvedValue({ candidates, hasMore: true })

    const after = { followerUserId: 'follower-0', followeeUserId: 'followee-0' }
    const result = await backfillBlueskyFollowPropagation(after, {
      enqueueBulkReconcileBlueskyFollow: mockEnqueueBulkReconcileBlueskyFollow,
      enqueueBackfillBlueskyFollowPropagationContinuation: mockFollowContinuation,
      listBlueskyFollowPropagationCandidatePage: mockListCandidatePage,
    })

    expect(result).toEqual({ enqueued: 2, hasMore: true })
    expect(mockListCandidatePage).toHaveBeenCalledExactlyOnceWith(after)
    expect(mockEnqueueBulkReconcileBlueskyFollow).toHaveBeenCalledExactlyOnceWith(candidates)
    expect(mockFollowContinuation).toHaveBeenCalledExactlyOnceWith(candidates[1])
  })

  it('stops after a partial candidate page without a continuation', async () => {
    mockListCandidatePage.mockResolvedValue({
      candidates: [{ followerUserId: 'follower-3', followeeUserId: 'followee-3' }],
      hasMore: false,
    })

    const result = await backfillBlueskyFollowPropagation(undefined, {
      enqueueBulkReconcileBlueskyFollow: mockEnqueueBulkReconcileBlueskyFollow,
      enqueueBackfillBlueskyFollowPropagationContinuation: mockFollowContinuation,
      listBlueskyFollowPropagationCandidatePage: mockListCandidatePage,
    })

    expect(result).toEqual({ enqueued: 1, hasMore: false })
    expect(mockFollowContinuation).not.toHaveBeenCalled()
  })

  it('enqueues nothing when there are no candidates', async () => {
    mockListCandidatePage.mockResolvedValue({ candidates: [], hasMore: false })

    const result = await backfillBlueskyFollowPropagation(undefined, {
      enqueueBulkReconcileBlueskyFollow: mockEnqueueBulkReconcileBlueskyFollow,
      enqueueBackfillBlueskyFollowPropagationContinuation: mockFollowContinuation,
      listBlueskyFollowPropagationCandidatePage: mockListCandidatePage,
    })

    expect(result).toEqual({ enqueued: 0, hasMore: false })
    expect(mockEnqueueBulkReconcileBlueskyFollow).not.toHaveBeenCalled()
    expect(mockFollowContinuation).not.toHaveBeenCalled()
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

  it('enqueues a full disconnect page and continues from its last authorization id', async () => {
    const requests = [
      { userId: 'user-2', blueskyDid: 'did:plc:two', linkAuthorizationId: 'auth-2' },
      { userId: 'user-3', blueskyDid: 'did:plc:three', linkAuthorizationId: 'auth-3' },
    ]
    mockListDisconnectPage.mockResolvedValue({ requests, hasMore: true })

    await expect(
      backfillBlueskyDisconnectRequests('auth-1', {
        enqueueBulkDisconnectRequested: mockEnqueueBulkDisconnect,
        enqueueBackfillBlueskyDisconnectRequestsContinuation: mockDisconnectContinuation,
        listPendingBlueskyDisconnectPage: mockListDisconnectPage,
      }),
    ).resolves.toEqual({ enqueued: 2, hasMore: true })

    expect(mockListDisconnectPage).toHaveBeenCalledExactlyOnceWith('auth-1')
    expect(mockEnqueueBulkDisconnect).toHaveBeenCalledExactlyOnceWith(requests)
    expect(mockDisconnectContinuation).toHaveBeenCalledExactlyOnceWith('auth-3')
  })

  it('stops after a partial disconnect page without a continuation', async () => {
    mockListDisconnectPage.mockResolvedValue({ requests: [], hasMore: false })

    await expect(
      backfillBlueskyDisconnectRequests(undefined, {
        enqueueBulkDisconnectRequested: mockEnqueueBulkDisconnect,
        enqueueBackfillBlueskyDisconnectRequestsContinuation: mockDisconnectContinuation,
        listPendingBlueskyDisconnectPage: mockListDisconnectPage,
      }),
    ).resolves.toEqual({ enqueued: 0, hasMore: false })
    expect(mockEnqueueBulkDisconnect).not.toHaveBeenCalled()
    expect(mockDisconnectContinuation).not.toHaveBeenCalled()
  })
})
