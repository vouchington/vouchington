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

// Stub the overflow menu to avoid loading its full async module tree (report-dialog, radix)
// which causes EnvironmentTeardownError when the dynamic() loader resolves after teardown.
vi.mock(import('../post-detail-overflow-menu'), () => ({
  PostDetailOverflowMenu: () => null,
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

  it('renders category topics as badges in badge strip', () => {
    const post: Post = {
      ...basePost,
      title: 'Topic test',
      post_related_topics: [
        {
          __entity_type: 'topic' as const,
          id: 'topic-1',
          name: 'Credit Cards',
          topic_type: 'category',
          slug: 'credit-cards',
          referral_program_id: null,
        },
      ],
    }

    render(
      <PostDetail
        post={post}
        html=''
      />,
    )

    expect(screen.getByText('Credit Cards')).toBeDefined()
  })

  it('does not show comment count in action bar', () => {
    render(
      <PostDetail
        post={basePost}
        html=''
      />,
    )

    expect(screen.queryByText(/comments/)).toBeNull()
  })

  it('sets automatic direction on authored titles without known content language', () => {
    render(
      <PostDetail
        post={{
          ...basePost,
          title: 'مرحبا بالعالم',
          declared_language: null,
          lingua_rs_detected_language: null,
        }}
        html=''
      />,
    )

    const heading = screen.getByRole('heading', { level: 1, name: 'مرحبا بالعالم' })
    expect(heading).not.toHaveAttribute('lang')
    expect(heading).toHaveAttribute('dir', 'auto')
  })

  it('renders Subscribe button in action bar when currentUserId provided', async () => {
    mockCurrentUser = { id: 'user-123' } as User
    render(
      <PostDetail
        post={basePost}
        html=''
      />,
    )

    expect(await screen.findByRole('button', { name: /subscribe/i })).toBeDefined()
  })

  it('renders comment details without constructing a rootless canonical discussion source', () => {
    expect(() =>
      render(
        <PostDetail
          post={{ ...basePost, post_type: 'comment' }}
          html='<p>Comment body</p>'
        />,
      ),
    ).not.toThrow()
    expect(screen.queryByText('Discuss in community')).toBeNull()
  })
})
