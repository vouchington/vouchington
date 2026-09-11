import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockGetModerationAppeals, mockGetCurrentUser, mockHeaders } = vi.hoisted(() => ({
  mockGetModerationAppeals: vi.fn<VitestLooseMock>(),
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockHeaders: vi.fn<VitestLooseMock>().mockResolvedValue({ get: () => null }),
}))

vi.mock(import('@/lib/api/server/appeals'), () => ({
  getModerationAppeals: mockGetModerationAppeals,
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('next/headers'), () => ({
  headers: mockHeaders,
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav data-pw='breadcrumbs' />,
}))

vi.mock(import('@/components/appeals/appeals-client'), () => ({
  AppealsClient: () => <div data-pw='appeals-client' />,
}))

import ModerationAppealsPage from './page'
import Loading from './loading'

const baseResponse = {
  appeals: [],
  page_info: { has_next_page: false, end_cursor: null },
}

describe('Loading', () => {
  it('renders without error', () => {
    const { container } = render(<Loading />)
    expect(container).toBeInTheDocument()
  })
})

describe('ModerationAppealsPage', () => {
  it('renders staff description for an administrator user', async () => {
    mockGetCurrentUser.mockResolvedValue({ roles: ['administrator'] })
    mockGetModerationAppeals.mockResolvedValueOnce(baseResponse)

    render(await ModerationAppealsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('Moderation Appeals')).toBeVisible()
    expect(
      screen.getByText('Review appeals filed by members against moderation decisions.'),
    ).toBeVisible()
  })

  it('renders member description for a non-staff user', async () => {
    mockGetCurrentUser.mockResolvedValue({ roles: [] })
    mockGetModerationAppeals.mockResolvedValueOnce(baseResponse)

    render(await ModerationAppealsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('Appeals against moderation decisions on this platform.')).toBeVisible()
  })

  it('renders staff description for a moderator user', async () => {
    mockGetCurrentUser.mockResolvedValue({ roles: ['moderator'] })
    mockGetModerationAppeals.mockResolvedValueOnce(baseResponse)

    render(await ModerationAppealsPage({ searchParams: Promise.resolve({}) }))

    expect(
      screen.getByText('Review appeals filed by members against moderation decisions.'),
    ).toBeVisible()
  })

  it('fetches appeals with cursor and status when provided', async () => {
    mockGetCurrentUser.mockResolvedValue({ roles: [] })
    mockGetModerationAppeals.mockResolvedValueOnce(baseResponse)

    render(
      await ModerationAppealsPage({
        searchParams: Promise.resolve({ cursor: 'abc123', status: 'resolved' }),
      }),
    )

    expect(mockGetModerationAppeals).toHaveBeenCalledWith({
      searchParams: { limit: 50, cursor: 'abc123', status: 'resolved' },
    })
  })

  it('renders the appeals client component', async () => {
    mockGetCurrentUser.mockResolvedValue({ roles: [] })
    mockGetModerationAppeals.mockResolvedValueOnce(baseResponse)

    const { container } = render(await ModerationAppealsPage({ searchParams: Promise.resolve({}) }))

    expect(container.querySelector('[data-pw="appeals-client"]')).not.toBeNull()
  })
})
