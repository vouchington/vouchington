import {
  VALID_REVIEW_CONTENT,
  mockCreateEntityRelation,
  mockCreatePost,
  mockDiscussion,
  mockPreviewMarkdown,
  mockRouterBack,
  mockRouterPush,
  mockToastError,
  mockUpdateMyFinancialProfile,
  mockUpdatePost,
} from '@/test-helpers/components/posts/post-form.mock-support'

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PostForm } from '../../post-form'
import type { Post } from '@/types/posts'

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
