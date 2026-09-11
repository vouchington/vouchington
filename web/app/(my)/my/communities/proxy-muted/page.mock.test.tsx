import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireCurrentUser } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: mockRequireCurrentUser,
}))
vi.mock(import('@/components/my/bookmark-page-header'), () => ({
  BookmarkPageHeader: ({ routeKey }: { routeKey: string }) => (
    <h1 data-testid='bookmark-page-header'>{routeKey}</h1>
  ),
}))
vi.mock(
  import('@/components/users/user-relation-route-pages'),
  () =>
    ({
      UserCommunityRelationRoute: () => <div />,
    }) as unknown as typeof import('@/components/users/user-relation-route-pages'),
)

import MyCommunitiesProxyMutedPage from './page'

const baseUser = { id: 'user-1', username: 'alice' }

describe('MyCommunitiesProxyMutedPage', () => {
  beforeEach(() => {
    mockRequireCurrentUser.mockReset()
  })

  it('redirects to /login when not authenticated', async () => {
    mockRequireCurrentUser.mockRejectedValue(new Error('redirect:/login'))
    await expect(MyCommunitiesProxyMutedPage()).rejects.toThrow('redirect:/login')
    expect(mockRequireCurrentUser).toHaveBeenCalled()
  })

  it('renders data-pw wrapper when authenticated', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    const { container } = render(await MyCommunitiesProxyMutedPage())
    expect(container.querySelector('[data-pw="my-communities-proxy-muted-page"]')).toBeTruthy()
  })
})
