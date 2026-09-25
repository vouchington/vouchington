import { describe, it, expect, vi, beforeEach } from 'vitest'

import { render, screen, waitFor } from '@testing-library/react'

import { PostCard } from '../post-card'

import type { Post, PostMetrics, PostElection } from '@/types/posts'

import type { User } from '@/types/user'

let mockCurrentUser: User | null = null

vi.mock(
  import('next/dynamic'),
  () =>
    ({
      default: (loader: () => Promise<unknown>) => {
        const src = loader.toString()
        if (src.includes('follower-share-actions'))
          return () => <div data-testid='follower-share-actions' />
        if (src.includes('report-menu-item'))
          return ({ 'data-pw': dataPw }: { 'data-pw'?: string }) => (
            <button
              type='button'
              data-pw={dataPw}
            >
              Report
            </button>
          )
        return () => null
      },
    }) as unknown as typeof import('next/dynamic'),
)

vi.mock(import('@/components/admin/admin-moderation-button'), () => ({
  default: () => <div data-testid='admin-moderation-button' />,
}))

vi.mock(import('@/components/shared/entity-bookmark-button'), () => ({
  EntityBookmarkButton: () => <button type='button'>Save</button>,
}))
vi.mock(import('@/components/shared/post-image'), () => {
  const Img = 'img' as const
  return {
    PostImage: ({ alt, priority }: { alt?: string; priority?: boolean }) => (
      <Img
        alt={alt}
        data-priority={String(Boolean(priority))}
      />
    ),
  }
})
vi.mock(import('@/lib/api/client/elections'), async importOriginal => ({
  ...(await importOriginal()),
  clearPostVote: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
  submitPostVote: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
}))

const mockUseEmblaCarousel = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('embla-carousel-react'),
  () =>
    ({
      default: mockUseEmblaCarousel,
    }) as unknown as typeof import('embla-carousel-react'),
)

vi.mock(import('@/components/shared/follower-share-actions'), () => ({
  FollowerShareActions: () => <div data-testid='follower-share-actions' />,
}))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: mockCurrentUser
          ? ({ ...mockCurrentUser, roles: mockCurrentUser.roles ?? [] } as User)
          : null,
        isAuthenticated: mockCurrentUser !== null,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: typeof mockCurrentUser) => void>(),
      }),
      useOptionalAuth: () =>
        mockCurrentUser
          ? {
              currentUser: { ...mockCurrentUser, roles: mockCurrentUser.roles ?? [] } as User,
              isAuthenticated: true,
              logout: vi.fn<() => Promise<void>>(),
              setUser: vi.fn<(user: typeof mockCurrentUser) => void>(),
            }
          : null,
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(import('@/components/shared/shared-byline'), () => ({
  SharedByline: ({ className }: { className?: string }) => (
    <div
      data-testid='shared-byline'
      data-class={className ?? ''}
    />
  ),
}))

