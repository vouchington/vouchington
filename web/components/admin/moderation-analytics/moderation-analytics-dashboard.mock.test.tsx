import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import ModerationAnalyticsDashboard from './moderation-analytics-dashboard'
import type { ModerationAnalytics } from '@/types/moderation-analytics'
import type { ReactNode } from 'react'

const routerPushMock = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: routerPushMock }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('recharts'), () => {
  const ChartShell = ({ children }: { children?: ReactNode }) => (
    <div data-testid='chart-shell'>{children}</div>
  )
  const Axis = ({
    dataKey,
    tickFormatter,
  }: {
    dataKey?: string
    tickFormatter?: (value: number | string) => string
  }) => (
    <span data-testid='axis-tick'>
      {tickFormatter ? tickFormatter(dataKey === 'date' ? '2026-05-01' : 1234) : null}
    </span>
  )
  const Tooltip = ({ formatter }: { formatter?: (value: number) => string }) => (
    <span data-testid='tooltip-value'>{formatter ? formatter(1234) : null}</span>
  )
  const Bar = ({ name }: { name?: string }) => <span data-testid='bar-name'>{name}</span>
  const Primitive = ({ children }: { children?: ReactNode }) => <div>{children}</div>

  return {
    Bar,
    BarChart: ChartShell,
    CartesianGrid: Primitive,
    Legend: () => <span data-testid='legend' />,
    Line: Primitive,
    LineChart: ChartShell,
    ResponsiveContainer: ChartShell,
    Tooltip,
    XAxis: Axis,
    YAxis: Axis,
  } as unknown as typeof import('recharts')
})

vi.mock(import('@/components/ui/select'), () => {
  const noop = () => {}
  let selectOnValueChange: (value: string) => void = noop

  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children?: ReactNode
      onValueChange?: (value: string) => void
    }) => {
      selectOnValueChange = onValueChange ?? noop
      return <div>{children}</div>
    },
    SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children?: ReactNode; value: string }) => {
      return (
        <button
          type='button'
          onClick={() => selectOnValueChange(value)}
        >
          {children}
        </button>
      )
    },
    SelectTrigger: ({ children, id }: { children?: ReactNode; id?: string }) => (
      <button
        id={id}
        type='button'
      >
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  } as unknown as typeof import('@/components/ui/select')
})

describe('ModerationAnalyticsDashboard', () => {
  beforeEach(() => {
    routerPushMock.mockReset()
  })

  it('renders moderation metrics and changes the date range', () => {
    renderDashboard(makeMetrics())

    expect(screen.getByRole('heading', { name: 'Moderation Analytics' })).toBeDefined()
    expect(screen.getByText('Platform trends')).toBeDefined()
    expect(screen.getByText('Reports')).toBeDefined()
    expect(screen.getByText('4 pending')).toBeDefined()
    expect(screen.getAllByText('25%')).toHaveLength(2)
    expect(screen.getByText('Rule Violations')).toBeDefined()
    expect(screen.getByText('Spam Link')).toBeDefined()
    expect(screen.getByText('Bot')).toBeDefined()
    expect(screen.getByText('High')).toBeDefined()
    expect(screen.getByText('@moduser')).toBeDefined()
    expect(screen.getByText('Remove (7)')).toBeDefined()
    expect(screen.getAllByTestId('bar-name')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }))
    expect(routerPushMock).toHaveBeenCalledWith('/admin/moderation-analytics?range=7d')

    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }))
    expect(routerPushMock).toHaveBeenCalledWith('/admin/moderation-analytics')
  })

  it('renders empty and n/a states', () => {
    renderDashboard(
      makeMetrics({
        appeals: {
          total_closed: 0,
          accepted: 0,
          reduced: 0,
          denied: 0,
          dismissed: 0,
          success_rate: null,
        },
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
        new_user_friction: {
          first_posts: 0,
          rejected_first_posts: 0,
          rejection_rate: null,
        },
        rule_violations: { reasons: [], reasons_over_time: [] },
      }),
      undefined,
    )

    expect(screen.getAllByText('n/a')).toHaveLength(3)
    expect(screen.getByText('No reports in this period.')).toBeDefined()
    expect(screen.getByText('No automod actions in this period.')).toBeDefined()
    expect(screen.getByText('No confidence data in this period.')).toBeDefined()
    expect(screen.getByText('No moderator actions in this period.')).toBeDefined()
  })
})

function renderDashboard(
  metrics: ModerationAnalytics,
  description: string | undefined = 'Platform trends',
) {
  return render(
    <UiLocaleProvider uiLocale='en-US'>
      <ModerationAnalyticsDashboard
        metrics={metrics}
        basePath='/admin/moderation-analytics'
        title='Moderation Analytics'
        description={description}
      />
    </UiLocaleProvider>,
  )
}

function makeMetrics(overrides: Partial<ModerationAnalytics> = {}): ModerationAnalytics {
  return {
    range: '30d',
    period_start: '2026-05-01T00:00:00.000Z',
    period_end: '2026-05-31T00:00:00.000Z',
    scope: { type: 'global' },
    queue_volume: {
      total_reports: 12,
      pending_reports: 4,
      reports_over_time: [{ date: '2026-05-01', count: 12 }],
      clearance_actions_over_time: [],
      moderator_actions_over_time: [],
    },
    rule_violations: {
      reasons: [{ reason: 'spam_link', count: 8 }],
      reasons_over_time: [],
    },
    automod_performance: {
      total_actions: 9,
      auto_removes: 5,
      reviewed_count: 4,
      false_positive_count: 1,
      false_positive_rate: 0.25,
      actions_over_time: [
        { date: '2026-05-01', type: 'auto_remove', count: 5 },
        { date: '2026-05-01', type: 'warn_user', count: 4 },
      ],
      confidence_distribution: [{ bucket: 'High', count: 6 }],
      sources: [{ source_type: 'bot', count: 9 }],
    },
    moderator_workload: {
      moderators: [
        {
          actor_id: 'user-1',
          total: 9,
          counts: { approve: 2, remove: 7 },
          weekly_counts: [],
        },
      ],
      users: { 'user-1': { username: 'moduser' } },
    },
    appeals: {
      total_closed: 4,
      accepted: 1,
      reduced: 0,
      denied: 3,
      dismissed: 0,
      success_rate: 0.25,
    },
    new_user_friction: {
      first_posts: 20,
      rejected_first_posts: 2,
      rejection_rate: 0.1,
    },
    ...overrides,
  }
}
