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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockObjectUrls } from '@/test-helpers/object-urls'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { PostForm } from '../post-form'

import type { Post } from '@/types/posts'

describe('PostForm image state', () => {
  beforeEach(() => {
    mockObjectUrls()
    mockRouterPush.mockClear()
    mockCreatePost.mockClear()
    mockUpdatePost.mockClear()
    mockSetPostImages.mockClear()
    mockUploadImageFile.mockClear()
    mockToastError.mockClear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('preserves the successful upload ID in submission when local bytes cannot decode', async () => {
    mockUploadImageFile.mockResolvedValue('new-img-id')
    mockCreatePost.mockResolvedValue({ post: { ...mockDiscussion, id: 'new-1' } })
    render(<PostForm postType='discussion' />)

    const file = new File(['content'], 'photo.heic', { type: 'image/heic' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    // Wait for upload to complete (caption input appears)
    await waitFor(
      () => {
        expect(screen.getByPlaceholderText('Caption (optional)')).toBeDefined()
      },
      { timeout: IMAGE_UPLOAD_WAIT_TIMEOUT },
    )

    fireEvent.error(screen.getByAltText('Uploaded image'))
    expect(screen.getByRole('status')).toHaveTextContent('Image uploaded. Preview unavailable.')

    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'Post content' },
    })
    fireEvent.click(screen.getByText('Post'))

    await waitFor(() => {
      expect(mockCreatePost).toHaveBeenCalledWith(
        expect.objectContaining({
          images: [{ image_id: 'new-img-id', order_index: 0, caption: '' }],
        }),
      )
    })
  })

  it('shows toast and removes entry when image upload fails', async () => {
    mockUploadImageFile.mockRejectedValue(new Error('Upload failed'))
    render(<PostForm postType='discussion' />)

    const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(
      () => {
        expect(mockToastError).toHaveBeenCalledWith('Failed to upload image. Please try again.')
      },
      { timeout: IMAGE_UPLOAD_WAIT_TIMEOUT },
    )
    expect(screen.queryByPlaceholderText('Caption (optional)')).toBeNull()
  }, 10_000)

  it('shows toast and does not upload for unsupported file type', async () => {
    render(<PostForm postType='discussion' />)

    const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Unsupported image format. Please use JPEG, PNG, WebP, GIF, TIFF, AVIF, HEIF, or HEIC.',
      )
    })
    expect(mockUploadImageFile).not.toHaveBeenCalled()
  })

  it('disables Add Image button at 20 images', async () => {
    const postWith20Images: Post = {
      ...mockDiscussion,
      images: Array.from({ length: 20 }, (_, i) => ({
        image_id: `img-${i}`,
        placement_id: `placement-${i}`,
        placement_revision: 0,
        order_index: i,
        caption: '',
      })),
    }
    render(
      <PostForm
        postType='discussion'
        post={postWith20Images}
      />,
    )
    const addButton = screen.getByText('Add Image').closest('button') as HTMLButtonElement
    expect(addButton.disabled).toBe(true)
  })
})
