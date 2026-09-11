import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PostCard } from '../post-card'
import type { Post, PostElection } from '@/types/posts'
import type { User } from '@/types/user'

let mockCurrentUser: User | null = null

// Stub dynamic() to render nothing — this test exercises card layout, not lazy children
vi.mock(import('next/dynamic'), () => ({
  default: () => () => null,
}))

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

vi.mock(import('@/components/shared/report-menu-item'), () => ({
  ReportMenuKebab: ({ 'data-pw': dataPw }: { 'data-pw'?: string }) => (
    <button
      type='button'
      data-pw={dataPw}
    >
      Report
    </button>
  ),
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

describe('PostCard images', () => {
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

  const mockElection: PostElection = {
    __entity_type: 'post_election',
    id: 'election-1',
    votes_score_net: 8,
    votes_count_up: 10,
    votes_count_down: 2,
  }

  describe('image priority (LCP)', () => {
    const imagePost: Post = {
      ...mockPost,
      images: [{ image_id: 'img-1', order_index: 0, caption: '' }],
    }
    const multiImagePost: Post = {
      ...mockPost,
      images: [
        { image_id: 'img-1', order_index: 0, caption: '' },
        { image_id: 'img-2', order_index: 1, caption: '' },
      ],
    }

    it('card view: single image with priority=true has data-priority="true"', () => {
      const { container } = render(
        <PostCard
          post={imagePost}
          priority
        />,
      )
      expect(container.querySelector('img')?.getAttribute('data-priority')).toBe('true')
    })

    it('card view: single image without priority has data-priority="false"', () => {
      const { container } = render(<PostCard post={imagePost} />)
      expect(container.querySelector('img')?.getAttribute('data-priority')).toBe('false')
    })

    it('card view: multi-image with priority=true — first slide is eager, second is not', () => {
      const { container } = render(
        <PostCard
          post={multiImagePost}
          priority
        />,
      )
      const imgs = container.querySelectorAll('img')
      expect(imgs[0]?.getAttribute('data-priority')).toBe('true')
      expect(imgs[1]?.getAttribute('data-priority')).toBe('false')
    })

    it('card view: multi-image without priority — no slide is eager', () => {
      const { container } = render(<PostCard post={multiImagePost} />)
      const imgs = container.querySelectorAll('img')
      expect(imgs[0]?.getAttribute('data-priority')).toBe('false')
      expect(imgs[1]?.getAttribute('data-priority')).toBe('false')
    })
  })

  describe('image alt text', () => {
    const imagePost: Post = {
      ...mockPost,
      images: [{ image_id: 'img-1', order_index: 0, caption: '' }],
    }

    it('card view: image without caption uses post title as alt', () => {
      const { container } = render(<PostCard post={imagePost} />)
      expect(container.querySelector('img')?.getAttribute('alt')).toBe('Test Post Title')
    })

    it('card view: image with caption uses empty alt (decorative)', () => {
      const post: Post = {
        ...mockPost,
        images: [{ image_id: 'img-1', order_index: 0, caption: 'A beautiful view' }],
      }
      const { container } = render(<PostCard post={post} />)
      expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
    })

    it('card view: image without caption and empty title uses Untitled fallback', () => {
      const post: Post = { ...imagePost, title: '' }
      const { container } = render(<PostCard post={post} />)
      expect(container.querySelector('img')?.getAttribute('alt')).toBe('Untitled Discussion')
    })

    it('compact view: image with caption uses caption as alt', () => {
      const post: Post = {
        ...mockPost,
        images: [{ image_id: 'img-1', order_index: 0, caption: 'Sunset view' }],
      }
      const { container } = render(
        <PostCard
          post={post}
          view='compact'
        />,
      )
      expect(container.querySelector('img')?.getAttribute('alt')).toBe('Sunset view')
    })

    it('compact view: image without caption uses post title as alt', () => {
      const { container } = render(
        <PostCard
          post={imagePost}
          view='compact'
        />,
      )
      expect(container.querySelector('img')?.getAttribute('alt')).toBe('Test Post Title')
    })

    it('compact view: image without caption and empty title uses Untitled fallback', () => {
      const post: Post = { ...imagePost, title: '' }
      const { container } = render(
        <PostCard
          post={post}
          view='compact'
        />,
      )
      expect(container.querySelector('img')?.getAttribute('alt')).toBe('Untitled Discussion')
    })
  })

  describe('image layout fixes', () => {
    it('compact view: thumbnail is wrapped in a link to post detail', () => {
      const post: Post = {
        ...mockPost,
        images: [{ image_id: 'img-1', order_index: 0, caption: '' }],
      }
      const { container } = render(
        <PostCard
          post={post}
          view='compact'
        />,
      )
      const img = container.querySelector('img')
      const link = img?.closest('a')
      expect(link?.getAttribute('href')).toContain(post.id)
    })

    it('card view with multiple images: carousel arrows are inside the viewport (left-2/right-2)', () => {
      const post: Post = {
        ...mockPost,
        images: [
          { image_id: 'img-1', order_index: 0, caption: '' },
          { image_id: 'img-2', order_index: 1, caption: '' },
        ],
      }
      render(<PostCard post={post} />)

      const prevBtn = screen.getByRole('button', { name: 'Previous slide' })
      const nextBtn = screen.getByRole('button', { name: 'Next slide' })
      expect(prevBtn.className).toContain('left-2')
      expect(nextBtn.className).toContain('right-2')
    })
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
})