describe('PostCard', () => {
  beforeEach(() => {
    mockCurrentUser = null
    mockUseEmblaCarousel.mockReturnValue([
      vi.fn<VitestLooseMock>(),
      {
        canScrollPrev: () => false,
        canScrollNext: () => false,
        scrollPrev: vi.fn<VitestLooseMock>(),
        scrollNext: vi.fn<VitestLooseMock>(),
        on: vi.fn<VitestLooseMock>(),
        off: vi.fn<VitestLooseMock>(),
      },
    ])
  })

  const mockPost: Post = {
    id: 'post-1',
    post_type: 'discussion',
    title: 'Test Post Title',
    markdown: 'This is a test post with some **markdown** content.',
    root_id: null,
    created_by_id: 'user-1',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    deleted_at: null,
    deleted_by_id: null,
    archived_at: null,
    archived_by_id: null,
    broadcast: 'everyone',
    privacy: 'public',
    is_anonymous: false,

    community_id: null,

    clearance_status: 'approved',
  }

  const mockMetrics: PostMetrics = {
    __entity_type: 'post_metrics',
    id: 'post-1',
    count: {
      descendants: 5,
      children: 3,
      ancestors: 0,
    },
    updated_at: '2024-01-15T10:00:00Z',
    bookmarks: {
      follow: 2,
      save: 1,
    },
  }

  const mockElection: PostElection = {
    __entity_type: 'post_election',
    id: 'election-1',
    votes_score_net: 8,
    votes_count_up: 10,
    votes_count_down: 2,
  }

  it('renders post title', () => {
    render(<PostCard post={mockPost} />)
    expect(screen.getByText('Test Post Title')).toBeDefined()
  })

  it('renders post type badge', () => {
    render(<PostCard post={mockPost} />)
    expect(screen.getByText('Discussion')).toBeDefined()
  })

  it('renders raw positive and negative vote counts', () => {
    render(
      <PostCard
        post={mockPost}
        metrics={mockMetrics}
        election={mockElection}
      />,
    )
    expect(document.querySelector('[data-pw="vote-count-up"]')).toHaveTextContent('+10 −2')
  })

  it('renders comment count', () => {
    render(
      <PostCard
        post={mockPost}
        metrics={mockMetrics}
      />,
    )
    expect(screen.getByText('5 comments')).toBeDefined()
  })

  it('renders excerpt from markdown', () => {
    render(<PostCard post={mockPost} />)
    // Markdown should be stripped to plain text
    expect(screen.getByText(/This is a test post/)).toBeDefined()
  })

  it('sets content lang on plain-text excerpts using declared language before detected language', () => {
    render(
      <PostCard
        post={{
          ...mockPost,
          declared_language: 'fr',
          lingua_rs_detected_language: 'en',
        }}
      />,
    )

    const excerpt = screen.getByText(/This is a test post/).closest('p')
    expect(excerpt).toHaveAttribute('lang', 'fr')
    expect(excerpt).toHaveAttribute('dir', 'ltr')
  })

  it('adds outbound UTM params to external links in rendered HTML excerpts', async () => {
    render(
      <PostCard
        post={mockPost}
        html='<p>Visit <a href="https://example.com/path">example</a></p>'
      />,
    )

    const link = screen.getByRole('link', { name: 'example' })
    await waitFor(() => {
      expect(link).toHaveAttribute(
        'href',
        'https://example.com/path?utm_source=voucha.ai&utm_medium=referral',
      )
    })
  })

  it('renders review rating when post has review', () => {
    const reviewPost: Post = {
      ...mockPost,
      post_type: 'review',
      review_topic_ratings: [
        {
          topic_id: 'topic-1',
          rating: 4,
          order_index: 0,
          updated_at: '2024-01-15T10:00:00Z',
          topic: {
            __entity_type: 'topic',
            id: 'topic-1',
            name: 'Chase Sapphire Reserve',
            slug: 'chase-sapphire-reserve',
            markdown: '',
            topic_type: 'card',
            created_at: '2024-01-15T10:00:00Z',
            referral_program_id: null,
          },
        },
      ],
    }

    render(<PostCard post={reviewPost} />)
    // Should show topic name in review badge row
    expect(screen.getByText(/Chase Sapphire Reserve/)).toBeDefined()
  })

  it('handles zero votes gracefully', () => {
    const zeroElection: PostElection = {
      ...mockElection,
      votes_count_up: 0,
      votes_count_down: 0,
    }

    render(
      <PostCard
        post={mockPost}
        election={zeroElection}
      />,
    )
    expect(document.querySelector('[data-pw="vote-count-up"]')).toHaveTextContent('+0 −0')
  })
  describe('hideBookmarkActions', () => {
    it('suppresses FollowerShareActions when hideBookmarkActions=true', () => {
      // viewer is authenticated and different from post owner so shareable=true normally
      mockCurrentUser = { id: 'viewer-99', roles: [] } as User
      render(
        <PostCard
          post={mockPost}
          hideBookmarkActions
        />,
      )
      expect(screen.queryByTestId('follower-share-actions')).toBeNull()
    })
    it('renders FollowerShareActions when hideBookmarkActions is not set and shareable', () => {
      mockCurrentUser = { id: 'viewer-99', roles: [] } as User
      render(<PostCard post={mockPost} />)
      expect(screen.getByTestId('follower-share-actions')).toBeDefined()
    })
  })
})
