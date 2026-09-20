import { vi } from 'vitest'

import type { Post } from '@/types/posts'
import { PostDetailView } from '../post-detail-view'

const mockUseEmblaCarousel = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockUseAuth = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('next/dynamic'),
  () =>
    ({
      default: (loader: () => Promise<unknown>) => {
        const src = loader.toString()
        if (src.includes('post-image-lightbox'))
          return ({
            open,
            startIndex,
            onOpenChange,
          }: {
            open: boolean
            startIndex: number
            onOpenChange: (value: boolean) => void
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
            ) : null
        return () => null
      },
    }) as unknown as typeof import('next/dynamic'),
)

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

vi.mock(
  import('@/components/shared/entity-bookmark-button'),
  () =>
    ({
      EntityBookmarkButton: () => null,
    }) as unknown as typeof import('@/components/shared/entity-bookmark-button'),
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
  import('embla-carousel-react'),
  () =>
    ({
      default: mockUseEmblaCarousel,
    }) as unknown as typeof import('embla-carousel-react'),
)

vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: mockUseAuth,
}))

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
      default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

export const basePost: Post = {
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

export function postDetailWithImages(imageCount: number, title = ''): Post {
  return {
    ...basePost,
    title,
    images: Array.from({ length: imageCount }, (_, orderIndex) => ({
      image_id: `img-${orderIndex + 1}`,
      placement_id: `placement-${orderIndex + 1}`,
      placement_revision: 0,
      order_index: orderIndex,
      caption: '',
    })),
  }
}

export function setUpPostDetailImagesTest() {
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
  mockUseAuth.mockReturnValue({ currentUser: null, isAuthenticated: false })
}

export async function loadPostDetail() {
  return PostDetailView
}
