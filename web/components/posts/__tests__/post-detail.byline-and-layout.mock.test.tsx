import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PostDetailView as PostDetail } from '../post-detail-view'
import type { Post } from '@/types/posts'
import type { User } from '@/types/user'

let mockCurrentUser: User | null = null

vi.mock(import('next/dynamic'), () => ({
  default: () => () => null,
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('@/components/shared/time-ago'),
  () =>
    ({
      TimeAgo: ({ date }: { date: string }) => <span>{date}</span>,
    }) as unknown as typeof import('@/components/shared/time-ago'),
)

vi.mock(import('@/components/shared/post-image'), () => {
  const Img = 'img' as const

  return {
    PostImage: ({
      alt,
      imageId,
      priority,
    }: {
      alt?: string
      imageId: string
      priority?: boolean
    }) => (
      <Img
        alt={alt}
        data-image-id={imageId}
        data-priority={String(Boolean(priority))}
      />
    ),
  }
})

vi.mock(import('@/components/shared/entity-bookmark-button'), () => ({
  EntityBookmarkButton: ({ inactiveLabel = 'Subscribe' }: { inactiveLabel?: string }) => (
    <button type='button'>{inactiveLabel}</button>
  ),
}))

vi.mock(import('@/components/posts/post-detail-actions'), () => ({
  PostDetailActions: () => <div data-testid='post-detail-actions' />,
}))

vi.mock(import('../post-detail-overflow-menu'), () => ({
  PostDetailOverflowMenu: () => null,
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

vi.mock(import('../discuss-in-community-action'), () => ({
  DiscussInCommunityAction: () => <button type='button'>Discuss</button>,
}))

const mockUseEmblaCarousel = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock(
  import('embla-carousel-react'),
  () =>
    ({
      default: mockUseEmblaCarousel,
    }) as unknown as typeof import('embla-carousel-react'),
)

vi.mock(
  import('../post-image-lightbox'),
  () =>
    ({
      PostImageLightbox: ({
        open,
        onOpenChange,
      }: {
        open: boolean
        startIndex: number
        onOpenChange: (open: boolean) => void
      }) =>
        open ? (
          <div data-testid='lightbox'>
            <button
              type='button'
              onClick={() => onOpenChange(false)}
            >
              Close lightbox
            </button>
          </div>
        ) : null,
    }) as unknown as typeof import('../post-image-lightbox'),
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

const basePost: Post = {
  id: 'post-1',
  post_type: 'discussion',
  markdown: 'Hello world',
  root_id: null,
  created_by_id: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: 'everyone',
  privacy: 'public',
  is_anonymous: false,
  community_id: null,
  clearance_status: 'approved',
  title: '',
}

describe('PostDetail byline and layout', () => {
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

  it('byline appears after markdown content in document order', () => {
    render(
      <PostDetail
        post={basePost}
        html='<p>Unique body text</p>'
      />,
    )

    const contentEl = screen.getByText('Unique body text')
    const bylineEl = screen.getByText(/Posted by/)
    expect(
      contentEl.compareDocumentPosition(bylineEl) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('anonymous byline appears after content in document order', () => {
    const post: Post = {
      ...basePost,
      title: 'Anon post',
      broadcast: 'users',
      is_anonymous: true,
    }

    render(
      <PostDetail
        post={post}
        html='<p>Anon content here</p>'
      />,
    )

    const contentEl = screen.getByText('Anon content here')
    const bylineEl = screen.getByText('Posted by Anonymous')
    expect(
      contentEl.compareDocumentPosition(bylineEl) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('does not show discuss action for restricted-audience posts', () => {
    render(
      <PostDetail
        post={{ ...basePost, broadcast: 'followers', privacy: 'public' }}
        html='<p>Followers content</p>'
      />,
    )

    expect(screen.queryByRole('button', { name: 'Discuss' })).toBeNull()
  })

  it('renders byline author name as a link to user profile', () => {
    const post: Post = {
      ...basePost,
      title: 'Linked author',
      created_by_id: 'user-abc',
      created_by: {
        __entity_type: 'user' as const,
        id: 'user-abc',
        username: 'story-teller',
        profile_image_id: null,
      },
    }
    render(
      <PostDetail
        post={post}
        html=''
      />,
    )
    const link = screen.getByRole('link', { name: /Posted by story-teller/i })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).href).toContain('/user/story-teller')
  })

  it('renders anonymous byline as plain text without a link', () => {
    const post: Post = { ...basePost, title: 'Anon', is_anonymous: true }
    render(
      <PostDetail
        post={post}
        html=''
      />,
    )
    expect(screen.getByText('Posted by Anonymous')).toBeDefined()
    expect(screen.queryByRole('link', { name: /Posted by/i })).toBeNull()
  })

  describe('floating kebab and title padding (shareMenuVisible)', () => {
    it('title gets pr-14 for authenticated non-owner on shareable post', () => {
      mockCurrentUser = { id: 'user-viewer' } as User
      const post: Post = { ...basePost, title: 'My Post', created_by_id: 'user-owner' }
      const { container } = render(
        <PostDetail
          post={post}
          html=''
          currentUserId='user-viewer'
        />,
      )
      expect(container.querySelector('h1')?.className).toContain('pr-14')
    })

    it('title has no pr-14 when user is the post owner', () => {
      mockCurrentUser = { id: 'user-1' } as User
      const post: Post = { ...basePost, title: 'My Post', created_by_id: 'user-1' }
      const { container } = render(
        <PostDetail
          post={post}
          html=''
        />,
      )
      expect(container.querySelector('h1')?.className).not.toContain('pr-14')
    })

    it('title has no pr-14 when signed out', () => {
      const post: Post = { ...basePost, title: 'My Post', created_by_id: 'user-owner' }
      const { container } = render(
        <PostDetail
          post={post}
          html=''
        />,
      )
      expect(container.querySelector('h1')?.className).not.toContain('pr-14')
    })
  })
})
