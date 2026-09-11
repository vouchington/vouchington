// oxlint-disable react-doctor/prefer-dynamic-import -- date formatters used in recharts callbacks; dedicated chart file where recharts is the core dependency
'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import type { DailyStats } from '@/types/landing-pages'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  dailyStats: DailyStats[]
}

export function AnalyticsVisitTrendChart({ dailyStats }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <section>
      <h2 className='mb-4 text-lg font-semibold'>
        {t('extracted.my.analyticsVisitTrendChart.visitTrendLast30Days_acaa3dbf')}
      </h2>
      <div className='rounded-xl border border-border bg-card p-4 shadow-sm'>
        <ResponsiveContainer
          width='100%'
          height={300}
        >
          <AreaChart data={dailyStats}>
            <CartesianGrid
              strokeDasharray='3 3'
              className='stroke-border'
            />
            <XAxis
              dataKey='date'
              tickFormatter={(d: string) =>
                new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })
              }
              className='text-xs'
            />
            <YAxis
              allowDecimals={false}
              className='text-xs'
              tickFormatter={value => formatNumber(Number(value), uiLocale)}
            />
            <Tooltip
              formatter={value => formatNumber(Number(value), uiLocale)}
              labelFormatter={(d: unknown) =>
                typeof d === 'string'
                  ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })
                  : String(d)
              }
            />
            <Legend />
            <Area
              type='monotone'
              dataKey='visits'
              name='Visits'
              stroke='#3b82f6'
              fill='#3b82f6'
              fillOpacity={0.1}
            />
            <Area
              type='monotone'
              dataKey='unique_visitors'
              name='Unique Visitors'
              stroke='#10b981'
              fill='#10b981'
              fillOpacity={0.1}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
