import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockHeaders, mockUserRouteLayout } = vi.hoisted(() => ({
  mockHeaders: vi.fn<VitestLooseMock>(),
  mockUserRouteLayout: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('next/headers'), () => ({ headers: mockHeaders }))
vi.mock(
  import('@/components/users/user-route-layout'),
  () =>
    ({
      UserRouteLayout: ({ children, ...props }: { children: React.ReactNode }) => {
        mockUserRouteLayout(props)
        return <div>{children}</div>
      },
    }) as unknown as typeof import('@/components/users/user-route-layout'),
)

import UserDetailLayout from './layout'

describe('UserDetailLayout', () => {
  beforeEach(() => {
    mockHeaders.mockResolvedValue(new Headers({ 'x-pathname': '/user/alice' }))
    mockUserRouteLayout.mockReset()
  })

  it('allows the deleted-account admin route to render without an active profile', async () => {
    const userId = '018f47a0-25cb-7a45-8b54-304f77ce64c0'
    mockHeaders.mockResolvedValue(new Headers({ 'x-pathname': `/user/${userId}/admin` }))

    render(
      await UserDetailLayout({
        params: Promise.resolve({ idOrUsername: userId }),
        children: <div>admin page</div>,
      }),
    )

    expect(screen.getByText('admin page')).toBeInTheDocument()
    expect(mockUserRouteLayout).toHaveBeenCalledWith({
      idOrUsername: userId,
      allowMissingProfile: true,
    })
  })

  it.each([
    ['a profile route', '/user/018f47a0-25cb-7a45-8b54-304f77ce64c0'],
    ['a username admin route', '/user/alice/admin'],
  ])('keeps the active-profile requirement for %s', async (_label, pathname) => {
    const idOrUsername = pathname.split('/')[2] ?? ''
    mockHeaders.mockResolvedValue(new Headers({ 'x-pathname': pathname }))

    render(
      await UserDetailLayout({
        params: Promise.resolve({ idOrUsername }),
        children: <div>page</div>,
      }),
    )

    expect(mockUserRouteLayout).toHaveBeenCalledWith({
      idOrUsername,
      allowMissingProfile: false,
    })
  })
})
