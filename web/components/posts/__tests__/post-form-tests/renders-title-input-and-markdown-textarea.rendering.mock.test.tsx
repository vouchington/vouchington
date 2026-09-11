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

describe('PostForm rendering', () => {
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

  it('renders title input and markdown textarea', () => {
    render(<PostForm postType='discussion' />)
    expect(screen.getByPlaceholderText('Give your post a title...')).toBeDefined()
    expect(screen.getByPlaceholderText('Write your post...')).toBeDefined()
  })

  it('renders hidden honeypot inputs with correct attributes', () => {
    render(<PostForm postType='discussion' />)
    const hpWebsite = document.querySelector('input[name="hp_website"]') as HTMLInputElement
    const hpPhone = document.querySelector('input[name="hp_phone"]') as HTMLInputElement
    expect(hpWebsite).not.toBeNull()
    expect(hpPhone).not.toBeNull()
    expect(hpWebsite.tabIndex).toBe(-1)
    expect(hpPhone.tabIndex).toBe(-1)
    expect(hpWebsite.autocomplete).toBe('off')
    expect(hpPhone.autocomplete).toBe('off')
    const wrapper = hpWebsite.closest('[aria-hidden="true"]')
    expect(wrapper).not.toBeNull()
  })

  it('renders anonymous toggle inside Advanced section', () => {
    render(<PostForm postType='discussion' />)
    fireEvent.click(screen.getByText('Advanced'))
    expect(screen.getByLabelText('Post anonymously')).toBeDefined()
    expect(screen.getByText('Only you and admins will see the author.')).toBeDefined()
  })

  it('toggles anonymous state when the description text is clicked', () => {
    render(<PostForm postType='discussion' />)
    fireEvent.click(screen.getByText('Advanced'))
    const checkbox = screen.getByRole('checkbox', { name: 'Post anonymously' })
    expect(checkbox.getAttribute('data-state')).toBe('unchecked')
    fireEvent.click(screen.getByText('Only you and admins will see the author.'))
    expect(checkbox.getAttribute('data-state')).toBe('checked')
    fireEvent.click(screen.getByText('Only you and admins will see the author.'))
    expect(checkbox.getAttribute('data-state')).toBe('unchecked')
  })

  it('does not show visibility selector for everyone posts', () => {
    render(<PostForm postType='discussion' />)
    fireEvent.click(screen.getByText('Advanced'))
    expect(screen.queryByText('Visibility')).toBeNull()
  })

  it('shows visibility selector for non-everyone audiences in edit mode', () => {
    render(
      <PostForm
        postType='discussion'
        post={{ ...mockDiscussion, broadcast: 'users', privacy: 'private' }}
      />,
    )
    fireEvent.click(screen.getByText('Advanced'))
    expect(screen.getByText('Visibility')).toBeDefined()
  })

  it('shows rating selector for review type in create mode', () => {
    render(<PostForm postType='review' />)
    expect(screen.getByRole('radiogroup', { name: /Rating for topic 1/i })).toBeDefined()
    expect(screen.getByRole('radio', { name: '1 star' })).toBeDefined()
    expect(screen.getByRole('radio', { name: '5 stars' })).toBeDefined()
    expect(screen.getByTestId('topic-autocomplete')).toBeDefined()
  })

  it('shows rating selector and topic autocomplete for review in edit mode', () => {
    const reviewPost: Post = {
      ...mockDiscussion,
      post_type: 'review',
      review_topic_ratings: [
        { topic_id: 'topic-1', rating: 4, order_index: 0, updated_at: '2024-01-15T10:00:00Z' },
      ],
    }
    render(
      <PostForm
        postType='review'
        post={reviewPost}
      />,
    )
    expect(screen.getByRole('radiogroup', { name: /Rating for topic-1/i })).toBeDefined()
    expect(screen.getByRole('radio', { name: '1 star' })).toBeDefined()
    expect(screen.getByTestId('topic-autocomplete')).toBeDefined()
  })

  it('does not show rating or topic autocomplete for discussion', () => {
    render(<PostForm postType='discussion' />)
    expect(screen.queryByRole('radiogroup', { name: /Rating/i })).toBeNull()
    expect(screen.queryByTestId('topic-autocomplete')).toBeNull()
  })

  it('Advanced section appears after the Content textarea', () => {
    const { container } = render(<PostForm postType='discussion' />)

    // Get positions in the DOM
    const contentTextarea = container.querySelector('textarea#markdown')
    const advancedButton = screen.getByText('Advanced')

    expect(contentTextarea).not.toBeNull()
    expect(advancedButton).toBeDefined()

    // Advanced trigger should come after content textarea in DOM order
    const position = contentTextarea!.compareDocumentPosition(advancedButton)
    // DOCUMENT_POSITION_FOLLOWING = 4 means advancedButton comes after contentTextarea
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows Write and Preview tabs in the content area', () => {
    render(<PostForm postType='discussion' />)
    expect(screen.getByRole('tab', { name: 'Write' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Preview' })).toBeInTheDocument()
  })

  it('pre-fills fields in edit mode', () => {
    render(
      <PostForm
        postType='discussion'
        post={mockDiscussion}
      />,
    )
    const titleInput = screen.getByPlaceholderText('Give your post a title...') as HTMLInputElement
    const textarea = screen.getByPlaceholderText('Write your post...') as HTMLTextAreaElement
    expect(titleInput.value).toBe('Existing Title')
    expect(textarea.value).toBe('Existing content')
  })

  it('focuses new topic search input after Add Topic is clicked', async () => {
    render(<PostForm postType='review' />)
    const initialInputs = screen.getAllByTestId('topic-search-input')
    expect(initialInputs).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: /Add Topic/i }))

    await waitFor(() => {
      expect(screen.getAllByTestId('topic-search-input')).toHaveLength(2)
    })
    // The second (newly added) input should be focused
    const inputs = screen.getAllByTestId('topic-search-input')
    expect(document.activeElement).toBe(inputs[1])
  })
})
