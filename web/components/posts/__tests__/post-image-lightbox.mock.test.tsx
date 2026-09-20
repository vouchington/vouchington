import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PostImageLightbox } from '../post-image-lightbox'
import type { ReactNode } from 'react'

vi.mock(import('@/components/shared/post-image'), () => {
  const Img = 'img' as const

  return {
    PostImage: ({ alt, imageId }: { alt?: string; imageId: string }) => (
      <Img
        alt={alt}
        data-image-id={imageId}
      />
    ),
  }
})

vi.mock(
  import('@/components/ui/dialog'),
  () =>
    ({
      Dialog: ({
        children,
        open,
        onOpenChange,
      }: {
        children: ReactNode
        open: boolean
        onOpenChange?: (open: boolean) => void
      }) =>
        open ? (
          <div data-testid='dialog'>
            <button
              type='button'
              onClick={() => onOpenChange?.(false)}
            >
              Close dialog
            </button>
            {children}
          </div>
        ) : null,
      DialogContent: ({ children }: { children: ReactNode }) => (
        <div data-testid='dialog-content'>{children}</div>
      ),
      DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
      DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    }) as unknown as typeof import('@/components/ui/dialog'),
)

vi.mock(import('@/components/ui/carousel'), () => {
  return {
    Carousel: ({ children }: { children: ReactNode; setApi?: unknown }) => {
      return <div data-testid='carousel'>{children}</div>
    },
    CarouselContent: ({ children }: { children: ReactNode }) => (
      <div data-testid='carousel-content'>{children}</div>
    ),
    CarouselItem: ({ children }: { children: ReactNode }) => (
      <div data-testid='carousel-item'>{children}</div>
    ),
    CarouselPrevious: ({ className }: { className?: string }) => (
      <button
        type='button'
        className={className}
      >
        Previous slide
      </button>
    ),
    CarouselNext: ({ className }: { className?: string }) => (
      <button
        type='button'
        className={className}
      >
        Next slide
      </button>
    ),
  } as unknown as typeof import('@/components/ui/carousel')
})

const images = [
  { imageId: 'img-1', placementId: 'placement-1', placementRevision: 0, caption: 'First image' },
  { imageId: 'img-2', placementId: 'placement-2', placementRevision: 0, caption: '' },
]

describe('PostImageLightbox', () => {
  it('renders nothing when closed', () => {
    render(
      <PostImageLightbox
        images={images}
        startIndex={0}
        open={false}
        onOpenChange={vi.fn<VitestLooseMock>()}
        alt='Post'
      />,
    )
    expect(screen.queryByTestId('dialog')).toBeNull()
  })

  it('renders the dialog when open', () => {
    render(
      <PostImageLightbox
        images={images}
        startIndex={0}
        open
        onOpenChange={vi.fn<VitestLooseMock>()}
        alt='Post'
      />,
    )
    expect(screen.getByTestId('dialog')).toBeDefined()
  })

  it('gives the dialog a screen reader description', () => {
    const { rerender } = render(
      <PostImageLightbox
        images={images}
        startIndex={0}
        open
        onOpenChange={vi.fn<VitestLooseMock>()}
        alt='Post'
      />,
    )
    expect(screen.getByText('View full-size post images.')).toBeDefined()

    rerender(
      <PostImageLightbox
        images={[images[0]!]}
        startIndex={0}
        open
        onOpenChange={vi.fn<VitestLooseMock>()}
        alt='Post'
      />,
    )
    expect(screen.getByText('View full-size post image.')).toBeDefined()
  })

  it('renders a carousel for multiple images', () => {
    render(
      <PostImageLightbox
        images={images}
        startIndex={0}
        open
        onOpenChange={vi.fn<VitestLooseMock>()}
        alt='Post'
      />,
    )
    expect(screen.getByTestId('carousel')).toBeDefined()
    expect(screen.getAllByTestId('carousel-item')).toHaveLength(2)
  })

  it('renders directly without carousel for a single image', () => {
    render(
      <PostImageLightbox
        images={[images[0]!]}
        startIndex={0}
        open
        onOpenChange={vi.fn<VitestLooseMock>()}
        alt='Post'
      />,
    )
    expect(screen.queryByTestId('carousel')).toBeNull()
    expect(screen.getByAltText('First image')).toBeDefined()
  })

  it('shows the caption for a single image', () => {
    render(
      <PostImageLightbox
        images={[images[0]!]}
        startIndex={0}
        open
        onOpenChange={vi.fn<VitestLooseMock>()}
        alt='Post'
      />,
    )
    expect(screen.getByText('First image')).toBeDefined()
  })

  it('calls onOpenChange(false) when the dialog close button is triggered', () => {
    const onOpenChange = vi.fn<VitestLooseMock>()
    render(
      <PostImageLightbox
        images={images}
        startIndex={0}
        open
        onOpenChange={onOpenChange}
        alt='Post'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('carousel arrows are positioned inside the viewport', () => {
    render(
      <PostImageLightbox
        images={images}
        startIndex={0}
        open
        onOpenChange={vi.fn<VitestLooseMock>()}
        alt='Post'
      />,
    )
    const prevBtn = screen.getByRole('button', { name: 'Previous slide' })
    const nextBtn = screen.getByRole('button', { name: 'Next slide' })
    expect(prevBtn.className).toContain('left-2')
    expect(nextBtn.className).toContain('right-2')
  })
})
