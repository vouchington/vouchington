import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockGetModerationAppeals } = vi.hoisted(() => ({
  mockGetModerationAppeals: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server/appeals'), () => ({
  getModerationAppeals: mockGetModerationAppeals,
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav data-pw='breadcrumbs' />,
}))

vi.mock(import('@/components/appeals/appeals-client'), () => ({
  AppealsClient: () => <div data-pw='appeals-client' />,
}))

import MyAppealsPage from './page'
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

describe('MyAppealsPage', () => {
  it('renders the heading and fetches member appeals', async () => {
    mockGetModerationAppeals.mockResolvedValueOnce(baseResponse)

    const { container } = render(await MyAppealsPage())

    expect(mockGetModerationAppeals).toHaveBeenCalledWith({
      searchParams: { limit: 50, mine: true },
    })
    expect(screen.getByText('My Appeals')).toBeVisible()
    expect(
      screen.getByText('Track appeals you have filed against moderation decisions.'),
    ).toBeVisible()
    expect(container.querySelector('[data-pw="settings-page-header"]')).not.toBeNull()
  })

  it('renders the appeals client component', async () => {
    mockGetModerationAppeals.mockResolvedValueOnce(baseResponse)

    const { container } = render(await MyAppealsPage())

    expect(container.querySelector('[data-pw="appeals-client"]')).not.toBeNull()
  })
})
