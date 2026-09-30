import { describe, vi } from 'vitest'
import { registerAppealsDisputesPageCases } from '@/test-helpers/app/reports/appeals-disputes-page-cases'

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
  page_info: { has_next_page: false as const, end_cursor: null },
}

describe('ReviewDisputesPage', () => {
  registerAppealsDisputesPageCases({
    Page: ReviewDisputesPage,
    title: 'Review Disputes',
    staffCopy: 'Review disputes filed by verified topic representatives.',
    memberCopy: 'Disputes filed against reviews on this platform.',
    getCurrentUser: mockGetCurrentUser,
    fetchList: mockGetReviewDisputes,
    baseResponse,
    fetchSearchParams: { cursor: 'abc123', status: 'pending' },
    expectedFetchArgs: {
      searchParams: { limit: 50, cursor: 'abc123', status: 'pending' },
    },
    clientSelector: '[data-pw="disputes-client"]',
    fetchCaseName: 'fetches disputes with cursor when provided',
    clientCaseName: 'renders the disputes client component',
  })
})
