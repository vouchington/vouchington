import '@/test-helpers/components/notifications/inbox-button-ui.mock-support'
import { EMPTY_NOTIFICATION_HYDRATION } from '@/components/notifications/empty-notification-hydration'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)

const { mockGetMyUnreadNotificationsSummaryClient } = vi.hoisted(() => ({
  mockGetMyUnreadNotificationsSummaryClient: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/my'), () => ({
  getMyUnreadNotificationsSummaryClient: mockGetMyUnreadNotificationsSummaryClient,
  markAllMyNotificationsRead: vi.fn<VitestLooseMock>(),
  markMyNotificationRead: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
  deleteMyNotification: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { success: vi.fn<VitestLooseMock>(), error: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('../notification-row'), () => ({
  NotificationRow: ({ notification }: { notification: { id: string; kind: string } }) => (
    <div data-testid='notification-row'>{notification.kind}</div>
  ),
}))

import { InboxButton } from '../inbox-button'

const emptySummary = {
  unread_count: 0,
  results: [],
  notifications: {},
  ...EMPTY_NOTIFICATION_HYDRATION,
}

const notificationId = 'notif-1'
const summaryWithNotification = {
  unread_count: 1,
  results: [{ id: notificationId }],
  ...EMPTY_NOTIFICATION_HYDRATION,
  notifications: {
    [notificationId]: {
      __entity_type: 'notification' as const,
      id: notificationId,
      user_id: 'user-1',
      entity_type: 'referral_click' as const,
      kind: 'referral_click' as const,
      params: {},
      post_id: null,
      rss_feed_item_id: null,
      actor_user_id: null,
      target_path: '/my/referrals',
      read_at: null,
      pushed_at: null,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    },
  },
}

describe('InboxButton (stub)', () => {
  beforeEach(() => {
    mockGetMyUnreadNotificationsSummaryClient.mockReset()
    mockGetMyUnreadNotificationsSummaryClient.mockResolvedValue(emptySummary)
  })

  it('renders the inbox button without notifications', () => {
    render(<InboxButton />)
    expect(screen.getByRole('button', { name: 'Open inbox' })).toBeInTheDocument()
    expect(screen.queryByTestId('notification-row')).not.toBeInTheDocument()
  })

  it('renders NotificationRow stubs when notifications are present', async () => {
    mockGetMyUnreadNotificationsSummaryClient.mockResolvedValue(summaryWithNotification)
    render(<InboxButton />)

    await waitFor(() => {
      expect(screen.getByTestId('notification-row')).toBeInTheDocument()
    })
    expect(screen.getByText('referral_click')).toBeInTheDocument()
  })
})
