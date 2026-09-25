import { describe, it, expect, vi, beforeEach } from 'vitest'

import React from 'react'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { PostForm } from '../../post-form'

import {
  expectInputEnterSubmits,
  expectTextareaCmdEnterSubmits,
} from '@/test-helpers/form-keyboard'

import type { Post } from '@/types/posts'

const mockRouterPush = vi.fn<VitestLooseMock>()

const mockRouterBack = vi.fn<VitestLooseMock>()

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

vi.mock(import('../../topic-autocomplete'), () => ({
  TopicAutocomplete: ({
    onChange,
    inputRef,
  }: {
    onChange: (id: string, name: string) => void
    inputRef?: React.Ref<HTMLInputElement>
  }) => (
    <div>
      <input
        type='text'
        ref={inputRef}
        aria-label='Search topics'
        data-testid='topic-search-input'
        readOnly
      />
      <button
        type='button'
        data-testid='topic-autocomplete'
        onClick={() => onChange('topic-1', 'Test Topic')}
      >
        Topic Autocomplete
      </button>
    </div>
  ),
}))

import { createPost, updatePost } from '@/lib/api/client/posts'

import { previewMarkdown } from '@/lib/api/client/markdown'

import { updateMyFinancialProfile } from '@/lib/api/client/financial-profile'

const mockCreatePost = vi.mocked(createPost)

const mockUpdatePost = vi.mocked(updatePost)

const mockPreviewMarkdown = vi.mocked(previewMarkdown)

const mockUpdateMyFinancialProfile = vi.mocked(updateMyFinancialProfile)

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

describe('PostForm', () => {
  beforeEach(() => {
    mockRouterPush.mockClear()
    mockRouterBack.mockClear()
    mockCreatePost.mockClear()
    mockUpdatePost.mockClear()
    mockToastError.mockClear()
    mockPreviewMarkdown.mockClear()
    mockUpdateMyFinancialProfile.mockClear()
  })

  it('discussion submit includes selected topics in the createPost categories', async () => {
    mockCreatePost.mockResolvedValue({ post: { ...mockDiscussion, id: 'new-post' } })

    render(
      <PostForm
        postType='discussion'
        initialDiscussionCategories={[
          { id: 'cat-1', name: 'Category One' },
          { id: 'cat-2', name: 'Category Two' },
        ]}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'Some content here' },
    })
    fireEvent.click(screen.getByText('Post'))

    await waitFor(() => {
      expect(mockCreatePost).toHaveBeenCalledWith(
        expect.objectContaining({
          categories: [
            { type: 'topic', topic_id: 'cat-1' },
            { type: 'topic', topic_id: 'cat-2' },
          ],
        }),
      )
    })
  })

  it('Enter on the title input submits the discussion form via the API client', async () => {
    mockCreatePost.mockResolvedValue({ post: { ...mockDiscussion, id: 'new-1' } })
    render(<PostForm postType='discussion' />)
    fireEvent.change(screen.getByPlaceholderText('Give your post a title...'), {
      target: { value: 'Keyboard Title' },
    })
    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'Keyboard content' },
    })

    const titleInput = screen.getByPlaceholderText('Give your post a title...') as HTMLInputElement
    await expectInputEnterSubmits({
      input: titleInput,
      onSubmit: mockCreatePost,
      awaitSubmit: true,
    })
  })

  it('Cmd+Enter and Ctrl+Enter on the body textarea submit the form; plain Enter does not', () => {
    mockCreatePost.mockResolvedValue({ post: { ...mockDiscussion, id: 'new-1' } })
    render(<PostForm postType='discussion' />)

    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'Keyboard textarea content' },
    })

    const textarea = screen.getByPlaceholderText('Write your post...') as HTMLTextAreaElement
    // Listen for the native submit event the design-system Textarea triggers via
    // form.requestSubmit(); the form's React onSubmit guards re-entry via isSaving so we
    // can't reuse the API client mock as the spy across all three keydowns.
    const onSubmit = vi.fn<VitestLooseMock>()
    textarea.form!.addEventListener('submit', onSubmit)
    expectTextareaCmdEnterSubmits({ textarea, onSubmit })
  })
})
