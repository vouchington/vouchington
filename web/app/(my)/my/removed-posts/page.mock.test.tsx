import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireCurrentUser, mockGetMyRemovedPosts } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetMyRemovedPosts: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: mockRequireCurrentUser,
}))
vi.mock(import('@/lib/api/server'), () => ({ getMyRemovedPosts: mockGetMyRemovedPosts }))
vi.mock(import('@/components/my/settings-page-header'), () => ({
  SettingsPageHeader: ({ title, description }: { title: string; description?: string }) => (
    <>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </>
  ),
}))
vi.mock(import('./my-removed-posts-client'), () => ({
  MyRemovedPostsClient: () => <div data-pw='my-removed-posts-client' />,
}))

import MyRemovedPostsPage from './page'

const emptyResponse = {
  removed_posts: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

describe('MyRemovedPostsPage', () => {
  beforeEach(() => {
    mockRequireCurrentUser.mockReset()
    mockGetMyRemovedPosts.mockReset()
  })

  it('redirects to /login before loading removed posts when not authenticated', async () => {
    mockRequireCurrentUser.mockRejectedValue(new Error('redirect:/login'))

    await expect(MyRemovedPostsPage()).rejects.toThrow('redirect:/login')
    expect(mockRequireCurrentUser).toHaveBeenCalled()
    expect(mockGetMyRemovedPosts).not.toHaveBeenCalled()
  })

  it('renders the page heading', async () => {
    mockRequireCurrentUser.mockResolvedValue({ id: 'user-1', username: 'alice' })
    mockGetMyRemovedPosts.mockResolvedValueOnce(emptyResponse)
    render(await MyRemovedPostsPage())
    expect(mockRequireCurrentUser).toHaveBeenCalled()
    expect(screen.getByText('My Removed Posts')).toBeVisible()
    expect(
      screen.getByText(
        'Posts removed by community or platform moderators. You may file an appeal for each.',
      ),
    ).toBeVisible()
  })

  it('renders the removed posts client component', async () => {
    mockRequireCurrentUser.mockResolvedValue({ id: 'user-1', username: 'alice' })
    mockGetMyRemovedPosts.mockResolvedValueOnce(emptyResponse)
    const { container } = render(await MyRemovedPostsPage())
    expect(container.querySelector('[data-pw="my-removed-posts-client"]')).not.toBeNull()
  })
})
