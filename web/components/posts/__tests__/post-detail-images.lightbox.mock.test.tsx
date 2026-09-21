import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  loadPostDetail,
  postDetailWithImages,
  setUpPostDetailImagesTest,
} from '@/test-helpers/components/posts/post-detail-images.mock-support'

vi.mock(
  import('@/components/shared/entity-bookmark-button'),
  () =>
    ({
      EntityBookmarkButton: () => null,
    }) as unknown as typeof import('@/components/shared/entity-bookmark-button'),
)

describe('PostDetail image lightbox', () => {
  beforeEach(setUpPostDetailImagesTest)

  it('opens lightbox when a single image is clicked', async () => {
    const PostDetail = await loadPostDetail()
    render(
      <PostDetail
        post={postDetailWithImages(1, 'Image post')}
        html=''
      />,
    )

    expect(screen.queryByRole('button', { name: 'Close lightbox' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View full size image' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Close lightbox' })).toBeDefined(),
    )
    expect(screen.getByRole('button', { name: 'Close lightbox' }).parentElement).toHaveAttribute(
      'data-start-index',
      '0',
    )
  })

  it('opens lightbox at the clicked carousel image index', async () => {
    const PostDetail = await loadPostDetail()
    render(
      <PostDetail
        post={postDetailWithImages(2, 'Multi-image post')}
        html=''
      />,
    )

    const buttons = await waitFor(() =>
      screen.getAllByRole('button', { name: /View full size image/i }),
    )
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[1]!)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Close lightbox' }).parentElement).toHaveAttribute(
        'data-start-index',
        '1',
      ),
    )
  })

  it('closes lightbox when its change handler receives false', async () => {
    const PostDetail = await loadPostDetail()
    render(
      <PostDetail
        post={postDetailWithImages(1, 'Image post')}
        html=''
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'View full size image' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Close lightbox' })).toBeDefined(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close lightbox' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close lightbox' })).toBeNull())
  })
})
