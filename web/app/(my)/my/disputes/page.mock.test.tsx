import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockGetReviewDisputes } = vi.hoisted(() => ({
  mockGetReviewDisputes: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server/disputes'), () => ({
  getReviewDisputes: mockGetReviewDisputes,
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav data-pw='breadcrumbs' />,
}))

vi.mock(import('@/components/disputes/disputes-client'), () => ({
  DisputesClient: () => <div data-pw='disputes-client' />,
}))

import MyDisputesPage from './page'

const baseResponse = {
  disputes: [],
  page_info: { has_next_page: false, end_cursor: null },
}

describe('MyDisputesPage', () => {
  it('renders the heading and fetches member disputes', async () => {
    mockGetReviewDisputes.mockResolvedValueOnce(baseResponse)

    const { container } = render(await MyDisputesPage())

    expect(mockGetReviewDisputes).toHaveBeenCalledWith({
      searchParams: { limit: 50, mine: true },
    })
    expect(screen.getByText('My Review Disputes')).toBeVisible()
    expect(
      screen.getByText('Track disputes you have filed as a verified topic representative.'),
    ).toBeVisible()
    expect(container.querySelector('[data-pw="settings-page-header"]')).not.toBeNull()
  })

  it('renders the disputes client component', async () => {
    mockGetReviewDisputes.mockResolvedValueOnce(baseResponse)

    const { container } = render(await MyDisputesPage())

    expect(container.querySelector('[data-pw="disputes-client"]')).not.toBeNull()
  })
})
