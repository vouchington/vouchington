import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NotificationList, type NotificationListNotification } from '../notification-list'

vi.mock(
  import('@/components/shared/time-ago'),
  () =>
    ({
      TimeAgo: ({ date }: { date: string }) => <span>{date}</span>,
    }) as unknown as typeof import('@/components/shared/time-ago'),
)

vi.mock(
  import('@/components/shared/entity-action-icons'),
  () =>
    ({
      EntityActionIcons: {
        follow: () => <svg data-testid='follow-icon' />,
        notificationDismiss: () => <svg data-testid='notification-dismiss-icon' />,
        report: () => <svg data-testid='report-icon' />,
      },
    }) as unknown as typeof import('@/components/shared/entity-action-icons'),
)

const notification: NotificationListNotification = {
  id: 'notification-1',
  entity_type: 'follow',
  title: '@alice started following you',
  body: 'Alice followed your profile.',
  read_at: null,
  created_at: '2026-05-12T10:00:00.000Z',
  target_path: '/user/alice',
}

describe('NotificationList', () => {
  it('renders notifications with data-pw and calls handlers', () => {
    const onOpen = vi.fn<VitestLooseMock>()
    const onDelete = vi.fn<VitestLooseMock>()
    const { container } = render(
      <NotificationList
        notifications={{
          results: [{ id: notification.id }],
          notifications: { [notification.id]: notification },
        }}
        onOpen={onOpen}
        onDelete={onDelete}
      />,
    )

    expect(screen.getByText('@alice started following you')).toBeInTheDocument()
    expect(container.querySelector('[data-pw="notification-list"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /alice started following you/i }))
    expect(onOpen).toHaveBeenCalledWith(notification)

    const deleteButton = screen.getByRole('button', { name: 'Delete notification' })
    expect(deleteButton).toContainElement(screen.getByTestId('notification-dismiss-icon'))
    fireEvent.click(deleteButton)
    expect(onDelete).toHaveBeenCalledWith('notification-1')
  })

  it('renders empty state with data-pw', () => {
    const { container } = render(
      <NotificationList
        notifications={{ results: [], notifications: {} }}
        onOpen={vi.fn<VitestLooseMock>()}
        onDelete={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByText('No notifications yet')).toBeInTheDocument()
    expect(container.querySelector('[data-pw="notification-list"]')).not.toBeNull()
  })
})
