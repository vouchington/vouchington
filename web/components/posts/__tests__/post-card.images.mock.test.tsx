import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/ui/button'

import {
  loadPostCard,
  postWithImages,
  setUpPostCardImagesTest,
} from '@/test-helpers/components/posts/post-card-images.mock-support'

vi.mock(import('@/components/shared/entity-bookmark-button'), () => ({
  EntityBookmarkButton: () => <Button type='button'>Save</Button>,
}))

describe('PostCard image loading and placement', () => {
  beforeEach(setUpPostCardImagesTest)

  it('marks the single card image as priority when requested', async () => {
    const PostCard = await loadPostCard()
    const { container } = render(
      <PostCard
        post={postWithImages(1)}
        priority
      />,
    )

    expect(container.querySelector('img')).toHaveAttribute('data-priority', 'true')
  })

  it('does not mark the single card image as priority by default', async () => {
    const PostCard = await loadPostCard()
    const { container } = render(<PostCard post={postWithImages(1)} />)

    expect(container.querySelector('img')).toHaveAttribute('data-priority', 'false')
  })

  it('binds the rendered media to its server placement and revision', async () => {
    const PostCard = await loadPostCard()
    const { container } = render(<PostCard post={postWithImages(1)} />)

    expect(container.querySelector('img')).toHaveAttribute('data-placement-id', 'placement-1')
    expect(container.querySelector('img')).toHaveAttribute('data-placement-revision', '0')
  })

  it('marks only the first card-carousel image as priority', async () => {
    const PostCard = await loadPostCard()
    const { container } = render(
      <PostCard
        post={postWithImages(2)}
        priority
      />,
    )

    const images = container.querySelectorAll('img')
    expect(images[0]).toHaveAttribute('data-priority', 'true')
    expect(images[1]).toHaveAttribute('data-priority', 'false')
  })

  it('does not mark card-carousel images as priority by default', async () => {
    const PostCard = await loadPostCard()
    const { container } = render(<PostCard post={postWithImages(2)} />)

    const images = container.querySelectorAll('img')
    expect(images[0]).toHaveAttribute('data-priority', 'false')
    expect(images[1]).toHaveAttribute('data-priority', 'false')
  })
})
