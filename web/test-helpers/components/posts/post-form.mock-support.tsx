/* oxlint-disable no-mistakes/playwright-consistent-attribute -- moved test support preserves existing Testing Library selectors */
import type { Ref } from 'react'
import { vi } from 'vitest'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Post } from '@/types/posts'

export const mockRouterPush = vi.fn<VitestLooseMock>()
export const mockRouterBack = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        push: mockRouterPush,
        back: mockRouterBack,
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

vi.mock(import('@/lib/api/client/markdown'), () => ({
  previewMarkdown: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/images'), () => ({
  uploadImageFile: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/financial-profile'), () => ({
  updateMyFinancialProfile: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/entity-relations'), () => ({
  createEntityRelation: vi.fn<VitestLooseMock>(),
}))

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
  TopicAutocomplete: ({
    onChange,
    inputRef,
  }: {
    onChange: (id: string, name: string) => void
    inputRef?: Ref<HTMLInputElement>
  }) => (
    <div>
      <Input
        type='text'
        ref={inputRef}
        aria-label='Search topics'
        data-testid='topic-search-input'
        readOnly
      />
      <Button
        type='button'
        variant='ghost'
        data-testid='topic-autocomplete'
        onClick={() => onChange('topic-1', 'Test Topic')}
      >
        Topic Autocomplete
      </Button>
    </div>
  ),
}))

import { createEntityRelation } from '@/lib/api/client/entity-relations'
import { updateMyFinancialProfile } from '@/lib/api/client/financial-profile'
import { previewMarkdown } from '@/lib/api/client/markdown'
import { createPost, updatePost } from '@/lib/api/client/posts'

export const mockCreatePost = vi.mocked(createPost)
export const mockUpdatePost = vi.mocked(updatePost)
export const mockPreviewMarkdown = vi.mocked(previewMarkdown)
export const mockUpdateMyFinancialProfile = vi.mocked(updateMyFinancialProfile)
export const mockCreateEntityRelation = vi.mocked(createEntityRelation)

// Valid review content: >= 150 chars, >= 30 words, >= 3 sentences.
export const VALID_REVIEW_CONTENT =
  'This credit card offers fantastic rewards and I have been using it for over a year now. ' +
  'The annual fee is absolutely worth every penny when you factor in all the benefits available. ' +
  'The customer service team is very helpful and responsive, making it my top recommendation.'

export const mockDiscussion: Post = {
  id: 'post-1',
  post_type: 'discussion',
  title: 'Existing Title',
  markdown: 'Existing content',
  root_post_id: null,
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
