import {
  baseUser,
  resetUserProfileHeaderDoubles,
} from '@/test-helpers/components/users/user-profile-header.mock-support'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'

import { UserProfileHeader } from '../user-profile-header'

vi.mock(import('@/components/shared/follow-button'), () => ({
  FollowButton: () => <div data-testid='follow-button' />,
}))

describe('UserProfileHeader', () => {
  beforeEach(() => {
    resetUserProfileHeaderDoubles()
  })
  it('does not render profile links when profileLinks is undefined', () => {
    render(<UserProfileHeader user={baseUser} />)
    expect(screen.queryByTestId('user-profile-links')).toBeNull()
  })

  it('renders MarkdownContent with the given aboutHtml, line-clamp class, and UTM features', () => {
    render(
      <UserProfileHeader
        user={baseUser}
        aboutHtml='<p>Hello world</p>'
      />,
    )
    const el = screen.getByTestId('markdown-content')
    expect(el).toBeDefined()
    expect(el.getAttribute('data-html')).toBe('<p>Hello world</p>')
    expect(el.getAttribute('data-classname')).toContain('line-clamp-4')
    expect(el.getAttribute('data-features')).toBe('{"utm":true}')
  })

  it('does not render MarkdownContent when aboutHtml is null', () => {
    render(
      <UserProfileHeader
        user={baseUser}
        aboutHtml={null}
      />,
    )
    expect(screen.queryByTestId('markdown-content')).toBeNull()
  })

  it('does not render MarkdownContent when aboutHtml is undefined', () => {
    render(<UserProfileHeader user={baseUser} />)
    expect(screen.queryByTestId('markdown-content')).toBeNull()
  })

  it('renders IdentityVerifiedBadge when verification_status=verified and is_verified_badge_visible=true', () => {
    render(
      <UserProfileHeader
        user={{ ...baseUser, verification_status: 'verified', is_verified_badge_visible: true }}
      />,
    )
    expect(screen.getByTestId('identity-verified-badge')).toBeDefined()
  })

  it('does not render IdentityVerifiedBadge when verification_status=verified but is_verified_badge_visible=false', () => {
    render(
      <UserProfileHeader
        user={{ ...baseUser, verification_status: 'verified', is_verified_badge_visible: false }}
      />,
    )
    expect(screen.queryByTestId('identity-verified-badge')).toBeNull()
  })

  it('does not render IdentityVerifiedBadge when verification_status is not verified', () => {
    render(
      <UserProfileHeader
        user={{ ...baseUser, verification_status: 'unverified', is_verified_badge_visible: true }}
      />,
    )
    expect(screen.queryByTestId('identity-verified-badge')).toBeNull()
  })

  it('does not render IdentityVerifiedBadge when verification fields are absent', () => {
    render(<UserProfileHeader user={baseUser} />)
    expect(screen.queryByTestId('identity-verified-badge')).toBeNull()
  })

  it('renders verified_display_name when present', () => {
    render(<UserProfileHeader user={{ ...baseUser, verified_display_name: 'Alice S.' }} />)
    expect(screen.getByText('Alice S.')).toBeDefined()
  })

  it('does not render verified_display_name when absent', () => {
    render(<UserProfileHeader user={baseUser} />)
    // Alice Example (display name) is present, but no separate verified_display_name paragraph
    expect(screen.queryByText(/^Alice S\./)).toBeNull()
  })
})
