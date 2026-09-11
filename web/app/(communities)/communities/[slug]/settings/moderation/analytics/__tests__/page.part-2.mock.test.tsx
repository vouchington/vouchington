import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CommunityModerationAnalyticsPage, { generateMetadata } from '../page'
import { ApiError } from '@/lib/api/error'
import type { ModerationAnalytics } from '@/types/moderation-analytics'

interface HeaderBag {
  get: (key: string) => string | null
}

const {
  dashboardMock,
  rangeFilterMock,
  transparencyPanelMock,
  getCommunityMock,
  getCommunityModerationAnalyticsMock,
  getCommunityModerationTransparencyMock,
  getCurrentUserMock,
  notFoundMock,
  redirectMock,
  headersMock,
} = vi.hoisted(() => ({
  dashboardMock: vi.fn<VitestLooseMock>(() => <div data-testid='dashboard' />),
  rangeFilterMock: vi.fn<VitestLooseMock>(() => <div data-testid='range-filter' />),
  transparencyPanelMock: vi.fn<VitestLooseMock>(() => <div data-testid='transparency-panel' />),
  getCommunityMock: vi.fn<VitestLooseMock>(),
  getCommunityModerationAnalyticsMock: vi.fn<VitestLooseMock>(),
  getCommunityModerationTransparencyMock: vi.fn<VitestLooseMock>(),
  getCurrentUserMock: vi.fn<VitestLooseMock>(),
  notFoundMock: vi.fn<VitestLooseMock>(() => {
    throw new Error('NOT_FOUND')
  }),
  redirectMock: vi.fn<VitestLooseMock>(() => {
    throw new Error('REDIRECT')
  }),
  headersMock: vi.fn<() => Promise<HeaderBag>>(),
}))

vi.mock(
  import('next/headers'),
  () => ({ headers: headersMock }) as unknown as typeof import('next/headers'),
)
vi.mock(import('next/dynamic'), () => ({ default: () => dashboardMock }))
vi.mock(import('@/components/admin/moderation-analytics/moderation-analytics-dashboard'), () => ({
  default: dashboardMock,
}))
vi.mock(import('@/components/moderation/moderation-transparency-panel'), () => ({
  ModerationTransparencyPanel: transparencyPanelMock,
}))
vi.mock(import('@/components/moderation/moderation-analytics-range-filter'), () => ({
  ModerationAnalyticsRangeFilter: rangeFilterMock,
}))
vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: notFoundMock,
      redirect: redirectMock,
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/server'), () => ({
  getCommunity: getCommunityMock,
  getCommunityModerationAnalytics: getCommunityModerationAnalyticsMock,
  getCommunityModerationTransparency: getCommunityModerationTransparencyMock,
}))
vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: getCurrentUserMock }))
vi.mock(
  import('@/lib/seo/metadata'),
  () =>
    ({
      createNoIndexMetadata: (title: string) => ({ title }),
    }) as unknown as typeof import('@/lib/seo/metadata'),
)

