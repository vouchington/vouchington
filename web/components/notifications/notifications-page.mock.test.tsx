import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NotificationsPage } from './notifications-page'
import { getPaginatedPage } from '@/lib/api/client'

const mockReceiveLoadMore = vi.fn<VitestLooseMock>()

const {
  mockMarkAllMyNotificationsRead,
  mockDeleteMyNotification,
  mockCreateMyWebPushSubscription,
  mockDeleteMyWebPushSubscription,
} = vi.hoisted(() => ({
  mockMarkAllMyNotificationsRead: vi.fn<VitestLooseMock>(),
  mockDeleteMyNotification: vi.fn<VitestLooseMock>(),
  mockCreateMyWebPushSubscription: vi.fn<VitestLooseMock>(),
  mockDeleteMyWebPushSubscription: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    onLoadMore,
  }: {
    children: React.ReactNode
    hasNextPage: boolean
    endCursor: string | null
    onLoadMore: () => Promise<void | boolean>
    resetKey?: unknown
  }) => {
    mockReceiveLoadMore(onLoadMore)
    return <div>{children}</div>
  },
}))

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/my'), () => ({
  markAllMyNotificationsRead: mockMarkAllMyNotificationsRead,
  deleteMyNotification: mockDeleteMyNotification,
  createMyWebPushSubscription: mockCreateMyWebPushSubscription,
  deleteMyWebPushSubscription: mockDeleteMyWebPushSubscription,
}))

describe('notifications-page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMarkAllMyNotificationsRead.mockReset()
    mockDeleteMyNotification.mockReset()
    mockCreateMyWebPushSubscription.mockReset()
    mockDeleteMyWebPushSubscription.mockReset()
  })

  describe('NotificationsPage', () => {
    const initialNotifications = {
      results: [{ __entity_type: 'notification' as const, id: 'n1', read_at: null }],
      notifications: {
        n1: {
          __entity_type: 'notification' as const,
          id: 'n1',
          user_id: 'u1',
          entity_type: 'post' as const,
          post_id: 'p1',
          rss_feed_item_id: null,
          actor_user_id: null,
          moderation_report_id: null,
          review_dispute_id: null,
          user_warning_id: null,
          conversation_id: null,
          community_id: null,
          event_key: null,
          title: 'New reply',
          body: 'Reply body',
          actor_label: 'tester',
          target_path: '/discussion/root-post/comment/p1',
          target_entity: null,
          target_intent: null,
          read_at: null,
          pushed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }

    it('renders notifications and marks all as read', async () => {
      mockMarkAllMyNotificationsRead.mockResolvedValue(undefined)
      render(
        <NotificationsPage
          initialNotifications={initialNotifications}
          initialSubscriptions={[]}
        />,
      )

      expect(screen.getByText('New reply')).toBeDefined()
      fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))

      await waitFor(() => expect(mockMarkAllMyNotificationsRead).toHaveBeenCalled())
    })

    it('deletes a notification from the page', async () => {
      mockDeleteMyNotification.mockResolvedValue(undefined)
      render(
        <NotificationsPage
          initialNotifications={initialNotifications}
          initialSubscriptions={[]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Delete notification' }))
      await waitFor(() => expect(mockDeleteMyNotification).toHaveBeenCalledWith('n1'))
    })

    it('appends notifications from the next page', async () => {
      vi.mocked(getPaginatedPage).mockResolvedValueOnce({
        results: [{ __entity_type: 'notification' as const, id: 'n2', read_at: null }],
        notifications: {
          n2: {
            ...initialNotifications.notifications.n1,
            id: 'n2',
            title: 'Another reply',
          },
        },
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      })

      render(
        <NotificationsPage
          initialNotifications={{
            ...initialNotifications,
            page_info: { has_next_page: true, start_cursor: null, end_cursor: 'cursor-1' },
          }}
          initialSubscriptions={[]}
        />,
      )

      const loadMore = mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>
      await act(async () => {
        await loadMore()
      })

      expect(screen.getByText('Another reply')).toBeInTheDocument()
      expect(getPaginatedPage).toHaveBeenCalledWith('/api/v1/my/notifications', {
        after: 'cursor-1',
      })
    })
  })
})
