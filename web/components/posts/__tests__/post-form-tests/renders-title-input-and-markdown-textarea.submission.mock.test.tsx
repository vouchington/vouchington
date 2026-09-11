import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PostForm } from '../../post-form'
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

vi.mock(import('@/lib/api/client/entity-relations'), () => ({
  createEntityRelation: vi.fn<VitestLooseMock>(),
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
import { createEntityRelation } from '@/lib/api/client/entity-relations'

const mockCreatePost = vi.mocked(createPost)
const mockUpdatePost = vi.mocked(updatePost)
const mockPreviewMarkdown = vi.mocked(previewMarkdown)
const mockUpdateMyFinancialProfile = vi.mocked(updateMyFinancialProfile)
const mockCreateEntityRelation = vi.mocked(createEntityRelation)

// Valid review content: >= 150 chars, >= 30 words, >= 3 sentences.
const VALID_REVIEW_CONTENT =
  'This credit card offers fantastic rewards and I have been using it for over a year now. ' +
  'The annual fee is absolutely worth every penny when you factor in all the benefits available. ' +
  'The customer service team is very helpful and responsive, making it my top recommendation.'

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

describe('PostForm submission', () => {
  beforeEach(() => {
    mockRouterPush.mockClear()
    mockRouterBack.mockClear()
    mockCreatePost.mockClear()
    mockUpdatePost.mockClear()
    mockToastError.mockClear()
    mockPreviewMarkdown.mockClear()
    mockUpdateMyFinancialProfile.mockClear()
    mockCreateEntityRelation.mockClear()
  })

  it('shows error when markdown is empty on submit', async () => {
    render(<PostForm postType='discussion' />)
    fireEvent.click(screen.getByText('Post'))
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Content is required.')
    })
    expect(mockCreatePost).not.toHaveBeenCalled()
  })

  it('shows error when review missing rating', async () => {
    render(<PostForm postType='review' />)
    const textarea = screen.getByPlaceholderText('Write your post...')
    fireEvent.change(textarea, { target: { value: VALID_REVIEW_CONTENT } })
    // Select topic first
    fireEvent.click(screen.getByTestId('topic-autocomplete'))
    fireEvent.click(screen.getByText('Post'))
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'A star rating is required for each review topic.',
      )
    })
  })

  it('shows error when review missing topic in create mode', async () => {
    render(<PostForm postType='review' />)
    const textarea = screen.getByPlaceholderText('Write your post...')
    fireEvent.change(textarea, { target: { value: VALID_REVIEW_CONTENT } })
    // Click rating star
    fireEvent.click(screen.getByRole('radio', { name: '3 stars' }))
    fireEvent.click(screen.getByText('Post'))
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('A topic is required for each review entry.')
    })
  })

  it('calls createPost with correct data for discussion', async () => {
    mockCreatePost.mockResolvedValue({ post: { ...mockDiscussion, id: 'new-1' } })
    render(<PostForm postType='discussion' />)
    fireEvent.change(screen.getByPlaceholderText('Give your post a title...'), {
      target: { value: 'My Title' },
    })
    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'My content' },
    })
    fireEvent.click(screen.getByText('Post'))
    await waitFor(() => {
      expect(mockCreatePost).toHaveBeenCalledWith({
        post_type: 'discussion',
        title: 'My Title',
        markdown: 'My content',
        broadcast: 'everyone',
        categories: [],
        privacy: 'public',
        is_anonymous: false,
        declared_language: null,
        hp_website: '',
        hp_phone: '',
        cf_turnstile_response: 'test-turnstile-token',
        recaptcha_token: 'test-recaptcha-token',
      })
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/discussion/new-1')
  })

  it('keeps the submit button disabled after success while routing', async () => {
    mockCreatePost.mockResolvedValue({ post: mockDiscussion })
    render(<PostForm postType='discussion' />)

    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'Fresh discussion content' },
    })
    fireEvent.click(screen.getByText('Post'))

    await waitFor(() => {
      expect(mockCreatePost).toHaveBeenCalled()
      expect(mockRouterPush).toHaveBeenCalledWith('/discussion/post-1')
    })

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
  })

  it('calls updatePost in edit mode', async () => {
    mockUpdatePost.mockResolvedValue({ post: { ...mockDiscussion } })
    render(
      <PostForm
        postType='discussion'
        post={mockDiscussion}
        initialDiscussionCategories={[
          { id: 'topic-1', name: 'Travel' },
          { id: '', name: '', hashtag: '#Travel.Deals' },
        ]}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'Updated content' },
    })
    fireEvent.click(screen.getByText('Save Changes'))
    await waitFor(() => {
      expect(mockUpdatePost).toHaveBeenCalledWith('post-1', {
        title: 'Existing Title',
        markdown: 'Updated content',
        broadcast: 'everyone',
        privacy: 'public',
        is_anonymous: false,
      })
    })
  })

  it('calls router.back() on cancel', () => {
    render(<PostForm postType='discussion' />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(mockRouterBack).toHaveBeenCalled()
  })

  it('calls previewMarkdown when switching to Preview tab with content', async () => {
    mockPreviewMarkdown.mockResolvedValue({ html: '<p>preview html</p>' })
    render(<PostForm postType='discussion' />)

    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'Hello **world**' },
    })
    // Radix Tabs triggers onValueChange via onFocus (automatic activation mode).
    fireEvent.focus(screen.getByRole('tab', { name: 'Preview' }))

    // waitFor polls until the 200ms debounce fires and the mock is called
    await waitFor(
      () => {
        expect(mockPreviewMarkdown).toHaveBeenCalledWith('Hello **world**')
      },
      { timeout: 500 },
    )
  })

  it('shows muted placeholder when switching to Preview tab with empty content', async () => {
    render(<PostForm postType='discussion' />)
    // Radix Tabs triggers onValueChange via onFocus (automatic activation mode).
    fireEvent.focus(screen.getByRole('tab', { name: 'Preview' }))

    // Empty markdown skips the API call — placeholder renders once the tab is active
    await waitFor(() => {
      expect(screen.getByText('Nothing to preview yet.')).toBeInTheDocument()
    })
    expect(mockPreviewMarkdown).not.toHaveBeenCalled()
  })
})