describe('CommunityModerationAnalyticsPage site moderator fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    notFoundMock.mockImplementation(() => {
      throw new Error('NOT_FOUND')
    })
    redirectMock.mockImplementation(() => {
      throw new Error('REDIRECT')
    })
    getCurrentUserMock.mockResolvedValue(makeUser())
    getCommunityMock.mockResolvedValue(makeCommunityData('moderator'))
    getCommunityModerationAnalyticsMock.mockResolvedValue(makeMetrics())
    getCommunityModerationTransparencyMock.mockResolvedValue(makeTransparency())
    headersMock.mockResolvedValue({ get: () => null })
  })

  it('allows site moderators and defaults invalid ranges', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser(['moderator']))
    getCommunityMock.mockResolvedValueOnce(null)

    render(await renderPage({ range: 'not-a-range' }))

    expect(getCommunityModerationAnalyticsMock).toHaveBeenCalledWith('test-community', {
      range: '30d',
    })
    expect(dashboardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('test-community moderation queue'),
      }),
      undefined,
    )
  })

  it('returns not found when analytics authorization fails for site moderators', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser(['moderator']))
    getCommunityMock.mockResolvedValueOnce(null)
    getCommunityModerationAnalyticsMock.mockRejectedValueOnce(new ApiError('Not found', 404))

    await expect(renderPage()).rejects.toThrow('NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('keeps site-staff raw analytics and renders the paid lock after a transparency 403', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser(['moderator']))
    getCommunityMock.mockResolvedValueOnce(null)
    getCommunityModerationTransparencyMock.mockRejectedValueOnce(new ApiError('Forbidden', 403))

    render(await renderPage())

    expect(screen.getByTestId('dashboard')).toBeDefined()
    expect(transparencyPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({ transparency: null }),
      undefined,
    )
  })

  it('denies raw analytics after a community moderator loses transparency access', async () => {
    getCommunityModerationTransparencyMock.mockRejectedValueOnce(new ApiError('Forbidden', 403))

    await expect(renderPage()).rejects.toThrow('NOT_FOUND')

    expect(notFoundMock).toHaveBeenCalled()
    expect(dashboardMock).not.toHaveBeenCalled()
    expect(transparencyPanelMock).not.toHaveBeenCalled()
  })

  it('redirects when supplementary transparency reports that the session expired', async () => {
    getCommunityModerationTransparencyMock.mockRejectedValueOnce(
      new ApiError('Unauthenticated', 401),
    )

    await expect(renderPage({ range: '7d' })).rejects.toThrow('REDIRECT')

    expect(redirectMock).toHaveBeenCalledWith(
      '/login?next=%2Fcommunities%2Ftest-community%2Fsettings%2Fmoderation%2Fanalytics%3Frange%3D7d',
    )
    expect(dashboardMock).not.toHaveBeenCalled()
    expect(transparencyPanelMock).not.toHaveBeenCalled()
  })

  it('redirects when raw analytics reports that the session expired', async () => {
    getCommunityModerationAnalyticsMock.mockRejectedValueOnce(new ApiError('Unauthenticated', 401))
    getCommunityModerationTransparencyMock.mockRejectedValueOnce(new ApiError('Forbidden', 403))

    await expect(renderPage({ range: '7d' })).rejects.toThrow('REDIRECT')

    expect(redirectMock).toHaveBeenCalledWith(
      '/login?next=%2Fcommunities%2Ftest-community%2Fsettings%2Fmoderation%2Fanalytics%3Frange%3D7d',
    )
    expect(dashboardMock).not.toHaveBeenCalled()
  })

  it('creates community metadata and returns empty metadata for missing communities', async () => {
    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: 'test-community' }),
        searchParams: Promise.resolve({}),
      }),
    ).resolves.toEqual({ title: 'Moderation Analytics — Test Community' })

    getCommunityMock.mockResolvedValueOnce(null)
    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: 'missing' }),
        searchParams: Promise.resolve({}),
      }),
    ).resolves.toEqual({})
  })
})

function renderPage(searchParams: { range?: string } = {}) {
  return CommunityModerationAnalyticsPage({
    params: Promise.resolve({ slug: 'test-community' }),
    searchParams: Promise.resolve(searchParams),
  })
}

function makeUser(roles: string[] = []) {
  return { id: 'user-1', roles }
}

function makeCommunityData(role: string | null) {
  return {
    community: { id: 'community-1', name: 'Test Community', slug: 'test-community' },
    membership: role ? { role, removed_at: null } : null,
  }
}

function makeMetrics(): ModerationAnalytics {
  return {
    range: '30d',
    period_start: '2026-05-01T00:00:00.000Z',
    period_end: '2026-05-31T00:00:00.000Z',
    scope: { type: 'community', community_id: 'community-1' },
    queue_volume: {
      total_reports: 0,
      pending_reports: 0,
      reports_over_time: [],
      clearance_actions_over_time: [],
      moderator_actions_over_time: [],
    },
    rule_violations: { reasons: [], reasons_over_time: [] },
    automod_performance: {
      total_actions: 0,
      auto_removes: 0,
      reviewed_count: 0,
      false_positive_count: 0,
      false_positive_rate: null,
      actions_over_time: [],
      confidence_distribution: [],
      sources: [],
    },
    moderator_workload: { moderators: [], users: {} },
    appeals: {
      total_closed: 0,
      accepted: 0,
      reduced: 0,
      denied: 0,
      dismissed: 0,
      success_rate: null,
    },
    new_user_friction: {
      first_posts: 0,
      rejected_first_posts: 0,
      rejection_rate: null,
    },
  }
}

function makeTransparency() {
  return {
    range: '30d' as const,
    buckets: [
      {
        date: '2026-01-01',
        metric: 'automated_moderation' as const,
        category: 'community_ai',
        count: 25,
      },
    ],
  }
}
