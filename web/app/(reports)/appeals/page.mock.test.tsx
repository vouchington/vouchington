import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { registerAppealsDisputesPageCases } from '@/test-helpers/app/reports/appeals-disputes-page-cases'

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
  page_info: { has_next_page: false as const, end_cursor: null },
}

describe('Loading', () => {
  it('renders without error', () => {
    const { container } = render(<Loading />)
    expect(container).toBeInTheDocument()
  })
})

describe('ModerationAppealsPage', () => {
  registerAppealsDisputesPageCases({
    Page: ModerationAppealsPage,
    title: 'Moderation Appeals',
    staffCopy: 'Review appeals filed by members against moderation decisions.',
    memberCopy: 'Appeals against moderation decisions on this platform.',
    getCurrentUser: mockGetCurrentUser,
    fetchList: mockGetModerationAppeals,
    baseResponse,
    fetchSearchParams: { cursor: 'abc123', status: 'resolved' },
    expectedFetchArgs: {
      searchParams: { limit: 50, cursor: 'abc123', status: 'resolved' },
    },
    clientSelector: '[data-pw="appeals-client"]',
    fetchCaseName: 'fetches appeals with cursor and status when provided',
    clientCaseName: 'renders the appeals client component',
  })
})
