import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommunityNav } from '../community-nav'

let mockPathname = '/communities/rewards-watch'

vi.mock(import('next/navigation'), () => ({
  usePathname: () => mockPathname,
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        scroll: _scroll,
        ...props
      }: {
        children: React.ReactNode
        href: string
        scroll?: boolean
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

const MEMBERSHIP_STUB = {
  __entity_type: 'community_member' as const,
  id: 'mem-1',
  community_id: 'c-1',
  user_id: 'u-1',
  role: 'member' as const,
  approved_by_id: null,
  removed_at: null,
  removed_by_id: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
}

describe('CommunityNav', () => {
  function navItem(container: HTMLElement, name: string) {
    return container.querySelector(`[data-pw="community-nav-${name}"]`)
  }

  beforeEach(() => {
    mockPathname = '/communities/rewards-watch'
  })

  it('shows Posts and News tabs (Overview removed)', () => {
    const { container } = render(
      <CommunityNav
        slug='rewards-watch'
        visibility='public'
        newsEnabled
      />,
    )

    expect(navItem(container, 'overview')).toBeNull()
    expect(navItem(container, 'posts')).toHaveAttribute('href', '/communities/rewards-watch')
    expect(navItem(container, 'posts')).toHaveAttribute('data-active', 'true')
    expect(navItem(container, 'news')).toHaveAttribute('href', '/communities/rewards-watch/news')
    expect(screen.queryByRole('menuitem', { name: 'Feed' })).toBeNull()
  })

  it('marks Posts active on the legacy /posts path', () => {
    mockPathname = '/communities/rewards-watch/posts'
    const { container } = render(
      <CommunityNav
        slug='rewards-watch'
        visibility='public'
        newsEnabled
      />,
    )

    expect(navItem(container, 'posts')).toHaveAttribute('data-active', 'true')
    expect(navItem(container, 'overview')).toBeNull()
  })

  it('marks News active on the community news page', () => {
    mockPathname = '/communities/rewards-watch/news'
    const { container } = render(
      <CommunityNav
        slug='rewards-watch'
        visibility='public'
        newsEnabled
      />,
    )

    expect(navItem(container, 'news')).toHaveAttribute('data-active', 'true')
  })

  it('shows Application Pending label when user has a pending application on a private community', () => {
    const { container } = render(
      <CommunityNav
        slug='rewards-watch'
        visibility='private'
        newsEnabled={false}
        hasPendingApplication
      />,
    )
    const applyTab = navItem(container, 'apply')
    expect(applyTab).toBeInTheDocument()
    expect(applyTab).toHaveTextContent('Application Pending')
  })

  it('hides news, lists, members, and about tabs when user has a pending application', () => {
    const { container } = render(
      <CommunityNav
        slug='rewards-watch'
        visibility='private'
        newsEnabled
        hasPendingApplication
      />,
    )
    expect(navItem(container, 'posts')).toBeInTheDocument()
    expect(navItem(container, 'news')).toBeNull()
    expect(navItem(container, 'lists')).toBeNull()
    expect(navItem(container, 'members')).toBeNull()
    expect(navItem(container, 'about')).toBeNull()
  })

  describe('role-gated tabs', () => {
    it('shows Moderation dropdown trigger for owner', () => {
      const { container } = render(
        <CommunityNav
          slug='rewards-watch'
          visibility='public'
          newsEnabled
          membership={{ ...MEMBERSHIP_STUB, role: 'owner' }}
          currentUserRole='owner'
        />,
      )
      // Moderation is now a dropdown; its trigger is a span (no href). Dropdown items render in a
      // portal and are not in container when closed — test that the trigger is present.
      const moderationTrigger = navItem(container, 'moderation')
      expect(moderationTrigger).toBeInTheDocument()
      expect(moderationTrigger?.tagName.toLowerCase()).not.toBe('a')
    })

    it('shows Settings and Moderation tabs for owner', () => {
      const { container } = render(
        <CommunityNav
          slug='rewards-watch'
          visibility='public'
          newsEnabled
          membership={{ ...MEMBERSHIP_STUB, role: 'owner' }}
          currentUserRole='owner'
        />,
      )

      const settingsTab = navItem(container, 'settings')
      expect(settingsTab).toHaveAttribute('href', '/communities/rewards-watch/settings')

      // Moderation is now a dropdown trigger (span), not a direct link
      const moderationTrigger = navItem(container, 'moderation')
      expect(moderationTrigger).toBeInTheDocument()
    })

    it('does not show Settings tab for moderator', () => {
      const { container } = render(
        <CommunityNav
          slug='rewards-watch'
          visibility='public'
          newsEnabled
          membership={{ ...MEMBERSHIP_STUB, role: 'moderator' }}
          currentUserRole='moderator'
        />,
      )

      expect(navItem(container, 'settings')).toBeNull()

      // Moderation dropdown trigger should be present for moderators
      expect(navItem(container, 'moderation')).toBeInTheDocument()
    })

    it('shows neither Settings nor Moderation for a regular member', () => {
      const { container } = render(
        <CommunityNav
          slug='rewards-watch'
          visibility='public'
          newsEnabled
          membership={{ ...MEMBERSHIP_STUB, role: 'member' }}
          currentUserRole='member'
        />,
      )

      expect(navItem(container, 'settings')).toBeNull()
      expect(navItem(container, 'moderation')).toBeNull()
    })

    it('shows the paid moderation transparency page to a regular member', () => {
      const { container } = render(
        <CommunityNav
          slug='rewards-watch'
          visibility='public'
          newsEnabled
          membership={{ ...MEMBERSHIP_STUB, role: 'member' }}
          currentUserRole='member'
        />,
      )

      expect(navItem(container, 'moderation-transparency')).toHaveAttribute(
        'href',
        '/communities/rewards-watch/settings/moderation/analytics',
      )
    })

    it('marks Settings active on the /settings page for owner', () => {
      mockPathname = '/communities/rewards-watch/settings'
      const { container } = render(
        <CommunityNav
          slug='rewards-watch'
          visibility='public'
          newsEnabled
          membership={{ ...MEMBERSHIP_STUB, role: 'owner' }}
          currentUserRole='owner'
        />,
      )

      expect(navItem(container, 'settings')).toHaveAttribute('data-active', 'true')
      expect(navItem(container, 'moderation')).toHaveAttribute('data-active', 'false')
    })

    it('marks Moderation active on /settings/moderation for owner', () => {
      mockPathname = '/communities/rewards-watch/settings/moderation'
      const { container } = render(
        <CommunityNav
          slug='rewards-watch'
          visibility='public'
          newsEnabled
          membership={{ ...MEMBERSHIP_STUB, role: 'owner' }}
          currentUserRole='owner'
        />,
      )

      expect(navItem(container, 'moderation')).toHaveAttribute('data-active', 'true')
      expect(navItem(container, 'settings')).toHaveAttribute('data-active', 'false')
    })

    it('marks Settings active on /settings/invites for owner', () => {
      mockPathname = '/communities/rewards-watch/settings/invites'
      const { container } = render(
        <CommunityNav
          slug='rewards-watch'
          visibility='public'
          newsEnabled
          membership={{ ...MEMBERSHIP_STUB, role: 'owner' }}
          currentUserRole='owner'
        />,
      )

      expect(navItem(container, 'settings')).toHaveAttribute('data-active', 'true')
      expect(navItem(container, 'moderation')).toHaveAttribute('data-active', 'false')
    })

    it('marks Moderation active on /settings/moderation for moderator', () => {
      mockPathname = '/communities/rewards-watch/settings/moderation'
      const { container } = render(
        <CommunityNav
          slug='rewards-watch'
          visibility='public'
          newsEnabled
          membership={{ ...MEMBERSHIP_STUB, role: 'moderator' }}
          currentUserRole='moderator'
        />,
      )

      expect(navItem(container, 'moderation')).toHaveAttribute('data-active', 'true')
    })

    it('marks Moderation dropdown trigger active on /settings/moderation/analytics for moderator', () => {
      mockPathname = '/communities/rewards-watch/settings/moderation/analytics'
      const { container } = render(
        <CommunityNav
          slug='rewards-watch'
          visibility='public'
          newsEnabled
          membership={{ ...MEMBERSHIP_STUB, role: 'moderator' }}
          currentUserRole='moderator'
        />,
      )

      // moderation-analytics is a dropdown item (portal-rendered, not in container when closed).
      // The parent moderation trigger should be active since a dropdown child path is active.
      expect(navItem(container, 'moderation-analytics')).toBeNull()
      expect(navItem(container, 'moderation')).toHaveAttribute('data-active', 'true')
    })
  })
})
