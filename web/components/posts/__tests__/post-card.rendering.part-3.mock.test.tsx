import { describe, it, expect, vi, beforeEach } from 'vitest'

import { render, screen } from '@testing-library/react'

import { PostCard } from '../post-card'

import type { Post } from '@/types/posts'

import type { User } from '@/types/user'

let mockCurrentUser: User | null = null

const mockGenerateExcerpt = vi.hoisted(() =>
  vi.fn<(markdown: string, maxLength: number) => string>(),
)

vi.mock(import('@ts-shared/utils/format'), async importOriginal => {
  const actual = await importOriginal<typeof import('@ts-shared/utils/format')>()
  return {
    ...actual,
    generateExcerpt: mockGenerateExcerpt,
  } as unknown as typeof import('@ts-shared/utils/format')
})

vi.mock(
  import('next/dynamic'),
  () =>
    ({
      default: (loader: () => Promise<unknown>) =>
        loader.toString().includes('follower-share-actions')
          ? () => <div data-testid='follower-share-actions' />
          : () => null,
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

  return { PostImage: ({ alt }: { alt?: string }) => <Img alt={alt} /> }
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
  SharedByline: () => <div data-testid='shared-byline' />,
}))

describe('PostCard', () => {
  beforeEach(() => {
    mockCurrentUser = null
    mockGenerateExcerpt.mockReset()
    mockGenerateExcerpt.mockImplementation(markdown => markdown)
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
    markdown: 'Original post content.',
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

  it('does not generate a plain-text excerpt when rendering an HTML excerpt', () => {
    render(
      <PostCard
        post={mockPost}
        html='<p>Rendered HTML excerpt</p>'
      />,
    )

    expect(screen.getByText('Rendered HTML excerpt')).toBeDefined()
    expect(mockGenerateExcerpt).not.toHaveBeenCalled()
  })

  describe('ContentRemovedNotice visibility', () => {
    it('shows notice to authenticated author when post is rejected', () => {
      mockCurrentUser = { id: 'user-1' } as User
      const { container } = render(
        <PostCard post={{ ...mockPost, clearance_status: 'rejected' }} />,
      )
      expect(container.querySelector('[data-pw="content-removed-notice"]')).not.toBeNull()
      expect(
        screen.getAllByText('This content was removed by a moderator.').length,
      ).toBeGreaterThan(0)
    })

    it('does not show notice to unauthenticated visitor even on a rejected post', () => {
      mockCurrentUser = null
      const { container } = render(
        <PostCard post={{ ...mockPost, clearance_status: 'rejected' }} />,
      )
      expect(container.querySelector('[data-pw="content-removed-notice"]')).toBeNull()
    })

    it('does not show notice to a third-party authenticated user on another author rejected post', () => {
      mockCurrentUser = { id: 'other-user' } as User
      const { container } = render(
        <PostCard post={{ ...mockPost, clearance_status: 'rejected' }} />,
      )
      expect(container.querySelector('[data-pw="content-removed-notice"]')).toBeNull()
    })

    it('does not show notice for an approved post even when viewer is the author', () => {
      mockCurrentUser = { id: 'user-1' } as User
      const { container } = render(
        <PostCard post={{ ...mockPost, clearance_status: 'approved' }} />,
      )
      expect(container.querySelector('[data-pw="content-removed-notice"]')).toBeNull()
    })

    it('does not show notice for rejected anonymous posts when viewer is unauthenticated (null === null guard)', () => {
      // This is the critical null-safety case: anonymous posts have created_by_id=null.
      // A logged-out viewer has currentUserId=null. Without the `currentUserId !== null`
      // guard the comparison would be null===null=true, wrongly showing the notice.
      mockCurrentUser = null
      const { container } = render(
        <PostCard post={{ ...mockPost, clearance_status: 'rejected', created_by_id: null }} />,
      )
      expect(container.querySelector('[data-pw="content-removed-notice"]')).toBeNull()
    })
  })

  describe('Staff reviewer visibility on rejected posts', () => {
    it('shows "Under review" badge to moderator on rejected post', () => {
      mockCurrentUser = { id: 'mod-user', roles: ['moderator'] } as User
      const { container } = render(
        <PostCard post={{ ...mockPost, clearance_status: 'rejected' }} />,
      )
      expect(container.querySelector('[data-pw="post-card-review-badge"]')).not.toBeNull()
      expect(container.querySelector('[data-pw="content-removed-notice"]')).toBeNull()
      expect(screen.queryByText('This content is unavailable.')).toBeNull()
    })

    it('shows "Under review" badge to administrator on rejected post', () => {
      mockCurrentUser = { id: 'admin-user', roles: ['administrator'] } as User
      const { container } = render(
        <PostCard post={{ ...mockPost, clearance_status: 'rejected' }} />,
      )
      expect(container.querySelector('[data-pw="post-card-review-badge"]')).not.toBeNull()
    })

    it('renders a plain-text excerpt to staff when a rejected post has no HTML excerpt', () => {
      mockCurrentUser = { id: 'mod-user', roles: ['moderator'] } as User
      mockGenerateExcerpt.mockReturnValue('Staff-visible plain excerpt')

      render(
        <PostCard
          post={{
            ...mockPost,
            clearance_status: 'rejected',
            markdown: 'Staff **review** markdown.',
          }}
        />,
      )

      expect(screen.getByText('Staff-visible plain excerpt')).toBeDefined()
      expect(mockGenerateExcerpt).toHaveBeenCalledWith('Staff **review** markdown.', 200)
    })

    it('shows ContentUnavailableNotice to non-author non-staff on rejected post', () => {
      mockCurrentUser = { id: 'other-user', roles: [] } as User
      const { container } = render(
        <PostCard post={{ ...mockPost, clearance_status: 'rejected' }} />,
      )
      expect(screen.queryByText('This content is unavailable.')).not.toBeNull()
      expect(container.querySelector('[data-pw="content-removed-notice"]')).toBeNull()
      expect(container.querySelector('[data-pw="post-card-review-badge"]')).toBeNull()
    })

    it('shows ContentUnavailableNotice to unauthenticated visitor on rejected post', () => {
      mockCurrentUser = null
      render(<PostCard post={{ ...mockPost, clearance_status: 'rejected' }} />)
      expect(screen.queryByText('This content is unavailable.')).not.toBeNull()
    })
  })

  describe('Images and DataPoint suppressed on rejected posts', () => {
    it('does not render post-card-images for a rejected post (non-staff viewer)', () => {
      mockCurrentUser = { id: 'other-user', roles: [] } as User
      const postWithImages: Post = {
        ...mockPost,
        clearance_status: 'rejected',
        images: [{ image_id: 'img-1', order_index: 0, caption: '' }],
      }
      const { container } = render(<PostCard post={postWithImages} />)
      // PostCardImages renders an img element; it must be absent for rejected posts
      expect(container.querySelector('img')).toBeNull()
    })

    it('does not render DataPointDetail for a rejected post', () => {
      mockCurrentUser = { id: 'other-user', roles: [] } as User
      const dataPointPost: Post = {
        ...mockPost,
        post_type: 'data_point',
        clearance_status: 'rejected',
        data_point_vertical: 'credit_card',
        structured_data: { credit_score_range: '700-749', result: 'approved' },
      }
      const { container } = render(<PostCard post={dataPointPost} />)
      // DataPointDetail renders one row per structured-data field; rejected posts hide it.
      expect(container.querySelector('[data-pw="data-point-row"]')).toBeNull()
    })
  })

  it('renders trimmed authored titles while retaining their language metadata', () => {
    render(
      <PostCard
        post={{
          ...mockPost,
          title: '  مرحبا بالعالم  ',
          declared_language: 'ar',
          lingua_rs_detected_language: 'en',
        }}
      />,
    )

    const title = screen.getByRole('heading', { level: 3, name: 'مرحبا بالعالم' })
    expect(title).toHaveAttribute('lang', 'ar')
    expect(title).toHaveAttribute('dir', 'rtl')
  })
})
