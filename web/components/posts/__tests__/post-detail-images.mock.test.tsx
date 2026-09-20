import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  loadPostDetail,
  postDetailWithImages,
  setUpPostDetailImagesTest,
} from './post-detail-images.mock-support'

vi.mock(
  import('@/components/shared/entity-bookmark-button'),
  () =>
    ({
      EntityBookmarkButton: () => null,
    }) as unknown as typeof import('@/components/shared/entity-bookmark-button'),
)

describe('PostDetail images', () => {
  beforeEach(setUpPostDetailImagesTest)

  it('marks the single hero image as priority', async () => {
    const PostDetail = await loadPostDetail()
    const { container } = render(
      <PostDetail
        post={postDetailWithImages(1)}
        html=''
      />,
    )

    expect(container.querySelector('img')).toHaveAttribute('data-priority', 'true')
  })

  it('marks only the first carousel image as priority', async () => {
    const PostDetail = await loadPostDetail()
    const { container } = render(
      <PostDetail
        post={postDetailWithImages(3)}
        html=''
      />,
    )

    const images = container.querySelectorAll('img')
    expect(images).toHaveLength(3)
    expect(images[0]).toHaveAttribute('data-priority', 'true')
    expect(images[1]).toHaveAttribute('data-priority', 'false')
    expect(images[2]).toHaveAttribute('data-priority', 'false')
  })

  it('wraps the single post image in a centering container', async () => {
    const PostDetail = await loadPostDetail()
    const { container } = render(
      <PostDetail
        post={postDetailWithImages(1, 'Image post')}
        html=''
      />,
    )

    const image = container.querySelector('img[data-image-id="img-1"]')
    expect(image).toBeDefined()
    expect(image?.parentElement?.className).toContain('items-center')
    expect(image?.parentElement?.className).toContain('justify-center')
  })
})
