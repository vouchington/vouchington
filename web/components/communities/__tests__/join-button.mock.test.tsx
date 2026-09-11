import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import JoinButton from '../join-button'
import type { CommunityMember } from '@/types/api-responses'
import type { User } from '@/types/user'

let mockCurrentUser: User | null = null

const mockPathname = vi.hoisted(() => ({ value: '/communities/test-slug' }))
vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: vi.fn<VitestLooseMock>() }),
      usePathname: () => mockPathname.value,
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: React.ReactNode
        href: string
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

const mockJoinCommunity = vi.hoisted(() => vi.fn<VitestLooseMock>().mockResolvedValue({}))
const mockLeaveCommunity = vi.hoisted(() => vi.fn<VitestLooseMock>().mockResolvedValue({}))
vi.mock(import('@/lib/api/client'), () => ({
  joinCommunity: mockJoinCommunity,
  leaveCommunity: mockLeaveCommunity,
}))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: mockCurrentUser,
        isAuthenticated: mockCurrentUser !== null,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: typeof mockCurrentUser) => void>(),
      }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

const baseUser: User = {
  id: 'user-1',
  roles: ['user'],
}

const activeMembership: CommunityMember = {
  __entity_type: 'community_member',
  id: 'member-1',
  community_id: 'community-1',
  user_id: 'user-1',
  role: 'member',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  removed_at: null,
  approved_by_id: null,
  removed_by_id: null,
}

describe('JoinButton — signed out', () => {
  beforeEach(() => {
    mockJoinCommunity.mockReset()
    mockLeaveCommunity.mockReset()
    mockCurrentUser = null
  })

  it('renders a Join link pointing to /login?next= when no currentUser', () => {
    render(
      <JoinButton
        communitySlug='test-slug'
        visibility='public'
      />,
    )

    const link = screen.getByRole('link', { name: /join/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent('/communities/test-slug')}`,
    )
    expect(link).toHaveAttribute('data-pw', 'join-button-signed-out')
  })

  it('encodes the current path into the next param', () => {
    mockPathname.value = '/communities/special-chars/here'
    render(
      <JoinButton
        communitySlug='special-chars'
        visibility='public'
      />,
    )

    const link = screen.getByRole('link', { name: /join/i })
    expect(link).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent('/communities/special-chars/here')}`,
    )
    mockPathname.value = '/communities/test-slug'
  })
})

describe('JoinButton — signed in', () => {
  beforeEach(() => {
    mockJoinCommunity.mockReset().mockResolvedValue({})
    mockLeaveCommunity.mockReset().mockResolvedValue({})
    mockCurrentUser = baseUser
  })

  it('renders Join button for non-member', () => {
    render(
      <JoinButton
        communitySlug='test-slug'
        visibility='public'
      />,
    )
    expect(screen.getByRole('button', { name: /^join$/i })).toBeInTheDocument()
  })

  it('renders Leave button for member', () => {
    render(
      <JoinButton
        communitySlug='test-slug'
        visibility='public'
        membership={activeMembership}
      />,
    )
    expect(screen.getByRole('button', { name: /leave/i })).toBeInTheDocument()
  })

  it('calls joinCommunity on Join click', async () => {
    render(
      <JoinButton
        communitySlug='test-slug'
        visibility='public'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^join$/i }))

    await waitFor(() => {
      expect(mockJoinCommunity).toHaveBeenCalledWith('test-slug')
    })
  })

  it('renders Apply to Join link for private communities when not a member', () => {
    render(
      <JoinButton
        communitySlug='private-slug'
        visibility='private'
      />,
    )
    const link = screen.getByRole('link', { name: /apply to join/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/communities/private-slug/apply')
  })

  it('renders disabled Application Pending button when hasPendingApplication is true for private community non-member', () => {
    render(
      <JoinButton
        communitySlug='private-slug'
        visibility='private'
        hasPendingApplication
      />,
    )
    const btn = screen.getByRole('button', { name: /application pending/i })
    expect(btn).toBeInTheDocument()
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('data-pw', 'join-button-application-pending')
  })
})
