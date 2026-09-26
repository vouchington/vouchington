import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommunityCard } from '../community-card'
import { makeCommunity, makeCommunityMetrics } from '@/test-helpers/api-responses/communities'
import type { Community, CommunityMember, CommunityMetrics } from '@/types/api-responses'

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

vi.mock(import('next/image'), () => {
  const Img = 'img' as const

  return {
    default: ({ src, alt, ...props }: { src: string; alt: string; [k: string]: unknown }) => (
      <Img
        src={src}
        alt={alt}
        {...props}
      />
    ),
  } as unknown as typeof import('next/image')
})

vi.mock(
  import('../join-button'),
  () =>
    ({
      default: (props: Record<string, unknown>) => (
        <button
          type='button'
          data-testid='mock-join-button'
          data-community-slug={props.communitySlug as string}
          data-has-pending-application={String(props.hasPendingApplication)}
        >
          Join
        </button>
      ),
    }) as unknown as typeof import('../join-button'),
)

vi.mock(
  import('next/dynamic'),
  () =>
    ({
      default: () => (props: Record<string, unknown>) => (
        <button
          type='button'
          data-testid='mock-join-button'
          data-community-slug={props.communitySlug as string}
          data-has-pending-application={String(props.hasPendingApplication)}
        >
          Join
        </button>
      ),
    }) as unknown as typeof import('next/dynamic'),
)

const baseCommunity: Community = makeCommunity({
  id: '00000000-0000-7000-8000-000000000001',
  name: 'Test Community Card',
  slug: 'test-community-card',
  markdown: 'A description',
  created_by_id: 'owner-uuid',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
})

const baseMetrics: Pick<CommunityMetrics, 'member_count' | 'post_count' | 'list_item_count'> =
  makeCommunityMetrics({
    member_count: 42,
    post_count: 7,
    list_item_count: 0,
  })

const activeMembership: CommunityMember = {
  __entity_type: 'community_member',
  id: 'member-1',
  community_id: baseCommunity.id,
  user_id: 'user-1',
  role: 'member',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  removed_at: null,
  approved_by_id: null,
  removed_by_id: null,
}

describe('CommunityCard', () => {
  it('renders the community name and description', () => {
    const { container } = render(<CommunityCard community={baseCommunity} />)
    expect(screen.getByRole('link', { name: 'Test Community Card' })).toBeInTheDocument()
    expect(container.querySelector('[data-pw="community-card"]')).not.toBeNull()
    expect(screen.getByText('A description')).toBeInTheDocument()
  })

  it('does not render an owner byline', () => {
    render(<CommunityCard community={baseCommunity} />)
    expect(screen.queryByText(/^by /)).toBeNull()
  })

  it('shows Private badge for private communities', () => {
    render(<CommunityCard community={{ ...baseCommunity, visibility: 'private' }} />)
    expect(screen.getByText('Private')).toBeInTheDocument()
  })

  it('shows Joined badge when membership is active', () => {
    const { container } = render(
      <CommunityCard
        community={baseCommunity}
        membership={activeMembership}
      />,
    )
    expect(container.querySelector('[data-pw="community-card-joined-badge"]')).not.toBeNull()
    expect(screen.getByText('Joined')).toBeInTheDocument()
  })

  it('does not show Joined badge when membership is removed', () => {
    const removedMembership: CommunityMember = {
      ...activeMembership,
      removed_at: '2024-06-01T00:00:00.000Z',
    }
    render(
      <CommunityCard
        community={baseCommunity}
        membership={removedMembership}
      />,
    )
    expect(screen.queryByText('Joined')).toBeNull()
  })

  it('shows members and posts in metrics row', () => {
    render(
      <CommunityCard
        community={baseCommunity}
        metrics={baseMetrics}
      />,
    )
    expect(screen.getByText(/42 members/)).toBeInTheDocument()
    expect(screen.getByText(/7 posts/)).toBeInTheDocument()
  })

  it('shows list items in metrics row when count > 0', () => {
    render(
      <CommunityCard
        community={baseCommunity}
        metrics={{ ...baseMetrics, list_item_count: 5 }}
      />,
    )
    expect(screen.getByText(/5 list items/)).toBeInTheDocument()
  })

  it('omits list items from metrics row when count is 0', () => {
    render(
      <CommunityCard
        community={baseCommunity}
        metrics={{ ...baseMetrics, list_item_count: 0 }}
      />,
    )
    expect(screen.queryByText(/list items/)).toBeNull()
  })

  it('shows profile image when profile_image_id is set', () => {
    render(
      <CommunityCard
        community={{ ...baseCommunity, profile_image_id: 'img-123' }}
        metrics={baseMetrics}
      />,
    )
    const img = screen.getByRole('img', { name: /Test Community Card icon/ })
    expect(img).toBeInTheDocument()
  })

  it('passes hasPendingApplication to JoinButton', () => {
    render(
      <CommunityCard
        community={{ ...baseCommunity, visibility: 'private' }}
        hasPendingApplication
      />,
    )
    const joinBtn = screen.getByTestId('mock-join-button')
    expect(joinBtn).toHaveAttribute('data-has-pending-application', 'true')
  })

  it('hides JoinButton when hideJoinButton is true', () => {
    render(
      <CommunityCard
        community={baseCommunity}
        hideJoinButton
      />,
    )
    expect(screen.queryByTestId('mock-join-button')).toBeNull()
  })

  it('marks the description with the declared community language before detection', () => {
    render(
      <CommunityCard
        community={{
          ...baseCommunity,
          markdown: 'وصف المجتمع',
          default_language: 'ar',
          lingua_rs_detected_language: 'en',
        }}
      />,
    )

    const description = screen.getByText('وصف المجتمع')
    expect(description).toHaveAttribute('lang', 'ar')
    expect(description).toHaveAttribute('dir', 'rtl')
  })

  it('marks the description with the detected language when no default is set', () => {
    render(
      <CommunityCard
        community={{
          ...baseCommunity,
          markdown: 'Description en francais',
          default_language: null,
          lingua_rs_detected_language: 'fr',
        }}
      />,
    )

    const description = screen.getByText('Description en francais')
    expect(description).toHaveAttribute('lang', 'fr')
    expect(description).toHaveAttribute('dir', 'ltr')
  })

  it('keeps an unknown-language description outside the UI locale', () => {
    render(
      <CommunityCard
        community={{
          ...baseCommunity,
          markdown: 'Unknown language description',
          default_language: 'und',
          lingua_rs_detected_language: null,
        }}
      />,
    )

    const description = screen.getByText('Unknown language description')
    expect(description).not.toHaveAttribute('lang')
    expect(description).toHaveAttribute('dir', 'auto')
  })
})
