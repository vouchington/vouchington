import { describe, it, expect, vi, beforeEach } from 'vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { PostCard } from '../post-card'

import type { Post, PostMetrics, PostElection } from '@/types/posts'

import type { PublicUser, User } from '@/types/user'

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
        currentUser: mockCurrentUser,
        isAuthenticated: mockCurrentUser !== null,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: typeof mockCurrentUser) => void>(),
      }),
      useOptionalAuth: () =>
        mockCurrentUser
          ? {
              currentUser: mockCurrentUser,
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

  it('renders the semantic vote chooser for an authenticated viewer', () => {
    mockCurrentUser = { id: 'user-2' } as User
    render(
      <PostCard
        post={mockPost}
        election={mockElection}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Choose a vote' }))
    expect(screen.getByRole('radio', { name: 'Vouch' })).toBeDefined()
    expect(screen.getByRole('radio', { name: 'Disavow' })).toBeDefined()
  })

  it('shows raw vote counts with the signed-out voting link', () => {
    render(
      <PostCard
        post={mockPost}
        election={mockElection}
      />,
    )
    expect(document.querySelector('[data-pw="score-vote-sign-in"]')).not.toBeNull()
    expect(document.querySelector('[data-pw="vote-count-up"]')).toHaveTextContent('+10 −2')
  })

  it('sets content lang and direction on post titles using declared language before detected language', () => {
    render(
      <PostCard
        post={{
          ...mockPost,
          title: 'مرحبا بالعالم',
          declared_language: 'ar',
          lingua_rs_detected_language: 'en',
        }}
      />,
    )

    const title = screen.getByRole('heading', { level: 3, name: 'مرحبا بالعالم' })
    expect(title).toHaveAttribute('lang', 'ar')
    expect(title).toHaveAttribute('dir', 'rtl')
  })

  it('renders the fallback title for whitespace-only post titles', () => {
    render(
      <PostCard
        post={{
          ...mockPost,
          title: '   ',
          declared_language: 'ar',
          lingua_rs_detected_language: 'en',
        }}
      />,
    )

    const title = screen.getByRole('heading', { level: 3, name: 'Untitled Discussion' })
    expect(title).not.toHaveAttribute('lang')
    expect(title).not.toHaveAttribute('dir')
  })

  it('sets automatic direction on authored titles without known content language', () => {
    render(
      <PostCard
        post={{
          ...mockPost,
          title: 'مرحبا بالعالم',
          declared_language: null,
          lingua_rs_detected_language: null,
        }}
      />,
    )
    const title = screen.getByRole('heading', { level: 3, name: 'مرحبا بالعالم' })
    expect(title).not.toHaveAttribute('lang')
    expect(title).toHaveAttribute('dir', 'auto')
  })

  describe('floating kebab and title padding', () => {
    it('card view: title gets pr-14 for authenticated non-owner on shareable post', () => {
      mockCurrentUser = { id: 'user-2' } as User
      const { container } = render(<PostCard post={mockPost} />)
      expect(container.querySelector('h3')?.className).toContain('pr-14')
    })
    it('card view: title has no pr-14 for post owner', () => {
      mockCurrentUser = { id: 'user-1' } as User
      const { container } = render(<PostCard post={mockPost} />)
      expect(container.querySelector('h3')?.className).not.toContain('pr-14')
    })
    it('card view: title has no pr-14 when signed out', () => {
      const { container } = render(<PostCard post={mockPost} />)
      expect(container.querySelector('h3')?.className).not.toContain('pr-14')
    })
    it('card view: omits follower share actions when signed out', () => {
      render(<PostCard post={mockPost} />)
      expect(screen.queryByTestId('follower-share-actions')).toBeNull()
    })
    it('card view: renders follower share actions for authenticated non-owner', () => {
      mockCurrentUser = { id: 'user-2' } as User
      render(<PostCard post={mockPost} />)
      expect(screen.getByTestId('follower-share-actions')).toBeDefined()
    })
    it('compact view: title has no pr-14 even for authenticated non-owner', () => {
      mockCurrentUser = { id: 'user-2' } as User
      const { container } = render(
        <PostCard
          post={mockPost}
          view='compact'
        />,
      )
      expect(container.querySelector('h3')?.className).not.toContain('pr-14')
    })
    it('card view: shared byline gets pr-14 for authenticated non-owner', () => {
      mockCurrentUser = { id: 'user-3' } as User
      const sharedByUser: PublicUser = { id: 'user-2', username: 'sharer' }
      const { container } = render(
        <PostCard
          post={mockPost}
          sharedByUser={sharedByUser}
        />,
      )
      expect(
        container.querySelector('[data-testid="shared-byline"]')?.getAttribute('data-class'),
      ).toBe('pr-14')
    })
    it('card view: shared byline has no pr-14 for post owner', () => {
      mockCurrentUser = { id: 'user-1' } as User
      const sharedByUser: PublicUser = { id: 'user-2', username: 'sharer' }
      const { container } = render(
        <PostCard
          post={mockPost}
          sharedByUser={sharedByUser}
        />,
      )
      expect(
        container.querySelector('[data-testid="shared-byline"]')?.getAttribute('data-class'),
      ).toBe('')
    })
  })
})
