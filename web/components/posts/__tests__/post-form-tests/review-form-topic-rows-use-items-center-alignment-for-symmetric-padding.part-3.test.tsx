import {
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

import { describe, it, expect, beforeEach } from 'vitest'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { PostForm } from '../../post-form'

describe('PostForm', () => {
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

  it('discussion submit skips empty category rows', async () => {
    mockCreatePost.mockResolvedValue({ post: { ...mockDiscussion, id: 'new-post' } })
    mockCreateEntityRelation.mockResolvedValue({
      created_at: '2024-01-01T00:00:00Z',
      created_by_id: 'user-1',
      object_data: {},
    })

    render(<PostForm postType='discussion' />)

    fireEvent.change(screen.getByPlaceholderText('Write your post...'), {
      target: { value: 'Some content here' },
    })
    fireEvent.click(screen.getByText('Post'))

    await waitFor(() => {
      expect(mockCreatePost).toHaveBeenCalled()
    })
    expect(mockCreateEntityRelation).not.toHaveBeenCalled()
  })
})
