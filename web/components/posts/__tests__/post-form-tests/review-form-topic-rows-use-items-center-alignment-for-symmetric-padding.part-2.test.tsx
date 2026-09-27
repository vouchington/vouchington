import {
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

import {
  expectInputEnterSubmits,
  expectTextareaCmdEnterSubmits,
} from '@/test-helpers/form-keyboard'

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
