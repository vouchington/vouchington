import {
  mockPostCardUser,
  resetPostCardRenderingDoubles,
} from '@/test-helpers/components/posts/post-card-rendering.mock-support'

import { describe, it, expect, vi, beforeEach } from 'vitest'

import { render, screen, waitFor } from '@testing-library/react'

import { PostCard } from '../post-card'

import type { Post, PostMetrics, PostElection } from '@/types/posts'

import type { User } from '@/types/user'

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: mockPostCardUser.current
          ? ({ ...mockPostCardUser.current, roles: mockPostCardUser.current.roles ?? [] } as User)
          : null,
        isAuthenticated: mockPostCardUser.current !== null,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: typeof mockPostCardUser.current) => void>(),
      }),
      useOptionalAuth: () =>
        mockPostCardUser.current
          ? {
              currentUser: {
                ...mockPostCardUser.current,
                roles: mockPostCardUser.current.roles ?? [],
              } as User,
              isAuthenticated: true,
              logout: vi.fn<() => Promise<void>>(),
              setUser: vi.fn<(user: typeof mockPostCardUser.current) => void>(),
            }
          : null,
    }) as unknown as typeof import('@/lib/auth/context'),
)

describe('PostCard', () => {
  beforeEach(() => {
    resetPostCardRenderingDoubles()
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
      mockPostCardUser.current = { id: 'viewer-99', roles: [] } as User
      render(
        <PostCard
          post={mockPost}
          hideBookmarkActions
        />,
      )
      expect(screen.queryByTestId('follower-share-actions')).toBeNull()
    })
    it('renders FollowerShareActions when hideBookmarkActions is not set and shareable', () => {
      mockPostCardUser.current = { id: 'viewer-99', roles: [] } as User
      render(<PostCard post={mockPost} />)
      expect(screen.getByTestId('follower-share-actions')).toBeDefined()
    })
  })
})
