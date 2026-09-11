import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PostDetailView as PostDetail } from '../post-detail-view'
import type { Post } from '@/types/posts'
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
            onOpenChange: (v: boolean) => void
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
const mockUseEmblaCarousel = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock(
  import('embla-carousel-react'),
  () =>
    ({
      default: mockUseEmblaCarousel,
    }) as unknown as typeof import('embla-carousel-react'),
)
const mockUseAuth = vi.hoisted(() => vi.fn<VitestLooseMock>())
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
describe('PostDetail image and lightbox', () => {
  beforeEach(() => {
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
  })
  it('single hero image has data-priority="true"', () => {
    const post: Post = {
      ...basePost,
      images: [{ image_id: 'img-1', order_index: 0, caption: '' }],
    }
    const { container } = render(
      <PostDetail
        post={post}
        html=''
      />,
    )
    expect(container.querySelector('img')?.getAttribute('data-priority')).toBe('true')
  })
  it('carousel: only first image has data-priority="true"', () => {
    const post: Post = {
      ...basePost,
      images: [
        { image_id: 'img-1', order_index: 0, caption: '' },
        { image_id: 'img-2', order_index: 1, caption: '' },
        { image_id: 'img-3', order_index: 2, caption: '' },
      ],
    }
    const { container } = render(
      <PostDetail
        post={post}
        html=''
      />,
    )
    const imgs = container.querySelectorAll('img')
    expect(imgs).toHaveLength(3)
    expect(imgs[0]!.getAttribute('data-priority')).toBe('true')
    expect(imgs[1]!.getAttribute('data-priority')).toBe('false')
    expect(imgs[2]!.getAttribute('data-priority')).toBe('false')
  })
  it('wraps single post image in a centering container', () => {
    const post: Post = {
      ...basePost,
      title: 'Image post',
      images: [{ image_id: 'img-1', order_index: 0, caption: '' }],
    }
    const { container } = render(
      <PostDetail
        post={post}
        html=''
      />,
    )
    const img = container.querySelector('img[data-image-id="img-1"]')
    expect(img).toBeDefined()
    const wrapper = img?.parentElement
    expect(wrapper?.className).toContain('items-center')
    expect(wrapper?.className).toContain('justify-center')
  })
  it('opens lightbox when single image is clicked', async () => {
    const post: Post = {
      ...basePost,
      title: 'Image post',
      images: [{ image_id: 'img-1', order_index: 0, caption: '' }],
    }
    render(
      <PostDetail
        post={post}
        html=''
      />,
    )
    expect(screen.queryByTestId('lightbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View full size image' }))
    await waitFor(() => expect(screen.getByTestId('lightbox')).toBeDefined())
    expect(screen.getByTestId('lightbox').getAttribute('data-start-index')).toBe('0')
  })
  it('opens lightbox at the correct index when a carousel image is clicked', async () => {
    const post: Post = {
      ...basePost,
      title: 'Multi-image post',
      images: [
        { image_id: 'img-1', order_index: 0, caption: '' },
        { image_id: 'img-2', order_index: 1, caption: '' },
      ],
    }
    render(
      <PostDetail
        post={post}
        html=''
      />,
    )
    const buttons = await waitFor(() =>
      screen.getAllByRole('button', { name: /View full size image/i }),
    )
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[1]!)
    await waitFor(() =>
      expect(screen.getByTestId('lightbox').getAttribute('data-start-index')).toBe('1'),
    )
  })
  it('closes lightbox when onOpenChange is called with false', async () => {
    const post: Post = {
      ...basePost,
      title: 'Image post',
      images: [{ image_id: 'img-1', order_index: 0, caption: '' }],
    }
    render(
      <PostDetail
        post={post}
        html=''
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'View full size image' }))
    await waitFor(() => expect(screen.getByTestId('lightbox')).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Close lightbox' }))
    await waitFor(() => expect(screen.queryByTestId('lightbox')).toBeNull())
  })
})
