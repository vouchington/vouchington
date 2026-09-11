import type { ReactNode } from 'react'
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

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenu: ({ children, open }: { children: ReactNode; open?: boolean }) =>
        open ? <div>{children}</div> : <div data-dropdown-closed>{children}</div>,
      DropdownMenuTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => (
        <div>{children}</div>
      ),
      DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuSeparator: () => <hr />,
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

vi.mock(
  import('@/components/ui/tooltip'),
  () =>
    ({
      TooltipProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      TooltipTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => (
        <div>{children}</div>
      ),
      TooltipContent: () => null,
    }) as unknown as typeof import('@/components/ui/tooltip'),
)

vi.mock(
  import('@/components/ui/scroll-area'),
  () =>
    ({
      ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    }) as unknown as typeof import('@/components/ui/scroll-area'),
)

vi.mock(import('../notification-row'), () => ({
  NotificationRow: ({ notification }: { notification: { id: string; title: string } }) => (
    <div data-testid='notification-row'>{notification.title}</div>
  ),
}))

import { InboxButton } from '../inbox-button'

const emptySummary = {
  unread_count: 0,
  results: [],
  notifications: {},
}

const notificationId = 'notif-1'
const summaryWithNotification = {
  unread_count: 1,
  results: [{ id: notificationId }],
  notifications: {
    [notificationId]: {
      __entity_type: 'notification' as const,
      id: notificationId,
      user_id: 'user-1',
      entity_type: 'post' as const,
      post_id: 'post-1',
      rss_feed_item_id: null,
      actor_user_id: null,
      title: 'Test notification',
      body: 'Test body',
      actor_label: null,
      target_path: '/posts/post-1',
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
    expect(screen.getByText('Test notification')).toBeInTheDocument()
  })
})
