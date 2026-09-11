import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReviewQueueMedia } from './review-queue-media'

describe('ReviewQueueMedia', () => {
  it('renders nothing for an old response without media context', () => {
    const { container } = render(
      <ReviewQueueMedia
        postId='post-1'
        mediaContext={undefined}
        onReveal={vi.fn<(postId: string) => void>()}
        revealDisabled={false}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the post has no images', () => {
    const { container } = render(
      <ReviewQueueMedia
        postId='post-1'
        mediaContext={{ requires_reveal: false, images: [] }}
        onReveal={vi.fn<(postId: string) => void>()}
        revealDisabled={false}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders safe images without a reveal gate', () => {
    render(
      <ReviewQueueMedia
        postId='post-1'
        mediaContext={{
          requires_reveal: false,
          images: [{ image_id: 'image-1', order_index: 0, caption: 'Evidence' }],
        }}
        onReveal={vi.fn<(postId: string) => void>()}
        revealDisabled={false}
      />,
    )

    expect(screen.getByRole('img', { name: 'Evidence' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sensitive content/i })).not.toBeInTheDocument()
  })

  it('gates a sensitive post media group and records one reveal for the post', () => {
    const onReveal = vi.fn<(postId: string) => void>()
    render(
      <ReviewQueueMedia
        postId='post-1'
        mediaContext={{
          requires_reveal: true,
          images: [
            { image_id: 'image-1', order_index: 0, caption: 'First' },
            { image_id: 'image-2', order_index: 1, caption: 'Second' },
          ],
        }}
        onReveal={onReveal}
        revealDisabled={false}
      />,
    )

    fireEvent.click(screen.getByRole('button'))

    expect(onReveal).toHaveBeenCalledOnce()
    expect(onReveal).toHaveBeenCalledWith('post-1')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getAllByRole('img')).toHaveLength(2)
  })

  it('blocks another sensitive-media reveal while exposure state is stale', () => {
    const onReveal = vi.fn<(postId: string) => void>()
    render(
      <ReviewQueueMedia
        postId='post-1'
        mediaContext={{
          requires_reveal: true,
          images: [{ image_id: 'image-1', order_index: 0, caption: 'Sensitive' }],
        }}
        onReveal={onReveal}
        revealDisabled
      />,
    )

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onReveal).not.toHaveBeenCalled()
  })
})
