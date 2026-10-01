/* oxlint-disable no-mistakes/playwright-consistent-attribute -- moved test support preserves existing Testing Library selectors */
import { vi } from 'vitest'
import { navMockModule } from '@/test-helpers/next-navigation-mock'
import CommunityModerationAnalyticsPage from '@/app/(communities)/communities/[slug]/settings/moderation/analytics/page'
import type { ModerationAnalytics, ModerationTransparency } from '@/types/moderation-analytics'

type HeaderBag = { get: (key: string) => string | null }

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
      ...(navMockModule as Record<string, unknown>),
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

function resetModerationAnalyticsPageMocks() {
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
}

function renderModerationAnalyticsPage(searchParams: { range?: string } = {}) {
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
      success_rate: null,
    },
    new_user_friction: {
      first_posts: 0,
      rejected_first_posts: 0,
      rejection_rate: null,
    },
  }
}

function makeTransparency(): ModerationTransparency {
  return {
    range: '30d',
    buckets: [
      {
        date: '2026-01-01',
        metric: 'automated_moderation',
        category: 'community_ai',
        count: 25,
      },
    ],
  }
}

export {
  dashboardMock,
  getCommunityMock,
  getCommunityModerationAnalyticsMock,
  getCommunityModerationTransparencyMock,
  getCurrentUserMock,
  makeCommunityData,
  makeTransparency,
  makeUser,
  notFoundMock,
  rangeFilterMock,
  redirectMock,
  renderModerationAnalyticsPage,
  resetModerationAnalyticsPageMocks,
  transparencyPanelMock,
}
