import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  basePost,
  postDetailMockState,
  resetPostDetailRenderingMocks,
} from '@/test-helpers/components/posts/post-detail-rendering.mock-support'

vi.mock(import('../post-detail-overflow-menu'), () => ({
  PostDetailOverflowMenu: () => <div data-testid='post-detail-overflow-trigger' />,
}))

import { render, screen } from '@testing-library/react'

import { PostDetailView as PostDetail } from '../post-detail-view'

import type { User } from '@/types/user'

describe('PostDetail rendering', () => {
  beforeEach(() => {
    resetPostDetailRenderingMocks()
  })

  it('renders overflow menu for authenticated non-owner', async () => {
    postDetailMockState.currentUser = { id: 'user-123' } as User
    render(
      <PostDetail
        post={basePost}
        html=''
        currentUserId='user-123'
      />,
    )

    expect(await screen.findByTestId('post-detail-overflow-trigger')).toBeDefined()
  })

  it('omits overflow menu when not logged in', () => {
    render(
      <PostDetail
        post={basePost}
        html=''
      />,
    )

    expect(screen.queryByTestId('post-detail-overflow-trigger')).toBeNull()
  })

  it('does not render Subscribe button when not logged in', () => {
    render(
      <PostDetail
        post={basePost}
        html=''
      />,
    )

    expect(screen.queryByRole('button', { name: /subscribe/i })).toBeNull()
  })

  it('renders markdown content', () => {
    render(
      <PostDetail
        post={basePost}
        html='<p>Test content here</p>'
      />,
    )

    expect(screen.getByText('Test content here')).toBeDefined()
  })
})
