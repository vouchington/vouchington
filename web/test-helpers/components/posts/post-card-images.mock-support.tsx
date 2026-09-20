import { vi } from 'vitest'

import { Button } from '@/components/ui/button'
import type { Post, PostElection } from '@/types/posts'
import type { User } from '@/types/user'
import { PostCard } from '@/components/posts/post-card'

let mockCurrentUser: User | null = null
const mockUseEmblaCarousel = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('next/dynamic'), () => ({
  default: () => () => null,
}))

vi.mock(import('@/components/admin/admin-moderation-button'), () => ({
  default: () => <div />,
}))

vi.mock(import('@/components/shared/entity-bookmark-button'), () => ({
  EntityBookmarkButton: () => <Button type='button'>Save</Button>,
}))

vi.mock(import('@/components/shared/post-image'), () => {
  const Img = 'img' as const

  return {
    PostImage: ({
      alt,
      placement,
      priority,
    }: {
      alt?: string
      placement?: { id: string; revision: number }
      priority?: boolean
    }) => (
      <Img
        alt={alt}
        data-placement-id={placement?.id}
        data-placement-revision={placement?.revision}
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

vi.mock(
  import('embla-carousel-react'),
  () =>
    ({
      default: mockUseEmblaCarousel,
    }) as unknown as typeof import('embla-carousel-react'),
)

vi.mock(import('@/components/shared/follower-share-actions'), () => ({
  FollowerShareActions: () => <div />,
}))

vi.mock(import('@/components/shared/report-menu-item'), () => ({
  ReportMenuKebab: () => <Button type='button'>Report</Button>,
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
  SharedByline: ({ className }: { className?: string }) => <div data-class={className ?? ''} />,
}))

export const mockPost: Post = {
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

export const mockElection: PostElection = {
  __entity_type: 'post_election',
  id: 'election-1',
  votes_score_net: 8,
  votes_count_up: 10,
  votes_count_down: 2,
}

export function postWithImages(imageCount: number, caption = ''): Post {
  return {
    ...mockPost,
    images: Array.from({ length: imageCount }, (_, orderIndex) => ({
      image_id: `img-${orderIndex + 1}`,
      placement_id: `placement-${orderIndex + 1}`,
      placement_revision: 0,
      order_index: orderIndex,
      caption,
    })),
  }
}

export function setUpPostCardImagesTest() {
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
}

export async function loadPostCard() {
  return PostCard
}
