import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import UserFollowersRoute from './page'

const { mockGetCurrentUser, mockGetUserUsersCollection, mockUserList } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetUserUsersCollection: vi.fn<VitestLooseMock>(),
  mockUserList: vi.fn<VitestLooseMock>(({ currentUserId }: { currentUserId?: string }) => (
    <div data-testid='user-list'>{currentUserId ?? 'anonymous'}</div>
  )),
}))

vi.mock(
  import('next/navigation'),
  () => ({ notFound: vi.fn<VitestLooseMock>() }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/server'), () => ({ getUserUsersCollection: mockGetUserUsersCollection }))
vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({ robots: { index: false } })),
}))
vi.mock(
  import('@/components/users/user-list'),
  () =>
    ({
      UserList: mockUserList,
    }) as unknown as typeof import('@/components/users/user-list'),
)

describe('UserFollowersRoute', () => {
  it('renders the followers page, threading the current viewer from the parallel fetch', async () => {
    mockGetUserUsersCollection.mockResolvedValue({
      results: [],
      page_info: { end_cursor: null, has_next_page: false },
    })
    mockGetCurrentUser.mockResolvedValue({ id: 'current-user-1' })

    const result = await UserFollowersRoute({
      params: Promise.resolve({ idOrUsername: 'alice' }),
    })

    render(result)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Followers')
    expect(screen.getByTestId('user-list')).toHaveTextContent('current-user-1')
  })
})
