import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  processCommunityActivityDigestBatch,
  processCommunityActivityDigestDispatch,
} from './community-activity-digest.mts'
import { processCommunityActivityDigestScheduleTick } from './community-activity-digest-schedule.mts'
import type {
  enqueueBulkDeliverNotificationPushIntents,
  enqueueCommunityActivityDigestBatch,
  enqueueCommunityActivityDigestDispatch,
  CommunityActivityDigestBatchData,
} from '@queues/notifications/enqueues'
import type { createCommunityActivityDigestBatch } from '@services/notifications/community-activity-digest'
import { getCommunityActivityDigestDispatchData } from '@queues/notifications/enqueues/community-activity-digest'
import type {
  completeCommunityActivityDigestWorkItem,
  claimCommunityActivityDigestWorkItem,
  prepareCommunityActivityDigestWorkItems,
  renewCommunityActivityDigestWorkItem,
} from '@services/notifications/community-activity-digest-dispatch'

const mockEnqueueBulkDeliverNotificationPushIntents =
  vi.fn<typeof enqueueBulkDeliverNotificationPushIntents>()
const mockEnqueueCommunityActivityDigestBatch = vi.fn<typeof enqueueCommunityActivityDigestBatch>()
const mockEnqueueCommunityActivityDigestDispatch =
  vi.fn<typeof enqueueCommunityActivityDigestDispatch>()
const mockCreateCommunityActivityDigestBatch = vi.fn<typeof createCommunityActivityDigestBatch>()
const mockPrepareDispatchWindows = vi.fn<typeof prepareCommunityActivityDigestWorkItems>()
const mockMarkDispatchWindowEnqueued = vi.fn<typeof claimCommunityActivityDigestWorkItem>()
const mockMarkDispatchWindowCompleted = vi.fn<typeof completeCommunityActivityDigestWorkItem>()
const mockRefreshDispatchWindowActivity = vi.fn<typeof renewCommunityActivityDigestWorkItem>()

