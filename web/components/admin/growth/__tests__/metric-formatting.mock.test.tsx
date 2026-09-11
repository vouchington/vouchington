import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { KpiCards } from '../kpi-cards'
import { InfrastructureMetricsPanel } from '../infrastructure-metrics'
import { ContentProductionChart } from '../content-production-chart'
import { ContentHealth } from '../content-health'
import { UserGrowthChart } from '../user-growth-chart'
import { EngagementChart } from '../engagement-chart'
import { NetworkEffectsCards } from '../network-effects-cards'
import { RevenueChart } from '../revenue-chart'
import { LandingPageAnalyticsDashboard } from '@/components/my/landing-page-analytics-dashboard'
import type { GrowthMetrics } from '@/types/growth-metrics'
import type { LandingPageAnalytics } from '@/types/landing-pages'

vi.mock(import('recharts'), () => {
  const ChartShell = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid='chart-shell'>{children}</div>
  )
  const Axis = ({
    dataKey,
    tickFormatter,
  }: {
    dataKey?: string
    tickFormatter?: (value: number | string) => string
  }) => (
    <div data-testid='axis-tick'>
      {tickFormatter ? tickFormatter(dataKey === 'date' ? '2026-05-01' : 1234) : null}
    </div>
  )
  const Tooltip = ({ formatter }: { formatter?: (value: number) => string }) => (
    <div data-testid='tooltip-value'>{formatter ? formatter(1234) : null}</div>
  )
  const Legend = () => <div data-testid='legend' />
  const Primitive = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>

  return {
    AreaChart: ChartShell,
    BarChart: ChartShell,
    LineChart: ChartShell,
    PieChart: ChartShell,
    ResponsiveContainer: ChartShell,
    CartesianGrid: Primitive,
    XAxis: Axis,
    YAxis: Axis,
    Tooltip,
    Legend,
    Area: Primitive,
    Bar: Primitive,
    Line: Primitive,
    Pie: Primitive,
    Cell: Primitive,
  } as unknown as typeof import('recharts')
})

const metrics: GrowthMetrics = {
  range: '30d',
  period_start: '2026-05-01',
  period_end: '2026-05-31',
  user_growth: {
    total_users: 1234,
    new_users: 2345,
    dau: 3456,
    mau: 4567,
    dau_mau_ratio: 0.756,
    signups_over_time: [{ date: '2026-05-01', count: 1234 }],
  },
  content_production: {
    total_posts: 1234,
    posts_by_type: {
      review: 1234,
      data_point: 2345,
      discussion: 3456,
      comment: 4567,
      story: 5678,
    },
    contributions_per_active_user: 3.4,
    clearance_approval_rate: 0.875,
    content_over_time: [{ date: '2026-05-01', count: 1234 }],
  },
  engagement: {
    votes_cast: 1234,
    comments_created: 2345,
    follows_created: 3456,
    avg_follows_per_user: 2.1,
    votes_over_time: [{ date: '2026-05-01', count: 1234 }],
    comments_over_time: [{ date: '2026-05-01', count: 2345 }],
    follows_over_time: [{ date: '2026-05-01', count: 3456 }],
  },
  network_effects: {
    referral_coefficient: 1.23,
    topic_coverage_rate: 0.456,
    landing_page_visits: 1234,
    new_signups: 2345,
    signup_visit_ratio: 0.123,
  },
  revenue: {
    active_memberships: 1234,
    memberships_by_tier: { pro: 1234 },
    mrr_by_currency: [{ amount: '1234000000', currency: 'usd', scale: 6 }],
    upgrades: 1234,
    downgrades: 2345,
    cancellations: 3456,
    churn_rate: 0.034,
  },
  infrastructure: {
    crawler_success_rate: 0.987,
    queue_throughput: 1234,
    cache_hit_rate: 0.876,
    ai_token_usage: 1_234_567,
  },
}

const analytics: LandingPageAnalytics = {
  total_visits: 1234,
  total_clicks: 2345,
  ctr: 0.123,
  unique_visitors: 3456,
  item_clicks: [],
  daily_stats: [{ date: '2026-05-01', visits: 1234, clicks: 2345, unique_visitors: 3456 }],
  utm_sources: [{ utm_source: 'newsletter', visits: 1234 }],
  conversion_funnel: {
    total_visits: 1234,
    total_clicks: 2345,
    total_signups: 3456,
    visit_to_click_rate: 0.234,
  },
}

function renderWithGermanLocale(ui: React.ReactElement) {
  return render(<UiLocaleProvider uiLocale='de-DE'>{ui}</UiLocaleProvider>)
}

describe('growth metric formatting', () => {
  it('formats card counts with the active UI locale', () => {
    renderWithGermanLocale(
      <>
        <KpiCards metrics={metrics} />
        <InfrastructureMetricsPanel infrastructure={metrics.infrastructure} />
        <NetworkEffectsCards networkEffects={metrics.network_effects} />
        <RevenueChart revenue={metrics.revenue} />
      </>,
    )

    expect(screen.getAllByText('1.234').length).toBeGreaterThan(3)
    expect(screen.getAllByText('1.234,00 $').length).toBeGreaterThan(1)
    expect(screen.getByText('1.234.567')).toBeInTheDocument()
  })

  it('formats chart ticks and tooltips with the active UI locale', () => {
    renderWithGermanLocale(
      <>
        <ContentProductionChart contentProduction={metrics.content_production} />
        <ContentHealth contentProduction={metrics.content_production} />
        <UserGrowthChart userGrowth={metrics.user_growth} />
        <EngagementChart engagement={metrics.engagement} />
        <RevenueChart revenue={metrics.revenue} />
      </>,
    )

    expect(screen.getAllByText('1.234').length).toBeGreaterThan(6)
  })

  it('renders explicit zero values when MRR has no currency groups', () => {
    const revenue = { ...metrics.revenue, mrr_by_currency: [] }
    renderWithGermanLocale(
      <>
        <KpiCards metrics={{ ...metrics, revenue }} />
        <RevenueChart revenue={revenue} />
      </>,
    )

    expect(screen.getAllByText('0')).toHaveLength(2)
  })

  it('formats landing page analytics counts with the active UI locale', () => {
    renderWithGermanLocale(
      <LandingPageAnalyticsDashboard
        analytics={analytics}
        items={[]}
      />,
    )

    expect(screen.getAllByText('1.234').length).toBeGreaterThan(2)
    expect(screen.getAllByText('3.456').length).toBeGreaterThan(1)
  })
})
