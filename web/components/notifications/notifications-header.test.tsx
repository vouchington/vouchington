import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NotificationsHeader } from './notifications-header'

describe('NotificationsHeader', () => {
  it('gives the mobile-visible Settings action a touch-safe target', () => {
    render(
      <NotificationsHeader
        canMarkAllRead
        onMarkAllRead={vi.fn<() => void>()}
      />,
    )

    expect(screen.getByRole('link', { name: 'Settings' })).toHaveClass('h-11', 'sm:h-7')
  })
})
