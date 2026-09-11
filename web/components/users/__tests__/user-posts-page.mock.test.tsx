import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockPostList } = vi.hoisted(() => ({
  mockPostList: vi.fn<VitestLooseMock>(() => <div data-testid='post-list' />),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getPosts: vi.fn<VitestLooseMock>(() =>
    Promise.resolve({ results: [], bookmarks: {}, elections: {}, election_votes: {} }),
  ),
}))
vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>(() => Promise.resolve(null)),
}))
vi.mock(import('@/lib/permissions/can-see-downvotes'), () => ({
  canCurrentUserSeeDownvotes: vi.fn<VitestLooseMock>(() => false),
}))
vi.mock(import('@/components/posts/post-list'), () => ({
  PostList: mockPostList,
}))

import { UserPostsPage } from '../user-posts-page'

describe('UserPostsPage', () => {
  it('renders PostList with all post types when postTypes is undefined (All posts)', async () => {
    const result = await UserPostsPage({ idOrUsername: 'alice' })
    render(result as React.ReactElement)
    expect(screen.getByTestId('post-list')).toBeDefined()
    expect(mockPostList).toHaveBeenCalledWith(
      expect.objectContaining({
        nextPageParams: expect.objectContaining({ post_types: 'review,discussion,comment' }),
      }),
      undefined,
    )
  })

  it('renders PostList scoped to a specific postType', async () => {
    const result = await UserPostsPage({ idOrUsername: 'alice', postTypes: 'review' })
    render(result as React.ReactElement)
    expect(screen.getByTestId('post-list')).toBeDefined()
    expect(mockPostList).toHaveBeenCalledWith(
      expect.objectContaining({
        nextPageParams: expect.objectContaining({ post_types: 'review' }),
      }),
      undefined,
    )
  })
})
