import { describe, it, expect, vi, beforeEach } from 'vitest'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { PostForm } from '../post-form'

import type { Post } from '@/types/posts'

const mockRouterPush = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        push: mockRouterPush,
        back: vi.fn<VitestLooseMock>(),
      }),
    }) as unknown as typeof import('next/navigation'),
)

// PostSlugField (admin-only) reads useAuth; provide a non-admin user so it renders nothing.
vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: { id: 'u1', roles: [] },
        isAuthenticated: true,
        logout: vi.fn<VitestLooseMock>(),
        setUser: vi.fn<VitestLooseMock>(),
      }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(import('@/lib/api/client/posts'), () => ({
  archivePost: vi.fn<VitestLooseMock>(),
  createPost: vi.fn<VitestLooseMock>(),
  updatePost: vi.fn<VitestLooseMock>(),
  unarchivePost: vi.fn<VitestLooseMock>(),
  addPostRating: vi.fn<VitestLooseMock>(),
  updatePostRating: vi.fn<VitestLooseMock>(),
  deletePostRating: vi.fn<VitestLooseMock>(),
  setPostImages: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/images'), () => {
  class ImageBlockedError extends Error {}
  class ImageProcessingTimeoutError extends Error {}
  return {
    uploadImageFile: vi.fn<VitestLooseMock>(),
    ImageBlockedError,
    ImageProcessingTimeoutError,
  } as unknown as typeof import('@/lib/api/client/images')
})

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn<VitestLooseMock>(),
  mockToastSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: mockToastError, success: mockToastSuccess },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('../topic-autocomplete'), () => ({
  TopicAutocomplete: ({ onChange }: { onChange: (id: string, name: string) => void }) => (
    <button
      type='button'
      data-testid='topic-autocomplete'
      onClick={() => onChange('topic-1', 'Test Topic')}
    >
      Topic Autocomplete
    </button>
  ),
}))

import { createPost, updatePost, setPostImages } from '@/lib/api/client/posts'

import { uploadImageFile } from '@/lib/api/client/images'

const mockCreatePost = vi.mocked(createPost)

const mockUpdatePost = vi.mocked(updatePost)

const mockSetPostImages = vi.mocked(setPostImages)

const mockUploadImageFile = vi.mocked(uploadImageFile)

const IMAGE_UPLOAD_WAIT_TIMEOUT = 2000

const mockDiscussion: Post = {
  id: 'post-1',
  post_type: 'discussion',
  title: 'Existing Title',
  markdown: 'Existing content',
  root_id: null,
  created_by_id: 'user-1',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: 'everyone',
  privacy: 'public',
  is_anonymous: false,

  community_id: null,

  clearance_status: 'approved',
}

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
