import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireCurrentUser, mockGetUserTopicsCollection } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetUserTopicsCollection: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: mockRequireCurrentUser,
}))

vi.mock(import('@/lib/api/server'), () => ({
  getUserTopicsCollection: mockGetUserTopicsCollection,
}))

vi.mock(import('@/components/my/bookmark-page-header'), () => ({
  BookmarkPageHeader: ({ routeKey }: { routeKey: string }) => (
    <h1 data-testid='bookmark-page-header'>{routeKey}</h1>
  ),
}))

vi.mock(import('@/components/users/user-topic-list'), () => ({
  UserTopicList: () => <div data-pw='user-topic-list' />,
}))

import MyTopicsFollowingPage from './page'

const baseUser = { id: 'user-1', username: 'alice' }

describe('MyTopicsFollowingPage', () => {
  beforeEach(() => {
    mockRequireCurrentUser.mockReset()
    mockGetUserTopicsCollection.mockReset()
    mockGetUserTopicsCollection.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
  })

  it('redirects to /login when not authenticated', async () => {
    mockRequireCurrentUser.mockRejectedValue(new Error('redirect:/login'))
    await expect(MyTopicsFollowingPage()).rejects.toThrow('redirect:/login')
    expect(mockRequireCurrentUser).toHaveBeenCalled()
  })

  it('renders the page heading when authenticated', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    render(await MyTopicsFollowingPage())
    expect(screen.getByTestId('bookmark-page-header')).toBeDefined()
  })

  it('calls getUserTopicsCollection with the current user id and following listType', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    await MyTopicsFollowingPage()
    expect(mockGetUserTopicsCollection).toHaveBeenCalledWith(baseUser.id, 'following')
  })

  it('renders the data-pw wrapper when authenticated', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    const { container } = render(await MyTopicsFollowingPage())
    expect(container.querySelector('[data-pw="my-topics-following-page"]')).toBeTruthy()
  })
})
