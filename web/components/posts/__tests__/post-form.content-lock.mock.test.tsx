import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PostForm } from '../post-form'
import type { Post } from '@/types/posts'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        push: vi.fn<VitestLooseMock>(),
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

vi.mock(import('@/lib/api/client/images'), () => ({
  uploadImageFile: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: vi.fn<VitestLooseMock>(), success: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('../topic-autocomplete'), () => ({
  TopicAutocomplete: ({
    disabled,
    onChange,
  }: {
    disabled?: boolean
    onChange: (id: string, name: string) => void
  }) => (
    <button
      type='button'
      data-testid='topic-autocomplete'
      onClick={() => onChange('topic-1', 'Test Topic')}
      disabled={disabled}
    >
      Topic Autocomplete
    </button>
  ),
}))

import {
  updatePost,
  addPostRating,
  updatePostRating,
  deletePostRating,
} from '@/lib/api/client/posts'

const mockUpdatePost = vi.mocked(updatePost)
const mockAddPostRating = vi.mocked(addPostRating)
const mockUpdatePostRating = vi.mocked(updatePostRating)
const mockDeletePostRating = vi.mocked(deletePostRating)

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

// Must meet REVIEW_MIN_CHARACTERS (150), REVIEW_MIN_WORDS (30), REVIEW_MIN_SENTENCES (3).
const VALID_REVIEW_MARKDOWN =
  'This credit card offers fantastic rewards and I have been using it for over a year now. ' +
  'The annual fee is absolutely worth every penny when you factor in all the benefits available. ' +
  'The customer service team is very helpful and responsive, making it my top recommendation.'

const mockReview: Post = {
  id: 'review-1',
  post_type: 'review',
  title: 'Review Title',
  markdown: VALID_REVIEW_MARKDOWN,
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
  review_topic_ratings: [
    { topic_id: 'topic-1', rating: 3, order_index: 0, updated_at: '2024-01-15T10:00:00Z' },
    { topic_id: 'topic-2', rating: 4, order_index: 1, updated_at: '2024-01-15T10:00:00Z' },
  ],
}

describe('PostForm content lock (can_edit_content)', () => {
  it('disables title and content inputs when can_edit_content is false', () => {
    render(
      <PostForm
        postType='discussion'
        post={{ ...mockDiscussion, can_edit_content: false }}
      />,
    )
    const titleInput = screen.getByPlaceholderText('Give your post a title...') as HTMLInputElement
    const contentTextarea = screen.getByPlaceholderText('Write your post...') as HTMLTextAreaElement
    expect(titleInput.disabled).toBe(true)
    expect(contentTextarea.disabled).toBe(true)
  })

  it('shows info message when content is locked', () => {
    render(
      <PostForm
        postType='discussion'
        post={{ ...mockDiscussion, can_edit_content: false }}
      />,
    )
    expect(screen.getByText('Title and content can no longer be edited after 1 day.')).toBeDefined()
  })

  it('disables discussion category controls and excludes categories from a locked edit', async () => {
    mockUpdatePost.mockResolvedValue({ post: mockDiscussion })
    render(
      <PostForm
        postType='discussion'
        post={{ ...mockDiscussion, can_edit_content: false }}
        initialDiscussionCategories={[{ id: 'topic-1', name: 'Test Topic' }]}
      />,
    )

    expect((screen.getByTestId('topic-autocomplete') as HTMLButtonElement).disabled).toBe(true)
    expect(
      (screen.getByRole('textbox', { name: 'Or add a hashtag' }) as HTMLInputElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Add Category' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Remove category' }) as HTMLButtonElement).disabled,
    ).toBe(true)

    fireEvent.click(screen.getByText('Save Changes'))

    await waitFor(() => {
      expect(mockUpdatePost).toHaveBeenCalledWith(
        'post-1',
        expect.not.objectContaining({ categories: expect.anything() }),
      )
    })
  })

  it('enables title and content inputs when can_edit_content is true', () => {
    render(
      <PostForm
        postType='discussion'
        post={{ ...mockDiscussion, can_edit_content: true }}
      />,
    )
    const titleInput = screen.getByPlaceholderText('Give your post a title...') as HTMLInputElement
    const contentTextarea = screen.getByPlaceholderText('Write your post...') as HTMLTextAreaElement
    expect(titleInput.disabled).toBe(false)
    expect(contentTextarea.disabled).toBe(false)
  })

  it('enables title and content inputs when can_edit_content is undefined (new post)', () => {
    render(<PostForm postType='discussion' />)
    const titleInput = screen.getByPlaceholderText('Give your post a title...') as HTMLInputElement
    const contentTextarea = screen.getByPlaceholderText('Write your post...') as HTMLTextAreaElement
    expect(titleInput.disabled).toBe(false)
    expect(contentTextarea.disabled).toBe(false)
  })

  it('does not show info message when content is not locked', () => {
    render(
      <PostForm
        postType='discussion'
        post={{ ...mockDiscussion, can_edit_content: true }}
      />,
    )
    expect(screen.queryByTestId('content-locked-message')).toBeNull()
  })
})

describe('PostForm review edit flow', () => {
  beforeEach(() => {
    mockUpdatePost.mockClear()
    mockAddPostRating.mockClear()
    mockUpdatePostRating.mockClear()
    mockDeletePostRating.mockClear()
  })

  it('calls updatePostRating for changed rating and skips unchanged', async () => {
    mockUpdatePost.mockResolvedValue({ post: { ...mockReview } })
    mockUpdatePostRating.mockResolvedValue(undefined)

    render(
      <PostForm
        postType='review'
        post={mockReview}
      />,
    )

    // Change the rating of the first star widget (topic-1 rated 3→5)
    // With 2 topics, there are 10 radio buttons total; index 4 = 5th star of first topic
    const starButtons = screen.getAllByRole('radio', { name: /star/i })
    fireEvent.click(starButtons[4]!) // 5th star of first rating widget

    fireEvent.click(screen.getByText('Save Changes'))
    await waitFor(() => {
      // Only rating changed (order_index 0 unchanged), so only rating is sent
      expect(mockUpdatePostRating).toHaveBeenCalledWith('review-1', 'topic-1', {
        rating: 5,
      })
    })
    // topic-2 rating unchanged, should not be updated
    expect(mockUpdatePostRating).toHaveBeenCalledTimes(1)
    expect(mockAddPostRating).not.toHaveBeenCalled()
    expect(mockDeletePostRating).not.toHaveBeenCalled()
  })

  it('calls deletePostRating for removed topics', async () => {
    mockUpdatePost.mockResolvedValue({ post: { ...mockReview } })
    mockDeletePostRating.mockResolvedValue(undefined)

    render(
      <PostForm
        postType='review'
        post={mockReview}
      />,
    )

    // Remove the second topic (topic-2) by clicking its Remove button
    const removeButtons = screen.getAllByLabelText('Remove topic')
    fireEvent.click(removeButtons[1]!) // remove second topic

    fireEvent.click(screen.getByText('Save Changes'))
    await waitFor(() => {
      expect(mockDeletePostRating).toHaveBeenCalledWith('review-1', 'topic-2')
    })
    expect(mockDeletePostRating).toHaveBeenCalledTimes(1)
    expect(mockAddPostRating).not.toHaveBeenCalled()
  })
})