describe('community activity digest processors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRefreshDispatchWindowActivity.mockResolvedValue(true)
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('dispatches the closed previous Monday activity window', () => {
    expect(getCommunityActivityDigestDispatchData(new Date('2026-07-13T09:00:00.000Z'))).toEqual({
      windowStart: '2026-07-06T00:00:00.000Z',
      windowEnd: '2026-07-13T00:00:00.000Z',
    })
  })

  it('uses the persisted dispatch window when enqueueing its first batch', async () => {
    mockEnqueueCommunityActivityDigestBatch.mockResolvedValue(undefined)

    await processCommunityActivityDigestDispatch(
      {
        windowStart: '2026-06-29T00:00:00.000Z',
        windowEnd: '2026-07-06T00:00:00.000Z',
        leaseToken: 'digest-lease',
      },
      {
        enqueueCommunityActivityDigestBatch: mockEnqueueCommunityActivityDigestBatch,
        renewCommunityActivityDigestWorkItem: mockRefreshDispatchWindowActivity,
      },
    )

    expect(mockEnqueueCommunityActivityDigestBatch).toHaveBeenCalledWith({
      windowStart: '2026-06-29T00:00:00.000Z',
      windowEnd: '2026-07-06T00:00:00.000Z',
      leaseToken: 'digest-lease',
    })
  })

  it('catches up durable missing windows and marks each accepted dispatch', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-07-15T18:42:00.000Z'))
      mockEnqueueCommunityActivityDigestDispatch.mockResolvedValue(undefined)
      mockPrepareDispatchWindows.mockResolvedValue([
        {
          windowStart: new Date('2026-06-29T00:00:00.000Z'),
          windowEnd: new Date('2026-07-06T00:00:00.000Z'),
        },
        {
          windowStart: new Date('2026-07-06T00:00:00.000Z'),
          windowEnd: new Date('2026-07-13T00:00:00.000Z'),
        },
      ])
      mockMarkDispatchWindowEnqueued.mockResolvedValue('digest-lease')

      await processCommunityActivityDigestScheduleTick(
        {},
        {
          enqueueCommunityActivityDigestDispatch: mockEnqueueCommunityActivityDigestDispatch,
          prepareCommunityActivityDigestWorkItems: mockPrepareDispatchWindows,
          claimCommunityActivityDigestWorkItem: mockMarkDispatchWindowEnqueued,
        },
      )

      expect(mockPrepareDispatchWindows).toHaveBeenCalledWith(new Date('2026-07-06T00:00:00.000Z'))
      expect(mockEnqueueCommunityActivityDigestDispatch).toHaveBeenCalledTimes(2)
      expect(mockMarkDispatchWindowEnqueued).toHaveBeenNthCalledWith(
        2,
        new Date('2026-07-06T00:00:00.000Z'),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('creates a batch, enqueues pushes, and continues the recipient cursor', async () => {
    const data: CommunityActivityDigestBatchData = {
      windowStart: '2026-07-06T00:00:00.000Z',
      windowEnd: '2026-07-13T00:00:00.000Z',
      leaseToken: 'digest-lease',
    }
    mockCreateCommunityActivityDigestBatch.mockResolvedValue({
      created: [{ userId: 'user-1', notificationId: 'notification-1' }],
      nextUserId: 'user-1',
    })
    mockEnqueueBulkDeliverNotificationPushIntents.mockResolvedValue(undefined)
    mockEnqueueCommunityActivityDigestBatch.mockResolvedValue(undefined)

    await processCommunityActivityDigestBatch(data, {
      createCommunityActivityDigestBatch: mockCreateCommunityActivityDigestBatch,
      enqueueBulkDeliverNotificationPushIntents: mockEnqueueBulkDeliverNotificationPushIntents,
      enqueueCommunityActivityDigestBatch: mockEnqueueCommunityActivityDigestBatch,
      completeCommunityActivityDigestWorkItem: mockMarkDispatchWindowCompleted,
      renewCommunityActivityDigestWorkItem: mockRefreshDispatchWindowActivity,
    })

    expect(mockCreateCommunityActivityDigestBatch).toHaveBeenCalledWith({
      windowStart: new Date(data.windowStart),
      windowEnd: new Date(data.windowEnd),
      afterUserId: undefined,
    })
    expect(mockEnqueueBulkDeliverNotificationPushIntents).toHaveBeenCalledWith([
      { userId: 'user-1', notificationId: 'notification-1' },
    ])
    expect(mockEnqueueCommunityActivityDigestBatch).toHaveBeenCalledWith({
      ...data,
      afterUserId: 'user-1',
    })
    expect(mockMarkDispatchWindowCompleted).not.toHaveBeenCalled()
    expect(mockRefreshDispatchWindowActivity).toHaveBeenCalledWith(
      new Date(data.windowStart),
      data.leaseToken,
    )
  })

  it('marks the durable window complete after the final empty batch', async () => {
    mockCreateCommunityActivityDigestBatch.mockResolvedValue({ created: [], nextUserId: null })
    mockEnqueueBulkDeliverNotificationPushIntents.mockResolvedValue(undefined)

    await processCommunityActivityDigestBatch(
      {
        windowStart: '2026-07-06T00:00:00.000Z',
        windowEnd: '2026-07-13T00:00:00.000Z',
        leaseToken: 'digest-lease',
        afterUserId: 'user-0',
      },
      {
        createCommunityActivityDigestBatch: mockCreateCommunityActivityDigestBatch,
        enqueueBulkDeliverNotificationPushIntents: mockEnqueueBulkDeliverNotificationPushIntents,
        enqueueCommunityActivityDigestBatch: mockEnqueueCommunityActivityDigestBatch,
        completeCommunityActivityDigestWorkItem: mockMarkDispatchWindowCompleted,
        renewCommunityActivityDigestWorkItem: mockRefreshDispatchWindowActivity,
      },
    )

    expect(mockEnqueueBulkDeliverNotificationPushIntents).toHaveBeenCalledWith([])
    expect(mockEnqueueCommunityActivityDigestBatch).not.toHaveBeenCalled()
    expect(mockMarkDispatchWindowCompleted).toHaveBeenCalledWith(
      new Date('2026-07-06T00:00:00.000Z'),
      'digest-lease',
    )
  })
})
