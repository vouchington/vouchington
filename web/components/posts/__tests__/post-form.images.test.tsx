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

import { describe, it, expect, vi, beforeEach } from 'vitest'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { PostForm } from '../post-form'

import type { Post } from '@/types/posts'

const postWithImages: Post = {
  ...mockDiscussion,
  images: [
    {
      image_id: 'img-1',
      placement_id: 'placement-1',
      placement_revision: 0,
      order_index: 0,
      caption: '',
    },
  ],
}

describe('PostForm image state', () => {
  beforeEach(() => {
    mockRouterPush.mockClear()
    mockCreatePost.mockClear()
    mockUpdatePost.mockClear()
    mockSetPostImages.mockClear()
    mockUploadImageFile.mockClear()
    mockToastError.mockClear()
  })

  it('does not call setPostImages when images are unchanged in edit mode', async () => {
    mockUpdatePost.mockResolvedValue({ post: { ...postWithImages } })
    render(
      <PostForm
        postType='discussion'
        post={postWithImages}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'Updated content' },
    })
    fireEvent.click(screen.getByText('Save Changes'))
    await waitFor(() => {
      expect(mockUpdatePost).toHaveBeenCalled()
    })
    expect(mockSetPostImages).not.toHaveBeenCalled()
    expect(mockRouterPush).toHaveBeenCalledWith('/discussion/post-1')
  })

  it('uses the persisted placement route for an existing image preview', () => {
    const { container } = render(
      <PostForm
        postType='discussion'
        post={postWithImages}
      />,
    )

    expect(container.querySelector('[data-pw="post-image"]')).toHaveAttribute(
      'src',
      expect.stringContaining('/images/placements/placement-1/0/img-1?w=100'),
    )
  })

  it('calls setPostImages when images are removed in edit mode', async () => {
    mockUpdatePost.mockResolvedValue({ post: { ...postWithImages } })
    mockSetPostImages.mockResolvedValue({ images: [] })
    render(
      <PostForm
        postType='discussion'
        post={postWithImages}
      />,
    )
    fireEvent.click(screen.getByLabelText('Remove image'))
    fireEvent.click(screen.getByText('Save Changes'))
    await waitFor(() => {
      expect(mockSetPostImages).toHaveBeenCalledWith('post-1', [])
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/discussion/post-1')
  })

  it('redirects to post page and shows toast when setPostImages fails in edit mode', async () => {
    mockUpdatePost.mockResolvedValue({ post: { ...postWithImages } })
    mockSetPostImages.mockRejectedValue(new Error('Network error'))
    render(
      <PostForm
        postType='discussion'
        post={postWithImages}
      />,
    )
    fireEvent.click(screen.getByLabelText('Remove image'))
    fireEvent.click(screen.getByText('Save Changes'))
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Post saved, but images could not be updated. Please try again.',
      )
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/discussion/post-1')
  })

  it('shows character count when caption approaches 1000 chars', () => {
    render(
      <PostForm
        postType='discussion'
        post={postWithImages}
      />,
    )
    const captionInput = screen.getByPlaceholderText('Caption (optional)') as HTMLInputElement
    const longCaption = 'a'.repeat(950)
    fireEvent.change(captionInput, { target: { value: longCaption } })
    expect(screen.getByText('950/1000')).toBeDefined()
  })

  it('does not show character count when caption is under 900 chars', () => {
    render(
      <PostForm
        postType='discussion'
        post={postWithImages}
      />,
    )
    const captionInput = screen.getByPlaceholderText('Caption (optional)') as HTMLInputElement
    fireEvent.change(captionInput, { target: { value: 'Short caption' } })
    expect(screen.queryByText(/\/1000/)).toBeNull()
  })

  it('uploads image file and adds it to the list', async () => {
    mockUploadImageFile.mockResolvedValue('new-img-id')
    render(<PostForm postType='discussion' />)

    const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(
      () => {
        expect(screen.getByPlaceholderText('Caption (optional)')).toBeDefined()
      },
      { timeout: IMAGE_UPLOAD_WAIT_TIMEOUT },
    )
    expect(mockUploadImageFile).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ onPhase: expect.any(Function) }),
    )
  }, 10_000)
})
