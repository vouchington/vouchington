import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetMemberPendingModerationReports,
  mockGetStaffPendingModerationReports,
  mockGetCurrentUser,
  mockHeaders,
  mockReportsClient,
} = vi.hoisted(() => ({
  mockGetMemberPendingModerationReports: vi.fn<VitestLooseMock>(),
  mockGetStaffPendingModerationReports: vi.fn<VitestLooseMock>(),
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockHeaders: vi.fn<VitestLooseMock>().mockResolvedValue({ get: () => null }),
  mockReportsClient: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getMemberPendingModerationReports: mockGetMemberPendingModerationReports,
  getStaffPendingModerationReports: mockGetStaffPendingModerationReports,
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

vi.mock(import('@/components/admin/reports-client'), () => ({
  ReportsClient: (props: unknown) => {
    mockReportsClient(props)
    return <div data-pw='reports-client' />
  },
}))

import ReportsPage from './page'

const baseResponse = {
  results: [],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

describe('ReportsPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the reports heading and fetches the first page for a staff user', async () => {
    mockGetCurrentUser.mockResolvedValue({ roles: ['administrator'] })
    mockGetStaffPendingModerationReports.mockResolvedValueOnce(baseResponse)

    render(await ReportsPage({ searchParams: Promise.resolve({}) }))

    expect(mockGetStaffPendingModerationReports).toHaveBeenCalledWith({
      searchParams: { cluster: 'entity', limit: 50, sort: 'created_at_desc' },
    })
    expect(mockGetMemberPendingModerationReports).not.toHaveBeenCalled()
    expect(screen.getByText('Moderation Reports')).toBeVisible()
  })

  it('renders the reports heading for a signed-in member', async () => {
    mockGetCurrentUser.mockResolvedValue({ roles: [] })
    mockGetMemberPendingModerationReports.mockResolvedValueOnce(baseResponse)

    render(await ReportsPage({ searchParams: Promise.resolve({}) }))

    expect(mockGetMemberPendingModerationReports).toHaveBeenCalledWith({
      searchParams: { limit: 50, sort: 'created_at_desc' },
    })
    expect(mockGetStaffPendingModerationReports).not.toHaveBeenCalled()
    expect(screen.getByText('Moderation Reports')).toBeVisible()
  })

  it('accepts staff-only sort values for staff users', async () => {
    mockGetCurrentUser.mockResolvedValue({ roles: ['administrator'] })
    mockGetStaffPendingModerationReports.mockResolvedValueOnce(baseResponse)

    render(await ReportsPage({ searchParams: Promise.resolve({ sort: 'most_reported' }) }))

    expect(mockGetStaffPendingModerationReports).toHaveBeenCalledWith({
      searchParams: { limit: 50, sort: 'most_reported' },
    })
  })

  it('restores a flat staff page and forwards its URL pagination state', async () => {
    mockGetCurrentUser.mockResolvedValue({ roles: ['administrator'] })
    mockGetStaffPendingModerationReports.mockResolvedValueOnce(baseResponse)

    render(
      await ReportsPage({
        searchParams: Promise.resolve({
          after: 'cursor-1',
          cluster: 'none',
          sort: 'created_at_desc',
          status: 'reviewed',
        }),
      }),
    )

    expect(mockGetStaffPendingModerationReports).toHaveBeenCalledWith({
      searchParams: {
        after: 'cursor-1',
        limit: 50,
        sort: 'created_at_desc',
        status: 'reviewed',
      },
    })
    expect(mockReportsClient).toHaveBeenLastCalledWith(
      expect.objectContaining({
        clusterMode: 'none',
        currentAfter: 'cursor-1',
        sortOrder: 'created_at_desc',
        statusFilter: 'reviewed',
      }),
    )
  })

  it('restarts from the first flat page when a clustered cursor request fails', async () => {
    mockGetCurrentUser.mockResolvedValue({ roles: ['administrator'] })
    mockGetStaffPendingModerationReports
      .mockRejectedValueOnce(new Error('clustered request failed'))
      .mockResolvedValueOnce(baseResponse)

    render(
      await ReportsPage({
        searchParams: Promise.resolve({
          before: 'clustered-cursor',
          cluster: 'entity',
          status: 'reviewed',
        }),
      }),
    )

    expect(mockGetStaffPendingModerationReports).toHaveBeenNthCalledWith(1, {
      searchParams: {
        before: 'clustered-cursor',
        cluster: 'entity',
        limit: 50,
        sort: 'created_at_desc',
        status: 'reviewed',
      },
    })
    expect(mockGetStaffPendingModerationReports).toHaveBeenNthCalledWith(2, {
      searchParams: { limit: 50, sort: 'severity', status: 'reviewed' },
    })
    expect(mockGetMemberPendingModerationReports).not.toHaveBeenCalled()
    expect(mockReportsClient).toHaveBeenLastCalledWith(
      expect.objectContaining({
        clusterMode: 'none',
        currentAfter: undefined,
        sortOrder: 'severity',
      }),
    )
  })

  it('limits member sort values to created-time ordering', async () => {
    mockGetCurrentUser.mockResolvedValue({ roles: [] })
    mockGetMemberPendingModerationReports.mockResolvedValueOnce(baseResponse)

    render(await ReportsPage({ searchParams: Promise.resolve({ sort: 'severity' }) }))

    expect(mockGetMemberPendingModerationReports).toHaveBeenCalledWith({
      searchParams: { limit: 50, sort: 'created_at_desc' },
    })
    expect(mockGetStaffPendingModerationReports).not.toHaveBeenCalled()
  })

  it.each(['after', 'before'] as const)(
    'drops an incompatible %s cursor when clustered reports fall back to flat reports',
    async direction => {
      mockGetStaffPendingModerationReports.mockReset()
      mockGetCurrentUser.mockResolvedValue({ roles: ['administrator'] })
      mockGetStaffPendingModerationReports
        .mockRejectedValueOnce(new Error('Invalid clustered cursor'))
        .mockResolvedValueOnce(baseResponse)

      render(
        await ReportsPage({
          searchParams: Promise.resolve({ [direction]: 'cursor-1' }),
        }),
      )

      expect(mockGetStaffPendingModerationReports).toHaveBeenNthCalledWith(1, {
        searchParams: {
          [direction]: 'cursor-1',
          cluster: 'entity',
          limit: 50,
          sort: 'created_at_desc',
        },
      })
      expect(mockGetStaffPendingModerationReports).toHaveBeenNthCalledWith(2, {
        searchParams: { limit: 50, sort: 'severity' },
      })
      expect(mockGetMemberPendingModerationReports).not.toHaveBeenCalled()
      expect(mockReportsClient).toHaveBeenLastCalledWith(
        expect.objectContaining({
          clusterMode: 'none',
          currentAfter: undefined,
          sortOrder: 'severity',
        }),
      )
    },
  )
})
