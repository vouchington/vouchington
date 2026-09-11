import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { InboxButton } from './inbox-button'

const mockPush = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: mockPush }),
    }) as unknown as typeof import('next/navigation'),
)

const {
  mockGetMyUnreadNotificationsSummaryClient,
  mockMarkMyNotificationRead,
  mockDeleteMyNotification,
} = vi.hoisted(() => ({
  mockGetMyUnreadNotificationsSummaryClient: vi.fn<VitestLooseMock>(),
  mockMarkMyNotificationRead: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
  mockDeleteMyNotification: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
}))

vi.mock(import('@/lib/api/client/my'), () => ({
  getMyUnreadNotificationsSummaryClient: mockGetMyUnreadNotificationsSummaryClient,
  markAllMyNotificationsRead: vi.fn<VitestLooseMock>(),
  markMyNotificationRead: mockMarkMyNotificationRead,
  deleteMyNotification: mockDeleteMyNotification,
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

vi.mock(
  import('@/components/shared/entity-action-icons'),
  () =>
    ({
      EntityActionIcons: {
        notificationDismiss: () => <svg data-testid='notification-dismiss-icon' />,
      },
    }) as unknown as typeof import('@/components/shared/entity-action-icons'),
)

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

describe('inbox-button', () => {
  beforeEach(() => {
    mockGetMyUnreadNotificationsSummaryClient.mockReset()
    mockPush.mockReset()
    mockMarkMyNotificationRead.mockReset()
    mockDeleteMyNotification.mockReset()
    mockMarkMyNotificationRead.mockResolvedValue(undefined)
    mockDeleteMyNotification.mockResolvedValue(undefined)
    mockGetMyUnreadNotificationsSummaryClient.mockResolvedValue(emptySummary)
  })

  describe('InboxButton', () => {
    it('renders bell button with accessible label', () => {
      render(<InboxButton />)
      expect(screen.getByRole('button', { name: 'Open inbox' })).toBeInTheDocument()
    })

    it('shows unread count badge when count > 0', async () => {
      mockGetMyUnreadNotificationsSummaryClient.mockResolvedValue({
        ...emptySummary,
        unread_count: 2,
      })
      render(<InboxButton />)

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument()
      })
    })

    it('shows 9+ when unread count exceeds 9', async () => {
      mockGetMyUnreadNotificationsSummaryClient.mockResolvedValue({
        ...emptySummary,
        unread_count: 15,
      })
      render(<InboxButton />)

      await waitFor(() => {
        expect(screen.getByText('9+')).toBeInTheDocument()
      })
    })

    it('does not show badge when unread count is 0', () => {
      render(<InboxButton />)
      expect(screen.queryByText('0')).not.toBeInTheDocument()
    })

    it('fetches notifications on mount', async () => {
      render(<InboxButton />)
      await waitFor(() => {
        expect(mockGetMyUnreadNotificationsSummaryClient).toHaveBeenCalled()
      })
    })

    it('renders notification rows when summary has notifications (L80)', async () => {
      mockGetMyUnreadNotificationsSummaryClient.mockResolvedValue(summaryWithNotification)
      render(<InboxButton />)
      await waitFor(() => {
        expect(screen.getByText('Test notification')).toBeInTheDocument()
      })
    })

    it('skips result entry when notifications dict is missing the id (L77-78)', async () => {
      mockGetMyUnreadNotificationsSummaryClient.mockResolvedValue({
        unread_count: 1,
        results: [{ id: 'missing-id' }],
        notifications: {},
      })
      render(<InboxButton />)
      await waitFor(() => {
        expect(mockGetMyUnreadNotificationsSummaryClient).toHaveBeenCalled()
      })
      expect(screen.queryByRole('button', { name: 'Delete notification' })).not.toBeInTheDocument()
    })

    it('calls handleClickNotification when notification row is clicked (L90)', async () => {
      mockGetMyUnreadNotificationsSummaryClient.mockResolvedValue(summaryWithNotification)
      render(<InboxButton />)
      await waitFor(() => {
        expect(screen.getByText('Test notification')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Test notification'))
      await waitFor(() => {
        expect(mockMarkMyNotificationRead).toHaveBeenCalledWith(notificationId)
      })
    })

    it('calls handleDeleteNotification when delete button is clicked (L114)', async () => {
      mockGetMyUnreadNotificationsSummaryClient.mockResolvedValue(summaryWithNotification)
      render(<InboxButton />)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Delete notification' })).toBeInTheDocument()
      })
      const deleteButton = screen.getByRole('button', { name: 'Delete notification' })
      expect(deleteButton).toContainElement(screen.getByTestId('notification-dismiss-icon'))
      fireEvent.click(deleteButton)
      await waitFor(() => {
        expect(mockDeleteMyNotification).toHaveBeenCalledWith(notificationId)
      })
    })

    it('navigates to /my/notifications when View all button is clicked (L131-132)', async () => {
      render(<InboxButton />)
      await waitFor(() => {
        expect(mockGetMyUnreadNotificationsSummaryClient).toHaveBeenCalled()
      })
      fireEvent.click(screen.getByText('View all notifications'))
      expect(mockPush).toHaveBeenCalledWith('/my/notifications')
    })
  })
})
