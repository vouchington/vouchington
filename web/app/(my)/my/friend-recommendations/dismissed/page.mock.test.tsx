import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireCurrentUser } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: mockRequireCurrentUser,
}))
vi.mock(
  import('@/components/users/user-relation-route-pages'),
  () =>
    ({
      UserUserRelationRoute: () => <div />,
    }) as unknown as typeof import('@/components/users/user-relation-route-pages'),
)

import FindFriendsDismissedPage from './page'

const baseUser = { id: 'user-1', username: 'alice' }

describe('FindFriendsDismissedPage', () => {
  beforeEach(() => {
    mockRequireCurrentUser.mockReset()
  })

  it('redirects to /login when not authenticated', async () => {
    mockRequireCurrentUser.mockRejectedValue(new Error('redirect:/login'))
    await expect(FindFriendsDismissedPage()).rejects.toThrow('redirect:/login')
    expect(mockRequireCurrentUser).toHaveBeenCalled()
  })

  it('renders data-pw wrapper when authenticated', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    const { container } = render(await FindFriendsDismissedPage())
    expect(container.querySelector('[data-pw="find-friends-dismissed-page"]')).toBeTruthy()
  })
})
