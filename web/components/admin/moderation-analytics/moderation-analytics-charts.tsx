// oxlint-disable react-doctor/prefer-dynamic-import -- dedicated chart file; recharts is the core dependency
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
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import type { ModerationAnalytics } from '@/types/moderation-analytics'
import { useTranslations } from '@/lib/i18n/use-translations'
import {
  formatAxisDate,
  formatLabel,
  formatPercent,
  pivotTypedSeries,
} from './moderation-analytics-format'

const axisTick = { fontSize: 11 }
const colors = ['#2563eb', '#16a34a', '#f97316', '#db2777', '#0891b2', '#7c3aed']

export function ModerationAnalyticsCharts({ metrics }: { metrics: ModerationAnalytics }) {
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
    <section className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
      <ChartPanel
        title={t('extracted.moderationAnalytics.moderationAnalyticsDashboard.queueVolume_1928d6c2')}
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
