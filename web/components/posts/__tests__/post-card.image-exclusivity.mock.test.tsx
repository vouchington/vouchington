import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PostCard } from '../post-card'
import type { Post } from '@/types/posts'
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

const mockPost: Post = {
  id: 'post-1',
  post_type: 'discussion',
  title: 'Test Post Title',
  markdown: 'This is a test post.',
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

// Two-image post ensures card mode renders the carousel (with navigation buttons)
const multiImagePost: Post = {
  ...mockPost,
  images: [
    {
      image_id: 'img-1',
      placement_id: 'placement-1',
      placement_revision: 0,
      order_index: 0,
      caption: '',
    },
    {
      image_id: 'img-2',
      placement_id: 'placement-2',
      placement_revision: 0,
      order_index: 1,
      caption: '',
    },
  ],
}

describe('PostCard image exclusivity', () => {
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

  it('card view: shows carousel, no compact thumbnail link', () => {
    const { container } = render(
      <PostCard
        post={multiImagePost}
        view='card'
      />,
    )
    // Carousel navigation buttons must be present in card mode
    expect(screen.queryByRole('button', { name: 'Previous slide' })).not.toBeNull()
    // The compact thumbnail (<Link><PostImage>) renders as <a><img> — must not appear in card mode
    expect(container.querySelector('a > img')).toBeNull()
  })

  it('compact view: shows thumbnail link, no carousel', () => {
    const { container } = render(
      <PostCard
        post={multiImagePost}
        view='compact'
      />,
    )
    // Compact thumbnail link must be present
    expect(container.querySelector('a > img')).not.toBeNull()
    // Carousel navigation buttons must not appear in compact mode
    expect(screen.queryByRole('button', { name: 'Previous slide' })).toBeNull()
  })

  it('compact view: exactly one thumbnail (not duplicated)', () => {
    const { container } = render(
      <PostCard
        post={multiImagePost}
        view='compact'
      />,
    )
    expect(container.querySelectorAll('a > img')).toHaveLength(1)
  })
})
