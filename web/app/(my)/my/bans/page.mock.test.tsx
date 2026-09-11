import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface HeaderBag {
  get: (key: string) => string | null
}

const { mockGetMyBans, mockGetCurrentUser, mockRedirect, mockHeaders } = vi.hoisted(() => ({
  mockGetMyBans: vi.fn<VitestLooseMock>(),
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockRedirect: vi.fn<VitestLooseMock>(),
  mockHeaders: vi.fn<() => Promise<HeaderBag>>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      redirect: mockRedirect,
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('next/headers'),
  () =>
    ({
      headers: mockHeaders,
    }) as unknown as typeof import('next/headers'),
)

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('@/lib/api/server'), () => ({
  getMyBans: mockGetMyBans,
}))

vi.mock(import('@/components/my/settings-page-header'), () => ({
  SettingsPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock(import('./my-bans-client'), () => ({
  MyBansClient: () => <div data-pw='my-bans-client' />,
}))

import MyBansPage from './page'

const baseUser = {
  id: 'user-1',
  username: 'alice',
  email_address: 'tests+alice@voucha.ai',
  roles: [],
}
const emptyResponse = {
  bans: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

describe('MyBansPage', () => {
  beforeEach(() => {
    mockHeaders.mockResolvedValue({ get: () => null })
  })

  it('redirects to /login when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    mockGetMyBans.mockResolvedValueOnce(emptyResponse)

    await MyBansPage()

    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('renders the page heading when authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(baseUser)
    mockGetMyBans.mockResolvedValueOnce(emptyResponse)

    render(await MyBansPage())

    expect(screen.getByText('My Bans')).toBeVisible()
  })

  it('renders the bans client component', async () => {
    mockGetCurrentUser.mockResolvedValue(baseUser)
    mockGetMyBans.mockResolvedValueOnce(emptyResponse)

    const { container } = render(await MyBansPage())

    expect(container.querySelector('[data-pw="my-bans-client"]')).not.toBeNull()
  })
})
