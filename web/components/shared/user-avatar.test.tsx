import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UserAvatar } from './user-avatar'

describe('UserAvatar', () => {
  it('renders fallback initials with data-pw', () => {
    const { container } = render(
      <UserAvatar
        profileImageId={null}
        username='alex'
      />,
    )

    expect(container.querySelector('[data-pw="user-avatar"]')).not.toBeNull()
    expect(screen.getByText('AL')).toBeInTheDocument()
  })

  it('renders configured size class when image id is present', () => {
    const { container } = render(
      <UserAvatar
        profileImageId='image-123'
        username='alex'
        size='lg'
      />,
    )

    expect(container.querySelector('[data-pw="user-avatar"]')).toHaveClass('h-16', 'w-16')
  })
})
