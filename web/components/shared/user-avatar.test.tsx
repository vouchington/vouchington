import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UserAvatar } from './user-avatar'

describe('UserAvatar', () => {
  it('renders fallback initials with data-pw', () => {
    const { container } = render(<UserAvatar username='alex' />)

    expect(container.querySelector('[data-pw="user-avatar"]')).not.toBeNull()
    expect(screen.getByText('AL')).toBeInTheDocument()
  })
})
