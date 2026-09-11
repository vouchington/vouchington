import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock(
  import('@/components/shared/time-ago'),
  () =>
    ({
      TimeAgo: ({ date }: { date: string }) => <span data-testid='time-ago'>{date}</span>,
    }) as unknown as typeof import('@/components/shared/time-ago'),
)

vi.mock(import('../notification-icon'), () => ({
  NotificationIcon: ({ entityType }: { entityType: string }) => (
    <span data-testid='notification-icon'>{entityType}</span>
  ),
}))

import { NotificationRow } from '../notification-row'
import type { NotificationListNotification } from '../notification-list'

const baseNotification: NotificationListNotification = {
  id: 'notif-1',
  entity_type: 'post',
  title: 'Test title',
  body: '',
  read_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  target_path: '/posts/post-1',
}

describe('NotificationRow', () => {
  describe('non-compact mode', () => {
    it('renders the title and calls onOpen when the main button is clicked', () => {
      const onOpen = vi.fn<VitestLooseMock>()
      const onDelete = vi.fn<VitestLooseMock>()
      render(
        <NotificationRow
          notification={baseNotification}
          onOpen={onOpen}
          onDelete={onDelete}
        />,
      )

      expect(screen.getByText('Test title')).toBeInTheDocument()
      expect(screen.getByTestId('notification-icon')).toBeInTheDocument()
      expect(screen.getByTestId('time-ago')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Test title/i }))
      expect(onOpen).toHaveBeenCalledWith(baseNotification)
    })

    it('calls onDelete when the delete button is clicked', () => {
      const onOpen = vi.fn<VitestLooseMock>()
      const onDelete = vi.fn<VitestLooseMock>()
      render(
        <NotificationRow
          notification={baseNotification}
          onOpen={onOpen}
          onDelete={onDelete}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Delete notification' }))
      expect(onDelete).toHaveBeenCalledWith('notif-1')
    })

    it('renders body text when body is provided', () => {
      render(
        <NotificationRow
          notification={{ ...baseNotification, body: 'Notification body text' }}
          onOpen={vi.fn<VitestLooseMock>()}
          onDelete={vi.fn<VitestLooseMock>()}
        />,
      )

      expect(screen.getByText('Notification body text')).toBeInTheDocument()
    })

    it('does not render body text when body is null', () => {
      render(
        <NotificationRow
          notification={baseNotification}
          onOpen={vi.fn<VitestLooseMock>()}
          onDelete={vi.fn<VitestLooseMock>()}
        />,
      )

      expect(screen.queryByText('Notification body text')).not.toBeInTheDocument()
    })

    it('shows unread indicator when read_at is null', () => {
      const { container } = render(
        <NotificationRow
          notification={{ ...baseNotification, read_at: null }}
          onOpen={vi.fn<VitestLooseMock>()}
          onDelete={vi.fn<VitestLooseMock>()}
        />,
      )

      expect(container.querySelector('.bg-destructive')).not.toBeNull()
    })

    it('does not show unread indicator when read_at is set', () => {
      const { container } = render(
        <NotificationRow
          notification={{ ...baseNotification, read_at: '2026-01-01T00:00:00.000Z' }}
          onOpen={vi.fn<VitestLooseMock>()}
          onDelete={vi.fn<VitestLooseMock>()}
        />,
      )

      expect(container.querySelector('.bg-destructive')).toBeNull()
    })

    it('inner action button is a flex column for vertical stacking', () => {
      render(
        <NotificationRow
          notification={baseNotification}
          onOpen={vi.fn<VitestLooseMock>()}
          onDelete={vi.fn<VitestLooseMock>()}
        />,
      )
      const mainButton = screen.getByRole('button', { name: /Test title/i })
      expect(mainButton.className).toContain('flex-col')
    })
  })

  describe('compact mode', () => {
    it('renders the title and calls onOpen when the main button is clicked', () => {
      const onOpen = vi.fn<VitestLooseMock>()
      const onDelete = vi.fn<VitestLooseMock>()
      render(
        <NotificationRow
          notification={baseNotification}
          onOpen={onOpen}
          onDelete={onDelete}
          compact
        />,
      )

      expect(screen.getByText('Test title')).toBeInTheDocument()
      expect(screen.getByTestId('notification-icon')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Test title/i }))
      expect(onOpen).toHaveBeenCalledWith(baseNotification)
    })

    it('calls onDelete when the delete button is clicked', () => {
      const onOpen = vi.fn<VitestLooseMock>()
      const onDelete = vi.fn<VitestLooseMock>()
      render(
        <NotificationRow
          notification={baseNotification}
          onOpen={onOpen}
          onDelete={onDelete}
          compact
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Delete notification' }))
      expect(onDelete).toHaveBeenCalledWith('notif-1')
    })

    it('renders body text when body is provided', () => {
      render(
        <NotificationRow
          notification={{ ...baseNotification, body: 'Compact body text' }}
          onOpen={vi.fn<VitestLooseMock>()}
          onDelete={vi.fn<VitestLooseMock>()}
          compact
        />,
      )

      expect(screen.getByText('Compact body text')).toBeInTheDocument()
    })

    it('does not render body text when body is null', () => {
      render(
        <NotificationRow
          notification={baseNotification}
          onOpen={vi.fn<VitestLooseMock>()}
          onDelete={vi.fn<VitestLooseMock>()}
          compact
        />,
      )

      expect(screen.queryByText('Compact body text')).not.toBeInTheDocument()
    })

    it('does not render TimeAgo in compact mode', () => {
      render(
        <NotificationRow
          notification={baseNotification}
          onOpen={vi.fn<VitestLooseMock>()}
          onDelete={vi.fn<VitestLooseMock>()}
          compact
        />,
      )

      expect(screen.queryByTestId('time-ago')).not.toBeInTheDocument()
    })
  })
})
