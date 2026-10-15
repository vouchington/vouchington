import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  enqueueBulkDeliverNotificationPushIntents,
  enqueueContinueReconcilePostNotifications,
  enqueueContinueReconcileRssFeedItemNotifications,
} from '@queues/notifications/enqueues'
import type { reconcileNotificationsForPost } from '@services/notifications/reconcile-post'
import type { reconcileNotificationsForRssFeedItem } from '@services/notifications/reconcile-rss-feed-item'
import {
  processReconcilePostNotifications,
  processReconcileRssFeedItemNotifications,
} from './processors.mts'

const mockReconcilePost = vi.fn<typeof reconcileNotificationsForPost>()
const mockReconcileRssFeedItem = vi.fn<typeof reconcileNotificationsForRssFeedItem>()
const mockEnqueuePushes = vi.fn<typeof enqueueBulkDeliverNotificationPushIntents>()
const mockContinuePost = vi.fn<typeof enqueueContinueReconcilePostNotifications>()
const mockContinueRssFeedItem = vi.fn<typeof enqueueContinueReconcileRssFeedItemNotifications>()

describe('notification reconcile page continuation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes the cursor to the post reconcile and queues the next page after a full page', async () => {
    mockReconcilePost.mockResolvedValue({
      created: 2,
      pruned: 0,
      nextAfterUserId: 'user-2',
    })

    await runPost({ postId: 'post-1', afterUserId: 'user-0' })

    expect(mockReconcilePost).toHaveBeenCalledWith(
      'post-1',
      expect.objectContaining({ afterUserId: 'user-0' }),
    )
    expect(mockContinuePost).toHaveBeenCalledExactlyOnceWith({
      postId: 'post-1',
      afterUserId: 'user-2',
    })
  })

  it('queues no continuation after the last post page', async () => {
    mockReconcilePost.mockResolvedValue({ created: 1, pruned: 0 })

    await runPost({ postId: 'post-1', afterUserId: 'user-2' })

    expect(mockContinuePost).not.toHaveBeenCalled()
  })

  it('queues the next RSS feed item page only after a full page', async () => {
    mockReconcileRssFeedItem.mockResolvedValueOnce({
      created: 2,
      pruned: 0,
      nextAfterUserId: 'user-8',
    })
    mockReconcileRssFeedItem.mockResolvedValueOnce({ created: 0, pruned: 1 })

    await runRssFeedItem({ rssFeedItemId: 'item-1' })
    await runRssFeedItem({ rssFeedItemId: 'item-1', afterUserId: 'user-8' })

    expect(mockContinueRssFeedItem).toHaveBeenCalledExactlyOnceWith({
      rssFeedItemId: 'item-1',
      afterUserId: 'user-8',
    })
  })
})

function runPost(data: { postId: string; afterUserId?: string }) {
  return processReconcilePostNotifications(data, {
    enqueueBulkDeliverNotificationPushIntents: mockEnqueuePushes,
    enqueueContinueReconcilePostNotifications: mockContinuePost,
    reconcileNotificationsForPost: mockReconcilePost,
  })
}

function runRssFeedItem(data: { rssFeedItemId: string; afterUserId?: string }) {
  return processReconcileRssFeedItemNotifications(data, {
    enqueueBulkDeliverNotificationPushIntents: mockEnqueuePushes,
    enqueueContinueReconcileRssFeedItemNotifications: mockContinueRssFeedItem,
    reconcileNotificationsForRssFeedItem: mockReconcileRssFeedItem,
  })
}
