import {
  IMAGE_UPLOAD_WAIT_TIMEOUT,
  mockCreatePost,
  mockDiscussion,
  mockRouterPush,
  mockSetPostImages,
  mockToastError,
  mockUpdatePost,
  mockUploadImageFile,
} from '@/test-helpers/components/posts/post-form-images.mock-support'

import { describe, it, expect, beforeEach } from 'vitest'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { PostForm } from '../post-form'

describe('PostForm image state', () => {
  beforeEach(() => {
    mockRouterPush.mockClear()
    mockCreatePost.mockClear()
    mockUpdatePost.mockClear()
    mockSetPostImages.mockClear()
    mockUploadImageFile.mockClear()
    mockToastError.mockClear()
  })

  it('uploads multiple files at once and appends them all with correct order_index', async () => {
    mockUploadImageFile
      .mockResolvedValueOnce('img-a')
      .mockResolvedValueOnce('img-b')
      .mockResolvedValueOnce('img-c')
    mockCreatePost.mockResolvedValue({ post: { ...mockDiscussion, id: 'new-1' } })
    render(<PostForm postType='discussion' />)

    const files = [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
      new File(['c'], 'c.jpg', { type: 'image/jpeg' }),
    ]
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files } })

    // Wait for all 3 caption inputs to appear
    await waitFor(
      () => {
        expect(screen.getAllByPlaceholderText('Caption (optional)')).toHaveLength(3)
      },
      { timeout: IMAGE_UPLOAD_WAIT_TIMEOUT },
    )

    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'Multi-image post' },
    })
    fireEvent.click(screen.getByText('Post'))

    await waitFor(() => {
      expect(mockCreatePost).toHaveBeenCalledWith(
        expect.objectContaining({
          images: [
            { image_id: 'img-a', order_index: 0, caption: '' },
            { image_id: 'img-b', order_index: 1, caption: '' },
            { image_id: 'img-c', order_index: 2, caption: '' },
          ],
        }),
      )
    })
  }, 10_000)
})
