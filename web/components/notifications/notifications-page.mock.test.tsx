import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NotificationsPage } from './notifications-page'
import { getPaginatedPage } from '@/lib/api/client'

type NotificationListProps = Parameters<typeof import('./notification-list').NotificationList>[0]

const mockReceiveLoadMore = vi.fn<VitestLooseMock>()

const {
  mockMarkAllMyNotificationsRead,
  mockMarkMyNotificationReadKeepalive,
  mockDeleteMyNotification,
  mockCreateMyWebPushSubscription,
  mockDeleteMyWebPushSubscription,
} = vi.hoisted(() => ({
  mockMarkAllMyNotificationsRead: vi.fn<VitestLooseMock>(),
  mockMarkMyNotificationReadKeepalive: vi.fn<VitestLooseMock>(),
  mockDeleteMyNotification: vi.fn<VitestLooseMock>(),
  mockCreateMyWebPushSubscription: vi.fn<VitestLooseMock>(),
  mockDeleteMyWebPushSubscription: vi.fn<VitestLooseMock>(),
}))

const { mockCaptureException, mockReceiveOpenNotification } = vi.hoisted(() => ({
  mockCaptureException: vi.fn<VitestLooseMock>(),
  mockReceiveOpenNotification: vi.fn<VitestLooseMock>(),
}))
const { mockNavigateToTarget, mockResolveNotificationTarget } = vi.hoisted(() => ({
  mockNavigateToTarget: vi.fn<VitestLooseMock>(),
  mockResolveNotificationTarget: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@sentry/nextjs'), () => ({ captureException: mockCaptureException }))
vi.mock(import('./utils'), () => ({
  navigateToTarget: mockNavigateToTarget,
  resolveNotificationTarget: mockResolveNotificationTarget,
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
  markMyNotificationReadKeepalive: mockMarkMyNotificationReadKeepalive,
  deleteMyNotification: mockDeleteMyNotification,
  createMyWebPushSubscription: mockCreateMyWebPushSubscription,
  deleteMyWebPushSubscription: mockDeleteMyWebPushSubscription,
}))

vi.mock(import('./notification-list'), () => ({
  NotificationList: ({ notifications, onDelete, onOpen }: NotificationListProps) => {
    mockReceiveOpenNotification(onOpen)
    return (
      <div>
        {notifications.results.map(({ id }) => {
          const notification = notifications.notifications[id]!
          return (
            <div key={id}>
              <span>{notification.title}</span>
              <button
                type='button'
                onClick={() => onOpen(notification)}
              >
                Open notification
              </button>
              <button
                type='button'
                onClick={() => onDelete(id)}
              >
                Delete notification
              </button>
            </div>
          )
        })}
      </div>
    )
  },
}))

describe('notifications-page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMarkAllMyNotificationsRead.mockReset()
    mockMarkMyNotificationReadKeepalive.mockReset()
    mockMarkMyNotificationReadKeepalive.mockResolvedValue(undefined)
    mockDeleteMyNotification.mockReset()
    mockCreateMyWebPushSubscription.mockReset()
    mockDeleteMyWebPushSubscription.mockReset()
    mockCaptureException.mockReset()
    mockReceiveOpenNotification.mockReset()
    mockNavigateToTarget.mockReset()
    mockResolveNotificationTarget.mockReset()
    mockResolveNotificationTarget.mockReturnValue('/discussion/root-post/comment/p1')
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
          copyright_notice_id: null,
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

    it('reports a failed best-effort read receipt without interrupting notification opening', async () => {
      const receiptError = new Error('read receipt failed')
      mockMarkMyNotificationReadKeepalive.mockRejectedValue(receiptError)
      render(
        <NotificationsPage
          initialNotifications={initialNotifications}
          initialSubscriptions={[]}
        />,
      )

      const onOpen = mockReceiveOpenNotification.mock.calls.at(-1)![0] as (notification: {
        id: string
      }) => void
      expect(() => onOpen(initialNotifications.notifications.n1)).not.toThrow()
      expect(mockNavigateToTarget).toHaveBeenCalledWith('/discussion/root-post/comment/p1')

      await waitFor(() => {
        expect(mockCaptureException).toHaveBeenCalledWith(receiptError)
      })
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
