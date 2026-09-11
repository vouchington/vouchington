import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'

import { PostDetailView as PostDetail } from '../post-detail-view'

import type { Post } from '@/types/posts'

import type { User } from '@/types/user'

let mockCurrentUser: User | null = null

const nextDynamicMock = vi.hoisted(() => {
  const React = require('react')
  return {
    default: (loader: () => Promise<unknown>) =>
      function MockDynamic(props: Record<string, unknown>) {
        const [dynamicComponent, setDynamicComponent] = React.useState(null)
        React.useEffect(() => {
          let active = true
          void loader().then((mod: unknown) => {
            if (active)
              setDynamicComponent(() =>
                typeof mod === 'function' ? mod : (mod as Record<string, unknown>).default,
              )
          })
          return () => {
            active = false
          }
        }, [])
        return dynamicComponent ? React.createElement(dynamicComponent, props) : null
      },
  }
})

vi.mock(import('next/dynamic'), () => nextDynamicMock as unknown as typeof import('next/dynamic'))

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

vi.mock(import('../post-detail-overflow-menu'), () => ({
  PostDetailOverflowMenu: () => <div data-testid='post-detail-overflow-trigger' />,
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
  DiscussInCommunityAction: () => <button type='button'>Discuss in community</button>,
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
        startIndex,
        onOpenChange,
      }: {
        open: boolean
        startIndex: number
        onOpenChange: (open: boolean) => void
      }) =>
        open ? (
          <div
            data-testid='lightbox'
            data-start-index={startIndex}
          >
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

describe('PostDetail rendering', () => {
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

  it('renders overflow menu for authenticated non-owner', async () => {
    mockCurrentUser = { id: 'user-123' } as User
    render(
      <PostDetail
        post={basePost}
        html=''
        currentUserId='user-123'
      />,
    )

    expect(await screen.findByTestId('post-detail-overflow-trigger')).toBeDefined()
  })

  it('omits overflow menu when not logged in', () => {
    render(
      <PostDetail
        post={basePost}
        html=''
      />,
    )

    expect(screen.queryByTestId('post-detail-overflow-trigger')).toBeNull()
  })

  it('does not render Subscribe button when not logged in', () => {
    render(
      <PostDetail
        post={basePost}
        html=''
      />,
    )

    expect(screen.queryByRole('button', { name: /subscribe/i })).toBeNull()
  })

  it('renders markdown content', () => {
    render(
      <PostDetail
        post={basePost}
        html='<p>Test content here</p>'
      />,
    )

    expect(screen.getByText('Test content here')).toBeDefined()
  })
})
