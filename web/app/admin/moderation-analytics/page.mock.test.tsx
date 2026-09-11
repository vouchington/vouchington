import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminModerationAnalyticsPage from './page'
import type { ModerationAnalytics } from '@/types/moderation-analytics'

const { dashboardMock, getAdminModerationAnalyticsMock, requireAdminMock } = vi.hoisted(() => ({
  dashboardMock: vi.fn<VitestLooseMock>(() => <div data-testid='dashboard' />),
  getAdminModerationAnalyticsMock: vi.fn<VitestLooseMock>(),
  requireAdminMock: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('next/dynamic'), () => ({
  default: () => dashboardMock,
}))

vi.mock(import('@/components/admin/moderation-analytics/moderation-analytics-dashboard'), () => ({
  default: dashboardMock,
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav data-testid='breadcrumbs' />,
}))

vi.mock(import('@/lib/auth/require-admin'), () => ({
  requireAdmin: requireAdminMock,
}))

vi.mock(import('@/lib/api/server/moderation-analytics'), () => ({
  getAdminModerationAnalytics: getAdminModerationAnalyticsMock,
}))

vi.mock(
  import('@/lib/seo/metadata'),
  () =>
    ({
      createNoIndexMetadata: (title: string) => ({ title }),
    }) as unknown as typeof import('@/lib/seo/metadata'),
)

describe('AdminModerationAnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdminMock.mockResolvedValue(undefined)
    getAdminModerationAnalyticsMock.mockResolvedValue(makeMetrics())
  })

  it('requires admin access and renders dashboard props for a valid range', async () => {
    const page = await AdminModerationAnalyticsPage({
      searchParams: Promise.resolve({ range: '7d' }),
    })
    render(page)

    expect(requireAdminMock).toHaveBeenCalled()
    expect(getAdminModerationAnalyticsMock).toHaveBeenCalledWith({ range: '7d' })
    expect(screen.getByTestId('breadcrumbs')).toBeDefined()
    expect(screen.getByTestId('dashboard')).toBeDefined()
    expect(dashboardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        basePath: '/admin/moderation-analytics',
        title: 'Moderation Analytics',
        metrics: expect.objectContaining({ range: '30d' }),
      }),
      undefined,
    )
  })

  it('falls back to the default range for invalid params', async () => {
    await AdminModerationAnalyticsPage({
      searchParams: Promise.resolve({ range: 'invalid' }),
    })

    expect(getAdminModerationAnalyticsMock).toHaveBeenCalledWith({ range: '30d' })
  })
})

function makeMetrics(): ModerationAnalytics {
  return {
    range: '30d',
    period_start: '2026-05-01T00:00:00.000Z',
    period_end: '2026-05-31T00:00:00.000Z',
    scope: { type: 'global' },
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
