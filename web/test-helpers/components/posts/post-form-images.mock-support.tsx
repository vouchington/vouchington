/* oxlint-disable no-mistakes/playwright-consistent-attribute -- moved test support preserves existing Testing Library selectors */
import { vi } from 'vitest'
import { Button } from '@/components/ui/button'
import type { Post } from '@/types/posts'

export const mockRouterPush = vi.fn<VitestLooseMock>()

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

const { mockToastError: toastError, mockToastSuccess: toastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn<VitestLooseMock>(),
  mockToastSuccess: vi.fn<VitestLooseMock>(),
}))

export const mockToastError = toastError

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: toastError, success: toastSuccess },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('../../../components/posts/topic-autocomplete'), () => ({
  TopicAutocomplete: ({ onChange }: { onChange: (id: string, name: string) => void }) => (
    <Button
      type='button'
      variant='ghost'
      data-testid='topic-autocomplete'
      onClick={() => onChange('topic-1', 'Test Topic')}
    >
      Topic Autocomplete
    </Button>
  ),
}))

import { createPost, setPostImages, updatePost } from '@/lib/api/client/posts'
import { uploadImageFile } from '@/lib/api/client/images'

export const mockCreatePost = vi.mocked(createPost)
export const mockUpdatePost = vi.mocked(updatePost)
export const mockSetPostImages = vi.mocked(setPostImages)
export const mockUploadImageFile = vi.mocked(uploadImageFile)
export const IMAGE_UPLOAD_WAIT_TIMEOUT = 2000

export const mockDiscussion: Post = {
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
