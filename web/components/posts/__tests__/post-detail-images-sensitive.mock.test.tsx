import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostDetailImages } from '../post-detail-images'

const { mockGetExposureState, mockRecordMediaReveal } = vi.hoisted(() => ({
  mockGetExposureState: vi.fn<VitestLooseMock>(),
  mockRecordMediaReveal: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('next/dynamic'), () => ({ default: () => () => null }))

vi.mock(import('@/components/ui/carousel'), async importOriginal => {
  const actual = await importOriginal()
  const Carousel = (({ children }) => <div>{children}</div>) as typeof actual.Carousel
  Carousel.displayName = 'Carousel'
  const CarouselContent = (({ children }) => <div>{children}</div>) as typeof actual.CarouselContent
  CarouselContent.displayName = 'CarouselContent'
  const CarouselItem = (({ children }) => <div>{children}</div>) as typeof actual.CarouselItem
  CarouselItem.displayName = 'CarouselItem'
  const CarouselNext = (_props: Parameters<typeof actual.CarouselNext>[0]) => <span />
  CarouselNext.displayName = 'CarouselNext'
  const CarouselPrevious = (_props: Parameters<typeof actual.CarouselPrevious>[0]) => <span />
  CarouselPrevious.displayName = 'CarouselPrevious'

  return {
    ...actual,
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
  }
})

vi.mock(import('@/components/shared/post-image'), () => ({
  PostImage: ({ imageId }: { imageId: string }) => <span>{imageId}</span>,
}))

vi.mock(import('@/lib/api/client/moderation-exposure'), () => ({
  getExposureState: mockGetExposureState,
  recordMediaReveal: mockRecordMediaReveal,
}))

const neutralExposure = { count: 0, threshold: 10, in_cooldown: false, cooldown_ends_at: null }

describe('PostDetailImages sensitive media', () => {
  beforeEach(() => {
    mockGetExposureState.mockReset()
    mockRecordMediaReveal.mockReset()
    mockGetExposureState.mockResolvedValue({ exposure: neutralExposure })
    mockRecordMediaReveal.mockResolvedValue({
      exposure: { ...neutralExposure, count: 1 },
    })
  })

  it('keeps post-detail media gated while the moderator is in cooldown', async () => {
    mockGetExposureState.mockResolvedValueOnce({
      exposure: {
        count: 10,
        threshold: 10,
        in_cooldown: true,
        cooldown_ends_at: '2099-01-01T00:00:00Z',
      },
    })

    render(
      <PostDetailImages
        heading='Sensitive post'
        postId='post-1'
        images={[
          { imageId: 'img-1', placementId: 'placement-1', placementRevision: 0, caption: '' },
        ]}
        isModerator
        isSensitive
      />,
    )

    const reveal = screen.getByRole('button', { name: /sensitive content/i })
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(mockGetExposureState).toHaveBeenCalledOnce()
    expect(reveal).toBeDisabled()
    fireEvent.click(reveal)
    expect(mockRecordMediaReveal).not.toHaveBeenCalled()
  })

  it('reveals the sensitive post media group and records it exactly once', async () => {
    render(
      <PostDetailImages
        heading='Sensitive post'
        postId='post-1'
        images={[
          { imageId: 'img-1', placementId: 'placement-1', placementRevision: 0, caption: 'First' },
          { imageId: 'img-2', placementId: 'placement-2', placementRevision: 0, caption: 'Second' },
        ]}
        isModerator
        isSensitive
      />,
    )

    const reveal = screen.getByRole('button', { name: /sensitive content/i })
    await waitFor(() => expect(reveal).toBeEnabled())
    fireEvent.click(reveal)

    await waitFor(() => expect(mockRecordMediaReveal).toHaveBeenCalledOnce())
    expect(mockRecordMediaReveal).toHaveBeenCalledWith({
      postId: 'post-1',
      surface: 'post_page',
    })
    expect(screen.queryByRole('button', { name: /sensitive content/i })).not.toBeInTheDocument()
    expect(screen.getByText('img-1')).toBeInTheDocument()
    expect(screen.getByText('img-2')).toBeInTheDocument()
  })

  it('lets the moderator retry a stale exposure-state request without leaving the post', async () => {
    mockGetExposureState.mockRejectedValueOnce(new Error('temporary exposure outage'))

    render(
      <PostDetailImages
        heading='Sensitive post'
        postId='post-1'
        images={[
          { imageId: 'img-1', placementId: 'placement-1', placementRevision: 0, caption: '' },
        ]}
        isModerator
        isSensitive
      />,
    )

    const reveal = screen.getByRole('button', { name: /sensitive content/i })
    await waitFor(() => expect(mockGetExposureState).toHaveBeenCalledOnce())
    expect(reveal).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(mockGetExposureState).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(reveal).toBeEnabled())
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('does not fetch exposure state when the media does not need a moderator gate', () => {
    const { rerender } = render(
      <PostDetailImages
        heading='Sensitive post'
        postId='post-1'
        images={[
          { imageId: 'img-1', placementId: 'placement-1', placementRevision: 0, caption: '' },
        ]}
        isSensitive
      />,
    )

    expect(mockGetExposureState).not.toHaveBeenCalled()

    rerender(
      <PostDetailImages
        heading='Safe post'
        postId='post-1'
        images={[
          { imageId: 'img-1', placementId: 'placement-1', placementRevision: 0, caption: '' },
        ]}
        isModerator
      />,
    )

    expect(mockGetExposureState).not.toHaveBeenCalled()
  })
})
