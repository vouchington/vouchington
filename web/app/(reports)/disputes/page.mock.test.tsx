import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockGetReviewDisputes, mockGetCurrentUser, mockHeaders } = vi.hoisted(() => ({
  mockGetReviewDisputes: vi.fn<VitestLooseMock>(),
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockHeaders: vi.fn<VitestLooseMock>().mockResolvedValue({ get: () => null }),
}))

vi.mock(import('@/lib/api/server/disputes'), () => ({
  getReviewDisputes: mockGetReviewDisputes,
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

vi.mock(import('@/components/disputes/disputes-client'), () => ({
  DisputesClient: () => <div data-pw='disputes-client' />,
}))

import ReviewDisputesPage from './page'

const baseResponse = {
  disputes: [],
  page_info: { has_next_page: false, end_cursor: null },
}

describe('ReviewDisputesPage', () => {
  it('renders staff description for an administrator user', async () => {
    mockGetCurrentUser.mockResolvedValue({ roles: ['administrator'] })
    mockGetReviewDisputes.mockResolvedValueOnce(baseResponse)

    render(await ReviewDisputesPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('Review Disputes')).toBeVisible()
    expect(
      screen.getByText('Review disputes filed by verified topic representatives.'),
    ).toBeVisible()
  })

  it('renders member description for a non-staff user', async () => {
    mockGetCurrentUser.mockResolvedValue({ roles: [] })
    mockGetReviewDisputes.mockResolvedValueOnce(baseResponse)

    render(await ReviewDisputesPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('Disputes filed against reviews on this platform.')).toBeVisible()
  })

  it('renders staff description for a moderator user', async () => {
    mockGetCurrentUser.mockResolvedValue({ roles: ['moderator'] })
    mockGetReviewDisputes.mockResolvedValueOnce(baseResponse)

    render(await ReviewDisputesPage({ searchParams: Promise.resolve({}) }))

    expect(
      screen.getByText('Review disputes filed by verified topic representatives.'),
    ).toBeVisible()
  })

  it('fetches disputes with cursor when provided', async () => {
    mockGetCurrentUser.mockResolvedValue({ roles: [] })
    mockGetReviewDisputes.mockResolvedValueOnce(baseResponse)

    render(
      await ReviewDisputesPage({
        searchParams: Promise.resolve({ cursor: 'abc123', status: 'pending' }),
      }),
    )

    expect(mockGetReviewDisputes).toHaveBeenCalledWith({
      searchParams: { limit: 50, cursor: 'abc123', status: 'pending' },
    })
  })

  it('renders the disputes client component', async () => {
    mockGetCurrentUser.mockResolvedValue({ roles: [] })
    mockGetReviewDisputes.mockResolvedValueOnce(baseResponse)

    const { container } = render(await ReviewDisputesPage({ searchParams: Promise.resolve({}) }))

    expect(container.querySelector('[data-pw="disputes-client"]')).not.toBeNull()
  })
})
