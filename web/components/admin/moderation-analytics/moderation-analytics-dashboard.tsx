/* oxlint-disable max-lines, react-doctor/prefer-dynamic-import -- Dashboard keeps compact cards, charts, and chart imports together. */
'use client'

import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ModerationAnalyticsRangeFilter } from '@/components/moderation/moderation-analytics-range-filter'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber, formatUtcDate } from '@ts-shared/utils/format'
import type {
  DailyTypedCountDataPoint,
  ModerationAnalytics,
  ModerationAnalyticsRange,
} from '@/types/moderation-analytics'
import { useTranslations } from '@/lib/i18n/use-translations'

const axisTick = { fontSize: 11 }
const colors = ['#2563eb', '#16a34a', '#f97316', '#db2777', '#0891b2', '#7c3aed']

interface Props {
  metrics: ModerationAnalytics
  basePath: string
  title: string
  description?: string
}

export default function ModerationAnalyticsDashboard({
  metrics,
  basePath,
  title,
  description,
}: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const reportTrend = metrics.queue_volume.reports_over_time.map(point => ({
    date: point.date,
    reports: point.count,
  }))
  const automodTrend = pivotTypedSeries(metrics.automod_performance.actions_over_time)
  const falsePositiveRate =
    metrics.automod_performance.false_positive_rate == null
      ? t('extracted.moderationAnalytics.moderationAnalyticsDashboard.nA_a683c5c5')
      : formatPercent(metrics.automod_performance.false_positive_rate, uiLocale)

  return (
    <div
      className='space-y-6'
      data-pw='moderation-analytics-dashboard'
    >
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <h1 className='text-xl font-bold sm:text-2xl md:text-3xl'>{title}</h1>
          {description && <p className='mt-1 text-sm text-muted-foreground'>{description}</p>}
          <p className='mt-1 text-sm text-muted-foreground'>
            {t(
              'extracted.moderationAnalytics.moderationAnalyticsDashboard.periodstartToPeriodend_99363d47',
              {
                periodStart: formatUtcDate(metrics.period_start),
                periodEnd: formatUtcDate(metrics.period_end),
              },
            )}
          </p>
        </div>
        <ModerationAnalyticsRangeFilter
          basePath={basePath}
          range={metrics.range}
        />
      </div>

      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <MetricCard
          label={t('extracted.moderationAnalytics.moderationAnalyticsDashboard.reports_dacca3cb')}
          value={formatNumber(metrics.queue_volume.total_reports, uiLocale)}
          detail={t(
            'extracted.moderationAnalytics.moderationAnalyticsDashboard.countPending_bc608dfb',
            {
              count: formatNumber(metrics.queue_volume.pending_reports, uiLocale),
            },
          )}
          data-pw='moderation-analytics-card-reports'
        />
        <MetricCard
          label={t(
            'extracted.moderationAnalytics.moderationAnalyticsDashboard.automodActions_2acb9bc4',
          )}
          value={formatNumber(metrics.automod_performance.total_actions, uiLocale)}
          detail={t(
            'extracted.moderationAnalytics.moderationAnalyticsDashboard.countAutoRemoves_38d75240',
            { count: formatNumber(metrics.automod_performance.auto_removes, uiLocale) },
          )}
          data-pw='moderation-analytics-card-automod-actions'
        />
        <MetricCard
          label={t(
            'extracted.moderationAnalytics.moderationAnalyticsDashboard.appealSuccess_94e52907',
          )}
          value={
            metrics.appeals.success_rate == null
              ? t('extracted.moderationAnalytics.moderationAnalyticsDashboard.nA_a683c5c5')
              : formatPercent(metrics.appeals.success_rate, uiLocale)
          }
          detail={t(
            'extracted.moderationAnalytics.moderationAnalyticsDashboard.countClosedAppeals_15c0cfb9',
            { count: formatNumber(metrics.appeals.total_closed, uiLocale) },
          )}
          data-pw='moderation-analytics-card-appeal-success'
        />
        <MetricCard
          label={t(
            'extracted.moderationAnalytics.moderationAnalyticsDashboard.newUserRejections_05c50235',
          )}
          value={
            metrics.new_user_friction.rejection_rate == null
              ? t('extracted.moderationAnalytics.moderationAnalyticsDashboard.nA_a683c5c5')
              : formatPercent(metrics.new_user_friction.rejection_rate, uiLocale)
          }
          detail={t(
            'extracted.moderationAnalytics.moderationAnalyticsDashboard.countRejectedFirstPosts_0e98bb37',
            { count: formatNumber(metrics.new_user_friction.rejected_first_posts, uiLocale) },
          )}
          data-pw='moderation-analytics-card-new-user-rejections'
        />
      </div>

      <section className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
        <ChartPanel
          title={t(
            'extracted.moderationAnalytics.moderationAnalyticsDashboard.queueVolume_1928d6c2',
          )}
          data-pw='moderation-analytics-chart-queue-volume'
        >
          <ResponsiveContainer
            width='100%'
            height={240}
          >
            <LineChart data={reportTrend}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis
                dataKey='date'
                tick={axisTick}
                tickFormatter={formatAxisDate}
              />
              <YAxis
                tick={axisTick}
                tickFormatter={value => formatNumber(Number(value), uiLocale)}
              />
              <Tooltip formatter={value => formatNumber(Number(value), uiLocale)} />
              <Line
                type='monotone'
                dataKey='reports'
                stroke={colors[0]}
                strokeWidth={2}
                dot={false}
                name={t(
                  'extracted.moderationAnalytics.moderationAnalyticsDashboard.reports_dacca3cb',
                )}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel
          title={t(
            'extracted.moderationAnalytics.moderationAnalyticsDashboard.automodPerformance_caa443bd',
          )}
          data-pw='moderation-analytics-chart-automod-performance'
        >
          <div className='mb-3 grid grid-cols-2 gap-2 text-sm'>
            <MiniStat
              label={t(
                'extracted.moderationAnalytics.moderationAnalyticsDashboard.reviewed_fad6057b',
              )}
              value={formatNumber(metrics.automod_performance.reviewed_count, uiLocale)}
              data-pw='moderation-analytics-ministat-reviewed'
            />
            <MiniStat
              label={t(
                'extracted.moderationAnalytics.moderationAnalyticsDashboard.falsePositiveRate_57505f91',
              )}
              value={falsePositiveRate}
              data-pw='moderation-analytics-ministat-false-positive-rate'
            />
          </div>
          <ResponsiveContainer
            width='100%'
            height={190}
          >
            <BarChart data={automodTrend.rows}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis
                dataKey='date'
                tick={axisTick}
                tickFormatter={formatAxisDate}
              />
              <YAxis
                tick={axisTick}
                tickFormatter={value => formatNumber(Number(value), uiLocale)}
              />
              <Tooltip formatter={value => formatNumber(Number(value), uiLocale)} />
              <Legend />
              {automodTrend.keys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={colors[index % colors.length]}
                  name={formatLabel(key)}
                  stackId='automod'
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </section>

      <section className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
        <RankedList
          title={t(
            'extracted.moderationAnalytics.moderationAnalyticsDashboard.ruleViolations_8f0d0e75',
          )}
          empty={t(
            'extracted.moderationAnalytics.moderationAnalyticsDashboard.noReportsInThisPeriod_7d879fa7',
          )}
          rows={metrics.rule_violations.reasons.map(row => ({
            key: row.reason,
            label: formatLabel(row.reason),
            value: formatNumber(row.count, uiLocale),
          }))}
          data-pw='moderation-analytics-list-rule-violations'
        />
        <RankedList
          title={t(
            'extracted.moderationAnalytics.moderationAnalyticsDashboard.automodSources_b9a82cc3',
          )}
          empty={t(
            'extracted.moderationAnalytics.moderationAnalyticsDashboard.noAutomodActionsInThisPeriod_1891e28b',
          )}
          rows={metrics.automod_performance.sources.map(row => ({
            key: row.source_type,
            label: formatLabel(row.source_type),
            value: formatNumber(row.count, uiLocale),
          }))}
          data-pw='moderation-analytics-list-automod-sources'
        />
        <RankedList
          title={t(
            'extracted.moderationAnalytics.moderationAnalyticsDashboard.confidence_6422e3e7',
          )}
          empty={t(
            'extracted.moderationAnalytics.moderationAnalyticsDashboard.noConfidenceDataInThisPeriod_4f4971ff',
          )}
          rows={metrics.automod_performance.confidence_distribution.map(row => ({
            key: row.bucket,
            label: row.bucket,
            value: formatNumber(row.count, uiLocale),
          }))}
          data-pw='moderation-analytics-list-confidence'
        />
      </section>

      <Card data-pw='moderation-analytics-workload'>
        <CardHeader>
          <CardTitle>
            {t(
              'extracted.moderationAnalytics.moderationAnalyticsDashboard.moderatorWorkload_8d9381df',
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='overflow-x-auto'>
            <table className='min-w-full divide-y divide-border text-sm'>
              <thead>
                <tr className='text-left text-xs uppercase text-muted-foreground'>
                  <th className='py-2 pr-4 font-medium'>
                    {t(
                      'extracted.moderationAnalytics.moderationAnalyticsDashboard.moderator_6748ec8b',
                    )}
                  </th>
                  <th className='py-2 pr-4 font-medium'>
                    {t(
                      'extracted.moderationAnalytics.moderationAnalyticsDashboard.actions_ff8059dc',
                    )}
                  </th>
                  <th className='py-2 pr-4 font-medium'>
                    {t(
                      'extracted.moderationAnalytics.moderationAnalyticsDashboard.topAction_4ad345ef',
                    )}
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-border'>
                {metrics.moderator_workload.moderators.length === 0 && (
                  <tr>
                    <td
                      className='py-6 text-center text-muted-foreground'
                      colSpan={3}
                    >
                      {t(
                        'extracted.moderationAnalytics.moderationAnalyticsDashboard.noModeratorActionsInThisPeriod_a21359a6',
                      )}
                    </td>
                  </tr>
                )}
                {metrics.moderator_workload.moderators.map(moderator => {
                  const user = metrics.moderator_workload.users[moderator.actor_id]
                  const topAction = Object.entries(moderator.counts).toSorted(
                    (a, b) => b[1] - a[1],
                  )[0]
                  return (
                    <tr key={moderator.actor_id}>
                      <td className='py-3 pr-4 font-medium'>
                        {user?.username ? `@${user.username}` : moderator.actor_id}
                      </td>
                      <td className='py-3 pr-4'>{formatNumber(moderator.total, uiLocale)}</td>
                      <td className='py-3 pr-4 text-muted-foreground'>
                        {topAction
                          ? `${formatLabel(topAction[0])} (${formatNumber(topAction[1], uiLocale)})`
                          : t(
                              'extracted.moderationAnalytics.moderationAnalyticsDashboard.nA_a683c5c5',
                            )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
  'data-pw': dataPw,
}: {
  label: string
  value: string
  detail: string
  'data-pw'?: string
}) {
  return (
    // oxlint-disable-next-line no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- call sites always pass a literal; default omitted to avoid ghost selectors
    <Card data-pw={dataPw}>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm font-medium text-muted-foreground'>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{value}</div>
        <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>
      </CardContent>
    </Card>
  )
}

function MiniStat({
  label,
  value,
  'data-pw': dataPw,
}: {
  label: string
  value: string
  'data-pw'?: string
}) {
  return (
    <div
      className='rounded border bg-muted/30 p-2'
      // oxlint-disable-next-line no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- call sites always pass a literal; default omitted to avoid ghost selectors
      data-pw={dataPw}
    >
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='font-semibold'>{value}</div>
    </div>
  )
}

function ChartPanel({
  title,
  children,
  'data-pw': dataPw,
}: {
  title: string
  children: ReactNode
  'data-pw'?: string
}) {
  return (
    // oxlint-disable-next-line no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- call sites always pass a literal; default omitted to avoid ghost selectors
    <Card data-pw={dataPw}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function RankedList({
  title,
  empty,
  rows,
  'data-pw': dataPw,
}: {
  title: string
  empty: string
  rows: { key: string; label: string; value: string }[]
  'data-pw'?: string
}) {
  return (
    // oxlint-disable-next-line no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- call sites always pass a literal; default omitted to avoid ghost selectors
    <Card data-pw={dataPw}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className='py-6 text-center text-sm text-muted-foreground'>{empty}</p>
        ) : (
          <ol className='space-y-3'>
            {rows.slice(0, 8).map(row => (
              <li
                key={row.key}
                className='flex items-center justify-between gap-3 text-sm'
              >
                <span className='min-w-0 truncate'>{row.label}</span>
                <span className='font-semibold'>{row.value}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

function pivotTypedSeries(points: DailyTypedCountDataPoint[]) {
  const keys = [...new Set(points.map(point => point.type))].toSorted()
  const byDate = new Map<string, Record<string, string | number>>()

  for (const point of points) {
    const row = byDate.get(point.date) ?? { date: point.date }
    row[point.type] = point.count
    byDate.set(point.date, row)
  }

  return {
    keys,
    rows: [...byDate.values()].toSorted((a, b) => String(a.date).localeCompare(String(b.date))),
  }
}

function formatLabel(value: string): string {
  return value
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatPercent(value: number, locale: string): string {
  return value.toLocaleString(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
  })
}

function formatAxisDate(value: string): string {
  return value.slice(5)
}
