import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireCurrentUser, mockGetUserUsersCollection } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetUserUsersCollection: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: mockRequireCurrentUser,
}))
vi.mock(import('@/lib/api/server'), () => ({
  getUserUsersCollection: mockGetUserUsersCollection,
}))
vi.mock(import('@/components/my/bookmark-page-header'), () => ({
  BookmarkPageHeader: ({ routeKey }: { routeKey: string }) => (
    <h1 data-testid='bookmark-page-header'>{routeKey}</h1>
  ),
}))
vi.mock(
  import('@/components/users/user-list'),
  () =>
    ({
      UserList: () => <div />,
    }) as unknown as typeof import('@/components/users/user-list'),
)

import MyUsersFollowingPage from './page'

const baseUser = { id: 'user-1', username: 'alice' }

describe('MyUsersFollowingPage', () => {
  beforeEach(() => {
    mockRequireCurrentUser.mockReset()
    mockGetUserUsersCollection.mockReset()
    mockGetUserUsersCollection.mockResolvedValue({
      results: [],
      muted: {},
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
  })

  it('redirects to /login when not authenticated', async () => {
    mockRequireCurrentUser.mockRejectedValue(new Error('redirect:/login'))
    await expect(MyUsersFollowingPage()).rejects.toThrow('redirect:/login')
    expect(mockRequireCurrentUser).toHaveBeenCalled()
  })

  it('renders data-pw wrapper when authenticated', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    const { container } = render(await MyUsersFollowingPage())
    expect(container.querySelector('[data-pw="my-users-following-page"]')).toBeTruthy()
  })
})
