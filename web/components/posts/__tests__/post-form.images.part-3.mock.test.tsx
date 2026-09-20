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
